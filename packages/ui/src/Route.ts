/**
 * Route definitions: a flat union of routes, each a path template with
 * `params` and `search` Schemas, plus a parser and a printer that agree.
 *
 * A route union is a `Schema.TaggedUnion`, so a route value such as
 * `{ _tag: "Person", params: { id: 1 }, search: {} }` can be a root's props and
 * a page's props. Parsing decodes path and search strings through each route's
 * Schemas with `Schema.toCodecStringTree`, so `params: { id: Schema.Number }`
 * works directly, and printing encodes through the same Schemas.
 *
 * **Matching**
 *
 * - A template has literal segments, `:name` params and an optional trailing
 *   `*`, which captures the rest of the path as the `"*"` param.
 * - A literal segment beats a param and a param beats a rest, whatever the
 *   declaration order. Between equal templates, the first declared wins.
 * - If a path param fails to decode, matching falls through to the next
 *   route, so `/people/:id` with a Number and `/people/:slug` with a String
 *   can coexist. If a required search field fails to decode, the URL is a 404:
 *   the result is the catch-all `"/*"` route, with no fall-through.
 * - A trailing slash is stripped, a printed path never has one, and matching
 *   is case-sensitive.
 * - Redirects take part in the ranking like routes, and `parse` resolves
 *   them, so the server and the client agree.
 *
 * **Search**
 *
 * - A search field that decodes when its key is absent, such as
 *   `Schema.optional(Schema.String)` or a field with
 *   `Schema.withDecodingDefaultKey`, is treated as absent when its value
 *   fails to decode or its key is repeated. `resolve` names such keys in
 *   `invalid`, and the Router replaces the URL with one without them.
 * - A lone value decodes into an array field, so `?tag=x` is `["x"]`.
 * - A field with a decoding default holds it when its key is absent, `make`
 *   fills it in, and `print` leaves out a param equal to it.
 *
 * **Base path**
 *
 * Templates are relative to the union's base path, which a Router Layer sets
 * at startup. `parse` only accepts URLs under the base and `print` adds it
 * back, so printed links are always absolute. A trailing slash on the base is
 * kept for Home only: under `"/docs/"` Home prints as `"/docs/"`, and under
 * `"/en"` as `"/en"`. A relative or full-URL base, such as Vite's `"./"`,
 * keeps the routes at the root. The base `"#"` puts the URL in the fragment,
 * as `"#/people/1"`, for static hosting.
 *
 * **Example** (A route table)
 *
 * ```ts import.meta.vitest
 * import { Option, Schema } from "effect"
 * import { Route } from "@effect/ui"
 *
 * const AppRoute = Route.union(
 *   {
 *     Home: Route.make("/"),
 *     Person: Route.make("/people/:id", {
 *       params: { id: Schema.Number },
 *       search: { tab: Schema.optional(Schema.String) }
 *     }),
 *     NotFound: Route.make("/*")
 *   },
 *   Route.redirect("/old/:id", (params) => ({ _tag: "Person", params: { id: Number(params.id) }, search: {} }))
 * )
 *
 * Option.getOrThrow(AppRoute.parse("/people/1?tab=posts")).search // => { tab: "posts" }
 * AppRoute.print(AppRoute.Person({ params: { id: 2 } })) // => "/people/2"
 * Option.getOrThrow(AppRoute.parse("/old/3")).params // => { id: 3 }
 * Option.getOrThrow(AppRoute.parse("/nope"))._tag // => "NotFound"
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import type * as Command from "./Command.ts"
import { decodeComponent } from "./internal/url.ts"

/**
 * Marks a route definition.
 *
 * @stability experimental
 * @category type IDs
 * @since 0.1.0
 */
export const TypeId = "~@effect/ui/Route" as const

