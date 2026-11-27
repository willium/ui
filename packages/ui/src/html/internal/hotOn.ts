import * as Cause from "effect/Cause"
import * as Schema from "effect/Schema"
import * as Component from "../../Component.ts"
import { replace } from "../../internal/child.ts"
import { formatCause, isRedacted } from "../../internal/codecRun.ts"
import type * as keptRun from "../../internal/keptRun.ts"
import * as Kernel from "../../internal/kernel.ts"
import type * as runtime from "../../internal/runtime.ts"
import { forgetStateCodec } from "../../internal/stateCodec.ts"
import * as stateRestore from "../../internal/stateRestore.ts"
import type * as MessageLog from "../../MessageLog.ts"
import type * as View from "../../View.ts"
import type * as BrowserHost from "../BrowserHost.ts"

const hotKey = Symbol.for("@effect/ui/hot")
const swapKey = Symbol.for("@effect/ui/hot/swap")
const devToolsKey = Symbol.for("@effect/ui/devtools")
const storageKey = "@effect/ui/hot"
const releasedEvent = "@effect/ui/hot/released"

export interface DevToolsHook {
  readonly messageLog: MessageLog.MessageLog
  readonly controllables: BrowserHost.Controllables
}

export const devTools = (
  container: globalThis.Element
): DevToolsHook | undefined => {
  const view = container.ownerDocument.defaultView
  if (view === null || view !== globalThis.window) return undefined
  return (view as unknown as Record<symbol, DevToolsHook | undefined>)[
    devToolsKey
  ]
}

interface SavedRoot {
  readonly path: string
  readonly containerId: string | undefined
  readonly data: stateRestore.Saved
  readonly warnings: ReadonlyArray<string>
}

interface HotPayload {
  readonly version: 1
  readonly url: string
  readonly scroll?: { readonly x: number; readonly y: number } | undefined
  readonly roots: Array<SavedRoot>
  readonly error?: string | undefined
}

interface WindowState {
  readonly roots: Map<Kernel.Instance, () => SavedRoot | undefined>
  pending: HotPayload | undefined
  scroll: HotPayload["scroll"]
  readonly saveHook: () => void
  readonly swapHook: (
    first: Exports,
    next: Exports,
    names: ReadonlyArray<string>
  ) => boolean
  readonly claim: () => void
}

const states = new WeakMap<Window, WindowState>()

const warn = (message: string) => {
  // oxlint-disable-next-line no-console
  console.warn(message)
}

const urlOf = (view: Window): string =>
  view.location.pathname + view.location.search

const takeStorage = (view: Window): string | null => {
  try {
    const raw = view.sessionStorage.getItem(storageKey)
    if (raw !== null) view.sessionStorage.removeItem(storageKey)
    return raw
  } catch {
    return null
  }
}

const writeStorage = (view: Window, payload: HotPayload): boolean => {
  try {
    view.sessionStorage.setItem(storageKey, JSON.stringify(payload))
    return true
  } catch {
    return false
  }
}

const parsePayload = (raw: string): HotPayload | undefined => {
  try {
    const parsed = JSON.parse(raw)
    return parsed?.version === 1 && typeof parsed.url === "string" &&
        Array.isArray(parsed.roots)
      ? parsed
      : undefined
  } catch {
    return undefined
  }
}

const saveWindow = (view: Window, state: WindowState): void => {
  // Keep any snapshot from before a broken reload until a replacement mounts.
  if (state.roots.size === 0) return
  state.pending = undefined
  state.scroll = undefined
  const roots: Array<SavedRoot> = []
  for (const capture of state.roots.values()) {
    const captured = capture()
    if (captured !== undefined) roots.push(captured)
  }
  if (roots.length === 0) return
  const url = urlOf(view)
  const scroll = { x: view.scrollX, y: view.scrollY }
  if (writeStorage(view, { version: 1, url, scroll, roots })) return
  writeStorage(view, {
    version: 1,
    url,
    roots: [],
    error:
      "[@effect/ui] hot reload: saved state could not be written to sessionStorage, so the app restarted from init."
  })
}

