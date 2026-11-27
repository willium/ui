/**
 * A Vite plugin that renders an `@effect/ui` app on the server in
 * `vite dev` and prerenders its pages in `vite build`.
 *
 * `@effect/ui/html` doesn't re-export it.
 *
 * The app's server entry exports a `default` Layer that adds its routes to
 * `HttpRouter`, such as `HtmlServerHttp.layerHttp`, and `prerender`, the
 * paths to prerender, as an array or an Effect of one. It renders its pages
 * with `document` from `virtual:@effect/ui/document`, which fills
 * `index.html` with `HtmlServer.document`. Add
 * `@effect/ui/html/HtmlServerViteDocument` to `compilerOptions.types` for
 * that module's types. `index.html` holds the static markup and the
 * `<!--app-html-->` marker where the page goes.
 *
 * In dev, Vite answers module, asset and `/@vite` requests first, and every
 * other request goes to the server entry. The template is `index.html`
 * after Vite's HTML transforms. Editing a module or `index.html` reloads
 * the server entry on the next request.
 *
 * In a build, it builds the client, then the server entry, using the
 * client's `index.html` as the template. It requests each `prerender`
 * path at `origin` and writes a 200 to `<path>.html`, or `index.html`
 * for a path ending in `/`, and a 404 to `404.html`. Any other status
 * fails the build. The server build isn't kept.
 *
 * Under a Vite `base` such as `"/docs/"`, the server entry gets the URLs
 * the browser sends, with the base, so pass `import.meta.env.BASE_URL` as
 * the `base` of `layerHttp` and `BrowserRouter.layer`. `prerender` paths
 * are relative to the base: `"/about"` is requested as `"/docs/about"` and
 * written to `about.html`. They're read before the entry's Layer is built,
 * so routes printed for them don't carry the base yet. A relative or
 * full-URL `base` keeps the routes at the root.
 *
 * **Gotchas**
 *
 * `vite build --watch` isn't supported and fails before building. Use
 * `vite dev` to rebuild on changes.
 *
 * **Example** (Configuring the plugin)
 *
 * ```ts
 * import { plugin } from "@effect/ui/html/HtmlServerVite"
 *
 * // vite.config.ts: export default { plugins: [ssr] }
 * const ssr = plugin({ entry: "/src/entry.server.ts" })
 *
 * // src/entry.server.ts:
 * //
 * // import { document } from "virtual:@effect/ui/document"
 * // export default layerHttp(App, { routes: AppRoute, document, base: import.meta.env.BASE_URL, static: import.meta.env.PROD })
 * // export const prerender = [AppRoute.print(AppRoute.Home())]
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as fs from "node:fs/promises"
import type * as Http from "node:http"
import * as path from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import type { ReadableStream as WebStream } from "node:stream/web"
import { pathToFileURL } from "node:url"

/**
 * The options of `plugin`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Options {
  /** The server entry, as a Vite module id such as `"/src/entry.server.ts"`. */
  readonly entry: string
  /** The origin prerendered pages are requested at. Defaults to `"http://localhost"`. */
  readonly origin?: string | undefined
}

/**
 * The subset of a Vite plugin that `plugin` returns. It is assignable to
 * Vite's `Plugin` without importing `vite`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Plugin {
  readonly name: string
  readonly sharedDuringBuild: true
  config(
    config: unknown,
    env: { readonly isPreview?: boolean | undefined }
  ): object
  resolveId(source: string): string | undefined
  load(this: LoadContext, id: string): Promise<string | undefined>
  configureServer(server: DevServer): () => void
  buildApp(builder: Builder): Promise<void>
  buildEnd(this: { readonly environment: object }): Promise<void>
}

interface LoadContext {
  addWatchFile(file: string): void
}

interface OutputFile {
  readonly fileName: string
  readonly isEntry?: boolean
  readonly code?: string
  readonly source?: string | Uint8Array
}

interface DevServer {
  readonly config: {
    readonly root: string
    readonly logger: { error(message: string): void }
  }
  readonly middlewares: {
    use(
      handler: (
        request: Http.IncomingMessage,
        response: Http.ServerResponse,
        next: (error?: unknown) => void
      ) => void
    ): unknown
  }
  readonly environments: {
    readonly client: object
    readonly ssr: {
      readonly runner?: { import(url: string): Promise<unknown> }
    }
  }
  transformIndexHtml(url: string, html: string): Promise<string>
}

interface Environment {
  readonly config: {
    readonly base: string
    readonly root: string
    readonly cacheDir: string
    readonly build: { readonly outDir: string; readonly watch?: unknown }
  }
}

interface Builder {
  readonly environments: { readonly [name: string]: Environment }
  build(environment: Environment): Promise<unknown>
}

/** What the virtual server module exports. */
interface ServerModule {
  readonly handler: (request: Request) => Promise<Response>
  readonly dispose: () => Promise<void>
  readonly prerender: () => Promise<ReadonlyArray<string>>
}