/**
 * The names of a template's `:name` params.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type PathParams<Path extends string> = Path extends
  `${string}:${infer Rest}`
  ? Rest extends `${infer Name}/${infer Tail}` ? Name | PathParams<`/${Tail}`>
  : Rest
  : never

/**
 * A route definition: a path template and the Schemas of its params and
 * search.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Route<
  out Path extends string,
  out Params extends Schema.Struct.Fields,
  out Search extends Schema.Struct.Fields
> {
  readonly [TypeId]: typeof TypeId
  readonly path: Path
  readonly params: Params
  readonly search: Search
}

/**
 * Any route definition.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Any = Route<string, Schema.Struct.Fields, Schema.Struct.Fields>

/**
 * The `params` fields of a route value: the declared ones, plus `"*"` for a
 * template ending in `*`.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type ParamFields<R> = R extends
  Route<infer Path, infer Params, infer _Search>
  ? Path extends `${string}*` ? Params & { readonly "*": Schema.String }
  : Params
  : never

/**
 * The `search` fields of a route value.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type SearchFields<R> = R extends
  Route<infer _Path, infer _Params, infer Search> ? Search : never

/**
 * A field as a route value holds it: a field with a decoding default, such
 * as `Schema.withDecodingDefaultKey`, also gets that default in `make`.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type MakeField<S extends Schema.Constraint> = S extends {
  readonly "~type.optionality": "required"
  readonly "~encoded.optionality": "optional"
  readonly "~type.constructor.default": "no-default"
} ? Schema.withConstructorDefault<S & Schema.WithoutConstructorDefault>
  : S

/**
 * A params or search Struct, each field as `MakeField` gives it, which `make`
 * fills in, defaults included, when no field needs a value.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type FieldsSchema<Fields extends Schema.Struct.Fields> = {} extends
  Schema.Struct<
    { readonly [K in keyof Fields]: MakeField<Fields[K]> }
  >["~type.make.in"] ? Schema.withConstructorDefault<
    Schema.Struct<{ readonly [K in keyof Fields]: MakeField<Fields[K]> }>
  >
  : Schema.Struct<{ readonly [K in keyof Fields]: MakeField<Fields[K]> }>

/**
 * A redirect: a template whose raw params and search map to a route value.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Redirect {
  readonly _tag: "Redirect"
  readonly path: string
  readonly to: (
    params: Readonly<Record<string, string>>,
    search: Readonly<Record<string, string | ReadonlyArray<string>>>
  ) => { readonly _tag: string }
}

/**
 * What `resolve` returns: the route a URL resolves to, whether a redirect or
 * a normalisation (such as a trailing slash) changed the URL, whether the
 * route is the union's catch-all `"/*"` route, and the search keys that were
 * dropped because their values failed to decode.
 *
 * **Details**
 *
 * The server answers a changed URL with a permanent redirect to
 * `print(route)`, a non-empty `invalid` with a temporary one, since the same
 * URL may be valid later, and a `notFound` route with a 404. `notFound` is
 * true whether the catch-all matched the path or a required search field that
 * failed to decode fell back to it. A union without a catch-all never sets
 * it, because such URLs don't resolve.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Resolved<A> {
  readonly route: A
  readonly redirected: boolean
  readonly notFound: boolean
  /** The search keys treated as absent, because their values failed to decode or were repeated. */
  readonly invalid: ReadonlyArray<string>
}

/**
 * A route union: a `Schema.TaggedUnion` of route values, with a parser, a
 * printer and one constructor per route.
 *
 * **Details**
 *
 * The schema members come from {@link Union.Base} and the constructors from
 * {@link Union.Constructors}.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Union<Routes extends Record<string, Any>> =
  & Union.Base<Routes>
  & Union.Constructors<Routes>

/**
 * Types that make up a {@link Union}.
 *
 * @stability experimental
 * @since 0.1.0
 */
export declare namespace Union {
  /**
   * The `Schema.TaggedStruct` of each route value, by tag.
   *
   * @stability experimental
   * @category models
   * @since 0.1.0
   */
  export type Cases<Routes extends Record<string, Any>> = {
    readonly [K in keyof Routes & string]: Schema.TaggedStruct<K, {
      readonly params: FieldsSchema<ParamFields<Routes[K]>>
      readonly search: FieldsSchema<SearchFields<Routes[K]>>
    }>
  }

