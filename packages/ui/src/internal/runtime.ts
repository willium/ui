/**
 * @internal
 */
import * as hotSessions from "#hot"
import * as Cause from "effect/Cause"
import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import type * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Scheduler from "effect/Scheduler"
import * as Scope from "effect/Scope"
import * as Command from "../Command.ts"
import type * as Component from "../Component.ts"
import type * as Query from "../Query.ts"
import type * as Renderer from "../Renderer.ts"
import * as View from "../View.ts"
import * as domHost from "./domHost.ts"
import * as Executor from "./executor.ts"
import { inline } from "./fork.ts"
import * as heads from "./heads.ts"
import type * as hydrateRun from "./hydrateRun.ts"
import * as Kernel from "./kernel.ts"
import * as lazy from "./lazy.ts"
import * as messageLog from "./messageLog.ts"
import type * as partsRun from "./partsRun.ts"
import { childName, segment, slotSegment } from "./paths.ts"
import * as queryCore from "./queryCore.ts"
import type * as Recorder from "./recorder.ts"
import type * as routeRun from "./routeRun.ts"
import { scopeAddFinalizerUnsafe } from "./scope.ts"
import * as serialize from "./serialize.ts"
import * as serverHost from "./serverHost.ts"
import * as services from "./services.ts"
import type { Decoded } from "./stateCodec.ts"
import * as transitionRun from "./transitionRun.ts"

/** @internal */
export interface Instance {
  readonly path: string
  readonly component: Component.Any
  readonly props: unknown
}

/** @internal */
export interface Pending {
  readonly path: string
  readonly name: string
  readonly status: string
}

/** @internal */
export interface Load {
  readonly path: string
  readonly name: string
}

/** @internal */
export interface Root {
  readonly path: string
  readonly session: string
  readonly instance: Instance
  readonly model: () => unknown
  readonly send: (message: unknown) => void
  readonly find: (born: number) => Instance | undefined
  readonly dispatch: (
    inst: Instance,
    message: unknown
  ) => Effect.Effect<Dispatched>
  readonly cache: ReturnType<typeof Query.internals>
  readonly crashed: () => Cause.Cause<unknown> | undefined
  readonly flush: () => number
  readonly buildsPendingSince: (flush: number) => number
  readonly head: () => unknown
  readonly adoptionHead: () => unknown
  readonly adopted: Effect.Effect<void>
  readonly waiting: () => ReadonlyArray<string>
  readonly freeze: () => queryCore.Cache | undefined
}

/** @internal */
export type Dispatched =
  | { readonly _tag: "Updated"; readonly seq: number }
  | { readonly _tag: "Failed"; readonly seq: number }
  | {
    readonly _tag: "Ignored"
    readonly reason: "closed" | "waiting" | "frozen" | "unchanged"
  }

/** @internal */
export interface PaintState {
  readonly model: unknown
  readonly queries?: Component.Results | undefined
  readonly props?: unknown
}

export { stateCodecOf } from "./stateCodec.ts"

/** @internal */
export const eventOwners = (
  handlers: Readonly<Record<string, unknown>>
): Readonly<Record<string, ReadonlyArray<string>>> => {
  const out: Record<string, ReadonlyArray<string>> = {}
  for (const event in handlers) {
    const handler = handlers[event]
    if ((handler as partsRun.Layered | undefined)?.["~fire"] !== undefined) {
      out[event] = (handler as partsRun.Layered).layers.map((layer) =>
        layer.inst.path
      )
    }
  }
  return out
}

const noCommands: ReadonlyArray<unknown> = []

const unchanged: Dispatched = { _tag: "Ignored", reason: "unchanged" }

const noHead = { title: undefined }

let sessions = 0