const stateOf = (view: Window): WindowState => {
  let state = states.get(view)
  if (state === undefined) {
    const made: WindowState = {
      roots: new Map(),
      pending: undefined,
      scroll: undefined,
      saveHook: () => saveWindow(view, made),
      swapHook: (first, next, names) =>
        swap(made.roots.keys(), first, next, names),
      claim: () => claimHooks(view, made)
    }
    states.set(view, state = made)
  }
  return state
}

// Copies of this module in one window share its hooks. The first copy to mount
// a root owns them until its last root detaches, then hands them to a copy
// that still has mounted roots. Only copies with roots listen for the handoff.
const claimHooks = (view: Window, state: WindowState): void => {
  const hooks = view as unknown as Record<symbol, unknown>
  if (hooks[hotKey] !== undefined) return
  hooks[hotKey] = state.saveHook
  hooks[swapKey] = state.swapHook
}

const releaseHooks = (view: Window, state: WindowState): void => {
  view.removeEventListener(releasedEvent, state.claim)
  const hooks = view as unknown as Record<symbol, unknown>
  if (hooks[hotKey] !== state.saveHook) return
  delete hooks[hotKey]
  delete hooks[swapKey]
  view.dispatchEvent(new Event(releasedEvent))
}

const loadPending = (
  view: Window,
  state: WindowState
): HotPayload | undefined => {
  const raw = takeStorage(view)
  if (raw !== null) {
    const parsed = parsePayload(raw)
    state.pending = parsed?.url === urlOf(view) ? parsed : undefined
    state.scroll = state.pending?.scroll
    if (state.pending?.error !== undefined) warn(state.pending.error)
  }
  return state.pending
}

const takeRoot = (
  pending: HotPayload | undefined,
  path: string,
  containerId: string | undefined
): SavedRoot | undefined => {
  const index =
    pending?.roots.findIndex((entry) =>
      entry.path === path && entry.containerId === containerId
    ) ?? -1
  return index < 0 ? undefined : pending!.roots.splice(index, 1)[0]
}

const restoreScroll = (view: Window, state: WindowState): void => {
  const scroll = state.scroll
  if (scroll === undefined) return
  state.scroll = undefined
  if (scroll.x === 0 && scroll.y === 0) return
  view.requestAnimationFrame(() => view.scrollTo(scroll.x, scroll.y))
}

const interruptedIn = (
  inst: Kernel.Instance,
  out: Array<string> = []
): Array<string> => {
  for (const run of inst.runs?.pending() ?? []) {
    out.push(`${inst.path} (${run.name})`)
  }
  for (const child of stateRestore.childrenOf(inst.rendered)) {
    interruptedIn(child, out)
  }
  for (const entry of inst.kept?.children() ?? []) {
    if (!entry.inst.closed) interruptedIn(entry.inst, out)
  }
  return out
}

type Exports = Readonly<Record<string, unknown>>

type Fields = Component.Any & {
  readonly parts?: unknown
  readonly "~load"?: unknown
}

// State outside the Model has no in-place migration path.
const plain = (component: Fields): boolean => {
  const definition = component.definition
  return component.view !== undefined && component.layer === undefined &&
    component.parts === undefined && component["~load"] === undefined &&
    component["~queries"] === undefined &&
    definition.shares === undefined && definition.reads === undefined &&
    definition.slots.length === 0
}

const swappable = (from: unknown, to: unknown): to is Fields =>
  Component.isComponent(from) && Component.isComponent(to) &&
  plain(from) && plain(to) &&
  from.definition.name === to.definition.name &&
  from.elements === to.elements &&
  (from.head === undefined) === (to.head === undefined) &&
  (from.subscriptions === undefined) === (to.subscriptions === undefined)

const fits = (schema: Schema.Top | undefined, value: unknown): boolean => {
  if (schema === undefined) return true
  try {
    return Schema.is(schema)(value)
  } catch {
    return false
  }
}

const instancesIn = (
  inst: Kernel.Instance,
  out: Set<Kernel.Instance>
): void => {
  if (out.has(inst)) return
  out.add(inst)
  if (inst.closed) return
  if (inst.rendered !== undefined) instancesInRec(inst.rendered, out)
  for (const entry of inst.kept?.children() ?? []) instancesIn(entry.inst, out)
}

