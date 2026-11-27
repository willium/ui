/**
 * A `Renderer.Host` over React Native's Fabric renderer
 * (`global.nativeFabricUIManager`), with no React.
 *
 * Fabric's shadow tree is persistent: a committed node never changes, and
 * changing it means cloning it and every ancestor. The Host contract is a
 * mutable tree, so this host keeps a mirror of `NativeNode`s that the
 * renderer mutates, marks what changed, and at `commit` clones only the
 * changed paths and calls `completeRoot` once. Shadow nodes are created at
 * the first commit that includes them, so props set before it cost nothing.
 *
 * Fabric diffs committed trees in C++ and unmounts the views a tree no longer
 * holds, so the host needs no destroy signal: a node the mirror drops is
 * collected.
 *
 * @stability experimental
 * @since 0.1.0
 */
import type * as Renderer from "@effect/ui/Renderer"
import type * as View from "@effect/ui/View"
import type * as Context from "effect/Context"
import * as Native from "./Native.ts"

/**
 * The part of `nativeFabricUIManager` the host uses.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface UIManager {
  createNode(
    tag: number,
    viewName: string,
    rootTag: number,
    props: object,
    instanceHandle: unknown
  ): unknown
  cloneNodeWithNewProps(node: unknown, props: object): unknown
  cloneNodeWithNewChildren(node: unknown): unknown
  cloneNodeWithNewChildrenAndProps(node: unknown, props: object): unknown
  appendChild(parent: unknown, child: unknown): unknown
  createChildSet(rootTag: number): unknown
  appendChildToSet(set: unknown, child: unknown): void
  completeRoot(rootTag: number, set: unknown): void
  registerEventHandler(
    handler: (instanceHandle: unknown, type: string, payload: unknown) => void
  ): void
  dispatchCommand(
    node: unknown,
    command: string,
    args: ReadonlyArray<unknown>
  ): void
  getBoundingClientRect(
    node: unknown,
    includeTransform: boolean
  ): ReadonlyArray<number> | null | undefined
}

/**
 * Options accepted by {@link make}.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Options {
  readonly ui: UIManager
  /** The surface the host renders into, as native passes it to `runApplication`. */
  readonly rootTag: number
  /** `Platform.OS` of the running app. */
  readonly os: string
  /** Turns a CSS colour into the value Fabric parses, as React Native's `processColor`. */
  readonly processColor: (color: unknown) => unknown
  /** Called after every `commit`, whether or not it changed anything. */
  readonly onCommit?: (() => void) | undefined
}

interface EventEntry {
  readonly handlers: Readonly<Record<string, View.Handler<unknown, any>>>
  readonly dispatch: Renderer.Dispatch
}

/**
 * A node of the host's mirror tree. The renderer only ever sees these.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export class NativeNode {
  parent: NativeNode | undefined = undefined
  first: NativeNode | undefined = undefined
  last: NativeNode | undefined = undefined
  prev: NativeNode | undefined = undefined
  next: NativeNode | undefined = undefined
  /** Props changed since the last commit, `null` for a removed one. */
  pending: Record<string, unknown> | undefined = undefined
  /** The committed shadow node, or `undefined` until a commit creates it. */
  shadow: unknown = undefined
  /** The native view name `shadow` was created as. */
  viewName = ""
  /** The tag of the parent `shadow` was created under. */
  parentTag = 0
  /** This node or a descendant changed since the last commit. */
  dirty = true
  /** A child changed, or was inserted or removed, since the last commit. */
  kidsChanged = false
  /** A scroll view's content container: its only child, holding its children. */
  inner: NativeNode | undefined = undefined
  events: EventEntry | undefined = undefined
  /** A text input's count of edits, which native needs back with its text. */
  eventCount = 0
  tag: number
  readonly type: string
  /** Props of the shadow node, in Fabric's flat form. */
  readonly props: Record<string, unknown>
  constructor(type: string, props: Record<string, unknown>) {
    this.type = type
    this.tag = nextTag
    // React Native allocates even tags from 2, which never collide with
    // the surfaces' own tags.
    nextTag += 2
    this.props = props
  }
}