const bridge = (
  host: Renderer.Host<any>,
  step: Recorder.Recording["step"],
  ownsHead: boolean
): Kernel.Host => ({
  createElement: (tag) => {
    const node = host.createElement(tag)
    if (tag.length === 4 && node?.nodeName === "FORM") {
      host.setEvents(node, View.noFields, () => false, View.noFields)
    }
    return node
  },
  createText: (text) => host.createText(text),
  setText: (node, text) => host.setText(node, text),
  setAttr: (node, name, value, previous) =>
    host.setAttr(node, name, value, previous),
  normalizeAttrs: host.normalizeAttrs === undefined
    ? undefined
    : (node, attrs) => host.normalizeAttrs!(node, attrs),
  setProp: (node, name, value) => host.setProp(node, name, value),
  setEvents: (node, rec) => {
    const view = rec.v as View.Element<any, any>
    host.setEvents(
      node,
      view.handlers,
      (event, handler, payload, onMessage) =>
        step(() => {
          const inst = rec.inst
          if (inst.closed) return false
          if (
            (handler as partsRun.Layered | undefined)?.["~fire"] !== undefined
          ) {
            return (handler as partsRun.Layered)["~fire"](
              payload,
              event,
              onMessage
            )
          }
          let message: unknown = handler
          if (typeof handler === "function") {
            try {
              message = handler(payload)
            } catch (error) {
              Kernel.fail(inst, "event", Cause.die(error))
              return false
            }
          }
          if (message === undefined) return false
          onMessage?.()
          Kernel.send(inst, message, event)
          return true
        }),
      view.eventOptions
    )
    host.events?.listen(view.handlers, view.eventOptions)
  },
  insert: (parent, node, before) =>
    host.insertBefore(parent, node, before ?? undefined),
  remove: (_parent, node) => host.remove(node),
  createContainer: host.createContainer === undefined
    ? undefined
    : () => host.createContainer!(),
  parentOf: (node) => host.parentOf(node),
  nextOf: (node) => host.nextOf(node) ?? null,
  commit: host.commit === undefined ? undefined : () => host.commit!(),
  controlled: host.controlled.size === 0 ? undefined : host.controlled,
  runsMounts: host.runsMounts,
  head: ownsHead && host.head !== undefined
    ? (head) => host.head!(head)
    : undefined,
  transitions: host.viewTransition === undefined
    ? undefined
    : transitionRun.make(host.viewTransition),
  unmounting: host.unmounting === undefined
    ? undefined
    : (container, nodes) => host.unmounting!(container, nodes)
})

const reportTo =
  (ctx: Context.Context<never>): Kernel.Tree["report"] =>
  (path, where, cause) => {
    Effect.runForkWith(ctx)(
      Effect.logError(`${path} failed in ${where}`, cause)
    )
  }

interface Server {
  readonly fetches: boolean
  readonly hooks: typeof serverHooks
  readonly idle: typeof idleOf
}

const serverHooks = (
  ctx: Context.Context<any>,
  record: Kernel.Recorder,
  deferred: Set<Kernel.Instance>
): Kernel.Server => {
  const report = (problem: unknown) => queryCore.report(ctx, problem)
  return {
    drop: (inst, name, issued) => {
      if (issued !== undefined) {
        record(inst, {
          _tag: "CommandDropped",
          name,
          issued,
          reason: "server"
        })
      }
      report(
        new Command.ServerCommandIssued({
          path: inst.path,
          command: name,
          message: issued === undefined
            ? `[@effect/ui] ${inst.path}'s update issued ${name} during server rendering, and it was dropped. The server renders a list's first page only.`
            : `[@effect/ui] ${inst.path}'s update issued ${name} during server rendering, and it was dropped. No Command runs on the server: read data with a query.`
        })
      )
    },
    defer: (inst) => {
      deferred.add(inst)
    },
    report
  }
}

const idleOf = (
  executor: Executor.Executor,
  root: () => Kernel.Instance | undefined,
  cache: () => queryCore.Cache | undefined
) => {
  const waiters: Array<() => void> = []
  let checking = false
  const check = () => {
    if (waiters.length === 0 || checking) return
    checking = true
    executor.schedule(() => {
      checking = false
      const instance = root()
      const tree = instance?.tree
      if (
        tree === undefined || tree.scheduled || tree.dirty.length > 0 ||
        (tree.building?.size ?? 0) > 0
      ) return
      const made = cache()
      if (made !== undefined && made.pending().length > 0) return
      if (loadsOf(instance!).length > 0) return
      for (const f of waiters.splice(0)) f()
    })
  }
  return {
    check,
    when: (f: () => void) => {
      waiters.push(f)
      check()
    }
  }
}

/** @internal */
export interface HotSession {
  readonly hasSnapshot: boolean
  readonly init: (
    inst: Kernel.Instance,
    first: Kernel.Next
  ) => Kernel.Next | undefined
  readonly restored: (inst: Kernel.Instance) => boolean
  readonly hold: (
    ...args: Parameters<NonNullable<Kernel.Host["hold"]>>
  ) => boolean | undefined
  readonly attach: (inst: Kernel.Instance) => void
  readonly flushed: (buildsPendingSince: (flush: number) => number) => void
  readonly clear: () => void
  readonly detach: () => void
}