  /**
   * The schema members of a {@link Union}, without the constructors.
   *
   * **Details**
   *
   * Everything `Schema.TaggedUnion` has, including `make`, `cases` and
   * `match`, plus the parser, the printer and `subset`. `annotate`, `check`
   * and `rebuild` return a plain `Schema.TaggedUnion`.
   *
   * @stability experimental
   * @category models
   * @since 0.1.0
   */
  export interface Base<Routes extends Record<string, Any>>
    extends Schema.TaggedUnion<Cases<Routes>>
  {
    /** The route definitions, by tag. */
    readonly routes: Routes
    /** The tag of the catch-all route, the first declared `"/*"`, if any. */
    readonly catchAll: (keyof Routes & string) | undefined
    /** Parses a URL path, with its search, into a route value, resolving redirects. */
    readonly parse: (url: string) => Option.Option<this["Type"]>
    /** Like `parse`, and also reports whether the URL was redirected or normalised. */
    readonly resolve: (url: string) => Option.Option<Resolved<this["Type"]>>
    /**
     * Prints a route value as an absolute URL path under the base, with its
     * search. A param equal to its field's decoding default is left out.
     */
    readonly print: (route: this["Type"]) => string
    /**
     * Prints a route value's path under the base, without its search: the key
     * of a page that updates in place when only the search changes.
     */
    readonly printPath: (route: this["Type"]) => string
    /** A union of some of the routes, for a section's props. It shares the base path. */
    readonly subset: <const Tags extends keyof Routes & string>(
      tags: ReadonlyArray<Tags>
    ) => Union<{ readonly [K in Tags]: Routes[K] }>
    /** The base path: `""`, `"#"` or a path such as `"/en"` or `"/docs/"`. */
    readonly base: () => string
    /** Sets the base path. Router and server Layers call it when built. */
    readonly setBase: (base: string) => void
  }

  /**
   * One constructor per route, keyed by tag.
   *
   * **Details**
   *
   * A constructor takes what `make` takes, without `_tag`: `{ params, search }`.
   * The argument is optional when the route has no field that needs a value.
   * It fills in `params`, `search` and decoding defaults, and validates, as
   * `make` does.
   *
   * @stability experimental
   * @category models
   * @since 0.1.0
   */
  export type Constructors<Routes extends Record<string, Any>> = {
    readonly [K in keyof Routes & string]: (
      ...args: Command.MakeArgs<WithoutTag<Cases<Routes>[K]["~type.make.in"]>>
    ) => Cases<Routes>[K]["Type"]
  }

  /**
   * Keys that can't be route tags because they collide with union, schema,
   * function or object members, plus `then`, which would make the union a
   * thenable that `await` and `Promise.resolve` call.
   *
   * @stability experimental
   * @category models
   * @since 0.1.0
   */
  export type ReservedTag =
    | Extract<keyof Base<{}> | keyof Function, string>
    | "constructor"
    | "hasOwnProperty"
    | "isPrototypeOf"
    | "propertyIsEnumerable"
    | "toLocaleString"
    | "valueOf"
    | "__proto__"
    | "__defineGetter__"
    | "__defineSetter__"
    | "__lookupGetter__"
    | "__lookupSetter__"
    | "then"
}

type WithoutTag<Input> = {
  readonly [K in keyof Input as K extends "_tag" ? never : K]: Input[K]
}

