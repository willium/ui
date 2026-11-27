import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Equal from "effect/Equal"
import type * as Fiber from "effect/Fiber"
import type * as AsyncResult from "effect/reactivity/AsyncResult"
import type * as Component from "../Component.ts"
import type * as Query from "../Query.ts"
import { defer } from "./due.ts"
import { follow, fork, servicesOf } from "./fork.ts"
import * as Kernel from "./kernel.ts"
import type * as componentQueries from "./queries.ts"
import * as queryCore from "./queryCore.ts"
import * as subscriptionCore from "./subscriptions.ts"

type Cache = queryCore.Cache
type Handle = ReturnType<Cache["watch"]>
type Settled = AsyncResult.Success<any, any> | AsyncResult.Failure<any, any>

interface Watch {
  marker: componentQueries.Marker
  readonly logKey: string
  handle: Handle | undefined
  released: boolean
  debounce: Fiber.Fiber<unknown, unknown> | undefined
}

interface Keyed {
  group: componentQueries.Group
  readonly logKey: string
  readonly values: Map<
    string,
    {
      readonly args: unknown
      readonly result: Settled
      readonly patched: boolean
    }
  >
  readonly changes: Set<string>
}

interface State {
  readonly watches: Map<string, Watch>
  readonly keyed: Map<string, Keyed>
  readonly loads: Set<() => void>
  queued: boolean
  synced: boolean
  mounting: boolean
}

interface Root {
  readonly cache: Cache
  hold: (() => void) | undefined
}

const loaded = (): queryCore.Loaded => queryCore.loaded!

const roots = new WeakMap<Kernel.Tree, Root>()
const states = new WeakMap<Kernel.Instance, State>()

const cacheIn = (ctx: Context.Context<any>): Cache => {
  const cell = Context.getOrUndefined(ctx, queryCore.CacheKey)
  if (cell !== undefined) return loaded().internals(cell as never)
  return loaded().buildCache(ctx, {
    visibility: Context.get(ctx, queryCore.Visibility),
    connectivity: Context.get(ctx, queryCore.Connectivity),
    report: Context.get(ctx, queryCore.Problems)
  }).cache
}

const rootOf = (inst: Kernel.Instance): Root => {
  const tree = inst.tree
  let root = roots.get(tree)
  if (root === undefined) {
    const made: Root = root = {
      cache: cacheIn(servicesOf(inst.env)),
      hold: undefined
    }
    roots.set(tree, made)
    tree.cached?.()
    const work = tree.work
    tree.work = (idle) => work?.(idle) === true || (idle && release(made))
  }
  return root
}

/** @internal */
// oxlint-disable-next-line effect/no-unused-internal
export const cacheOf = (inst: Kernel.Instance): Cache => rootOf(inst).cache

const release = (root: Root): boolean => {
  const held = root.hold
  if (held === undefined) return false
  root.hold = undefined
  held()
  return true
}

const endPass = (inst: Kernel.Instance): void => {
  if (inst.tree.flushing) return
  const root = roots.get(inst.tree)
  if (root !== undefined) release(root)
}

const stateOf = (inst: Kernel.Instance): State => {
  let state = states.get(inst)
  if (state === undefined) {
    const made: State = state = {
      watches: new Map(),
      keyed: new Map(),
      loads: new Set(),
      queued: false,
      synced: false,
      mounting: false
    }
    states.set(inst, made)
    ;(inst.closers ??= []).push(() => releaseAll(made))
    ;(inst.swaps ??= []).push(() => swap(inst, made))
  }
  return state
}

const boundOf = (inst: Kernel.Instance): componentQueries.Bound =>
  queryCore.boundOf(inst.component as unknown as Component.Any)!

const failWith = (inst: Kernel.Instance, error: unknown, key?: string): void =>
  Kernel.fail(
    inst,
    "subscription",
    Cause.isCause(error) ? error : Cause.die(error),
    undefined,
    undefined,
    key
  )

const releaseWatch = (running: Watch, abandon = false): void => {
  if (running.released) return
  running.released = true
  running.debounce?.interruptUnsafe()
  running.handle?.unregister(abandon)
}

const releaseAll = (state: State): void => {
  for (const running of state.watches.values()) releaseWatch(running)
  for (const cancel of state.loads) cancel()
  state.loads.clear()
}