const instancesInRec = (rec: Kernel.Rec, out: Set<Kernel.Instance>): void => {
  const inst = rec.inst as Kernel.Instance | undefined
  // Failed children still need checking even when their fallback is visible.
  if (
    rec.v._tag === "Child" && inst !== undefined &&
    (rec.kids === undefined || inst.failure !== undefined)
  ) instancesIn(inst, out)
  for (const kid of rec.kids ?? []) instancesInRec(kid, out)
}

const holdsChild = (rec: Kernel.Rec): boolean =>
  rec.v._tag === "Child" || (rec.kids?.some(holdsChild) ?? false)

// Require index-by-index pairing along each child's ancestry to avoid remounts.
const reuses = (
  rec: Kernel.Rec,
  view: View.Node<any, any>,
  resolve: (component: unknown) => unknown
): boolean => {
  const old = rec.v
  if (old._tag === "Child") {
    return view._tag === "Child" && view.key === old.key &&
      resolve(view.component) === old.component &&
      view.view === undefined && view.slots === undefined &&
      (view.alive === undefined) === (old.alive === undefined) &&
      // A fallback on show is drawn again, so a child in it may be made again.
      !(rec.kids?.some(holdsChild) ?? false)
  }
  if (!Kernel.pairs(old, view)) return false
  if (old._tag !== "Element" || !holdsChild(rec)) return true
  const next = view as View.Element<any, any>
  if (old.owned?.length || next.owned?.length) return false
  const kids = rec.kids!
  return kids.length === next.children.length &&
    kids.every((kid, index) => reuses(kid, next.children[index]!, resolve))
}

// Reload if a child would remount, including when its component identity or
// ancestor elements change.
const keepsChildren = (
  inst: Kernel.Instance,
  to: Fields,
  resolve: (component: unknown) => unknown
): boolean => {
  const kept = inst.kept as keptRun.Table | undefined
  for (const entry of kept?.kids.values() ?? []) {
    // A parked child isn't drawn now, so its identity can't be checked.
    if (entry.rec === undefined) return false
  }
  let node: View.Node<any, any> | undefined
  try {
    node = Kernel.draw(inst, to as unknown as Kernel.Runnable, undefined)
  } catch {
    return false
  }
  if (node === undefined) return false
  return inst.rendered === undefined || reuses(inst.rendered, node, resolve)
}

const swap = (
  roots: Iterable<Kernel.Instance>,
  first: Exports,
  next: Exports,
  names: ReadonlyArray<string>
): boolean => {
  const pairs = new Map<unknown, Fields>()
  const firstOf = new Map<unknown, unknown>()
  for (const name of names) {
    const from = first[name]
    const to = next[name]
    if (from === to) continue
    if (!swappable(from, to)) return false
    pairs.set(from, to)
    firstOf.set(to, from)
  }
  const resolve = (component: unknown) => firstOf.get(component) ?? component
  const mounted = new Set<Kernel.Instance>()
  for (const root of roots) instancesIn(root, mounted)
  const found: Array<Kernel.Instance> = []
  for (const inst of mounted) {
    const to = pairs.get(inst.component)
    if (to === undefined) continue
    if (
      inst.failure !== undefined || !fits(to.model, inst.model) ||
      !fits(to.definition.props, inst.props) ||
      !keepsChildren(inst, to, resolve)
    ) return false
    found.push(inst)
  }
  // Mutate the first object so existing importers see the new code.
  for (const [from, to] of pairs) {
    Object.assign(from as Component.Any, to)
    replace(from as Component.Any, to)
    forgetStateCodec(from as Component.Any)
  }
  for (const inst of found) {
    if (inst.closed) continue
    Kernel.markDirty(inst)
    inst.component["~sync"]?.(inst)
  }
  return true
}

const restarted = (inst: Kernel.Instance, why: string): string =>
  `[@effect/ui] hot reload: ${inst.path} restarted from init. ${why}`

