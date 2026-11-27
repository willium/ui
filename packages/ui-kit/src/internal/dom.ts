export const isElement = (node: unknown): node is Element =>
  (node as Node | null)?.nodeType === 1

export const rootOf = (node: Node): Document | ShadowRoot =>
  node.isConnected
    ? node.getRootNode() as Document | ShadowRoot
    : node.ownerDocument ?? node as Document

// In a shadow root, focus outside it leaves its `activeElement` null.
export const focusedOf = (node: Node): Element | null =>
  rootOf(node).activeElement ?? node.ownerDocument?.activeElement ?? null

// Listens in `node`'s tree and each tree above it, as a listener outside a
// shadow root sees its host as the target. Each event reaches `handler` once,
// with the target its innermost tree shows.
export const listenTrees = <K extends keyof DocumentEventMap>(
  node: Node,
  type: K,
  handler: (event: DocumentEventMap[K]) => void,
  options?: AddEventListenerOptions
): void => {
  let host: Element | undefined
  let seen: WeakSet<Event> | undefined
  for (let root = rootOf(node);; root = rootOf(host)) {
    const inner = host
    if (inner === undefined && root.nodeType === 9) {
      root.addEventListener(type, handler as EventListener, options)
      return
    }
    seen ??= new WeakSet()
    const handled = seen
    root.addEventListener(
      type,
      (event) => {
        if (event.target === inner || handled.has(event)) return
        handled.add(event)
        handler(event as DocumentEventMap[K])
      },
      options
    )
    if (root.nodeType === 9) return
    host = (root as ShadowRoot).host
  }
}

export const isHTMLElement = (node: unknown): node is HTMLElement => {
  const ctor = (node as Node | null)?.ownerDocument?.defaultView?.HTMLElement ??
    globalThis.HTMLElement
  return ctor !== undefined && node instanceof ctor
}

// The element an event's target is, or the element a text node is in.
export const elementOf = (target: EventTarget | null): Element | null =>
  isElement(target) ? target : (target as Node | null)?.parentElement ?? null

export const perDocument = <A>(make: () => A): (document: Document) => A => {
  const made = new WeakMap<Document, A>()
  return (document) => {
    let value = made.get(document)
    if (value === undefined) made.set(document, value = make())
    return value
  }
}

export const focusVisible = (element: Element): boolean => {
  try {
    return element.matches(":focus-visible")
  } catch {
    return true
  }
}

export const activeOf = (
  root: Document | ShadowRoot
): Element | null => {
  let active = root.activeElement
  while (active?.shadowRoot?.activeElement != null) {
    active = active.shadowRoot.activeElement
  }
  return active
}

export const radioGroup = (element: HTMLElement): Array<HTMLInputElement> => {
  const radio = element as HTMLInputElement
  if (
    radio.localName !== "input" || radio.type !== "radio" || radio.name === ""
  ) return []
  // The whole tree: a form's radios can sit outside it and name it with `form`.
  return Array.from(
    (radio.getRootNode() as ParentNode).querySelectorAll<HTMLInputElement>(
      "input[type=\"radio\"]"
    )
  )
    .filter((other) => other.name === radio.name && other.form === radio.form)
}

export const onRange = (event: Event): boolean =>
  event.composedPath().some((target) =>
    isHTMLElement(target) && target.localName === "input" &&
    (target as HTMLInputElement).type === "range"
  )

const tabbableSelector = [
  "a[href]",
  "area[href]",
  "button",
  "input:not([type=\"hidden\"])",
  "select",
  "textarea",
  "iframe",
  "summary",
  "details",
  "audio[controls]",
  "video[controls]",
  "[tabindex]",
  "[contenteditable]"
].join(",")

// An unchecked radio Tab skips: one in a named group that has a checked
// radio, or that isn't the group's first.
const radioOut = (element: HTMLElement): boolean => {
  const radio = element as HTMLInputElement
  if (
    radio.localName !== "input" || radio.type !== "radio" ||
    radio.name === "" || radio.checked
  ) {
    return false
  }
  const group = radioGroup(radio)
  return group.some((other) => other.checked) || group[0] !== radio
}