/** @internal */
// oxlint-disable-next-line effect/no-unused-internal
export const closing = (inst: Kernel.Instance): void => {
  const state = states.get(inst)
  if (state !== undefined) releaseAll(state)
}

const swap = (inst: Kernel.Instance, state: State): void => {
  for (const running of state.watches.values()) releaseWatch(running, true)
  state.watches.clear()
  state.keyed.clear()
  state.synced = false
  for (const cancel of state.loads) cancel()
  state.loads.clear()
  const results = inst.results as componentQueries.Results | undefined
  inst.results = undefined
  if (results === undefined) return
  const bound = boundOf(inst)
  for (const entry of bound.entries) {
    const result = bound.empty[entry.name]
    if (results[entry.name] !== result) {
      inst.tree.log?.(inst, { _tag: "QueryChanged", name: entry.name, result })
    }
  }
}

const against = (
  inst: Kernel.Instance,
  go: (ctx: Context.Context<any>) => void
): void => {
  if (inst.closed) return
  if (inst.hold?.(() => against(inst, go))) return
  const env = inst.env
  if (env.ctx !== undefined) return go(env.ctx)
  if (env.cause === undefined) {
    env.waiting.push(() => {
      against(inst, go)
      endPass(inst)
    })
    return
  }
  go(servicesOf(env))
}

/** @internal */
// oxlint-disable-next-line effect/no-unused-internal
export const sync = (inst: Kernel.Instance, next?: Kernel.Next): void => {
  if (inst.closed || inst.tree.host.inert) return
  const state = stateOf(inst)
  follows(inst, state, next)
  if (next === undefined && state.keyed.size > 0 && !inst.closed) {
    drainKeyed(inst, state)
  }
  endPass(inst)
}

const follows = (
  inst: Kernel.Instance,
  state: State,
  next?: Kernel.Next
): void => {
  const folds = watch(inst, state)
  if (inst.closed) return
  if (
    (inst.component as unknown as Component.Any).subscriptions !== undefined
  ) subscriptionCore.loaded?.(inst)
  for (const fold of folds) fold()
  const lists = next?.lists as ReadonlyArray<Component.ListIssue> | undefined
  if (lists !== undefined) {
    for (const list of lists) issueList(inst, state, list)
  }
  if (state.keyed.size > 0) requestKeyed(inst, state)
}

/** @internal */
// oxlint-disable-next-line effect/no-unused-internal
export const first = (inst: Kernel.Instance): void => {
  if (inst.tree.host.inert) return
  const state = stateOf(inst)
  state.mounting = true
  for (const fold of watch(inst, state)) fold()
  if (state.keyed.size > 0) drainKeyed(inst, state)
  state.mounting = false
  endPass(inst)
}

