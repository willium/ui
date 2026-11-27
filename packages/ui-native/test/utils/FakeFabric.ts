/**
 * A stand-in for `nativeFabricUIManager`. It keeps Fabric's rules that a
 * committed (sealed) node never changes and that a tag keeps the parent it
 * was first appended to, and counts calls by method.
 */
import type { UIManager } from "@effect/ui-native/NativeHost"

export interface ShadowNode {
  readonly tag: number
  readonly viewName: string
  readonly props: Record<string, unknown>
  readonly children: Array<ShadowNode>
  readonly handle: unknown
  sealed: boolean
}

export const make = () => {
  const calls: Record<string, number> = {}
  const commands: Array<readonly [number, string, ReadonlyArray<unknown>]> = []
  const rects = new Map<number, readonly [number, number, number, number]>()
  const count = (name: string) => (calls[name] = (calls[name] ?? 0) + 1)
  // Fabric asserts this in ShadowNodeFamily::setParent.
  const parents = new Map<number, number>()
  const adopt = (parentTag: number, child: ShadowNode) => {
    const before = parents.get(child.tag)
    if (before !== undefined && before !== parentTag) {
      throw new Error(
        `tag ${child.tag} moved from parent ${before} to ${parentTag}`
      )
    }
    parents.set(child.tag, parentTag)
  }
  let committed: ReadonlyArray<ShadowNode> = []
  let handler:
    | ((handle: unknown, type: string, payload: unknown) => void)
    | undefined
  const merge = (props: Record<string, unknown>, diff: object) => {
    const out = { ...props }
    for (const [k, v] of Object.entries(diff)) {
      if (v === null) delete out[k]
      else out[k] = v
    }
    return out
  }
  const seal = (n: ShadowNode) => {
    if (n.sealed) return
    n.sealed = true
    n.children.forEach(seal)
  }
  const ui: UIManager = {
    createNode(tag, viewName, _rootTag, props, handle) {
      count("createNode")
      return {
        tag,
        viewName,
        props: { ...props },
        children: [],
        handle,
        sealed: false
      }
    },
    cloneNodeWithNewProps(node: any, props) {
      count("cloneNodeWithNewProps")
      return {
        ...node,
        props: merge(node.props, props),
        children: [...node.children],
        sealed: false
      }
    },
    cloneNodeWithNewChildren(node: any) {
      count("cloneNodeWithNewChildren")
      return { ...node, children: [], sealed: false }
    },
    cloneNodeWithNewChildrenAndProps(node: any, props) {
      count("cloneNodeWithNewChildrenAndProps")
      return {
        ...node,
        props: merge(node.props, props),
        children: [],
        sealed: false
      }
    },
    appendChild(parent: any, child: any) {
      count("appendChild")
      if (parent.sealed) throw new Error("appendChild on a sealed node")
      adopt(parent.tag, child)
      parent.children.push(child)
      return parent
    },
    createChildSet(rootTag) {
      count("createChildSet")
      return Object.assign([], { rootTag })
    },
    appendChildToSet(set: any, child: any) {
      count("appendChildToSet")
      adopt(set.rootTag, child)
      set.push(child)
    },
    completeRoot(_rootTag, set: any) {
      count("completeRoot")
      set.forEach(seal)
      committed = set
    },
    registerEventHandler(h) {
      handler = h
    },
    dispatchCommand(node: any, command, args) {
      commands.push([node.tag, command, args])
    },
    getBoundingClientRect(node: any) {
      return rects.get(node.tag)
    }
  }
  return {
    ui,
    calls,
    commands,
    /** Places the view with `tag` on screen, for hit tests and `measure`. */
    place: (n: ShadowNode, rect: readonly [number, number, number, number]) =>
      rects.set(n.tag, rect),
    reset: () => {
      for (const k in calls) delete calls[k]
    },
    committed: () => committed,
    emit: (node: ShadowNode, type: string, payload: unknown) =>
      handler!(node.handle, type, payload)
  }
}

/** The committed tree as text, `<RCTView>…</>`, with raw text as its string. */
export const print = (nodes: ReadonlyArray<ShadowNode>): string =>
  nodes.map((n) =>
    n.viewName === "RCTRawText"
      ? String(n.props.text)
      : `<${n.viewName}>${print(n.children)}</>`
  )
    .join("")

export const find = (
  nodes: ReadonlyArray<ShadowNode>,
  test: (n: ShadowNode) => boolean
): ShadowNode | undefined => {
  for (const n of nodes) {
    if (test(n)) return n
    const found = find(n.children, test)
    if (found) return found
  }
}

export const byText = (s: string) => (n: ShadowNode) =>
  n.viewName === "RCTRawText" && n.props.text === s

export const byName = (name: string) => (n: ShadowNode) => n.viewName === name
