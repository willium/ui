/**
 * Metro configuration for an `@effect/ui-native` app.
 *
 * Metro doesn't tree-shake, so a release bundle would carry every module
 * `effect` and `@effect/ui` could need. {@link withEffectUi} pre-bundles
 * release builds with Vite, which does, and hands Metro the result with
 * React Native left out for Metro to resolve. In development Metro serves
 * the sources, and edits reach the app through Fast Refresh.
 *
 * @example
 * ```ts
 * // metro.config.js
 * const { getDefaultConfig } = require("expo/metro-config")
 * const { NativeMetro } = require("@effect/ui-native/node")
 *
 * module.exports = NativeMetro.withEffectUi(getDefaultConfig(__dirname))
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Fs from "node:fs"
import * as Path from "node:path"
import { fileURLToPath } from "node:url"

/**
 * The parts of a Metro config {@link withEffectUi} reads and changes.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface MetroConfig {
  readonly projectRoot: string
  readonly resolver?: {
    readonly unstable_conditionNames?: ReadonlyArray<string> | undefined
    readonly [key: string]: unknown
  } | undefined
  readonly transformer?: {
    readonly babelTransformerPath?: string | undefined
    readonly [key: string]: unknown
  } | undefined
  readonly serializer?: {
    readonly getModulesRunBeforeMainModule?:
      | ((entryFilePath: string) => ReadonlyArray<string>)
      | undefined
    readonly [key: string]: unknown
  } | undefined
  readonly [key: string]: unknown
}

/**
 * Options accepted by {@link withEffectUi}.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Options {
  /** The module the bundle starts at. The `main` of the app's `package.json` by default. */
  readonly entry?: string | undefined
  /**
   * Whether a release build is pre-bundled with Vite. `true` by default; with
   * `false`, Metro bundles the sources.
   */
  readonly prebundle?: boolean | undefined
  /**
   * Modules the pre-bundle leaves to Metro, besides `react-native`, `expo`
   * and their scoped and prefixed packages. Leave out any package with
   * native code or assets.
   */
  readonly external?: ReadonlyArray<string | RegExp> | undefined
}

/**
 * Where a release build's pre-bundle is written, under the project root.
 *
 * @stability experimental
 * @category constants
 * @since 0.1.0
 */
export const prebundleDirectory = "node_modules/.cache/@effect/ui-native"

const own = (file: string) => {
  const self = fileURLToPath(import.meta.url)
  return Fs.realpathSync(
    Path.join(Path.dirname(self), file + Path.extname(self))
  )
}

const native = /^(?:@?react-native|@?expo)(?:[-/]|$)/

const isExternal = (external: ReadonlyArray<string | RegExp>) => (id: string) =>
  native.test(id) ||
  external.some((entry) =>
    typeof entry === "string"
      ? id === entry || id.startsWith(entry + "/")
      : entry.test(id)
  )

const mainOf = (root: string): string => {
  const pkg = JSON.parse(
    Fs.readFileSync(Path.join(root, "package.json"), "utf8")
  )
  if (typeof pkg.main !== "string") {
    throw new Error(
      `[@effect/ui-native] ${root}/package.json has no "main", so pass the entry to withEffectUi`
    )
  }
  return pkg.main
}

/**
 * Pre-bundles `entry` with Vite into {@link prebundleDirectory}, as a
 * release build does, and returns the file written.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const prebundle = async (
  root: string,
  entry: string,
  external: ReadonlyArray<string | RegExp> = []
): Promise<string> => {
  const { build } = await import("vite")
  const outDir = Path.join(root, prebundleDirectory)
  await build({
    configFile: false,
    root,
    mode: "production",
    logLevel: "warn",
    // `production` drops the development checks of `@effect/ui`.
    resolve: {
      conditions: ["react-native", "production", "import", "module", "default"],
      tsconfigPaths: true
    },
    define: { "process.env.NODE_ENV": "\"production\"" },
    build: {
      outDir,
      emptyOutDir: false,
      // Metro minifies, and transforms the syntax for Hermes.
      minify: false,
      target: "es2020",
      sourcemap: true,
      lib: {
        entry: Path.resolve(root, entry),
        // Metro's Babel turns the imports of React Native into requires, with
        // its interop, as it does for the rest of the app.
        formats: ["es"],
        fileName: () => "main.js"
      },
      rollupOptions: { external: isExternal(external) }
    }
  })
  return Path.join(outDir, "main.js")
}

/**
 * Configures Metro for an `@effect/ui-native` app, and pre-bundles a
 * release build. Use the result as the export of `metro.config.js`.
 *
 * **Details**
 *
 * A release build is one with `NODE_ENV=production`, as `expo export`,
 * `expo run:android --variant release`, Gradle's and Xcode's release builds
 * and EAS Build all set. For one, Vite bundles the entry with the
 * `production` condition, leaving out React Native and Expo, and Metro
 * bundles the result in place of the entry. Packages Metro has to bundle,
 * such as those with native code or assets, go in `external`.
 *
 * In development the entry's sources are served as they are, and the
 * refresh runtime is run before them, so that an edit to a module whose
 * exports are all components swaps them in place without losing state.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const withEffectUi = async <Config extends MetroConfig>(
  config: Config | Promise<Config>,
  options?: Options | undefined
): Promise<Config> => {
  const resolved = await config
  const root = resolved.projectRoot
  if (process.env.NODE_ENV === "production") {
    const conditions = resolved.resolver?.unstable_conditionNames ?? []
    const out = {
      ...resolved,
      resolver: {
        ...resolved.resolver,
        unstable_conditionNames: conditions.includes("production")
          ? conditions
          : [...conditions, "production"]
      }
    }
    if (options?.prebundle === false) return out
    const entry = Path.resolve(root, options?.entry ?? mainOf(root))
    const bundle = await prebundle(root, entry, options?.external)
    const upstream = resolved.transformer?.babelTransformerPath
    if (upstream === undefined) {
      throw new Error(
        "[@effect/ui-native] the Metro config has no transformer.babelTransformerPath to wrap"
      )
    }
    // Metro's workers start after the config loads, and inherit these.
    process.env.EFFECT_UI_NATIVE_PREBUNDLE = JSON.stringify({
      entry,
      bundle,
      upstream
    })
    return {
      ...out,
      transformer: {
        ...resolved.transformer,
        babelTransformerPath: own("internal/prebundleTransformer"),
        // Part of Metro's cache key, so a cached entry from another setup isn't reused.
        effectUiNativePrebundle: Path.relative(root, entry)
      }
    }
  }
  const before = resolved.serializer?.getModulesRunBeforeMainModule
  const refresh = own("../internal/devOn")
  return {
    ...resolved,
    serializer: {
      ...resolved.serializer,
      getModulesRunBeforeMainModule: (entryFilePath: string) => [
        ...(before?.(entryFilePath) ?? []),
        refresh
      ]
    }
  }
}