/**
 * Any route union.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface AnyUnion {
  readonly parse: (url: string) => Option.Option<{ readonly _tag: string }>
  readonly resolve: (
    url: string
  ) => Option.Option<Resolved<{ readonly _tag: string }>>
  readonly print: (route: any) => string
  readonly printPath: (route: any) => string
  readonly catchAll: string | undefined
  readonly base: () => string
  readonly setBase: (base: string) => void
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

type Segment =
  | { readonly _tag: "Static"; readonly value: string }
  | { readonly _tag: "Param"; readonly name: string }
  | {
    readonly _tag: "Rest"
  }

const parseTemplate = (path: string): ReadonlyArray<Segment> => {
  if (!path.startsWith("/")) {
    throw new Error(`Route template "${path}" must start with "/"`)
  }
  const parts = path === "/" ? [] : path.replace(/\/$/, "").slice(1).split("/")
  return parts.map((part, index): Segment => {
    if (part === "*") {
      if (index !== parts.length - 1) {
        throw new Error(
          `Route template "${path}": "*" must be the last segment`
        )
      }
      return { _tag: "Rest" }
    }
    if (part.startsWith(":")) {
      if (part.length === 1) {
        throw new Error(`Route template "${path}": a param needs a name`)
      }
      return { _tag: "Param", name: part.slice(1) }
    }
    return { _tag: "Static", value: part }
  })
}

/** Fields that weren't given infer as their constraint, which means none. */
type Declared<Fields extends Schema.Struct.Fields> = string extends keyof Fields
  ? {}
  : Fields

/**
 * Defines a route from a path template and the Schemas of its params and
 * search.
 *
 * **Details**
 *
 * Every `:name` in the template must have a Schema in `params`, which is a
 * compile error otherwise. A trailing `*` captures the rest of the path, as
 * the `"*"` param. Params and search decode from URL strings through
 * `Schema.toCodecStringTree`, so a `Schema.Number` param parses `"42"`. A
 * search field that is neither optional nor defaulted makes the route a 404
 * when it's missing or fails to decode.
 *
 * Give a search field a default with the Schema API, as
 * `Schema.Number.pipe(Schema.withDecodingDefaultKey(Effect.succeed(1)))`:
 * its type is then `number`, an absent or invalid param decodes to the
 * default, `print` leaves the param out while it holds the default, and the
 * union's `make` fills it in.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const make = <
  const Path extends string,
  const Params extends Schema.Struct.Fields = {},
  const Search extends Schema.Struct.Fields = {}
>(
  path: Path,
  ...[options]: [PathParams<Path>] extends [never] ? [options?: {
      readonly params?: Params | undefined
      readonly search?: Search | undefined
    }]
    : [
      options: {
        readonly params:
          & Params
          & { readonly [K in PathParams<Path>]: Schema.Constraint }
        readonly search?: Search | undefined
      }
    ]
): Route<Path, Declared<Params>, Declared<Search>> => {
  const params = (options?.params ?? {}) as Declared<Params>
  for (const segment of parseTemplate(path)) {
    if (segment._tag === "Param" && !(segment.name in params)) {
      throw new Error(
        `Route "${path}" has no Schema for its :${segment.name} param`
      )
    }
  }
  return {
    [TypeId]: TypeId,
    path,
    params,
    search: (options?.search ?? {}) as Declared<Search>
  }
}

/**
 * A redirect for a route union: a template whose raw string params and search
 * map to a route value.
 *
 * **Details**
 *
 * A redirect is ranked with the routes, and `parse` returns the route it
 * maps to. `resolve` reports it as `redirected`, which the server answers
 * with a 301.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const redirect = <const Path extends string>(
  path: Path,
  to: (
    params: { readonly [K in PathParams<Path>]: string },
    search: Readonly<Record<string, string | ReadonlyArray<string>>>
  ) => { readonly _tag: string }
): Redirect => {
  parseTemplate(path)
  return { _tag: "Redirect", path, to: to as Redirect["to"] }
}

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

type RawSearch = Record<string, string | Array<string>>

const parseSearch = (input: string): RawSearch | undefined => {
  // No prototype, so keys such as `constructor` or `__proto__` are plain search keys.
  const search: RawSearch = Object.create(null)
  if (input === "") return search
  for (const pair of input.split("&")) {
    if (pair === "") continue
    const at = pair.indexOf("=")
    const key = decodeComponent(
      (at < 0 ? pair : pair.slice(0, at)).replaceAll("+", " ")
    )
    const value = decodeComponent(
      (at < 0 ? "" : pair.slice(at + 1)).replaceAll("+", " ")
    )
    if (key === undefined || value === undefined) return undefined
    const found = Object.hasOwn(search, key) ? search[key] : undefined
    search[key] = found === undefined
      ? value
      : typeof found === "string"
      ? [found, value]
      : [...found, value]
  }
  return search
}

const printSearch = (search: unknown): string => {
  if (typeof search !== "object" || search === null) return ""
  const parts: Array<string> = []
  for (const [key, value] of Object.entries(search)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (typeof item === "string") {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(item)}`)
      }
    }
  }
  return parts.length === 0 ? "" : `?${parts.join("&")}`
}

/** A relative or full-URL base, as Vite allows, keeps the routes at the root. */
const normaliseBase = (base: string): string => {
  if (base === "/" || /^(\.|\/\/|[a-z][a-z\d+.-]*:|$)/i.test(base)) return ""
  if (base.startsWith("#")) return "#"
  return base.startsWith("/") ? base : `/${base}`
}

