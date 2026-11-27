/**
 * What a component builds from `queries`: the query results an instance
 * holds beside its Model, their Schema, the opened views of `h` and `$`,
 * and the watches the runtime registers.
 *
 * A query result holds a snapshot: the last settled result of the query, at
 * the args it was taken for. The Model plus the results is an instance's state.
 *
 * @internal
 */
import * as Duration from "effect/Duration"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import type * as Component from "../Component.ts"
import type * as Query from "../Query.ts"
import * as Subscription from "../Subscription.ts"
import * as queryCore from "./queryCore.ts"

// `Query` binds a component's queries through `queryCore.loaded`, so it's loaded whenever this runs.
const queryModule = (): queryCore.Loaded => queryCore.loaded!
const QueryTypeId: Query.TypeId = "~@effect/ui/Query"

type QueryFn = ($: Component.Current<any, any, any>) => unknown

/**
 * One entry of `queries`.
 *
 * @internal
 */
export interface Entry {
  readonly name: string
  readonly query: Query.Query.Any
  /** A `queryMany` entry. */
  readonly keyed: boolean
  /** A `query` of an infinite query. */
  readonly list: boolean
  readonly args: QueryFn
  /** From `debounce`: how many milliseconds a fetch for changed args waits. */
  readonly debounce: number | undefined
  readonly dropPrevious: boolean
  /** From `interruptPrevious`: changed args interrupt the old args' fetch, as with `debounce`. */
  readonly interruptPrevious: boolean
  readonly onChange: ((...args: Array<any>) => unknown) | undefined
  readonly restore: false | undefined
}

/**
 * One set of query arguments and its cache key.
 *
 * @internal
 */
export interface Keyed {
  readonly args: unknown
  readonly argsKey: string
}

/**
 * What one query's watch carries for the runtime.
 *
 * @internal
 */
export interface Marker {
  readonly query: Query.Query.Any
  readonly name: string
  /** `undefined`: the query is disabled, and the marker is inert. */
  readonly args: unknown
  readonly argsKey: string | undefined
  /** Set for one key of a keyed query: its values are collected into the query's result. */
  readonly keyed: boolean
  readonly debounce: number | undefined
  readonly interruptPrevious: boolean
}

/**
 * A keyed query's ordered keys, accompanying its per-key watch markers.
 *
 * @internal
 */
export interface Group {
  readonly name: string
  readonly query: Query.Query.Any
  readonly entries: ReadonlyArray<Keyed>
}

/** @internal */
export interface KeyedChange {
  readonly args: unknown
  readonly result: AsyncResult.AsyncResult<any, any>
}

/**
 * An instance's query results, by query name.
 *
 * @internal
 */
export type Results = Readonly<Record<string, unknown>>

/**
 * A component's bound `queries`. `undefined` without any.
 *
 * @internal
 */
export const boundOf: (
  component: { readonly "~queries": unknown }
) => Bound | undefined = queryCore.boundOf

/** @internal */
export const isWatchKey: (key: string) => boolean = queryCore.isWatchKey

/** Whether the opened value includes an unconfirmed patch. */
const patched = (snapshot: unknown, argsKey: string | undefined): boolean => {
  const data = queryModule().snapshotData(snapshot)
  return argsKey !== undefined && data?.argsKey === argsKey && data.patched
}

/** A list's pages, with their items: the dedupe runs once per page array. */
const lists = new WeakMap<
  object,
  {
    readonly items: ReadonlyArray<unknown>
    readonly pages: ReadonlyArray<unknown>
  }
>()
const listOf = (def: QueryDef, pages: ReadonlyArray<unknown>) => {
  let out = lists.get(pages)
  if (out === undefined) {
    out = { items: def.list!.ops.itemsOf(def, pages), pages }
    lists.set(pages, out)
  }
  return out
}

/** One opened list per snapshot, so a view and `onChange` share it. */
const openedLists = new WeakMap<object, AsyncResult.AsyncResult<any, any>>()

/** One kept result per stored Success, so every read gets the same value. */
const kept = new WeakMap<object, AsyncResult.AsyncResult<any, any>>()