interface Options {
  readonly fallback?:
    | ((
      failure: AsyncResult.Failure<never, unknown>,
      h: any
    ) => View.Content<never, any>)
    | undefined
  readonly hydrate?: hydrateRun.Hydrating | undefined
  readonly hot?: HotSession | undefined
  readonly query?: Renderer.QueryOptions | undefined
  readonly head?: boolean | undefined
  readonly adoptionHead?: boolean | undefined
  readonly scheduler?: Scheduler.Scheduler | undefined
  readonly onEmit?: Kernel.Tree["onEmit"]
}

const makeCell = (
  ctx: Context.Context<any>,
  options: Options | undefined,
  server: Server | undefined,
  onMake: (cache: queryCore.Cache) => void
) => {
  let made: {
    readonly cache: queryCore.Cache
    readonly dispose: Effect.Effect<void>
  } | undefined
  const get = () => {
    if (made === undefined) {
      made = queryCore.loaded!.buildCache(ctx, {
        visibility: Context.get(ctx, queryCore.Visibility),
        connectivity: Context.get(ctx, queryCore.Connectivity),
        report: Context.get(ctx, queryCore.Problems),
        idleTimeToLive: options?.query?.idleTimeToLive,
        settleOnce: server !== undefined,
        fetches: server === undefined || server.fetches
      })
      onMake(made.cache)
    }
    return made.cache
  }
  const cell: queryCore.CacheCell = {
    [queryCore.CacheTypeId]: queryCore.CacheTypeId,
    [queryCore.CacheCellTypeId]: get
  }
  return {
    cell,
    cache: () => queryCore.loaded === undefined ? undefined : get(),
    made: () => made?.cache,
    dispose: Effect.suspend(() => made?.dispose ?? Effect.void)
  }
}

const isClosed = (scope: Scope.Scope): boolean => scope.state._tag === "Closed"