export const open = (
  component: Component.Any,
  container: globalThis.Element
): runtime.HotSession | undefined => {
  const view = container.ownerDocument.defaultView
  if (view === null || view !== globalThis.window) return undefined
  const path = "/" + component.definition.name
  const containerId = container.id === "" ? undefined : container.id
  const windowState = stateOf(view)
  const claimed = takeRoot(loadPending(view, windowState), path, containerId)
  for (const message of claimed?.warnings ?? []) warn(message)
  const adopting = claimed !== undefined
  let active = adopting
  let restoring = claimed?.data
  let warnings: Array<string> = []
  let instance: Kernel.Instance | undefined
  const restore = stateRestore.make({
    rootPath: path,
    entry: () => restoring,
    restore: (at) => {
      const found = restoring && stateRestore.pageAt(restoring, at)
      if (found !== undefined) delete restoring![at]
      return found
    },
    onEncodeFailure: (inst, cause) => {
      warnings.push(restarted(
        inst,
        isRedacted(cause)
          ? "Its Model holds a Schema.Redacted, which isn't written to sessionStorage."
          : `Its state doesn't encode as JSON: ${formatCause(cause)}`
      ))
    },
    onAsyncEncode: (inst) => {
      warnings.push(restarted(
        inst,
        "Its state encodes asynchronously, so it couldn't be saved before reload."
      ))
      return false
    },
    onRestoreThrow: (inst, error) => {
      warnings.push(restarted(
        inst,
        `Its restore threw: ${Cause.pretty(Cause.die(error))}`
      ))
    },
    onDecodeFailure: (inst, cause) =>
      warn(restarted(
        inst,
        `Its saved state no longer decodes: ${formatCause(cause)}`
      ))
  })
  const capture = (): SavedRoot | undefined => {
    if (instance === undefined || instance.closed) return undefined
    const data: stateRestore.Saved = {}
    warnings = []
    restore.snapshot(instance, data)
    const interrupted = interruptedIn(instance)
    if (interrupted.length > 0) {
      warnings.push(
        "[@effect/ui] hot reload: interrupted in-flight Commands: " +
          interrupted.join(", ")
      )
    }
    return { path, containerId, data, warnings }
  }
  return {
    get hasSnapshot() {
      return active
    },
    init: (inst, first) => {
      if (!active) return undefined
      const next = restore.init(inst, first)
      return restore.restored(inst)
        ? { model: next.model, commands: [], events: [] }
        : next
    },
    restored: restore.restored,
    hold: (owner, rec, at, component) =>
      active ? restore.hold(owner, rec, at, component) : undefined,
    attach: (inst) => {
      instance = inst
      restore.watch(inst.tree)
      windowState.roots.set(inst, capture)
      view.addEventListener(releasedEvent, windowState.claim)
      windowState.claim()
    },
    flushed: (buildsPendingSince) => {
      if (
        restoring === undefined &&
        (!adopting || windowState.scroll === undefined)
      ) return
      if (buildsPendingSince(0) !== 0 || restore.holding()) return
      if (adopting) restoreScroll(view, windowState)
      restoring = undefined
    },
    clear: () => {
      restoring = undefined
      active = false
      restore.clear()
    },
    detach: () => {
      if (instance !== undefined) windowState.roots.delete(instance)
      instance = undefined
      if (windowState.roots.size === 0) releaseHooks(view, windowState)
    }
  }
}

// Roots that `Renderer.mount` placed on a host with `hot: true`, such as a
// native one. Their hot-reload runtime calls the swap hook on `globalThis`.
const hostRoots = new Set<Kernel.Instance>()

const hostSwap: WindowState["swapHook"] = (first, next, names) =>
  swap(hostRoots, first, next, names)

export const openHost = (): runtime.HotSession | undefined => {
  let instance: Kernel.Instance | undefined
  const hooks = globalThis as unknown as Record<symbol, unknown>
  return {
    hasSnapshot: false,
    init: () => undefined,
    restored: () => false,
    hold: () => undefined,
    attach: (inst) => {
      instance = inst
      hostRoots.add(inst)
      hooks[swapKey] ??= hostSwap
    },
    flushed: () => {},
    clear: () => {},
    detach: () => {
      if (instance !== undefined) hostRoots.delete(instance)
      instance = undefined
      if (hostRoots.size === 0 && hooks[swapKey] === hostSwap) {
        delete hooks[swapKey]
      }
    }
  }
}