let nextTag = 2

// Native looks a view up by tag, so a recreated node takes a fresh one.
const retag = (n: NativeNode) => {
  n.tag = nextTag
  nextTag += 2
}

const isColor = /(^c|C)olor$/
const colors = new Map<string, unknown>()

/**
 * Makes a host for the surface `rootTag`, and the node its root mounts in.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const make = (options: Options): {
  readonly host: Renderer.Host<NativeNode>
  readonly root: NativeNode
  readonly operations: Context.Service.Shape<typeof Native.Host>
} => {
  const { onCommit, os, processColor, rootTag, ui } = options
  // Each read of a binding method makes a new host function, so read once.
  const createNode = ui.createNode
  const cloneProps = ui.cloneNodeWithNewProps
  const cloneChildren = ui.cloneNodeWithNewChildren
  const cloneBoth = ui.cloneNodeWithNewChildrenAndProps
  const appendChild = ui.appendChild
  const root = new NativeNode("#root", {})
  listen(ui)

  const color = (value: unknown) => {
    if (typeof value !== "string") return processColor(value)
    let out = colors.get(value)
    if (out === undefined) {
      if (colors.size > 255) colors.clear()
      colors.set(value, out = processColor(value))
    }
    return out
  }

  // Marks `n` changed, so that every ancestor is cloned with its children.
  const markDirty = (n: NativeNode | undefined) => {
    while (n !== undefined && !n.dirty) {
      n.dirty = true
      n = n.parent
      if (n !== undefined) n.kidsChanged = true
    }
  }

  const setNative = (n: NativeNode, name: string, value: unknown) => {
    if (value !== undefined && isColor.test(name)) value = color(value)
    if (n.props[name] === value) return
    if (value === undefined) delete n.props[name]
    else n.props[name] = value
    // A node not created yet takes all its props at createNode.
    if (n.shadow !== undefined) {
      ;(n.pending ??= {})[name] = value === undefined ? null : value
    }
    markDirty(n)
  }

  // The view name `n` has where it sits now. Text inside text is a span,
  // which Fabric calls virtual text.
  const viewNameOf = (n: NativeNode): string => {
    switch (n.type) {
      case "view":
        return "RCTView"
      case "text":
        return n.parent?.type === "text" ? "RCTVirtualText" : "RCTText"
      case "#text":
        return "RCTRawText"
      case "scroll":
        return os === "android" && n.props.horizontal === true
          ? "AndroidHorizontalScrollView"
          : "RCTScrollView"
      case "#content":
        return os === "android" && n.parent!.props.horizontal === true
          ? "AndroidHorizontalScrollContentView"
          : "RCTScrollContentView"
      default:
        return os === "ios" ? "RCTSinglelineTextInputView" : "AndroidTextInput"
    }
  }

  // Builds the shadow node of `n` under the parent `parentTag`, cloning it
  // only if it or a child changed.
  const build = (n: NativeNode, parentTag: number): unknown => {
    if (!n.dirty && n.parentTag === parentTag) return n.shadow
    n.dirty = false
    let pending = n.pending
    n.pending = undefined
    const viewName = viewNameOf(n)
    if (
      n.shadow !== undefined &&
      (viewName !== n.viewName || n.parentTag !== parentTag)
    ) {
      // Native can't change a view's type, and a view keeps the parent it
      // was created under, so a view that moved into or out of text, a
      // scroll view that changed direction, and a view that moved to another
      // parent are new views, and so are their descendants.
      n.shadow = undefined
      retag(n)
    }
    let shadow: unknown
    if (n.shadow === undefined) {
      n.viewName = viewName
      n.parentTag = parentTag
      shadow = createNode(n.tag, viewName, rootTag, n.props, n)
    } else if (n.kidsChanged) {
      shadow = pending === undefined
        ? cloneChildren(n.shadow)
        : cloneBoth(n.shadow, pending)
    } else {
      if (pending !== undefined) n.shadow = cloneProps(n.shadow, pending)
      return n.shadow
    }
    pending = undefined
    n.kidsChanged = false
    const textual = n.type === "text"
    for (let k = n.first; k !== undefined; k = k.next) {
      // Outside text, the renderer's only text is the empty node a blank
      // view leaves, which native can't lay out.
      if (k.type === "#text" && !textual) continue
      appendChild(shadow, build(k, n.tag))
    }
    return n.shadow = shadow
  }

  const unwrap = (n: NativeNode): NativeNode => n.inner ?? n

  const host: Renderer.Host<NativeNode> = {
    elements: [Native.name],
    controlled: new Set(["value"]),
    runsMounts: true,
    hot: true,
    createElement(type) {
      if (!Native.isTag(type)) {
        throw new Error(`<${type}> isn't in the ${Native.name} vocabulary`)
      }
      // React Native's ScrollView styles its view as scrolling.
      const n = new NativeNode(
        type,
        type === "scroll" ? { overflow: "scroll" } : {}
      )
      if (type === "scroll") {
        const inner = new NativeNode("#content", { collapsable: false })
        inner.parent = n
        n.first = n.last = n.inner = inner
      }
      return n
    },
    createText(text) {
      return new NativeNode("#text", { text })
    },
    createContainer() {
      return new NativeNode("#root", {})
    },
    setText(n, text) {
      setNative(n, "text", text)
    },
    setAttr(n, name, value) {
      setNative(n, name, value)
    },
    setProp(n, name, value) {
      switch (name) {
        case "value": {
          // `text` follows native's edits, so this only sends a value that
          // differs from what the field shows. Native drops text sent for an
          // older edit than its own, so it carries the latest edit's count.
          if (n.props.text === value) return
          setNative(n, "mostRecentEventCount", n.eventCount)
          setNative(n, "text", value)
          return
        }
        case "horizontal": {
          setNative(n, name, value)
          // As in React Native's ScrollView, a horizontal scroll view and its
          // content view lay out in a row, so that the content view is as
          // wide as its children. The content view's name follows too.
          const row = value === true ? "row" : undefined
          setNative(n, "flexDirection", row)
          if (n.inner !== undefined) setNative(n.inner, "flexDirection", row)
          return
        }
      }
      setNative(n, name, value)
    },
    insertBefore(parent, n, ref) {
      if (n.parent !== undefined) host.remove(n)
      parent = unwrap(parent)
      const prev = ref === undefined ? parent.last : ref.prev
      n.parent = parent
      n.prev = prev
      n.next = ref
      if (prev === undefined) parent.first = n
      else prev.next = n
      if (ref === undefined) parent.last = n
      else ref.prev = n
      // A text node's view name depends on its parent, so check it again.
      if (n.type === "text") n.dirty = true
      parent.kidsChanged = true
      markDirty(parent)
    },
    remove(n) {
      const parent = n.parent
      if (parent === undefined) return
      if (n.prev === undefined) parent.first = n.next
      else n.prev.next = n.next
      if (n.next === undefined) parent.last = n.prev
      else n.next.prev = n.prev
      n.parent = n.prev = n.next = undefined
      parent.kidsChanged = true
      markDirty(parent)
    },
    // `nodes` are all of `parent`'s children, as the Host contract says.
    removeChildren(parent, nodes) {
      parent = unwrap(parent)
      for (const n of nodes) n.parent = n.prev = n.next = undefined
      parent.first = parent.last = undefined
      parent.kidsChanged = true
      markDirty(parent)
    },
    parentOf: (n) => n.parent?.type === "#content" ? n.parent.parent : n.parent,
    nextOf: (n) => n.next,
    setEvents(n, handlers, dispatch) {
      n.events = { handlers, dispatch }
      // A flattened view has no native view to receive touches.
      if (handlers.press !== undefined && n.props.collapsable !== false) {
        setNative(n, "collapsable", false)
      }
    },
    commit() {
      if (root.dirty) {
        root.dirty = false
        root.kidsChanged = false
        const set = ui.createChildSet(rootTag)
        for (let k = root.first; k !== undefined; k = k.next) {
          if (k.type !== "#text") ui.appendChildToSet(set, build(k, rootTag))
        }
        ui.completeRoot(rootTag, set)
      }
      onCommit?.()
    }
  }
  const operations: Context.Service.Shape<typeof Native.Host> = {
    focus(n) {
      if (n.shadow !== undefined) ui.dispatchCommand(n.shadow, "focus", [])
    },
    blur(n) {
      if (n.shadow !== undefined) ui.dispatchCommand(n.shadow, "blur", [])
    },
    scrollTo(n, x, y, animated = true) {
      if (n.shadow !== undefined) {
        ui.dispatchCommand(n.shadow, "scrollTo", [x, y, animated])
      }
    },
    measure(n) {
      const rect = n.shadow === undefined
        ? undefined
        : ui.getBoundingClientRect(n.shadow, false)
      if (rect == null) return undefined
      const [x, y, width, height] = rect as [number, number, number, number]
      return { x, y, width, height }
    }
  }
  return { host, root, operations }
}

// Native reports every surface's events through one handler, with the
// instance handle the host gave `createNode`.
const listening = new WeakSet<UIManager>()

// How far, in points, a touch may end outside the pressed view and still
// press it, as React Native's `Pressable` allows by default.
const slop = 20

const listen = (ui: UIManager) => {
  if (listening.has(ui)) return
  listening.add(ui)
  let pressed: NativeNode | undefined
  const fire = (n: NativeNode | undefined, name: string, payload: unknown) => {
    for (; n !== undefined; n = n.parent) {
      const handler = n.events?.handlers[name]
      if (handler !== undefined) {
        n.events!.dispatch(name, handler, payload)
        return
      }
    }
  }
  const within = (n: NativeNode, x: number, y: number) => {
    const rect = n.shadow === undefined
      ? undefined
      : ui.getBoundingClientRect(n.shadow, true)
    if (rect == null) return true
    const [left, top, width, height] = rect as [number, number, number, number]
    return x >= left - slop && x <= left + width + slop &&
      y >= top - slop && y <= top + height + slop
  }
  ui.registerEventHandler((handle, type, payload) => {
    if (!(handle instanceof NativeNode)) return
    const event = payload as any
    switch (type) {
      case "topTouchStart": {
        let n: NativeNode | undefined = handle
        while (n !== undefined && n.events?.handlers.press === undefined) {
          n = n.parent
        }
        pressed = n
        return
      }
      case "topTouchCancel": {
        pressed = undefined
        return
      }
      case "topTouchEnd": {
        const target = pressed
        pressed = undefined
        if (target === undefined) return
        const touch = event?.changedTouches?.[0]
        const x = touch?.pageX ?? 0
        const y = touch?.pageY ?? 0
        let n: NativeNode | undefined = handle
        while (n !== undefined && n !== target) n = n.parent
        if (n !== undefined && within(target, x, y)) {
          fire(target, "press", { x, y })
        }
        return
      }
      case "topChange": {
        const value = String(event?.text ?? "")
        if (typeof event?.eventCount === "number") {
          handle.eventCount = event.eventCount
        }
        // Native shows this text already, so it isn't sent back.
        handle.props.text = value
        fire(handle, "input", { value })
        return
      }
      case "topSubmitEditing": {
        fire(handle, "submit", { value: event?.text ?? "" })
        return
      }
      case "topFocus": {
        fire(handle, "focus", {})
        return
      }
      case "topBlur": {
        fire(handle, "blur", {})
        return
      }
      case "topScroll": {
        fire(handle, "scroll", {
          x: event?.contentOffset?.x ?? 0,
          y: event?.contentOffset?.y ?? 0,
          contentWidth: event?.contentSize?.width ?? 0,
          contentHeight: event?.contentSize?.height ?? 0,
          width: event?.layoutMeasurement?.width ?? 0,
          height: event?.layoutMeasurement?.height ?? 0
        })
        return
      }
    }
  })
}