/** The base without its trailing slash, which only Home keeps. */
const prefixOf = (base: string): string =>
  base.endsWith("/") ? base.slice(0, -1) : base

// ---------------------------------------------------------------------------
// Unions
// ---------------------------------------------------------------------------

interface Entry {
  readonly segments: ReadonlyArray<Segment>
  readonly rank: ReadonlyArray<number>
  readonly order: number
  readonly route:
    | {
      readonly tag: string
      readonly decodeParams: (raw: unknown) => Option.Option<unknown>
      readonly decodeSearch: (
        raw: RawSearch
      ) => Option.Option<
        { readonly value: unknown; readonly invalid: ReadonlyArray<string> }
      >
    }
    | undefined
  readonly redirect: Redirect | undefined
}

const rankOf = (segments: ReadonlyArray<Segment>): ReadonlyArray<number> =>
  segments.map((segment) =>
    segment._tag === "Static" ? 0 : segment._tag === "Param" ? 1 : 2
  )

const compareRank = (a: Entry, b: Entry): number => {
  const length = Math.max(a.rank.length, b.rank.length)
  for (let index = 0; index < length; index++) {
    const x = a.rank[index] ?? -1
    const y = b.rank[index] ?? -1
    if (x !== y) return x - y
  }
  return a.order - b.order
}

const matchShape = (
  segments: ReadonlyArray<Segment>,
  input: ReadonlyArray<string>
): Record<string, string> | undefined => {
  const params: Record<string, string> = {}
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]!
    if (segment._tag === "Rest") {
      params["*"] = input.slice(index).join("/")
      return params
    }
    const part = input[index]
    if (part === undefined) return undefined
    if (segment._tag === "Static") {
      if (part !== segment.value) return undefined
    } else {
      if (part === "") return undefined
      params[segment.name] = part
    }
  }
  return input.length === segments.length ? params : undefined
}

/** Whether the codec decodes `{}`, and what to. */
const decodeAbsent = <A>(codec: Schema.Codec<A, unknown>): Option.Option<A> =>
  Schema.decodeUnknownOption(codec)({})

/** Gives a field with a decoding default that default as its constructor default too, so `make` fills it in. */
const makeField = (
  key: string,
  field: Schema.Constraint
): Schema.Constraint => {
  if (field.ast.context?.constructorDefault !== undefined) return field
  const absent = decodeAbsent(
    Schema.Struct({ [key]: field }) as unknown as Schema.Codec<
      Record<string, unknown>,
      unknown
    >
  )
  if (Option.isNone(absent) || !Object.hasOwn(absent.value, key)) return field
  const value = absent.value[key]
  return (field as any).pipe(
    Schema.withConstructorDefault(Effect.succeed(value) as any)
  )
}