const watch = (
  inst: Kernel.Instance,
  state: State
): ReadonlyArray<() => void> => {
  const bound = boundOf(inst)
  inst.results ??= bound.empty
  let declared: ReadonlyArray<object & { readonly key: string }>
  try {
    declared = bound.context(
      inst.model,
      inst.props,
      inst.results as componentQueries.Results | undefined
    ).watches()
  } catch (error) {
    failWith(inst, error)
    return []
  }
  const markers = new Map<string, componentQueries.Marker>()
  for (const subscription of declared) {
    const marker = queryCore.markerOf(subscription)
    if (marker !== undefined) {
      if (!markers.has(subscription.key)) markers.set(subscription.key, marker)
      continue
    }
    const group = queryCore.groupOf(subscription)!
    const run = state.keyed.get(group.name)
    if (run !== undefined) run.group = group
    else {
      state.keyed.set(group.name, {
        group,
        logKey: subscriptionCore.keyOf(`~query/${group.name}`),
        values: new Map(),
        changes: new Set()
      })
    }
  }
  const watches = state.watches
  for (const [key, running] of watches) {
    if (markers.has(key)) continue
    watches.delete(key)
    releaseWatch(
      running,
      running.marker.debounce !== undefined || running.marker.interruptPrevious
    )
    if (running.marker.keyed) {
      const run = state.keyed.get(running.marker.name)
      run?.values.delete(running.marker.argsKey!)
      run?.changes.delete(running.marker.argsKey!)
    }
  }
  let folds: Array<() => void> | undefined = []
  for (const [key, marker] of markers) {
    const existing = watches.get(key)
    if (existing !== undefined) {
      existing.marker = marker
      continue
    }
    const def = loaded().defOf(marker.query)
    const fetchKey = marker.argsKey === undefined
      ? undefined
      : def.logKey(marker.args, marker.argsKey)
    const logKey = fetchKey === undefined
      ? key
      : subscriptionCore.keyOf(`~query/${marker.name}`, fetchKey)
    const running: Watch = {
      marker,
      logKey,
      handle: undefined,
      released: false,
      debounce: undefined
    }
    watches.set(key, running)
    if (marker.argsKey === undefined) continue
    inst.tree.watched?.(inst, def.name, marker.argsKey)
    const at = { args: marker.args, argsKey: marker.argsKey }
    let last: {
      readonly result: Settled
      readonly patched: boolean
      readonly more: unknown
    } | undefined
    const send = (
      result: Settled,
      patched: boolean,
      more: Query.More<any> | undefined
    ) => {
      if (running.released || inst.closed) return
      if (
        last !== undefined && last.patched === patched &&
        loaded().sameMore(last.more as never, more) &&
        Equal.equals(last.result, result)
      ) return
      last = { result, patched, more }
      if (running.marker.keyed) {
        const run = state.keyed.get(running.marker.name)!
        run.values.set(at.argsKey, { args: at.args, result, patched })
        run.changes.add(at.argsKey)
        return requestKeyed(inst, state)
      }
      follow(inst.tree)(() => {
        Kernel.renderAbove(inst)
        if (running.released || inst.closed) return
        const entry = bound.byName.get(running.marker.name)!
        writeResult(
          inst,
          state,
          entry,
          bound.snapshot(entry, at, result, patched, more),
          [],
          logKey
        )
      })
    }
    const go = (ctx: Context.Context<any>) => {
      if (inst.closed || running.released) return
      const fetcher = Context.getOrUndefined(ctx, marker.query as never)
      if (fetcher === undefined) {
        return failWith(
          inst,
          new Error(
            `${inst.path}: nothing provides the query ${
              JSON.stringify(def.name)
            }`
          ),
          logKey
        )
      }
      const root = rootOf(inst)
      root.hold ??= root.cache.hold()
      const handle = root.cache.watch(
        def,
        marker.args,
        fetcher as never,
        send,
        (cause) => {
          if (!running.released) {
            follow(inst.tree)(() => failWith(inst, cause, logKey))
          }
        },
        { patched: true }
      )
      running.handle = handle
      const fold = () => {
        const current = handle.patchedView()
        if (current.result._tag !== "Initial") {
          send(current.result as Settled, current.patched, handle.more())
        }
      }
      if (folds !== undefined) folds.push(fold)
      else fold()
    }
    const start = () => against(inst, go)
    if (
      marker.debounce === undefined || !state.synced ||
      inst.tree.host.server !== undefined ||
      !wouldFetch(inst, def, marker.args)
    ) {
      start()
      continue
    }
    const resume = follow(inst.tree)
    running.debounce = fork(
      inst.tree,
      servicesOf(inst.env),
      Effect.andThen(
        Effect.sleep(Duration.millis(marker.debounce)),
        Effect.sync(() =>
          resume(() => {
            running.debounce = undefined
            start()
            endPass(inst)
          })
        )
      )
    )
  }
  if (!state.mounting) state.synced = true
  const out = folds
  folds = undefined
  return out
}

const wouldFetch = (
  inst: Kernel.Instance,
  def: ReturnType<queryCore.Loaded["defOf"]>,
  args: unknown
): boolean => {
  const info = rootOf(inst).cache.inspect(def, args)
  return info === undefined ||
    (info.watchers === 0 && info.fetch === "none" && info.stale)
}

const requestKeyed = (inst: Kernel.Instance, state: State): void => {
  if (state.queued) return
  state.queued = true
  defer(inst.tree, () => {
    state.queued = false
    Kernel.renderAbove(inst)
    drainKeyed(inst, state)
  })
}

