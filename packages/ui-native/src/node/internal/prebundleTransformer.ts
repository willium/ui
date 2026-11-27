// Wraps the project's Babel transformer so that, in a release build, the
// entry module is replaced by a require of the Vite pre-bundle. The entry's
// output never changes, and the pre-bundle is a file of its own, so Metro's
// cache stays correct for both.
import { createRequire } from "node:module"
import * as Path from "node:path"

interface Transformer {
  readonly transform: (args: {
    readonly filename: string
    readonly src: string
    readonly options: { readonly dev: boolean; readonly projectRoot: string }
    readonly [key: string]: unknown
  }) => unknown
  readonly getCacheKey?: ((...args: ReadonlyArray<any>) => string) | undefined
  readonly isDefaultConfig?: unknown
}

const setup: {
  readonly entry: string
  readonly bundle: string
  readonly upstream: string
} = JSON.parse(
  process.env.EFFECT_UI_NATIVE_PREBUNDLE!
)

const upstream: Transformer = createRequire(import.meta.url)(setup.upstream)

export const transform: Transformer["transform"] = (args) => {
  if (
    !args.options.dev &&
    Path.resolve(args.options.projectRoot, args.filename) === setup.entry
  ) {
    const relative = Path.relative(Path.dirname(setup.entry), setup.bundle)
      .split(Path.sep).join("/")
    args = {
      ...args,
      src: `module.exports = require(${
        JSON.stringify(relative.startsWith(".") ? relative : "./" + relative)
      })\n`
    }
  }
  return upstream.transform(args)
}

export const getCacheKey = upstream.getCacheKey

export const isDefaultConfig = upstream.isDefaultConfig