const fieldsSchema = (fields: Schema.Struct.Fields): Schema.Top => {
  const struct = Schema.Struct(
    Object.fromEntries(
      Object.entries(fields).map(([key, field]) => [key, makeField(key, field)])
    )
  )
  const empty = struct.makeOption({})
  return Option.isSome(empty)
    ? struct.pipe(
      Schema.withConstructorDefault(Effect.succeed(empty.value) as any)
    ) as any
    : struct as any
}

const paramFieldsOf = (route: Any): Schema.Struct.Fields =>
  route.path.endsWith("*")
    ? { ...route.params, "*": Schema.String }
    : route.params

/** A search field as the parser and the printer see it. */
interface SearchField {
  readonly key: string
  /**
   * Decodes `{ [key]: raw }` to `{ [key]: value }`. An optional or defaulted field also decodes
   * `{}`, its key absent, and a default is evaluated each time.
   */
  readonly decode: (raw: unknown) => Option.Option<object>
  /** The encoded default, which `print` leaves out. */
  readonly omit: unknown
}

const searchFieldOf = (key: string, field: Schema.Constraint): SearchField => {
  const codec = Schema.toCodecStringTree(
    Schema.Struct({ [key]: field })
  ) as unknown as Schema.Codec<object, unknown>
  // The default as it is now, once: `print` leaves out a param equal to this one.
  const absent = decodeAbsent(codec)
  let omit: unknown = undefined
  if (Option.isSome(absent) && Object.hasOwn(absent.value, key)) {
    try {
      omit = (Schema.encodeUnknownSync(codec)(absent.value) as Record<
        string,
        unknown
      >)[key]
    } catch {
      // A default that doesn't encode is always printed.
    }
  }
  return { key, decode: Schema.decodeUnknownOption(codec), omit }
}

const sameEncoded = (a: unknown, b: unknown): boolean =>
  a === b ||
  (Array.isArray(a) && Array.isArray(b) && a.length === b.length &&
    a.every((item, index) => item === b[index]))

/**
 * Decodes the declared fields one by one: each from its raw value, or from a lone value wrapped
 * for an array field. A value that fails, or a repeated key on a single-valued field, is treated
 * as absent when the field is optional or defaulted, and makes the URL a 404 otherwise. Absence is
 * decoded for each URL, since a default is an Effect.
 */
const decodeSearch = (
  fields: ReadonlyArray<SearchField>,
  search: RawSearch
): Option.Option<
  { readonly value: unknown; readonly invalid: ReadonlyArray<string> }
> => {
  const entries: Array<[string, unknown]> = []
  const invalid: Array<string> = []
  for (const field of fields) {
    const raw = Object.hasOwn(search, field.key) ? search[field.key] : undefined
    let decoded = field.decode(raw === undefined ? {} : { [field.key]: raw })
    if (Option.isNone(decoded) && typeof raw === "string") {
      decoded = field.decode({ [field.key]: [raw] })
    }
    if (Option.isNone(decoded) && raw !== undefined) {
      decoded = field.decode({})
      invalid.push(field.key)
    }
    if (Option.isNone(decoded)) return Option.none()
    entries.push(...Object.entries(decoded.value))
  }
  return Option.some({ value: Object.fromEntries(entries), invalid })
}

const printerOf = (
  printers: Record<string, (route: any) => string>,
  route: { readonly _tag: string }
): (route: any) => string => {
  const printer = printers[route._tag]
  if (printer === undefined) throw new Error(`No route for ${route._tag}`)
  return printer
}