const withProps = <A, E, R>(
  rootProps: unknown,
  f: (props: unknown) => Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> =>
  Effect.isEffect(rootProps)
    ? Effect.flatMap(rootProps as Effect.Effect<unknown>, f)
    : f(rootProps)

/** @internal */
export type MakeDom = (
  container: unknown,
  options: {
    readonly head: boolean
    readonly step: (f: () => boolean) => boolean
  }
) => Kernel.Host & { readonly dispose: () => void }

interface HostInput {
  readonly elements: ReadonlyArray<string> | "any"
  readonly hot?: boolean | undefined
  readonly make: (
    container: unknown,
    ownsHead: boolean,
    step: Recorder.Recording["step"]
  ) => {
    readonly base: Kernel.Host
    readonly dom: (Kernel.Host & { readonly dispose: () => void }) | undefined
  }
}

const fromRenderer = (ctx: Context.Context<any>): HostInput => {
  const host = Context.get(ctx, services.Renderer).host
  return {
    elements: host.elements,
    hot: host.hot,
    make: (container, ownsHead, step) => {
      const dom = domHost.doms.get(host)?.make(container, {
        head: ownsHead,
        step
      })
      return { base: dom ?? bridge(host, step, ownsHead), dom }
    }
  }
}

const fromDom = (
  makeDom: MakeDom,
  elements: ReadonlyArray<string> | "any"
): HostInput => ({
  elements,
  make: (container, ownsHead, step) => {
    const dom = makeDom(container, { head: ownsHead, step })
    return { base: dom, dom }
  }
})

const mountCore = (
  component: Component.Any,
  rootProps: unknown,
  container: unknown,
  hostOf: (ctx: Context.Context<any>) => HostInput,
  options?: Options
): Effect.Effect<
  Root & Renderer.Root<any, any>,
  never,
  Scope.Scope
> =>
  withProps(rootProps, (props) => {
    const path = "/" + component.definition.name
    const go = (decoded?: Exit.Exit<Decoded, unknown>) =>
      Effect.uninterruptible(
        Effect.contextWith((ctx: Context.Context<Scope.Scope>) => {
          const owner = Context.get(ctx, Scope.Scope)
          if (isClosed(owner)) return Effect.interrupt
          let made: ReturnType<typeof start> | undefined
          let ready = false
          let waiters: Array<() => void> | undefined
          scopeAddFinalizerUnsafe(owner, {}, () => {
            const close = Effect.suspend(() => made?.close ?? Effect.void)
            return Effect.suspend(() =>
              ready
                ? close
                : Effect.flatMap(
                  Effect.callback<void>((resume) => {
                    if (ready) resume(Effect.void)
                    else (waiters ??= []).push(() => resume(Effect.void))
                  }),
                  () => close
                )
            )
          })
          try {
            made = start(
              component,
              props,
              container,
              ctx,
              options,
              hostOf(ctx),
              undefined,
              decoded && [path, decoded]
            )
          } finally {
            ready = true
            if (waiters !== undefined) {
              for (const wake of waiters) wake()
            }
          }
          return isClosed(owner)
            ? Effect.interrupt
            : Effect.succeed(made.root)
        })
      )
    const hydrate = options?.hydrate
    return hydrate === undefined
      ? go(undefined)
      : hydrate.decode(component as unknown as Kernel.Runnable, path, go)
  })

/** @internal */
export const mount = (
  component: Component.Any,
  rootProps: unknown,
  container: unknown,
  options?: Options
): Effect.Effect<
  Root & Renderer.Root<any, any>,
  never,
  Scope.Scope | Renderer.Renderer
> => mountCore(component, rootProps, container, fromRenderer, options)

/** @internal */
export const mountDom = (
  component: Component.Any,
  rootProps: unknown,
  container: unknown,
  makeDom: MakeDom,
  elements: ReadonlyArray<string> | "any",
  options?: Options
): Effect.Effect<Root & Renderer.Root<any, any>, never, Scope.Scope> =>
  mountCore(
    component,
    rootProps,
    container,
    () => fromDom(makeDom, elements),
    options
  )

const start = (
  component: Component.Any,
  props: unknown,
  container: unknown,
  caller: Context.Context<any>,
  options: Options | undefined,
  hostInput: HostInput,
  server?: Server,
  decodedRoot?: readonly [string, Exit.Exit<Decoded, unknown>]
) => {
  const ctx = onScheduler(caller, options?.scheduler)
  const logService = Context.get(ctx, messageLog.MessageLog)
  const executor = Context.get(ctx, Executor.CurrentExecutor)
  const clock = Context.get(ctx, Clock.Clock)
  const session = `${clock.currentTimeMillisUnsafe().toString(36)}-k${
    (sessions++).toString(36)
  }`
  let flushes = 0
  let inFlush = true
  const since = () => inFlush ? flushes : flushes + 1
  const recording = messageLog.recorder === undefined
    ? messageLog.silent
    : messageLog.recorder(logService, clock, session, component.definition.name)
  let initCommands: ReadonlyArray<unknown> | undefined
  const hydrate = options?.hydrate
  const hot = options?.hot ??
    (hostInput.hot === true ? hotSessions.openHost() : undefined)
  const record: Kernel.Recorder = (inst, draft) => {
    if (initCommands !== undefined && draft._tag === "Mounted") {
      draft = { ...draft, commands: initCommands }
      initCommands = undefined
    }
    if (hydrating !== undefined) {
      const next = hydrating.record(inst, draft)
      if (!("_tag" in next)) return next.seq
      draft = next
    }
    if (
      draft._tag === "Mounted" &&
      (routing?.restored(inst) === true || hot?.restored(inst) === true)
    ) {
      draft = { ...draft, adopted: true }
    }
    const seq = recording.record(inst, draft)
    if (
      inst === dispatching && outcome === undefined &&
      (draft._tag === "Update" || draft._tag === "Failed")
    ) {
      outcome = {
        _tag: draft._tag === "Update" ? "Updated" : "Failed",
        seq: seq ?? -1
      }
    }
    return seq
  }
  let dispatching: Kernel.Instance | undefined
  let outcome: Dispatched | undefined
  const dispatchTo = (
    inst: Kernel.Instance,
    message: unknown
  ): Dispatched => {
    const reason = inst.closed
      ? "closed"
      : hydrating?.isWaiting(inst) === true
      ? "waiting"
      : frozen
      ? "frozen"
      : undefined
    if (reason !== undefined) return { _tag: "Ignored", reason }
    dispatching = inst
    outcome = undefined
    try {
      recording.step(() => Kernel.send(inst, message))
    } finally {
      dispatching = undefined
    }
    return outcome ?? unchanged
  }
  const hooks = Context.getOrUndefined(ctx, services.RootHooks)
  const building = (flush: number) => {
    let count = 0
    for (const stamp of kernelRoot?.instance.tree.building ?? []) {
      if (stamp.flush >= flush) count++
    }
    return count
  }
  const ownsHead = options?.head !== false
  const { base, dom } = hostInput.make(container, ownsHead, recording.step)
  const deferred = new Set<Kernel.Instance>()
  let hydrating: hydrateRun.Session | undefined
  const routing: routeRun.Routed | undefined = hooks?.kernel?.(hooks, {
    path: "/" + component.definition.name,
    container,
    context: ctx,
    flush: () => flushes,
    since,
    buildsPendingSince: building,
    hydrated: () =>
      kernelRoot !== undefined &&
      hydrating?.adopts(kernelRoot.instance) === true,
    static: hydrate?.static === true,
    navigated: () => {
      hydrating?.closeWindow()
      hot?.clear()
    }
  })
  const bridged: Kernel.Host = {
    ...base,
    hold: hot === undefined
      ? routing?.hold
      : (owner, rec, at, component) =>
        hot.hold(owner, rec, at, component) ??
          routing?.hold(owner, rec, at, component) ?? false,
    commit: () => {
      base.commit?.()
      hydrating?.commit()
      routing?.flushed()
      hot?.flushed(building)
      idle?.check()
    },
    server: server?.hooks(ctx, record, deferred)
  }
  hydrating = hydrate?.open({
    path: "/" + component.definition.name,
    container,
    bridged,
    base,
    dom: dom !== undefined,
    record: recording.record,
    at: clock.currentTimeMillisUnsafe(),
    decodedRoot,
    heldFor: routing?.heldFor,
    cache: () => queries.made()
  })
  const idle = server?.idle(
    executor,
    () => kernelRoot?.instance,
    () => queries.made()
  )
  const fallback = options?.fallback
  let frozen = false
  const queries = makeCell(ctx, options, server, (cache) => {
    cache.onFetch((event) => {
      if (!frozen) recording.tree({ _tag: "FetchStarted", ...event })
    })
    if (idle !== undefined) cache.onFetchEnd(idle.check)
    hydrating?.onCache(cache)
  })
  if (hydrating?.hasQuery) queries.cache()
  let kernelRoot: Kernel.Root | undefined
  kernelRoot = recording.session(() =>
    Kernel.mount(
      component as unknown as Kernel.Runnable,
      props,
      container,
      bridged,
      {
        context: Context.add(
          Context.add(ctx, queryCore.CacheKey, queries.cell as never),
          services.CurrentRoot,
          () => routing?.handle
        ),
        init: (inst) => {
          const made = inst.component as unknown as Component.Any
          const elements = made.elements
          if (
            elements !== undefined && hostInput.elements !== "any" &&
            !hostInput.elements.includes(elements.name)
          ) {
            throw new Error(
              `${made.definition.name} renders ${elements.name} elements, and this host shows ${
                hostInput.elements.join(", ")
              }`
            )
          }
          const first = inst.component.init(inst.props)
          const adopted = hydrating?.init(inst, first) ??
            hot?.init(inst, first)
          if (adopted !== undefined) {
            return routing === undefined
              ? adopted
              : routing.init(inst, adopted, true)
          }
          if (server !== undefined && first.commands.length > 0) {
            initCommands = first.commands
            return {
              model: first.model,
              commands: noCommands,
              events: first.events,
              lists: first.lists,
              sends: first.sends,
              viewTransition: first.viewTransition
            }
          }
          return routing === undefined ? first : routing.init(inst, first)
        },
        log: record,
        onEmit: options?.onEmit,
        schedule: (task) => {
          const run = recording.follow()
          executor.schedule(() => {
            flushes++
            inFlush = true
            try {
              run(task)
            } finally {
              inFlush = false
            }
          })
        },
        follow: recording.follow,
        report: reportTo(ctx),
        fallback: fallback === undefined ?
          undefined :
          (cause) =>
            View.toNode(
              fallback(
                AsyncResult.failure(cause),
                View.makeHelper({}, component.elements)
              )
            )
      }
    )
  )
  inFlush = false
  hydrating?.end()
  const mounted = kernelRoot
  const instance = mounted.instance
  const tree = instance.tree
  if (routing !== undefined) {
    routing.attach(instance)
    routing.flushed()
  }
  if (hot !== undefined) {
    hot.attach(instance)
    hot.flushed(building)
  }
  tree.flush = since
  const head = () =>
    tree.head?.value ??
      component.elements?.head?.merge({ entries: [], children: [] }) ??
      noHead
  const root = {
    path: instance.path,
    session,
    instance: instance as unknown as Instance,
    model: () => instance.failure === undefined ? instance.model : undefined,
    send: (message: unknown) => recording.step(() => mounted.send(message)),
    find: (born: number) =>
      findIn(instance, born, recording.numberOf) as Instance | undefined,
    dispatch: (inst: Instance, message: unknown) =>
      Effect.callback<Dispatched>((resume) => {
        const target = inst as unknown as Kernel.Instance
        const go = () => resume(Effect.succeed(dispatchTo(target, message)))
        if (tree.transitions?.waits(target)) tree.transitions.wait(go)
        else go()
      }),
    get cache() {
      return (queries.cache() ?? { pending: () => [] }) as unknown as Root[
        "cache"
      ]
    },
    crashed: () => instance.failure,
    flush: () => flushes,
    buildsPendingSince: building,
    head,
    adoptionHead: () =>
      hydrating === undefined ? head() : hydrating.adoptionHead(),
    adopted: hydrating === undefined ? Effect.void : hydrating.adopted,
    waiting: () =>
      hydrating === undefined
        ? (noCommands as ReadonlyArray<string>)
        : hydrating.waiting(),
    freeze: () => {
      if (!frozen) {
        tree.transitions?.settle()
        if (!tree.closed && (tree.scheduled || tree.dirty.length > 0)) {
          Kernel.flush(tree)
        }
        frozen = tree.closed = true
      }
      return queries.made()
    }
  } satisfies Root & Renderer.Root<any, any>
  hydrating?.finish(root.head)
  const awaitOwned: Effect.Effect<void> = Effect.suspend(() =>
    tree.owned === undefined || tree.owned.size === 0
      ? Effect.void
      : Effect.andThen(Fiber.awaitAll([...tree.owned]), awaitOwned)
  )
  return {
    root,
    deferred,
    idle,
    close: Effect.suspend(() => {
      hydrating?.close()
      routing?.detach()
      hot?.detach()
      dom?.dispose()
      if (frozen) tree.closed = false
      // A hook's throw surfaces only after teardown and cleanup.
      let failed: Effect.Effect<void> = Effect.void
      try {
        base.unmounting?.(container, Kernel.nodesOf(instance.rendered!, []))
      } catch (error) {
        failed = Effect.die(error)
      }
      mounted.close()
      return Effect.andThen(awaitOwned, Effect.andThen(queries.dispose, failed))
    })
  }
}

const findIn = (
  inst: Kernel.Instance,
  born: number,
  numberOf: (inst: Kernel.Instance) => number | undefined
): Kernel.Instance | undefined => {
  if (inst.closed) return undefined
  if (numberOf(inst) === born) return inst
  const found = inst.rendered === undefined
    ? undefined
    : findInRec(inst.rendered, born, numberOf)
  if (found !== undefined) return found
  for (const entry of inst.kept?.children() ?? []) {
    const found = findIn(entry.inst, born, numberOf)
    if (found !== undefined) return found
  }
  return undefined
}

const findInRec = (
  rec: Kernel.Rec,
  born: number,
  numberOf: (inst: Kernel.Instance) => number | undefined
): Kernel.Instance | undefined => {
  if (rec.v._tag === "Child" && rec.inst.at === rec) {
    return findIn(rec.inst, born, numberOf)
  }
  const kids = rec.kids
  if (kids === undefined) return undefined
  for (const kid of kids) {
    const found = findInRec(kid, born, numberOf)
    if (found !== undefined) return found
  }
  return undefined
}

/** @internal */
export const pending = (root: Root): ReadonlyArray<Pending> =>
  pendingOf(root.instance as unknown as Kernel.Instance)

/** @internal */
export const loads = (root: Root): ReadonlyArray<Load> =>
  loadsOf(root.instance as unknown as Kernel.Instance)

const pendingOf = (
  inst: Kernel.Instance,
  out: Array<Pending> = []
): Array<Pending> => {
  const runs = inst.runs
  if (runs !== undefined) {
    for (const run of runs.pending()) {
      out.push({ path: inst.path, ...run } as Pending)
    }
  }
  if (inst.rendered !== undefined) pendingIn(inst.rendered, out)
  return out
}

const pendingIn = (rec: Kernel.Rec, out: Array<Pending>): void => {
  const kids = rec.kids
  if (kids !== undefined) { for (const kid of kids) pendingIn(kid, out) }
  else if (rec.v._tag === "Child" && !rec.inst.closed) pendingOf(rec.inst, out)
}

const loadsOf = (
  inst: Kernel.Instance,
  out: Array<Load> = []
): Array<Load> => {
  if (inst.rendered !== undefined) loadsIn(inst.path, inst.rendered, out)
  if (inst.kept !== undefined) {
    for (const rec of inst.kept.parked()) loadsIn(inst.path, rec, out)
  }
  return out
}

// `under` is the path a child drawn at `rec` mounts under.
const loadsIn = (
  under: string,
  rec: Kernel.Rec,
  out: Array<Load>
): void => {
  const view = rec.v
  const kids = rec.kids
  if (kids === undefined) {
    if (view._tag === "Child" && !rec.inst.closed) loadsOf(rec.inst, out)
    return
  }
  if (view._tag === "Outlet") {
    under = rec.inst.path + "/" + slotSegment(view.name)
  } else if (
    view._tag === "Child" && lazy.isLazy(view.component) &&
    lazy.stateOf(view.component)._tag === "Loading"
  ) {
    // A kept child mounts under its holder.
    if (view.alive !== undefined) under = rec.inst.path
    out.push({
      path: under + "/" + segment(view),
      name: childName(view.component)
    })
  }
  for (const kid of kids) loadsIn(under, kid, out)
}

const onScheduler = (
  ctx: Context.Context<any>,
  callers = Context.get(ctx, Scheduler.Scheduler)
): Context.Context<any> => {
  let dispatcher: Scheduler.SchedulerDispatcher | undefined
  return Context.add(
    ctx,
    Scheduler.Scheduler,
    Context.get(ctx, Executor.CurrentExecutor).scheduler ?? {
      executionMode: callers.executionMode,
      shouldYield: (fiber) =>
        inline > 0
          ? fiber.currentOpCount >= fiber.cache.maxOpsBeforeYield
          : callers.shouldYield(fiber),
      makeDispatcher: () => dispatcher ??= callers.makeDispatcher()
    }
  )
}

/**
 * Renders a tree on the server: on a host that keeps nothing,
 * waiting for provided Layers and the per-request cache's fetches until
 * nothing is in flight or the budget runs out, then serialising it once.
 *
 * @internal
 */
export const prerender = (
  component: Component.Any,
  rootProps: unknown,
  options: {
    readonly budget: Duration.Input
    readonly elements: ReadonlyArray<string> | "any"
    readonly static?: boolean | undefined
    readonly sink?: services.ServerSink | undefined
    readonly onFinish?: ((cache: queryCore.Cache) => void) | undefined
  }
): Effect.Effect<Renderer.Prerendered<any>> =>
  withProps(rootProps, (props) =>
    Effect.acquireUseRelease(
      Scope.make("sequential"),
      Effect.fnUntraced(function*(scope) {
        const budget = Duration.fromInputUnsafe(options.budget)
        const started = !Duration.isZero(budget)
        const ctx = Context.add(
          yield* Effect.context<never>(),
          Scope.Scope,
          scope
        )
        const made = start(
          component,
          props,
          serverHost.node,
          ctx,
          undefined,
          {
            elements: options.elements,
            make: () => ({ base: serverHost.host, dom: undefined })
          },
          { fetches: started, hooks: serverHooks, idle: idleOf }
        )
        yield* Scope.addFinalizer(scope, made.close)
        const root = made.root
        if (started) {
          yield* Effect.raceFirst(
            Effect.callback<void>((resume) => {
              made.idle!.when(() => resume(Effect.void))
            }),
            Effect.sleep(budget)
          )
        }
        const cache = root.freeze()
        if (cache !== undefined) options.onFinish?.(cache)
        const query = cache === undefined ? {} : cache.dehydrate()
        const snap = serialize.snapshot(
          root.instance as unknown as Kernel.Instance,
          made.deferred,
          cache?.shipped
        )
        const nodes: Array<Renderer.ServerNode> = []
        const state = yield* serialize.write(
          snap,
          query,
          ctx,
          options.static === true,
          options.sink ?? serialize.nodeSink(nodes)
        )
        return { nodes, state, model: root.model(), head: headOf(root) }
      }),
      (scope, exit) => Scope.close(scope, exit)
    ))

/** @internal */
export const headOf = (root: Root): unknown => {
  const elements = root.instance.component.elements
  const head = root.head()
  return elements?.name === "html" &&
      elements.head === undefined &&
      (head as { readonly meta?: unknown }).meta === undefined
    ? { ...heads.emptyHtml, ...(head as object) }
    : head
}

const unmoved: Kernel.Transitions = {
  request: () => {},
  waits: () => true,
  wait: () => {},
  hold: () => false,
  settle: () => {}
}

interface Painted {
  readonly fellBack: ReadonlyArray<string>
  readonly fallbacks: ReadonlyArray<string>
  readonly skipped: ReadonlyArray<string>
}

const paintCore = (
  component: Component.Any,
  rootProps: unknown,
  container: unknown,
  state: (path: string) => PaintState | undefined,
  hostOf: (ctx: Context.Context<any>) => HostInput
): Effect.Effect<
  Painted,
  never,
  Scope.Scope
> =>
  Effect.contextWith((caller: Context.Context<Scope.Scope>) => {
    const ctx = onScheduler(caller)
    const executor = Context.get(ctx, Executor.CurrentExecutor)
    const fellBack: Array<string> = []
    const skipped = new Set<string>()
    let broke: { readonly error: unknown } | undefined
    const { base, dom } = hostOf(ctx).make(
      container,
      false,
      messageLog.silent.step
    )
    const close = () => {
      painted.close()
      dom?.dispose()
    }
    const painted = Kernel.mount(
      component as unknown as Kernel.Runnable,
      rootProps,
      container,
      {
        ...base,
        setEvents: () => {},
        transitions: () => unmoved,
        inert: true,
        skipped: (path) => skipped.add(path)
      },
      {
        context: ctx,
        init: (inst) => {
          let recorded: PaintState | undefined
          try {
            recorded = state(inst.path)
          } catch (error) {
            broke = { error }
            throw error
          }
          if (recorded === undefined) {
            fellBack.push(inst.path)
            recorded = inst.component.init(inst.props)
          } else {
            if (Object.hasOwn(recorded, "props")) inst.props = recorded.props
            inst.results = recorded.queries
          }
          return {
            model: recorded!.model,
            commands: noCommands,
            events: noCommands
          }
        },
        schedule: (task) => executor.schedule(task),
        report: reportTo(ctx)
      }
    )
    if (broke !== undefined) {
      close()
      return Effect.die(broke.error)
    }
    const fallbacks = new Set<string>()
    fallbacksIn(painted.instance, fallbacks)
    return Effect.as(
      Scope.addFinalizer(
        Context.get(ctx, Scope.Scope),
        Effect.sync(close)
      ),
      {
        fellBack,
        fallbacks: Array.from(fallbacks),
        skipped: Array.from(skipped)
      }
    )
  })

/** @internal */
// oxlint-disable-next-line effect/no-unused-internal
export const paint = (
  component: Component.Any,
  rootProps: unknown,
  container: unknown,
  state: (path: string) => PaintState | undefined
): Effect.Effect<
  Painted,
  never,
  Scope.Scope | Renderer.Renderer
> => paintCore(component, rootProps, container, state, fromRenderer)

/** @internal */
export const paintDom = (
  component: Component.Any,
  rootProps: unknown,
  container: unknown,
  state: (path: string) => PaintState | undefined,
  makeDom: MakeDom,
  elements: ReadonlyArray<string> | "any"
): Effect.Effect<
  Painted,
  never,
  Scope.Scope
> =>
  paintCore(
    component,
    rootProps,
    container,
    state,
    () => fromDom(makeDom, elements)
  )

const fallbacksIn = (inst: Kernel.Instance, out: Set<string>): void => {
  if (!inst.closed && inst.rendered !== undefined) {
    fallbacksInRec(inst.rendered, out)
  }
}

const fallbacksInRec = (rec: Kernel.Rec, out: Set<string>): void => {
  if (rec.v._tag === "Child") {
    if (rec.inst.at === rec) return fallbacksIn(rec.inst, out)
    out.add(rec.inst.path)
  }
  const kids = rec.kids
  if (kids !== undefined) { for (const kid of kids) fallbacksInRec(kid, out) }
}