const documentId = "virtual:@effect/ui/document"
const serverId = "virtual:@effect/ui/server"

/**
 * Creates the Vite plugin.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const plugin = (options: Options): Plugin => {
  const origin = options.origin ?? "http://localhost"
  let devServer: DevServer | undefined
  // The app's `index.html` in dev, and the client build's in a build.
  let templateFile = ""
  // Closes each dev server, by its client environment. A restart
  // configures the new server before it closes the old one.
  const closers = new WeakMap<object, () => Promise<void>>()

  const template = async (context: LoadContext): Promise<string> => {
    const html = await fs.readFile(templateFile, "utf8")
    if (devServer === undefined) return html
    context.addWatchFile(templateFile)
    return devServer.transformIndexHtml("/", html)
  }

  return {
    name: "effect-ui-html-server",
    // Shared, so the server build sees the `templateFile` that `buildApp` sets.
    sharedDuringBuild: true,
    config: (_, { isPreview }) => ({
      // In dev, page requests that Vite doesn't answer reach the server
      // entry. A preview serves `/about` from `about.html`.
      appType: isPreview ? "mpa" : "custom",
      builder: {},
      ssr: { noExternal: [/^@effect\/ui/] },
      environments: {
        ssr: {
          build: { write: false, rolldownOptions: { input: serverId } }
        }
      }
    }),
    resolveId: (source) =>
      source === documentId || source === serverId ? `\0${source}` : undefined,
    async load(id) {
      if (id === `\0${documentId}`) {
        return [
          `import { document as fill } from "@effect/ui/html/HtmlServer"`,
          `const template = ${JSON.stringify(await template(this))}`,
          `export const document = (rendered) => fill(template, rendered)`
        ].join("\n")
      }
      if (id === `\0${serverId}`) {
        return [
          `import * as entry from ${JSON.stringify(options.entry)}`,
          `import { isEffect, runPromise } from "effect/Effect"`,
          `import { toWebHandler } from "effect/http/HttpRouter"`,
          // Built on the first request, so `prerender` is evaluated before the entry's Layer sets a base.
          `let web`,
          `export const handler = (request) => (web ??= toWebHandler(entry.default, { disableLogger: true })).handler(request)`,
          `export const dispose = async () => web?.dispose()`,
          `export const prerender = async () => isEffect(entry.prerender) ? runPromise(entry.prerender) : entry.prerender ?? []`
        ].join("\n")
      }
      return undefined
    },
    configureServer(server) {
      devServer = server
      templateFile = path.join(server.config.root, "index.html")
      // Read now: on restart, Vite copies the new server's fields onto this one.
      const { client, ssr } = server.environments
      const { logger } = server.config
      let current: ServerModule | undefined
      let closing = false
      const seen = new WeakSet<ServerModule>()
      const active = new Map<ServerModule, number>()
      const inflight = new Set<Promise<void>>()
      const disposing = new Set<Promise<void>>()

      const track = (set: Set<Promise<void>>, promise: Promise<void>) => {
        set.add(promise)
        promise.then(() => set.delete(promise))
      }

      const dispose = (module: ServerModule) => {
        track(
          disposing,
          module.dispose().catch((error) =>
            logger.error(
              `HtmlServerVite failed to dispose the server entry: ${error}`
            )
          )
        )
      }

      /** Disposes a module once it is replaced and answers no request. */
      const disposeIdle = (module: ServerModule) => {
        if (module !== current && !active.has(module)) dispose(module)
      }

      /** Holds `module` while `serve` runs, so a reload can't dispose it. */
      const hold = async (module: ServerModule, serve: () => Promise<void>) => {
        active.set(module, (active.get(module) ?? 0) + 1)
        try {
          await serve()
        } finally {
          const count = active.get(module)! - 1
          if (count > 0) {
            active.set(module, count)
          } else {
            active.delete(module)
            disposeIdle(module)
          }
        }
      }

      const load = async () => {
        if (ssr.runner === undefined) {
          throw new Error("HtmlServerVite needs a runnable ssr environment")
        }
        const module = (await ssr.runner.import(serverId)) as ServerModule
        // A new module means an edit re-evaluated the entry. A module that
        // was already replaced never becomes current again.
        if (!seen.has(module)) {
          seen.add(module)
          const previous = current
          current = module
          if (previous !== undefined) disposeIdle(previous)
        }
        return current!
      }

      const serve = (
        request: Http.IncomingMessage,
        response: Http.ServerResponse,
        next: (error?: unknown) => void
      ): Promise<void> =>
        load()
          .then((module) => {
            // The client left while the entry was loading.
            if (response.destroyed) return
            // A client that leaves aborts the request, but the module stays
            // held until the handler and the body have settled.
            const abort = new AbortController()
            const leave = () => {
              if (!response.writableFinished) abort.abort()
            }
            response.once("close", leave)
            return hold(module, async () => {
              try {
                const answer = await module.handler(
                  toRequest(request, abort.signal)
                )
                await send(response, answer)
              } finally {
                response.off("close", leave)
              }
            })
          })
          .catch((error) => {
            if (!response.destroyed) next(error)
          })

      // Refuses new requests, lets in-flight ones settle (which disposes
      // replaced modules), then disposes the current one.
      closers.set(client, async () => {
        closing = true
        await Promise.all(inflight)
        const last = current
        current = undefined
        if (last !== undefined) dispose(last)
        await Promise.all(disposing)
      })

      // Returned, so it runs after Vite's own middlewares.
      return () => {
        server.middlewares.use((request, response, next) => {
          if (closing) {
            response.statusCode = 503
            response.end()
            return
          }
          track(inflight, serve(request, response, next))
        })
      }
    },
    async buildApp(builder) {
      const { client, ssr } = builder.environments
      if (client.config.build.watch || ssr.config.build.watch) {
        throw new Error(
          "HtmlServerVite doesn't support `vite build --watch`. Use `vite dev` to rebuild on changes."
        )
      }
      const { cacheDir, root } = ssr.config
      const outDir = path.resolve(root, client.config.build.outDir)
      // Like `Route`, a relative or full-URL base keeps the pages at the root.
      const base = client.config.base.startsWith("/")
        ? client.config.base.replace(/\/$/, "")
        : ""
      await builder.build(client)
      templateFile = path.join(outDir, "index.html")
      const output = (await builder.build(ssr)) as {
        readonly output: ReadonlyArray<OutputFile>
      }
      await fs.mkdir(cacheDir, { recursive: true })
      // Inside the project, so the bundle's external imports resolve.
      const dir = await fs.mkdtemp(path.join(cacheDir, "effect-ui-server-"))
      try {
        await Promise.all(
          output.output.map((file) =>
            write(dir, file.fileName, file.code ?? file.source ?? "")
          )
        )
        const entry = output.output.find((file) => file.isEntry)!
        const module = (await import(
          pathToFileURL(path.join(dir, entry.fileName)).href
        )) as ServerModule
        try {
          // Settled, so no render outlives the handler when one fails.
          const results = await Promise.allSettled(
            (await module.prerender()).map(async (url) => {
              const target = new URL(url, origin)
              const request = new URL(target)
              request.pathname = base + target.pathname
              const response = await module.handler(new Request(request))
              await write(
                outDir,
                fileName(target.pathname, response.status),
                await response.text()
              )
            })
          )
          const failed = results.find((result) => result.status === "rejected")
          if (failed !== undefined) throw failed.reason
        } finally {
          await module.dispose()
        }
      } finally {
        await fs.rm(dir, { recursive: true, force: true })
      }
    },
    // Closes the dev server that owns this environment. Builds register none.
    async buildEnd() {
      await closers.get(this.environment)?.()
    }
  }
}