/** Keeps a stored Success while changed args load, unless `dropPrevious` is set. */
const open = (
  snapshot: unknown,
  argsKey: string | undefined,
  entry: Entry
): AsyncResult.AsyncResult<any, any> => {
  if (argsKey === undefined) return AsyncResult.initial(false)
  const data = queryModule().snapshotData(snapshot)
  if (data?.result === undefined) return AsyncResult.initial(true)
  const { def, result } = data
  if (data.argsKey === argsKey) {
    if (!entry.list) return result
    let opened = openedLists.get(snapshot as object)
    if (opened === undefined) {
      const more = data.more ?? { _tag: "End" }
      opened = AsyncResult.map(
        result,
        (pages: ReadonlyArray<unknown>) => ({ ...listOf(def, pages), more })
      )
      openedLists.set(snapshot as object, opened)
    }
    return opened
  }
  if (entry.dropPrevious || result._tag !== "Success") {
    return AsyncResult.initial(true)
  }
  let out = kept.get(result)
  if (out === undefined) {
    out = AsyncResult.success(
      entry.list
        // Prevent pagination of the kept list; loadMore uses the current args.
        ? { ...listOf(def, result.value), more: { _tag: "Loading" } }
        : result.value,
      { waiting: true, timestamp: result.timestamp }
    )
    kept.set(result, out)
  }
  return out
}

/**
 * A keyed result opened at the query's keys: an entry per key in its order,
 * each the stored result or `Initial`, waiting, and `get` by args.
 */
const openKeyed = (
  def: QueryDef,
  snapshots: unknown,
  entries: ReadonlyArray<Keyed>
): ReadonlyArray<
  { readonly args: unknown; readonly result: AsyncResult.AsyncResult<any, any> }
> => {
  const stored = queryModule().snapshotMapData(snapshots)?.entries
  const opened = entries.map((entry) => {
    const data = queryModule().snapshotData(stored?.get(entry.argsKey))
    return {
      args: entry.args,
      result: data?.result ?? AsyncResult.initial(true),
      patched: data?.patched ?? false
    }
  })
  const byKey = new Map(opened.map((entry, i) => [entries[i].argsKey, entry]))
  return Object.assign(opened, {
    get: (args: unknown) => Option.fromUndefinedOr(byKey.get(def.argsKey(args)))
  })
}

/**
 * Returns query arguments deduplicated by key, in first-occurrence order.
 */
const uniqueArgs = (
  component: string,
  name: string,
  def: QueryDef,
  args: unknown
): ReadonlyArray<Keyed> => {
  if (!Array.isArray(args)) {
    throw new Error(
      `${component}: queries.${name} is a queryMany query, and its args must return an array.`
    )
  }
  const seen = new Set<string>()
  const out: Array<Keyed> = []
  for (const one of args) {
    const argsKey = def.argsKey(one)
    if (seen.has(argsKey)) continue
    seen.add(argsKey)
    out.push({ args: one, argsKey })
  }
  return out
}

type QueryDef = ReturnType<typeof Query.defOf>

const isQuery = (u: unknown): u is Query.Query.Any =>
  Predicate.hasProperty(u, QueryTypeId)

/**
 * Checks the entries of `queries`. Throws at module load on an entry that
 * isn't `{ query, args }` or `{ queryMany, args }`.
 */
const parse = (component: string, queries: unknown): ReadonlyArray<Entry> => {
  if (queries === undefined) return []
  if (typeof queries !== "object" || queries === null) {
    throw new Error(
      `${component}: queries must be a record of { query, args } or { queryMany, args } entries.`
    )
  }
  return Object.entries(queries).map(([name, entry]): Entry => {
    const fail = (why: string) =>
      new Error(`${component}: queries.${name} ${why}`)
    if (typeof entry !== "object" || entry === null) {
      throw fail("must be { query, args } or { queryMany, args }.")
    }
    const {
      args,
      debounce,
      dropPrevious,
      interruptPrevious,
      query,
      queryMany,
      onChange,
      restore
    } = entry as Record<string, unknown>
    if ((query === undefined) === (queryMany === undefined)) {
      throw fail("must have exactly one of query and queryMany.")
    }
    const definition = query ?? queryMany
    if (!isQuery(definition)) {
      throw fail(
        `has a ${
          query === undefined ? "queryMany" : "query"
        } that isn't a Query.`
      )
    }
    if (typeof args !== "function") throw fail("must have an args function.")
    if (onChange !== undefined && typeof onChange !== "function") {
      throw fail("has an onChange that isn't a function.")
    }
    if (restore !== undefined && restore !== false) {
      throw fail("has a restore that isn't false.")
    }
    const list = queryModule().defOf(definition).list !== undefined
    if (queryMany !== undefined && list) {
      throw fail(
        "has an infinite query under queryMany. An infinite query takes query."
      )
    }
    return {
      name,
      query: definition,
      keyed: queryMany !== undefined,
      list,
      args: args as QueryFn,
      debounce: debounce === undefined
        ? undefined
        : Duration.toMillis(debounce as Duration.Input),
      dropPrevious: dropPrevious === true,
      interruptPrevious: interruptPrevious === true,
      onChange: onChange as Entry["onChange"],
      restore
    }
  })
}

/** A query's evaluated arguments, deduplicated by key for a keyed query. */
type Current =
  | {
    readonly args: unknown
    readonly argsKey: string | undefined
    readonly entries?: undefined
  }
  | {
    readonly args: ReadonlyArray<unknown>
    readonly argsKey: undefined
    readonly entries: ReadonlyArray<Keyed>
  }

