/**
 * Serves a routed `@effect/ui` app's pages through `HttpRouter`, with
 * `HtmlServer.renderToHtml` doing the rendering.
 *
 * It is a separate entry point, `@effect/ui/html/HtmlServerHttp`, and
 * `@effect/ui/html` doesn't re-export it. A browser bundle that imports
 * `@effect/ui/html` then takes in none of the `effect/http` modules this
 * module needs, even when it uses a namespace such as `Html` as a value.
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Context from "effect/Context"
import type * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as HttpRouter from "effect/http/HttpRouter"
import * as HttpServerResponse from "effect/http/HttpServerResponse"
import type * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Scope from "effect/Scope"
import type * as Component from "../Component.ts"
import * as base from "../internal/base.ts"
import { canonical } from "../internal/url.ts"
import * as Router from "../Router.ts"
import type * as View from "../View.ts"
import type * as BrowserHost from "./BrowserHost.ts"
import type * as Html from "./Html.ts"
import * as HtmlServer from "./HtmlServer.ts"

/**
 * Serves a routed app's pages through `HttpRouter`: a `GET *` route that
 * renders the component at the request's URL and answers with a document.
 *
 * **When to use**
 *
 * Use when the app's root takes `{ route }` and mounts in the browser with
 * `Router.props(routes)`, and every service the render needs can be built
 * once with the server.
 *
 * **Details**
 *
 * While the Layer is built, the routes' base is `base`. URLs are matched
 * with it, as the browser sends them, and links are printed with it. The
 * previous base is restored when the Layer's Scope closes.
 *
 * Per request it resolves the URL with `routes`. A URL that doesn't resolve
 * is a 404, and a redirected or normalised one is a 301 to
 * `routes.print(route)`, or a 302 when search params were also dropped as
 * invalid. A URL with search params dropped as invalid is a 302 to the same
 * URL without them, keeping the others as written. Otherwise it renders with `HtmlServer.renderToHtml` under
 * `Router.static` at the URL, with `Router.props(routes)` as the props,
 * the same props the client hydrates with. The response is
 * `document(rendered)` as `text/html`.
 *
 * The status is 404 for the catch-all `"/*"` route and 200 otherwise.
 * `status` replaces that default, for what the route can't know, such as a
 * record that doesn't exist. Its `model` is `undefined` if the root
 * failed. `budget` and `static` are `renderToHtml`'s options.
 *
 * The Layer captures the component's services when it is built, so provide
 * them with `Layer.provide`. It needs no request service.
 *
 * **Gotchas**
 *
 * A service provided to the Layer is shared by every request. Render with
 * `HtmlServer.renderToHtml` in your own handler when a service belongs to the
 * request, such as the current user.
 *
 * **Example** (Serving a routed app)
 *
 * ```ts import.meta.vitest
 * import { Layer, Schema } from "effect"
 * import { HttpRouter } from "effect/http"
 * import { Component, Route, Router } from "@effect/ui"
 * import { HtmlServer } from "@effect/ui/html"
 * import { layerHttp } from "@effect/ui/html/HtmlServerHttp"
 *
 * const AppRoute = Route.union({
 *   Home: Route.make("/"),
 *   NotFound: Route.make("/*")
 * })
 *
 * const App = Component.define({
 *   name: "App",
 *   props: Schema.Struct({ route: AppRoute }),
 *   model: Schema.Struct({ route: AppRoute }),
 *   message: Schema.Never
 * }).make({
 *   init: ($) => ({ route: $.props.route }),
 *   update: ($) => $.model,
 *   view: (h, { route }) => h.el("h1", route._tag === "Home" ? "Home" : "Page not found")
 * })
 *
 * const Pages = layerHttp(App, {
 *   routes: AppRoute,
 *   budget: "300 millis",
 *   document: (page) => `<!doctype html>
 * <html ${page.htmlAttributes}>
 *   <head><meta charset="utf-8">${page.head}</head>
 *   <body ${page.bodyAttributes}>
 *     <div id="app">${page.html}</div>
 *     <script type="application/json" id="state">${HtmlServer.serializeState(page.state)}</script>
 *     <script type="module" src="/client.js"></script>
 *   </body>
 * </html>`
 * })
 *
 * const { dispose, handler } = HttpRouter.toWebHandler(Pages, { disableLogger: true })
 * const response = await handler(new Request("http://localhost/nowhere"))
 * response.status // => 404
 * await dispose()
 * ```
 *
 * @see {@link HtmlServer.renderToHtml} for services that belong to the request
 *
 * @stability experimental
 * @category layers
 * @since 0.1.0
 */
export const layerHttp = <
  Name extends string,
  Model,
  Msg,
  Events,
  R,
  V extends View.Elements,
  U extends Router.Routes
>(
  component:
    & Component.Members<
      Name,
      { readonly route: U["Type"] },
      Model,
      Msg,
      Events,
      R,
      V,
      any
    >
    & BrowserHost.HtmlRoot<V>,
  options: {
    readonly routes: U
    /**
     * The base path the routes are relative to, as in `BrowserRouter.layer`,
     * such as Vite's `import.meta.env.BASE_URL`. Defaults to the routes'
     * base. It's set while the Layer is built.
     */
    readonly base?: string | undefined
    readonly document: (rendered: HtmlServer.Rendered<Model>) => string
    readonly budget?: Duration.Input | undefined
    readonly static?: boolean | undefined
    readonly status?:
      | ((route: U["Type"], model: Model | undefined) => number)
      | undefined
  }
): Layer.Layer<
  never,
  never,
  HttpRouter.HttpRouter | Exclude<R, Html.Host | Router.Services>
> =>
  HttpRouter.use(Effect.fnUntraced(function*(router) {
    if (options.base !== undefined) {
      yield* base.scoped(options.routes, options.base)
    }
    const services = Context.omit(Scope.Scope)(
      yield* Effect.context<Exclude<R, Html.Host | Router.Services>>()
    )
    const render = HtmlServer.renderToHtml(
      component,
      Router.props(options.routes),
      {
        budget: options.budget,
        static: options.static
      }
    )
    yield* router.add("GET", "*", (request) => {
      const resolved = options.routes.resolve(request.url)
      if (Option.isNone(resolved)) {
        return Effect.succeed(
          HttpServerResponse.text("Not found", { status: 404 })
        )
      }
      const { invalid, notFound, redirected, route } = resolved.value
      if (redirected || invalid.length > 0) {
        // Temporary while params are dropped as invalid: the same params may decode later, if the routes change.
        return Effect.succeed(
          HttpServerResponse.redirect(
            canonical(options.routes, resolved.value, request.url),
            {
              status: invalid.length > 0 ? 302 : 301
            }
          )
        )
      }
      return render.pipe(
        Effect.provide(
          Router.static({ routes: options.routes, url: request.url })
        ),
        Effect.provideContext(services as Context.Context<any>),
        Effect.map((rendered) =>
          HttpServerResponse.text(options.document(rendered), {
            status: options.status
              ? options.status(route, rendered.model)
              : notFound
              ? 404
              : 200,
            contentType: "text/html"
          })
        )
      ) as Effect.Effect<HttpServerResponse.HttpServerResponse>
    })
  }))