const fileName = (pathname: string, status: number): string => {
  if (status === 404) {
    return "404.html"
  }
  if (status !== 200) {
    throw new Error(`Prerendering ${pathname} answered ${status}`)
  }
  const segments = pathname.split("/").map((segment) => {
    const name = decodeURIComponent(segment)
    if (/[/\\\0]/.test(name) || name === "." || name === "..") {
      throw new Error(`Prerendering ${pathname} has no file name`)
    }
    return name
  })
  const file = segments.join("/")
  return file.endsWith("/") ? `${file}index.html` : `${file}.html`
}

const write = async (
  dir: string,
  file: string,
  content: string | Uint8Array
) => {
  const target = path.join(dir, file)
  if (!target.startsWith(dir + path.sep)) {
    throw new Error(`${file} is outside ${dir}`)
  }
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, content)
}

const toRequest = (
  request: Http.IncomingMessage,
  signal: AbortSignal
): Request => {
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined || name.startsWith(":")) continue
    for (const item of Array.isArray(value) ? value : [value]) {
      headers.append(name, item)
    }
  }
  const method = request.method ?? "GET"
  const protocol = "encrypted" in request.socket ? "https" : "http"
  return new Request(
    // Vite strips its `base` from `url`, and the entry matches with it.
    new URL(
      (request as { readonly originalUrl?: string }).originalUrl ??
        request.url ?? "/",
      `${protocol}://${request.headers.host}`
    ),
    {
      method,
      headers,
      signal,
      ...(method === "GET" || method === "HEAD" ? {} : {
        body: Readable.toWeb(request) as ReadableStream,
        duplex: "half"
      })
    } as RequestInit
  )
}

const send = async (response: Http.ServerResponse, answer: Response) => {
  response.statusCode = answer.status
  response.setHeaders(answer.headers)
  if (answer.body === null) {
    response.end()
  } else {
    await pipeline(Readable.fromWeb(answer.body as WebStream), response)
  }
}