/**
 * The views of one `(model, props, results)`: each query runs at most once,
 * and the watches, `queries` and `patched` share its args.
 *
 * @internal
 */
export interface Context {
  readonly queries: Record<string, any>
  readonly patched: Record<string, boolean>
  /** The watch markers and keyed groups of every query, which the runtime registers. */
  readonly watches: () => ReadonlyArray<Subscription.Subscription<any, any>>
  /** The args of a query: a keyed query's are its unique args. */
  readonly argsOf: (name: string) => Current
  /**
   * The message a query's `onChange` returns for its result as these views open
   * it, or `undefined` without `onChange`. A keyed query's also gets `changes`.
   */
  readonly changed: (
    name: string,
    changes: ReadonlyArray<KeyedChange>
  ) => { readonly value: unknown } | undefined
}

/**
 * The Schema of an instance's results: a struct with each query's result Schema.
 *
 * @internal
 */
export type ResultsSchema = Schema.Struct<
  { readonly [name: string]: Schema.Codec<unknown, unknown> }
>

/** @internal */
export interface Bound {
  readonly entries: ReadonlyArray<Entry>
  readonly byName: ReadonlyMap<string, Entry>
  /** Every result empty: an instance's results before a query writes one. */
  readonly empty: Results
  /** The empty result of each `restore: false` entry, for history to save. */
  readonly unsaved: Results | undefined
  /** The Schema of the results for page state and history: a field per query, by name. */
  readonly schema: ResultsSchema
  /**
   * The Schema of the results for the message log. It keeps `waiting` and a
   * list's exact `more`, which `update` can read and page state drops.
   */
  readonly logSchema: ResultsSchema
  readonly context: (
    model: unknown,
    props: unknown,
    results: Results | undefined
  ) => Context
  /** A single or infinite query's result holding `result` at `entry`. */
  readonly snapshot: (
    entry: Entry,
    at: Keyed,
    result: AsyncResult.Success<any, any> | AsyncResult.Failure<any, any>,
    patched: boolean,
    more: Query.More<any> | undefined
  ) => unknown
  /** A keyed query's result holding `snapshots`, one per args key. */
  readonly snapshotMany: (entry: Entry, snapshots: Iterable<unknown>) => unknown
}

interface State {
  $: Component.Current<any, any, any>
  readonly results: Results
  readonly memo: Map<string, Current>
  /** The opened keyed results, built at the first read. */
  readonly opened: Map<string, unknown>
  readonly running: Array<string>
}

/**
 * Binds `queries`. `undefined` without any.
 *
 * @internal
 */