const build = (
  routes: Record<string, Any>,
  redirects: ReadonlyArray<Redirect>,
  baseRef: { value: string }
): any => {
  const cases: Record<string, Schema.Struct.Fields> = {}
  const entries: Array<Entry> = []
  const pathPrinters: Record<string, (route: any) => string> = {}
  const searchPrinters: Record<string, (route: any) => string> = {}
  let notFound: string | undefined
  let order = 0
  for (const [tag, route] of Object.entries(routes)) {
    const paramFields = paramFieldsOf(route)
    cases[tag] = {
      params: fieldsSchema(paramFields),
      search: fieldsSchema(route.search)
    }
    const segments = parseTemplate(route.path)
    if (route.path === "/*" && notFound === undefined) notFound = tag
    const paramsCodec = Schema.toCodecStringTree(
      Schema.Struct(paramFields)
    ) as unknown as Schema.Codec<
      unknown,
      unknown
    >
    const searchCodec = Schema.toCodecStringTree(
      Schema.Struct(route.search)
    ) as unknown as Schema.Codec<
      unknown,
      unknown
    >
    const searchFields = Object.entries(route.search).map(([key, field]) =>
      searchFieldOf(key, field)
    )
    entries.push({
      segments,
      rank: rankOf(segments),
      order: order++,
      route: {
        tag,
        decodeParams: Schema.decodeUnknownOption(paramsCodec),
        decodeSearch: (search) => decodeSearch(searchFields, search)
      },
      redirect: undefined
    })
    const encodeParams = Schema.encodeUnknownSync(paramsCodec)
    const encodeSearch = Schema.encodeUnknownSync(searchCodec)
    pathPrinters[tag] = (value) => {
      const params = encodeParams(value.params ?? {}) as Record<string, string>
      const path = segments.map((segment) =>
        segment._tag === "Static"
          ? segment.value
          : segment._tag === "Param"
          ? encodeURIComponent(params[segment.name]!)
          : (params["*"] ?? "").split("/").map(encodeURIComponent).join("/")
      ).filter((part, index, all) =>
        !(part === "" && index === all.length - 1 && index > 0)
      ).join("/")
      const base = baseRef.value
      if (base === "#") return `#/${path}`
      if (path === "") return base === "" ? "/" : base
      return `${prefixOf(base)}/${path}`.replace(/\/$/, "")
    }
    searchPrinters[tag] = (value) => {
      const encoded = encodeSearch(value.search ?? {}) as Record<
        string,
        unknown
      >
      for (const field of searchFields) {
        if (
          field.omit !== undefined &&
          sameEncoded(encoded[field.key], field.omit)
        ) delete encoded[field.key]
      }
      return printSearch(encoded)
    }
  }
  for (const redirect of redirects) {
    const segments = parseTemplate(redirect.path)
    entries.push({
      segments,
      rank: rankOf(segments),
      order: order++,
      route: undefined,
      redirect
    })
  }
  entries.sort(compareRank)

  const union = Schema.TaggedUnion(cases)

  const resolve = (href: string): Option.Option<Resolved<any>> => {
    // With the `#` base, the URL lives in the fragment.
    const inFragment = baseRef.value === "#"
    if (inFragment && !href.startsWith("#")) return Option.none()
    const url = inFragment ? href.slice(1) : href
    const hashAt = url.indexOf("#")
    const withoutHash = hashAt < 0 ? url : url.slice(0, hashAt)
    const searchAt = withoutHash.indexOf("?")
    let path = searchAt < 0 ? withoutHash : withoutHash.slice(0, searchAt)
    const searchString = searchAt < 0 ? "" : withoutHash.slice(searchAt + 1)
    const base = inFragment ? "" : baseRef.value
    const prefix = prefixOf(base)
    // Home is canonical with the base's trailing slash, or without when it has none.
    let homeRedirected = false
    if (prefix !== "") {
      if (path !== prefix && !path.startsWith(`${prefix}/`)) {
        return Option.none()
      }
      path = path.slice(prefix.length)
      homeRedirected = path !== base.slice(prefix.length)
    }
    if (!path.startsWith("/")) path = `/${path}`
    const trimmed = path.length > 1 && path.endsWith("/")
      ? path.replace(/\/+$/, "") || "/"
      : path
    const input: Array<string> = []
    if (trimmed !== "/") {
      for (const part of trimmed.slice(1).split("/")) {
        const decoded = decodeComponent(part)
        if (decoded === undefined) return Option.none()
        input.push(decoded)
      }
    }
    const search = parseSearch(searchString)
    const fallback = (): Option.Option<Resolved<any>> =>
      notFound === undefined ? Option.none() : Option.some({
        route: union.make(
          {
            _tag: notFound,
            params: { "*": input.join("/") },
            search: {}
          } as any
        ),
        redirected: false,
        notFound: true,
        invalid: []
      })
    if (search === undefined) return fallback()
    for (const entry of entries) {
      const raw = matchShape(entry.segments, input)
      if (raw === undefined) continue
      if (entry.redirect !== undefined) {
        const route = entry.redirect.to(raw, search)
        return Option.some({
          route,
          redirected: true,
          notFound: route._tag === notFound,
          invalid: []
        })
      }
      const route = entry.route!
      const params = route.decodeParams(raw)
      if (Option.isNone(params)) continue
      const decodedSearch = route.decodeSearch(search)
      if (Option.isNone(decodedSearch)) return fallback()
      return Option.some({
        route: {
          _tag: route.tag,
          params: params.value,
          search: decodedSearch.value.value
        },
        redirected: trimmed !== path ||
          (trimmed === "/" && homeRedirected),
        notFound: route.tag === notFound,
        invalid: decodedSearch.value.invalid
      })
    }
    return Option.none()
  }

  const result: Record<string, any> = Object.assign(union, {
    routes,
    catchAll: notFound,
    resolve,
    parse: (url: string) =>
      Option.map(resolve(url), (resolved) => resolved.route),
    print: (route: { readonly _tag: string }) =>
      printerOf(pathPrinters, route)(route) +
      searchPrinters[route._tag]!(route),
    printPath: (route: { readonly _tag: string }) =>
      printerOf(pathPrinters, route)(route),
    subset: (tags: ReadonlyArray<string>) =>
      build(
        Object.fromEntries(tags.map((tag) => [tag, routes[tag]!])),
        [],
        baseRef
      ),
    base: () => baseRef.value,
    setBase: (base: string) => {
      baseRef.value = normaliseBase(base)
    }
  })
  for (const tag of Object.keys(routes)) {
    if (tag in result || tag === "then") {
      throw new Error(`Route tag "${tag}" is reserved`)
    }
    const make = union.cases[tag]!.make
    result[tag] = (args?: object) => make((args ?? {}) as any)
  }
  return result
}