/** @internal */
// oxlint-disable-next-line effect/no-unused-internal
export const drain = (inst: Kernel.Instance): void => {
  const state = states.get(inst)
  if (state !== undefined && state.keyed.size > 0) drainKeyed(inst, state)
}

const drainKeyed = (inst: Kernel.Instance, state: State): void => {
  let sent = true
  while (sent) {
    sent = false
    for (const run of state.keyed.values()) {
      if (inst.closed) return
      if (deliverKeyed(inst, state, run)) sent = true
    }
  }
}

const deliverKeyed = (
  inst: Kernel.Instance,
  state: State,
  run: Keyed
): boolean => {
  const group = run.group
  const declared = new Set(group.entries.map((entry) => entry.argsKey))
  const changes = group.entries.flatMap((entry) => {
    const value = run.changes.has(entry.argsKey)
      ? run.values.get(entry.argsKey)
      : undefined
    return value === undefined
      ? []
      : [{ args: value.args, result: value.result }]
  })
  const results = inst.results as componentQueries.Results | undefined
  const held = loaded().snapshotMapData(results?.[group.name])
  let prune = false
  for (const key of held?.entries.keys() ?? []) {
    if (!declared.has(key)) {
      prune = true
      break
    }
  }
  run.changes.clear()
  if (!prune && changes.length === 0) return false
  const bound = boundOf(inst)
  const entry = bound.byName.get(group.name)!
  const snapshot = bound.snapshotMany(
    entry,
    group.entries.flatMap((at) => {
      const value = run.values.get(at.argsKey)
      return value === undefined
        ? []
        : [bound.snapshot(entry, at, value.result, value.patched, undefined)]
    })
  )
  follow(inst.tree)(() =>
    writeResult(inst, state, entry, snapshot, changes, run.logKey)
  )
  return true
}

const writeResult = (
  inst: Kernel.Instance,
  state: State,
  entry: componentQueries.Entry,
  result: unknown,
  changes: ReadonlyArray<componentQueries.KeyedChange>,
  key: string
): void => {
  if (inst.closed) return
  const bound = boundOf(inst)
  const results = (inst.results ?? bound.empty) as componentQueries.Results
  if (Equal.equals(results[entry.name], result)) return
  inst.results = { ...results, [entry.name]: result }
  const seq = inst.tree.log?.(inst, {
    _tag: "QueryChanged",
    name: entry.name,
    result
  })
  if (state.mounting) {
    for (const fold of watch(inst, state)) fold()
  } else {
    Kernel.markDirty(inst)
    follows(inst, state)
  }
  if (entry.onChange === undefined || inst.closed) return
  let message: { readonly value: unknown } | undefined
  try {
    message = bound.context(
      inst.model,
      inst.props,
      inst.results as componentQueries.Results
    ).changed(
      entry.name,
      changes
    )
  } catch (error) {
    return failWith(inst, error, key)
  }
  if (message !== undefined) {
    Kernel.send(inst, message.value, {
      _tag: "Query",
      name: entry.name,
      seq
    })
  }
}

const issueList = (
  inst: Kernel.Instance,
  state: State,
  list: Component.ListIssue
): void => {
  if (inst.closed) return
  const bound = boundOf(inst)
  const field = bound.byName.get(list.name)
  if (field === undefined || !field.list) return
  let args: unknown
  try {
    args = bound.context(
      inst.model,
      inst.props,
      inst.results as componentQueries.Results | undefined
    ).argsOf(
      field.name
    ).args
  } catch (error) {
    return failWith(inst, error)
  }
  if (args === undefined) return
  const server = inst.tree.host.server
  if (server !== undefined) {
    return server.drop(
      inst,
      `$.${list.op}(${JSON.stringify(list.name)})`,
      undefined
    )
  }
  const def = loaded().defOf(field.query)
  const cache = rootOf(inst).cache
  if (list.op === "reset") return cache.reset(def, args)
  against(inst, (ctx) => {
    if (inst.closed) return
    const fetcher = Context.getOrUndefined(ctx, field.query as never)
    if (fetcher === undefined) return
    let done = false
    let cancel: (() => void) | undefined
    cancel = cache.loadMore(def, args, fetcher as never, () => {
      done = true
      if (cancel !== undefined) state.loads.delete(cancel)
    })
    if (!done) state.loads.add(cancel)
  })
}
