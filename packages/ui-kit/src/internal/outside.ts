import { listenTrees } from "./dom.ts"
import { onScrollbar } from "./interaction.ts"
import { inKept } from "./topLayer.ts"

export interface Outside {
  readonly open: () => boolean
  readonly anyButton?: (() => boolean) | undefined
  readonly inside: (target: Node) => boolean
  readonly pressed: (pointerType: string) => void
  readonly focused?: (() => void) | undefined
}

export const listenOutside = (
  node: Node,
  signal: AbortSignal,
  outside: Outside
): void => {
  let touchPress = false
  const onPointerDown = (event: PointerEvent) => {
    touchPress = false
    const target = event.target as Node | null
    if (
      !outside.open() || target === null ||
      (event.button !== 0 && outside.anyButton?.() !== true) ||
      !event.isPrimary || outside.inside(target)
    ) return
    if (inKept(target)) return
    if (event.pointerType === "touch") touchPress = true
    else if (!onScrollbar(target, event)) outside.pressed(event.pointerType)
  }
  const onClick = (event: MouseEvent) => {
    if (!touchPress) return
    touchPress = false
    const target = event.target as Node | null
    if (outside.open() && target !== null && !outside.inside(target)) {
      outside.pressed("touch")
    }
  }
  const focused = outside.focused
  const onFocusIn = (event: FocusEvent) => {
    const target = event.target as Node | null
    if (outside.open() && target !== null && !outside.inside(target)) {
      focused?.()
    }
  }
  listenTrees(node, "pointerdown", onPointerDown, {
    capture: true,
    signal
  })
  listenTrees(node, "click", onClick, { capture: true, signal })
  if (focused !== undefined) {
    listenTrees(node, "focusin", onFocusIn, { capture: true, signal })
  }
}

export const releasedOutside = (
  event: MouseEvent,
  inside: (target: Node) => boolean,
  anchor: Element | null
): boolean => {
  const target = event.target as Node | null
  if (target === null || inside(target)) return false
  if (anchor === null) return true
  const r = anchor.getBoundingClientRect()
  return event.clientX < r.left || event.clientX > r.right ||
    event.clientY < r.top || event.clientY > r.bottom
}