/**
 * Builds a route union from routes by tag, and redirects.
 *
 * **Details**
 *
 * The result is a `Schema.TaggedUnion` whose values are
 * `{ _tag, params, search }`, with `make`, `match`, `guards` and `isAnyOf`,
 * plus `parse`, `resolve`, `print`, `printPath`, `subset` and `catchAll`,
 * and one constructor per route: `AppRoute.Home()`,
 * `AppRoute.Person({ params: { id: 1 } })`. A constructor is `make` with the
 * tag filled in, and `make` stays for a tag held in a variable. Both fill in
 * `params` and `search` when no field needs a value, and a field's decoding
 * default when it's left out.
 *
 * Declare a catch-all `"/*"` route, conventionally `NotFound`, whose tag is
 * `catchAll`: it ranks last, and a required search field that fails to
 * decode resolves to it, so `parse` returns a route for every URL under the
 * base and the Model never holds an `Option`. Without one, `parse` returns
 * `Option.none()` for such URLs and `catchAll` is `undefined`.
 *
 * **Gotchas**
 *
 * - A tag in {@link Union.ReservedTag} (`parse`, `print`, `make`, `match`,
 *   `name`, `Type`, ...) is a type error, and throws when the union is built
 *   if it names a member the union has at runtime.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const union = <const Routes extends Record<string, Any>>(
  routes:
    & Routes
    & {
      readonly [K in keyof Routes]: K extends Union.ReservedTag ? never : Any
    },
  ...redirects: ReadonlyArray<Redirect>
): Union<Routes> => build(routes, redirects, { value: "" })