// Chromium reports layout boxes for content hidden by closed `<details>`,
// even though Tab skips that content.
const collapsed = "details:not([open]) > :not(summary:first-of-type)"

export const focusable = (element: HTMLElement): boolean =>
  element.isConnected && element.getClientRects().length > 0 &&
  element.closest(collapsed) === null &&
  !element.matches(":disabled") && element.closest("[inert]") === null &&
  element.ownerDocument.defaultView?.getComputedStyle(element).visibility !==
    "hidden"

// Chromium reports `tabIndex` -1 for an editing host and for a `<details>`
// without a summary, but Tab still stops on both.
const tabOrder = (element: HTMLElement): number => {
  if (element.hasAttribute("tabindex")) return element.tabIndex
  const host = element.localName === "details"
    ? element.querySelector(":scope > summary") === null
    : element.isContentEditable &&
      !(element.parentElement?.isContentEditable ?? false)
  return host ? 0 : element.tabIndex
}

const tabbable = (element: HTMLElement): boolean =>
  tabOrder(element) >= 0 && focusable(element) && !radioOut(element)

export const tabbablesIn = (root: Element): Array<HTMLElement> =>
  Array.from(root.querySelectorAll<HTMLElement>(tabbableSelector))
    .filter(tabbable)

// Moves focus itself, as the browser's next stop after a positive
// `tabindex` can be outside `root`.
export const trapTab = (event: KeyboardEvent, root: HTMLElement): void => {
  event.preventDefault()
  const found = tabbablesIn(root)
  const items = [
    ...found.filter((element) => tabOrder(element) > 0)
      .sort((a, b) => tabOrder(a) - tabOrder(b)),
    ...found.filter((element) => tabOrder(element) === 0)
  ]
  if (items.length === 0) return
  const focused = activeOf(root.ownerDocument)
  const at = items.findIndex((element) => element === focused)
  const step = event.shiftKey ? -1 : 1
  let next: number
  if (at !== -1) next = at + step
  else if (focused === null || focused === root || !root.contains(focused)) {
    next = event.shiftKey ? -1 : 0
  } else {
    // Focus is on a non-stop inside `root`, such as the list.
    const after = items.findIndex((element) =>
      (focused.compareDocumentPosition(element) &
        Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    )
    next = after === -1
      ? (event.shiftKey ? -1 : 0)
      : event.shiftKey
      ? after - 1
      : after
  }
  items.at(next % items.length)?.focus({ preventScroll: true })
}

export const byAttribute = (
  root: Document | ShadowRoot,
  name: string,
  value: string
): HTMLElement | null =>
  root.querySelector<HTMLElement>(
    "[" + name + "=\"" + CSS.escape(value) + "\"]"
  )

export const focusFinal = (
  root: Document | ShadowRoot,
  popupId: string,
  fallback: HTMLElement | null,
  lost: boolean,
  keyboard: boolean
): void => {
  const marked = byAttribute(root, "data-final-focus", popupId)
  const back = marked ?? fallback
  if (back !== null && (marked !== null || lost)) {
    back.focus({
      preventScroll: true,
      focusVisible: keyboard ? true : undefined
    } as FocusOptions)
  }
}

type StyleName = Exclude<
  {
    [K in keyof CSSStyleDeclaration]: CSSStyleDeclaration[K] extends string ? K
      : never
  }[keyof CSSStyleDeclaration],
  number
>

export const saved = (
  element: HTMLElement,
  names: ReadonlyArray<StyleName>
): () => void => {
  const values = names.map((name) => element.style[name])
  return () => names.forEach((name, i) => (element.style[name] = values[i]!))
}

export const override = (
  element: HTMLElement,
  styles: Readonly<Record<string, string>>,
  priority = ""
): () => void => {
  const style = element.style
  const before = Object.keys(styles).map((name) =>
    [
      name,
      style.getPropertyValue(name),
      style.getPropertyPriority(name)
    ] as const
  )
  for (const [name, value] of Object.entries(styles)) {
    style.setProperty(name, value, priority)
  }
  return () => {
    for (const [name, value, priority] of before) {
      if (value === "") style.removeProperty(name)
      else style.setProperty(name, value, priority)
    }
  }
}