export const bind = (
  component: string,
  queries: unknown
): Bound | undefined => {
  const entries = parse(component, queries)
  if (entries.length === 0) return undefined
  const byName = new Map(entries.map((entry) => [entry.name, entry]))
  const empty: Record<string, unknown> = {}
  let unsaved: Record<string, unknown> | undefined
  const fields: Record<string, Schema.Top> = {}
  const logFields: Record<string, Schema.Top> = {}
  for (const entry of entries) {
    const def = queryModule().defOf(entry.query)
    empty[entry.name] = entry.keyed
      ? queryModule().makeSnapshotMap(def, entry.name, [])
      : queryModule().makeSnapshot(def, entry.name, undefined, undefined)
    fields[entry.name] = entry.keyed
      ? queryModule().snapshotMapSchema(entry.query, entry.name)
      : queryModule().snapshotSchema(entry.query, entry.name)
    logFields[entry.name] = entry.keyed
      ? queryModule().snapshotMapSchema(entry.query, entry.name, true)
      : queryModule().snapshotSchema(entry.query, entry.name, true)
    if (entry.restore === false) {
      ;(unsaved ??= {})[entry.name] = empty[entry.name]
    }
  }
  Object.freeze(empty)
  const stateKey = Symbol()
  const argsOf = (state: State, entry: Entry): Current => {
    let current = state.memo.get(entry.name)
    if (current !== undefined) return current
    if (state.running.includes(entry.name)) {
      throw new Error(
        `${component}: the queries ${
          [
            ...state.running.slice(state.running.indexOf(entry.name)),
            entry.name
          ].join(" -> ")
        } read each other in a cycle.`
      )
    }
    state.running.push(entry.name)
    let args: unknown
    try {
      args = entry.args(state.$)
    } finally {
      state.running.pop()
    }
    const def = queryModule().defOf(entry.query)
    if (entry.keyed) {
      const keyed = uniqueArgs(component, entry.name, def, args)
      current = {
        args: keyed.map((one) => one.args),
        argsKey: undefined,
        entries: keyed
      }
    } else {current = {
        args,
        argsKey: args === undefined ? undefined : def.argsKey(args)
      }}
    state.memo.set(entry.name, current)
    return current
  }
  // The two views share prototypes built once here, so a render defines no property.
  const view = (
    read: (
      snapshot: unknown,
      argsKey: string | undefined,
      entry: Entry
    ) => unknown,
    keyed: ((state: State, entry: Entry) => unknown) | undefined
  ) => {
    const proto = {}
    for (const entry of entries) {
      if (entry.keyed && keyed === undefined) continue
      Object.defineProperty(proto, entry.name, {
        enumerable: true,
        get(this: any) {
          const state: State = this[stateKey]
          return entry.keyed
            ? keyed!(state, entry)
            : read(
              state.results[entry.name],
              argsOf(state, entry).argsKey,
              entry
            )
        }
      })
    }
    return proto
  }
  const openKeyedResult = (state: State, entry: Entry) => {
    let opened = state.opened.get(entry.name)
    if (opened === undefined) {
      opened = openKeyed(
        queryModule().defOf(entry.query),
        state.results[entry.name],
        argsOf(state, entry).entries!
      )
      state.opened.set(entry.name, opened)
    }
    return opened
  }
  const queriesProto = view(open, openKeyedResult)
  const patchedProto = view(patched, undefined)
  const viewOf = (proto: object, state: State) => {
    const out = Object.create(proto)
    out[stateKey] = state
    return out
  }
  const watchesOf = (state: State) =>
    entries.flatMap((entry) => {
      const current = argsOf(state, entry)
      const watchName = `~query/${entry.name}`
      const watchOf = (
        args: unknown,
        argsKey: string | undefined,
        keyed: boolean
      ) => {
        const marker: Marker = {
          query: entry.query,
          name: entry.name,
          args,
          argsKey,
          keyed,
          debounce: entry.debounce,
          interruptPrevious: entry.interruptPrevious
        }
        return {
          [Subscription.TypeId]: Subscription.TypeId,
          // New args are a new key, so the old watcher goes before the new one registers.
          key: Subscription.keyOf(watchName, argsKey),
          name: watchName,
          deps: argsKey === undefined ? undefined : [argsKey],
          stream: Stream.never,
          [queryCore.markerKey]: marker
        } as unknown as Subscription.Subscription<any, any>
      }
      if (current.entries === undefined) {
        return [watchOf(current.args, current.argsKey, false)]
      }
      // A keyed query: one watcher per unique key, and the group that collects their values.
      const group: Group = {
        name: entry.name,
        query: entry.query,
        entries: current.entries
      }
      return [
        {
          [Subscription.TypeId]: Subscription.TypeId,
          key: Subscription.keyOf(watchName),
          name: watchName,
          deps: undefined,
          stream: Stream.never,
          [queryCore.groupKey]: group
        } as unknown as Subscription.Subscription<any, any>,
        ...current.entries.map((one) => watchOf(one.args, one.argsKey, true))
      ]
    })
  const make = (model: any, props: any, results: Results): Context => {
    const state: State = {
      $: undefined!,
      results,
      memo: new Map(),
      opened: new Map(),
      running: []
    }
    const queries = viewOf(queriesProto, state)
    state.$ = { model, props, queries }
    return {
      queries,
      patched: viewOf(patchedProto, state),
      argsOf: (name) => argsOf(state, byName.get(name)!),
      watches: () => watchesOf(state),
      changed: (name, changes) => {
        const entry = byName.get(name)!
        if (entry.onChange === undefined) return undefined
        return {
          value: entry.keyed
            ? entry.onChange(queries[name], changes)
            : entry.onChange(queries[name])
        }
      }
    }
  }
  // One context per (model, props, results), shared by the watches and the view of that triple.
  const contexts = new WeakMap<
    object,
    {
      readonly model: unknown
      readonly props: unknown
      readonly context: Context
    }
  >()
  return {
    entries,
    byName,
    empty,
    unsaved,
    schema: Schema.Struct(fields) as unknown as ResultsSchema,
    logSchema: Schema.Struct(logFields) as unknown as ResultsSchema,
    context: (model, props, results = empty) => {
      const found = contexts.get(results)
      if (
        found !== undefined && found.model === model && found.props === props
      ) return found.context
      const context = make(model, props, results)
      contexts.set(results, { model, props, context })
      return context
    },
    snapshot: (entry, at, result, patched, more) =>
      queryModule().makeSnapshot(
        queryModule().defOf(entry.query),
        entry.name,
        at,
        result,
        patched,
        more
      ),
    snapshotMany: (entry, snapshots) =>
      queryModule().makeSnapshotMap(
        queryModule().defOf(entry.query),
        entry.name,
        snapshots
      )
  }
}
