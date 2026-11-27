/**
 * A popup that opens on top of the page and asks for the user's attention,
 * such as a form, a confirmation or a detail view.
 *
 * `Dialog` is headless: it owns the ids, the ARIA, the data attributes, focus,
 * dismissal and the popup's place in the top layer, and the consumer draws
 * the markup. The consumer owns whether the dialog is open, passes it as
 * `open`, and stores what the `RequestedOpen` and `RequestedClose` events
 * ask for. The dialog stays as it is until `open` changes, so a consumer can
 * refuse a close, such as an editor with unsaved changes asking first.
 *
 * **Anatomy**
 *
 * | Part           | Element                                              |
 * | :------------- | :--------------------------------------------------- |
 * | `trigger`      | `<button>` that opens the dialog                       |
 * | `portal`       | `<dialog>` in the top layer, around the parts below  |
 * | `backdrop`     | `<div>` that covers the page                           |
 * | `viewport`     | `<div>` that positions the popup                       |
 * | `popup`        | `<div>` with the dialog's content                      |
 * | `title`        | a heading, `<h1>` to `<h6>`, that labels the dialog          |
 * | `description`  | `<p>` that describes the dialog                        |
 * | `close`        | `<button>` that closes the dialog                      |
 * | `initialFocus` | any element, focused when the dialog opens           |
 * | `finalFocus`   | any element, focused when the dialog closes          |
 *
 * Each part takes the consumer's builder and returns it with the part
 * applied, and the consumer adds the children:
 * `dialog.portal(h.dialog)?.children(dialog.popup(h.div).children(dialog.title(h.h2).children("Settings")))`.
 * The portal returns `undefined` while the dialog is closed, unless
 * `keepMounted`, and the backdrop returns `undefined` in a nested dialog, unless
 * `forceRenderBackdrop`. `backdrop` and `viewport` are optional. A part's result
 * is a builder, so it can also be another kit call's `element`, such as a
 * ui-kit Button's.
 *
 * The portal is a `<dialog>` shown as a manual popover, in every mode, so it
 * sits in the top layer and needs no portal to another place in the document.
 * With `topLayer: false` it stays in place instead, as **In place** below
 * describes.
 * The kit resets its box inline to an empty one at the viewport's corner,
 * with nothing visible of its own, so style the backdrop, viewport and popup
 * as fixed-position layers:
 * `.viewport { position: fixed; inset: 0; display: grid; place-items: center }`.
 * With `modal: true`, the kit draws a transparent layer over the whole
 * viewport as the portal's first child, before the consumer's children. It
 * takes the presses meant for the page behind. A closed `keepMounted` portal
 * keeps it, inert, so the children after it keep their elements when the
 * dialog opens.
 *
 * **Data attributes**
 *
 * Each present with an empty value or absent:
 *
 * - `trigger`: `data-popup-open`
 * - `backdrop`: `data-open` / `data-closed`, `data-starting-style`,
 *   `data-ending-style`
 * - `viewport` and `popup`: the backdrop's, and `data-nested` and
 *   `data-nested-dialog-open`
 *
 * The popup also sets the CSS variable `--nested-dialogs`, the number of
 * dialogs open inside this one. `data-starting-style` is present for the first
 * frame after the dialog opens and `data-ending-style` while it closes, so a
 * transition can start from and end in a hidden style. The dialog stays shown
 * until the popup's own transitions and animations finish, then closes and
 * emits `Settled`. One that loops, such as a spinner's, doesn't count. For an
 * exit the kit can't see, such as one run by an animation library, set
 * `holdExit` while it runs: the dialog stays in its ending state until it is
 * cleared.
 *
 * **Keyboard**
 *
 * The trigger and the close button are native buttons, so Enter and Space
 * press them. Escape asks the topmost open dialog to close, wherever focus is,
 * unless an input method is composing or focus is in a popover drawn above
 * the dialog, such as a toast. A refused close keeps the dialog open as often
 * as Escape is pressed.
 *
 * When the dialog opens, focus moves to the `initialFocus` element, or else
 * to the first element in the popup that Tab reaches, or else to the popup.
 * Focus already inside the popup stays. Opened by touch, it focuses the popup
 * instead of the first field, so the on-screen keyboard doesn't open, but
 * still focuses an `initialFocus` element. `initialFocus: false` leaves focus
 * where it is. When the focused element inside is removed or hidden, focus
 * moves to the popup.
 *
 * As soon as the close starts, focus moves to the `finalFocus` element,
 * unless the dialog closed because focus left it, or because a press outside
 * gave focus to an element of the page. Otherwise, if focus was inside the
 * dialog, it moves to the trigger that opened it, or else to what had focus
 * before it opened. Focus that a press outside gave to the page or to
 * another dialog stays there. A dialog removed while focus is inside gives
 * focus back the same way. A touch that closes the dialog moves focus
 * once the finger lifts, so a tap on a field of the page keeps the field
 * focused. The popup is `inert` while the dialog closes, so during the exit
 * transition Tab skips it and screen readers don't reach it. Tab stays
 * inside a dialog with `modal: true` or `modal: "trap-focus"`.
 *
 * **Modes**
 *
 * - `modal: true`, the default: the page behind takes no presses, the page
 *   doesn't scroll, focus stays inside, and the page is hidden from screen
 *   readers.
 * - `modal: "trap-focus"`: focus stays inside and the page is hidden from
 *   screen readers, but the page behind still scrolls and takes clicks.
 * - `modal: false`: the page stays usable, and the dialog asks to close when
 *   focus leaves it. The portal has `aria-modal="false"`, as Chromium takes
 *   any `<dialog>` in the top layer as modal.
 *
 * The page is hidden with `aria-hidden` on everything outside the dialog,
 * except live regions such as the toasts. The scroll lock keeps the space of
 * the scrollbar, so the page doesn't shift, and leaves a lock the page
 * already has alone. Both end as soon as the close starts, so the page takes
 * presses and scrolls during the exit transition.
 *
 * A press outside the popup asks the topmost dialog to close: a click with
 * the main mouse button that starts and ends outside, or one finger. A press
 * on a scrollbar doesn't count. With `modal: true`, only a press on the
 * kit's layer, the backdrop or the portal around the popup counts, so a press
 * on a toast above it doesn't close it. In the other modes, any press outside
 * counts, a toast's too, even in a toast viewport drawn after the dialog
 * opened, except one on an element added to the page since the dialog
 * opened, in a new root or inside one already there. An element the renderer
 * reuses for new content counts as already there. Focus that such a press
 * moves out of the dialog doesn't close it either, but moving focus there
 * with the keyboard does. `disablePointerDismissal` turns that off, and the
 * close on focus leaving with it.
 *
 * In the modes other than `modal: true`, a press directly on the page that
 * closes the dialog still reaches what it landed on, as in Base UI: a tap or
 * a click on a button of the page closes the dialog and presses the button.
 * With `modal: true`, or when a tap lands on the dialog's own backdrop or
 * viewport, a finger closes the dialog as it touches and the tap's click is
 * dropped, so it doesn't land on the page behind it.
 *
 * The modal is the kit's, not the browser's: find-in-page and a script's
 * `focus()` still reach the page behind it. On Android, in a browser with
 * `CloseWatcher` such as Chrome, the back gesture asks the topmost open
 * dialog to close, with `close-watcher`, and a refused close keeps it open as
 * often as back is used. Firefox on Android has no `CloseWatcher`, so back
 * doesn't reach the dialog there. On desktop and iOS, close requests other
 * than Escape don't reach it.
 *
 * **In place**
 *
 * With `topLayer: false`, the portal is a `<dialog open>` where the view
 * draws it, like Base UI's portal given a `container`, so an ancestor's
 * `overflow`, `position` and stacking context apply to it. Its box is reset
 * to none of its own, so the backdrop, viewport and popup are positioned
 * against the nearest positioned ancestor:
 * `.card { position: relative; overflow: hidden }` with
 * `.viewport { position: absolute; inset: 0 }` keeps the dialog inside the
 * card. Popups in the top layer, such as the toasts, stay above it.
 *
 * A dialog in place is never modal, whatever `modal` says: no scroll lock,
 * no `aria-hidden` and no layer over the viewport. It still asks to close
 * on Escape, a press outside and focus leaving it.
 *
 * **Nesting**
 *
 * A dialog drawn inside another one's popup is nested. It finds the dialog
 * above it by itself: the outer popup gets `data-nested-dialog-open` and
 * `--nested-dialogs`, the inner one `data-nested`, and only the inner one hears
 * Escape, outside presses and Android's back gesture. Two dialogs under one
 * parent each take a `key`. Of two dialogs open side by side, the one opened
 * later is on top, as in the browser's top layer, and only it hears them. Focus
 * a dialog moves by itself, into it as it opens or back to its trigger as it
 * closes, doesn't close another one with `modal: false`. Focus the user
 * moves out of it still does.
 *
 * **Triggers drawn elsewhere**
 *
 * A `DialogTrigger` opens a dialog from another part of the page. Give the
 * dialog an `id` and the trigger the same `popupId`: the dialog then counts a
 * press on the trigger as the trigger's, not a press outside, and gives focus
 * back to it when it closes. Store the press's method and pass it as the
 * dialog's `openMethod`, so an open by touch is treated as one.
 *
 * **Example** (A settings dialog whose open state lives in the consumer's Model)
 *
 * ```ts import.meta.vitest
 * import { UiSchema } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { Dialog } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const ToolbarMessage = UiSchema.TaggedEnum({ RequestedOpenSettings: {}, RequestedCloseSettings: {} })
 *
 * const Toolbar = Html.component({
 *   name: "Toolbar",
 *   model: Schema.Struct({ settings: Schema.Boolean }),
 *   message: ToolbarMessage
 * }).make({
 *   init: () => ({ settings: true }),
 *   update: {
 *     RequestedOpenSettings: ($) => $.evolve({ settings: true }),
 *     RequestedCloseSettings: ($) => $.evolve({ settings: false })
 *   },
 *   view: (h, model) =>
 *     Dialog(h, {
 *       props: { open: model.settings },
 *       onEmit: {
 *         RequestedOpen: () => ToolbarMessage.RequestedOpenSettings(),
 *         RequestedClose: () => ToolbarMessage.RequestedCloseSettings(),
 *         Settled: () => undefined
 *       },
 *       view: (dialog) =>
 *         h.div(
 *           dialog.trigger(h.button.class("button")).children("Settings"),
 *           dialog.portal(h.dialog)?.children(
 *             dialog.viewport(h.div.class("viewport")).children(
 *               dialog.popup(h.div.class("popup")).children(
 *                 dialog.title(h.h2).children("Settings"),
 *                 dialog.close(h.button.class("button")).children("Close")
 *               )
 *             )
 *           )
 *         )
 *     })
 * })
 *
 * // The popup keeps the consumer's class, and the dialog is labelled by its title.
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Toolbar, {}))
 * const title = /<h2 id="([^"]+)"/.exec(html)?.[1]
 * if (title === undefined || !html.includes(`aria-labelledby="${title}"`) || !html.includes(`class="popup"`)) {
 *   throw new Error("the dialog isn't labelled by its title")
 * }
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import type * as Component from "@effect/ui/Component"
import * as Html from "@effect/ui/html/Html"
import * as Mount from "@effect/ui/Mount"
import * as UiSchema from "@effect/ui/UiSchema"
import * as View from "@effect/ui/View"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import {
  type Attributed,
  attrOf,
  flag,
  idOf,
  noSelect,
  withStyle,
  withTokens
} from "./internal/attributes.ts"
import {
  byAttribute,
  focusable,
  focusedOf,
  isElement,
  isHTMLElement,
  listenTrees,
  perDocument,
  rootOf,
  tabbablesIn
} from "./internal/dom.ts"
import {
  methodOf,
  onScrollbar,
  trackComposing
} from "./internal/interaction.ts"
import {
  hideOthers,
  lockScroll,
  modalOf,
  nextLayerOrder
} from "./internal/modal.ts"
import { isAndroid } from "./internal/platform.ts"
import {
  inKept,
  inPlaceBox,
  portalBox,
  raiseAboveShown
} from "./internal/topLayer.ts"
import {
  frameOf,
  settling,
  statusOf,
  transitionAttrs
} from "./internal/transition.ts"

/**
 * How a dialog limits the page behind it: `true` for a modal, `"trap-focus"`
 * to keep focus inside but leave the page usable, `false` for neither.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const DialogModal = Schema.Union([
  Schema.Boolean,
  Schema.Literal("trap-focus")
])

/**
 * How a dialog limits the page behind it.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type DialogModal = typeof DialogModal.Type

/**
 * How the user opened or closed a dialog. `keyboard` covers Enter and Space
 * on a button and Escape.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const DialogInteraction = Schema.Literals([
  "mouse",
  "touch",
  "pen",
  "keyboard"
])

/**
 * How the user opened or closed a dialog.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type DialogInteraction = typeof DialogInteraction.Type

/**
 * Controls whether the dialog is open, how it treats the page behind it, and
 * where focus goes.
 *
 * **Details**
 *
 * - `open`: whether the dialog shows. Required: the consumer owns it.
 * - `modal`: `true` by default, `"trap-focus"` or `false`, as the module
 *   describes.
 * - `disablePointerDismissal`: a press outside the popup doesn't ask to
 *   close, and neither does focus leaving a dialog with `modal: false`.
 * - `triggerId`: the `id` of the trigger the dialog is open for, when it has
 *   several. Only that trigger gets `aria-expanded` and `data-popup-open`, and
 *   focus goes back to it. With none, every trigger reports the dialog open.
 * - `keepMounted`: the portal stays in the page while the dialog is closed,
 *   hidden.
 * - `forceRenderBackdrop`: a nested dialog draws its backdrop too.
 * - `nested`: `false` keeps a dialog drawn inside another one out of the
 *   nesting: the outer popup doesn't count it, neither gets the nesting
 *   attributes, and its backdrop draws. It is still on top, so only it hears
 *   Escape and outside presses. For a popup that isn't a second dialog to
 *   the user, such as a date picker in a form.
 * - `initialFocus`: `false` leaves focus where it is when the dialog opens.
 *   Clearing it while the dialog is open moves focus in as an open does.
 * - `finalFocus`: `false` leaves focus where it is when the dialog closes.
 * - `id`: the portal's `id`, generated when left out. Set it to pair the
 *   dialog with a `DialogTrigger` drawn somewhere else, as its `popupId`.
 * - `openMethod`: how the user opened the dialog, for a dialog opened from a
 *   `DialogTrigger`, whose press reports it. It wins over the one the
 *   dialog's own trigger records, and decides the focus of a touch open.
 * - `holdExit`: a closed dialog stays shown, in its ending state, while this
 *   is `true`, for an exit animation that the consumer runs itself. Set it
 *   back to `false` once that animation ends, and the dialog closes and
 *   emits `Settled`.
 * - `topLayer`: `false` draws the dialog in place instead of in the top
 *   layer, and makes it non-modal, as the module's **In place** describes.
 *   `true` when left out.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const DialogProps = Schema.Struct({
  open: Schema.Boolean,
  modal: Schema.optional(DialogModal),
  disablePointerDismissal: Schema.optional(Schema.Boolean),
  triggerId: Schema.optional(Schema.NullOr(Schema.String)),
  keepMounted: Schema.optional(Schema.Boolean),
  forceRenderBackdrop: Schema.optional(Schema.Boolean),
  nested: Schema.optional(Schema.Boolean),
  initialFocus: Schema.optional(Schema.Boolean),
  finalFocus: Schema.optional(Schema.Boolean),
  id: Schema.optional(Schema.String),
  openMethod: Schema.optional(Schema.NullOr(DialogInteraction)),
  holdExit: Schema.optional(Schema.Boolean),
  topLayer: Schema.optional(Schema.Boolean)
})

/**
 * The props of a `Dialog`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type DialogProps = typeof DialogProps.Type

/**
 * Why a dialog asks to close: a press on its open trigger, a press outside
 * the popup, Escape, a press on the close part, focus leaving a dialog with
 * `modal: false`, or a close request from the browser, such as Android's back
 * gesture.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const DialogDismissReason = Schema.Literals([
  "trigger-press",
  "outside-press",
  "escape-key",
  "close-press",
  "focus-out",
  "close-watcher"
])

/**
 * Why a dialog asks to close.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type DialogDismissReason = typeof DialogDismissReason.Type

/**
 * `RequestedOpen` asks for the dialog to open, from a press on a trigger, with
 * the trigger's `id` if it has one. `RequestedClose` asks for it to close,
 * with the reason. The consumer decides whether to change `open`. `Settled`
 * reports that the transitions and animations of an open or a close finished.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const DialogEvents = UiSchema.TaggedEnum({
  RequestedOpen: { triggerId: Schema.NullOr(Schema.String) },
  RequestedClose: { reason: DialogDismissReason },
  Settled: { open: Schema.Boolean }
})

/**
 * What a `Dialog` emits.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type DialogEvents = typeof DialogEvents.Type

/**
 * Where a dialog is in its open or close transition: `starting` for the first
 * frame after it opens, `ending` while it closes, and `null` otherwise.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type DialogTransitionStatus = "starting" | "ending" | null

const DialogMessage = UiSchema.TaggedEnum({
  ClickedTrigger: {
    triggerId: Schema.NullOr(Schema.String),
    key: Schema.String,
    pointerType: Schema.String
  },
  ClickedClose: { pointerType: Schema.String },
  PressedEscape: {},
  PressedOutside: { pointerType: Schema.String },
  FocusedOutside: {},
  CancelledCloseWatcher: {},
  ShowedPortal: {},
  RenderedFirstFrame: {},
  FinishedTransition: { open: Schema.Boolean },
  ChangedNested: { count: Schema.Number }
})

type DialogMessage = typeof DialogMessage.Type

const DialogModel = Schema.Struct({
  mounted: Schema.Boolean,
  started: Schema.Boolean,
  nestedOpen: Schema.Number,
  trigger: Schema.NullOr(Schema.String),
  reason: Schema.NullOr(DialogDismissReason),
  openMethod: Schema.NullOr(DialogInteraction),
  closeMethod: Schema.NullOr(DialogInteraction)
})

type DialogModel = typeof DialogModel.Type

type DialogUpdate = Component.Update<
  DialogModel,
  DialogMessage,
  DialogEvents,
  DialogProps
>

const topmost = (model: DialogModel): boolean => model.nestedOpen === 0

const dismiss = (
  $: DialogUpdate,
  reason: DialogDismissReason,
  closeMethod: DialogInteraction | null
) =>
  $.evolve({ reason, closeMethod }).emit(
    DialogEvents.RequestedClose({ reason })
  )

const blocker = new Html.Element<never>("div").attrs({
  role: "presentation",
  style: "position:fixed;inset:0;" + noSelect
})
const layer = View.toNode(blocker)
const inertLayer = View.toNode(blocker.attr("inert", ""))

const closestOf = (
  target: Node,
  selector: string
): Element | null | undefined =>
  (isElement(target) ? target : target.parentElement)?.closest(selector)

const inNested = (dialog: Element, element: Element): boolean =>
  element.parentElement?.closest("dialog") !== dialog

const tabbables = (dialog: Element, root: Element): Array<HTMLElement> =>
  tabbablesIn(root).filter((element) => !inNested(dialog, element))

const TrackDialogArgs = {
  modal: DialogModal,
  open: Schema.Boolean,
  mounted: Schema.Boolean,
  started: Schema.Boolean,
  topmost: Schema.Boolean,
  dismissible: Schema.Boolean,
  initialFocus: Schema.Boolean,
  finalFocus: Schema.Boolean,
  openMethod: Schema.NullOr(DialogInteraction),
  closeMethod: Schema.NullOr(DialogInteraction),
  closedByFocusOut: Schema.Boolean,
  closedByOutsidePress: Schema.Boolean,
  triggerId: Schema.NullOr(Schema.String),
  holdExit: Schema.Boolean,
  portalId: Schema.String,
  popupId: Schema.String
}

type TrackDialogArgs = Schema.Struct<typeof TrackDialogArgs>["Type"]

type CloseWatcher = EventTarget & { readonly destroy: () => void }
type Showing = {
  readonly node: HTMLDialogElement
  readonly order: number
  readonly open: () => boolean
  readonly top: () => boolean
  readonly watch: () => CloseWatcher | undefined
}

interface Stack {
  readonly showing: Array<Showing>
  watched:
    | { readonly entry: Showing; readonly watcher: CloseWatcher }
    | undefined
}
const stackOf = perDocument((): Stack => ({ showing: [], watched: undefined }))
const rewatch = (stack: Stack) => {
  const top = stack.showing.find((entry) => entry.top())
  if (stack.watched?.entry === top) return
  stack.watched?.watcher.destroy()
  const watcher = top?.watch()
  stack.watched = top !== undefined && watcher !== undefined
    ? { entry: top, watcher }
    : undefined
}
const orderOf = ({ showing }: Stack, node: Element): number =>
  showing.findIndex((entry) => entry.node === node)
const onTop = (stack: Stack, node: HTMLDialogElement): boolean => {
  const mine = orderOf(stack, node)
  return stack.showing.every((other, index) =>
    other.node === node || !other.open() ||
    !(node.contains(other.node) || (!other.node.contains(node) && index > mine))
  )
}

let handingOff = 0
const handOff = (
  element: HTMLElement | null | undefined,
  visible = false
): void => {
  if (element == null) return
  // Never `false`, which hides a focus ring the browser would draw.
  const focusVisible = visible || undefined
  handingOff++
  try {
    element.focus({ preventScroll: true, focusVisible } as FocusOptions)
  } finally {
    handingOff--
  }
}

const inDialogAbove = (
  stack: Stack,
  node: HTMLDialogElement,
  target: Node
): boolean => {
  const other = closestOf(target, "dialog")
  if (other == null || other === node || other.contains(node)) return false
  const index = orderOf(stack, other)
  return index === -1 || index > orderOf(stack, node)
}

const inOtherLayer = (node: HTMLDialogElement, target: Node): boolean => {
  const other = closestOf(target, "[popover]")
  return other != null && other !== node && !other.contains(node) &&
    !node.contains(other)
}

const closeWatcherOf = (
  view: Window | null
): (new() => CloseWatcher) | undefined =>
  view !== null && isAndroid(view)
    ? (view as Window & { readonly CloseWatcher?: new() => CloseWatcher })
      .CloseWatcher
    : undefined

// Capture focus before the host commit shows the portal and moves focus inside.
const TrackDialog = Mount.makeStream(
  "TrackDialog",
  { args: TrackDialogArgs, beforeCommit: true },
  (node: HTMLDialogElement, args, changes) =>
    Stream.callback<DialogMessage>((queue) => {
      const document = node.ownerDocument
      const view = document.defaultView
      const frame = frameOf(view)
      const stack = stackOf(document)
      let current: TrackDialogArgs = args
      const send = (message: DialogMessage) => Queue.offerUnsafe(queue, message)
      const focusedNow = (): Element | null => focusedOf(node)
      const popup = (): HTMLElement =>
        (rootOf(node).getElementById(current.popupId) as HTMLElement | null) ??
          node
      const takes = (element: HTMLElement, visible = false): boolean => {
        handOff(element, visible)
        return focusedNow() === element
      }
      const topmost = () => current.topmost && onTop(stack, node)
      const Watcher = closeWatcherOf(view)
      const entry: Showing = {
        node,
        order: nextLayerOrder(),
        open: () => current.open,
        top: () => current.open && topmost(),
        watch: () => {
          if (Watcher === undefined) return undefined
          const watcher = new Watcher()
          watcher.addEventListener("cancel", (event) => {
            if (event.cancelable) event.preventDefault()
            send(DialogMessage.CancelledCloseWatcher())
          })
          watcher.addEventListener("close", () => {
            if (stack.watched?.watcher !== watcher) return
            stack.watched = undefined
            frame(() => rewatch(stack))
          })
          return watcher
        }
      }
      const controls = `[aria-controls="${CSS.escape(args.portalId)}"]`
      const anyTrigger = `${controls},[data-dialog-trigger="${
        CSS.escape(args.portalId)
      }"]`
      const onTrigger = (target: Node): boolean =>
        closestOf(target, anyTrigger) != null ||
        trigger?.contains(target) === true
      const findTrigger = (): HTMLElement | null => {
        const root = rootOf(node)
        const focused = focusedNow()
        return (current.triggerId === null
          ? null
          : root.getElementById(current.triggerId)) ??
          (isHTMLElement(focused) && focused.matches(controls)
            ? focused
            : root.querySelector<HTMLElement>(controls))
      }
      let trigger = findTrigger()
      const active = focusedNow()
      let focusInside = node.contains(active)
      let lastFocused: HTMLElement | null = focusInside
        ? active as HTMLElement
        : null
      let before: HTMLElement | null = isHTMLElement(active) && !focusInside
        ? active
        : null
      const visited: Array<HTMLElement> = []
      let added = new WeakSet<Node>()
      const record = (records: ReadonlyArray<MutationRecord>) => {
        for (const { addedNodes } of records) {
          for (const child of addedNodes) added.add(child)
        }
      }
      const page = new MutationObserver(record)
      const addedSince = (target: Node): boolean => {
        record(page.takeRecords())
        for (
          let at: Node | null = target;
          at !== null && at !== document.body;
          at = at.parentNode
        ) {
          if (added.has(at)) return true
        }
        return false
      }

      const focusFirst = (from: Element | null) => {
        const root = popup()
        if (root.contains(from)) return
        if (!current.initialFocus) {
          const focused = focusedNow()
          if (focused === null || !node.contains(focused)) return
          if (
            isHTMLElement(from) && from !== document.body && from.isConnected
          ) handOff(from)
          else (focused as HTMLElement).blur()
          return
        }
        const marked = Array.from(
          node.querySelectorAll<HTMLElement>("[autofocus]")
        ).find((element) => !inNested(node, element))
        const visible = current.openMethod === "keyboard"
        if (
          marked === undefined && current.openMethod !== "touch" &&
          tabbables(node, root).some((element) => takes(element, visible))
        ) return
        handOff(marked ?? root, visible)
      }

      let release: (() => void) | undefined
      const hold = () => {
        release?.()
        release = undefined
        if (!current.open || current.modal === false) return
        const shown = hideOthers(node, entry.order)
        const unlock = current.modal === true ? lockScroll(document) : undefined
        release = () => {
          shown()
          unlock?.()
        }
      }

      const onKeyDown = (event: KeyboardEvent) => {
        if (event.defaultPrevented || !current.open || !topmost()) return
        const target = event.target as Node | null
        if (event.key === "Escape") {
          if (composing(event)) return
          if (target !== null && inOtherLayer(node, target)) return
          event.preventDefault()
          send(DialogMessage.PressedEscape())
          return
        }
        if (event.key !== "Tab" || current.modal === false) return
        const focused = focusedNow()
        if (
          focused !== null && focused !== document.body &&
          !node.contains(focused) &&
          (current.modal !== true || inOtherLayer(node, focused))
        ) return
        const root = popup()
        const items = tabbables(node, root)
        const first = items[0]
        const last = items.at(-1)
        if (first === undefined || last === undefined) {
          event.preventDefault()
          handOff(root, true)
        } else if (
          !node.contains(focused) ||
          (event.shiftKey
            ? focused === first || focused === root
            : focused === last)
        ) {
          const to = event.shiftKey ? last : first
          if (takes(to, true)) return event.preventDefault()
          // Chromium can't focus a `<details>` without a summary from script,
          // only with Tab. Focus an adjacent stop and let the browser handle Tab.
          const stop = document.createElement("span")
          stop.tabIndex = -1
          to[event.shiftKey ? "after" : "before"](stop)
          stop.addEventListener("blur", () => stop.remove(), { once: true })
          if (!takes(stop)) {
            stop.remove()
            event.preventDefault()
          }
        }
      }

      const outside = (target: Node): boolean => {
        const root = popup()
        if (root.contains(target) || onTrigger(target)) return false
        if (current.modal === true) {
          return isElement(target) && target !== node &&
            target.closest("dialog") === node &&
            (target.contains(root) ||
              target.getAttribute("role") === "presentation")
        }
        return node.contains(target) || inKept(target) || !addedSince(target)
      }
      const hasBackdrop = (): boolean =>
        node.querySelector(
          `[data-dialog-backdrop="${CSS.escape(args.portalId)}"]`
        ) !== null
      const touches = new Set<number>()
      let pressed: string | undefined
      let dismissing: number | undefined
      let ignored: Node | null = null
      const listens = (): boolean =>
        current.open && current.dismissible && topmost()
      // A touch dismisses on pointerdown, so the dialog's layer, backdrop or
      // viewport has left or stopped taking events before the tap's click,
      // which would land on the page behind it. When the tap landed directly
      // on the page, its click goes through, as a mouse's does.
      const swallowClick = (press: PointerEvent) => {
        const done = new AbortController()
        const options = { capture: true, signal: done.signal }
        const stop = () => done.abort()
        document.addEventListener("click", (event) => {
          event.preventDefault()
          event.stopPropagation()
          stop()
        }, options)
        document.addEventListener(
          "pointerdown",
          (event) => event !== press && stop(),
          options
        )
        document.addEventListener(
          "pointercancel",
          (event) => event.pointerId === press.pointerId && stop(),
          options
        )
        document.addEventListener("pointerup", (event) => {
          if (event.pointerId === press.pointerId) setTimeout(stop, 400)
        }, options)
      }
      const onPointerDown = (event: PointerEvent) => {
        pressed = undefined
        const target = event.target as Node | null
        const out = target !== null && outside(target)
        ignored =
          target !== null && current.open && !out && !node.contains(target)
            ? target
            : null
        if (event.pointerType === "touch") touches.add(event.pointerId)
        if (
          !listens() || !event.isPrimary || event.button !== 0 ||
          touches.size > 1
        ) return
        if (
          !out || (event.pointerType !== "touch" && onScrollbar(target, event))
        ) return
        if (
          event.pointerType === "touch" ||
          (current.modal === "trap-focus" && !hasBackdrop())
        ) {
          if (event.pointerType === "touch" && node.contains(target)) {
            swallowClick(event)
          }
          dismissing = event.pointerId
          send(DialogMessage.PressedOutside({ pointerType: event.pointerType }))
        } else {
          pressed = event.pointerType
        }
      }
      const onPointerEnd = (event: PointerEvent) => {
        touches.delete(event.pointerId)
        if (event.pointerId === dismissing) dismissing = undefined
        ignored = null
        const target = event.target as Node | null
        if (
          event.type === "pointercancel" || target === null || !outside(target)
        ) pressed = undefined
      }
      const onClick = (event: MouseEvent) => {
        const pointerType = pressed
        pressed = undefined
        if (!listens()) return
        if (pointerType === undefined && event.detail !== 0) return
        const target = event.target as Node | null
        if (target === null || !outside(target)) return
        send(DialogMessage.PressedOutside({ pointerType: pointerType ?? "" }))
      }

      const onFocusIn = (event: FocusEvent) => {
        const target = event.target as Node | null
        focusInside = target !== null && node.contains(target)
        if (focusInside) lastFocused = target as HTMLElement
        else if (isHTMLElement(target) && visited.push(target) > 20) {
          visited.shift()
        }
        if (
          focusInside || target === null || current.modal !== false ||
          !current.open || !showed
        ) return
        if (
          !topmost() || inDialogAbove(stack, node, target) ||
          (ignored !== null && target.contains(ignored))
        ) return
        if (current.dismissible && handingOff === 0 && !onTrigger(target)) {
          send(DialogMessage.FocusedOutside())
        }
      }

      const recover = () =>
        frame(() => {
          const focused = focusedNow()
          if (!current.open || !focusInside || lastFocused === null) return
          if (focused !== null && focused !== document.body) return
          if (
            lastFocused.isConnected && lastFocused.getClientRects().length > 0
          ) return
          handOff(popup())
        })
      const onFocusOut = (event: FocusEvent) => {
        if (event.relatedTarget === null) recover()
      }
      const observer = new MutationObserver(recover)

      const opening = (from: Element | null) =>
        frame(() => {
          if (current.open && topmost()) focusFirst(from)
          const focused = focusedNow()
          focusInside = node.contains(focused)
          if (focusInside) lastFocused = focused as HTMLElement
          if (current.open && !current.started) {
            frame(() => send(DialogMessage.RenderedFirstFrame()))
          }
        })

      const parentsOf = () =>
        stack.showing.filter((other) => other.node.contains(node))
      const restoreFocus = (
        parents: ReadonlyArray<typeof entry>,
        held: boolean
      ) => {
        const {
          closedByFocusOut,
          closedByOutsidePress,
          closeMethod,
          finalFocus,
          portalId
        } = current
        const focused = focusedNow() as HTMLElement | null
        const away = !held && focused !== null && focused !== document.body &&
          !node.contains(focused)
        if (
          focused !== null &&
          stack.showing.some((other) =>
            other.open() && other.node.contains(focused) &&
            !parents.includes(other)
          )
        ) return
        if (!finalFocus) {
          if (focusInside && node.contains(focused)) focused?.blur()
          return
        }
        const visible = closeMethod === "keyboard"
        const marked = closedByFocusOut || (closedByOutsidePress && away)
          ? null
          : byAttribute(rootOf(node), "data-final-focus", portalId)
        if (marked != null && focusable(marked)) return handOff(marked, visible)
        if (away) return
        const back = [trigger, before, ...[...visited].reverse()].find((
          element
        ) => element != null && !node.contains(element) && focusable(element))
        handOff(back, visible)
      }
      const restore = (parents: ReadonlyArray<typeof entry>) =>
        frame(() => {
          if (!current.open) restoreFocus(parents, false)
        })
      const closing = () => {
        const parents = parentsOf()
        const press = dismissing
        if (press === undefined) return restore(parents)
        const done = new AbortController()
        const options = { capture: true, signal: done.signal }
        const end = (event: PointerEvent) => {
          if (event.pointerId !== press) return
          done.abort()
          restore(parents)
        }
        document.addEventListener("pointerup", end, options)
        document.addEventListener("pointercancel", end, options)
      }

      const transition = settling(
        node,
        popup,
        frame,
        (open) => send(DialogMessage.FinishedTransition({ open }))
      )
      const onChange = (next: TrackDialogArgs) => {
        const previous = current
        current = next
        if (next.mounted && !previous.mounted) shows()
        if (next.open && next.triggerId !== previous.triggerId) {
          trigger = findTrigger() ?? trigger
        }
        if (
          next.open && previous.open && next.initialFocus &&
          !previous.initialFocus
        ) opening(focusedNow())
        if (next.open !== previous.open || next.modal !== previous.modal) hold()
        if (next.open !== previous.open || next.topmost !== previous.topmost) {
          rewatch(stack)
        }
        if (previous.open && !next.open) {
          pressed = undefined
          closing()
        } else if (!previous.open && next.open) {
          send(DialogMessage.ShowedPortal())
          page.takeRecords()
          added = new WeakSet()
          const focused = focusedNow()
          if (isHTMLElement(focused) && !node.contains(focused)) {
            before = focused
          }
          opening(focused)
        }
        transition.follow(previous, next)
      }

      const controller = new AbortController()
      const { signal } = controller
      const composing = trackComposing(document, signal)
      let showed = false
      const shows = () => {
        if (showed || signal.aborted) return
        showed = true
        raiseAboveShown(node, signal)
        opening(active)
      }

      return Effect.acquireRelease(
        Effect.sync(() => {
          stack.showing.push(entry)
          listenTrees(node, "keydown", onKeyDown, { signal })
          listenTrees(node, "pointerdown", onPointerDown, {
            capture: true,
            signal
          })
          listenTrees(node, "pointerup", onPointerEnd, {
            capture: true,
            signal
          })
          listenTrees(node, "pointercancel", onPointerEnd, {
            capture: true,
            signal
          })
          listenTrees(node, "click", onClick, { capture: true, signal })
          listenTrees(node, "focusin", onFocusIn, {
            capture: true,
            signal
          })
          node.addEventListener("focusout", onFocusOut, { signal })
          if (document.body !== null) {
            page.observe(document.body, { subtree: true, childList: true })
          }
          observer.observe(node, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ["class", "style", "hidden"]
          })
          hold()
          rewatch(stack)
          if (current.mounted) shows()
          else send(DialogMessage.ShowedPortal())
        }).pipe(
          Effect.tap(() =>
            Effect.forkScoped(
              Stream.runForEach(changes, (next) =>
                Effect.sync(() => onChange(next)))
            )
          )
        ),
        () =>
          Effect.sync(() => {
            stack.showing.splice(stack.showing.indexOf(entry), 1)
            controller.abort()
            rewatch(stack)
            observer.disconnect()
            page.disconnect()
            release?.()
            transition.cancel()
            if (current.open) {
              const parents = parentsOf()
              const held = focusInside
              frame(() => restoreFocus(parents, held))
            }
          })
      )
    })
)

const triggerAttrs = <B extends Attributed<B>>(
  builder: B,
  active: boolean,
  popupId: string | undefined
): B =>
  builder
    .attrs({
      type: "button",
      "aria-haspopup": "dialog",
      "aria-expanded": active ? "true" : "false",
      "aria-controls": active ? popupId : undefined,
      "data-popup-open": flag(active),
      "data-dialog-trigger": popupId
    })

/**
 * A press on a `DialogTrigger`: the trigger's `id`, if it has one, and how
 * the user pressed it.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface DialogTriggerPress {
  readonly triggerId: string | null
  readonly method: DialogInteraction
}

/**
 * A `<button>` builder: what `DialogTrigger` accepts as `element`, from the
 * caller's `h.button`, and what it returns.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type DialogTriggerElement<Msg, R = never> = Html.Element<
  Msg,
  R,
  Html.EventsOf<"button">,
  HTMLButtonElement,
  "button"
>

/**
 * The props of a `DialogTrigger`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface DialogTriggerProps {
  /** Whether the dialog is open for this trigger. */
  readonly open: boolean
  /** The dialog's `id`, which `aria-controls` points at while it is open. */
  readonly popupId?: string | undefined
}

/**
 * A button that opens a dialog drawn somewhere else, such as in another
 * component. Call it with the caller's `h`, whether the dialog is open for
 * this trigger, the dialog's `id` as `popupId`, and what a press sends as
 * `onPress`, then chain the label.
 *
 * **Details**
 *
 * It sets the trigger's `aria-haspopup="dialog"`, `aria-expanded`,
 * `data-popup-open`, and `aria-controls` while the dialog is open, in
 * `forward`, so they win over the caller's. Give the dialog the same `id`
 * prop: the dialog then finds the trigger by its `aria-controls`, so a press
 * on it isn't a press outside, and focus goes back to it when the dialog
 * closes.
 *
 * `onPress` is a message, or a function of the press, which carries the
 * trigger's `id` and how the user pressed it. Store the method and pass it
 * as the dialog's `openMethod`, so an open by touch focuses the popup.
 *
 * Given `onPress`, a click handler of the caller's own, set on `element` or
 * chained after the call, throws at render: pass the message as `onPress`.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const DialogTrigger = <Msg, R = never>(
  h: { readonly button: DialogTriggerElement<Msg> },
  options: {
    /** The caller's `h.button`, to stack a part on it. `h.button` when left out. */
    readonly element?: DialogTriggerElement<Msg, R> | undefined
    readonly props: DialogTriggerProps
    /** What a press sends, with a click, Space or Enter. */
    readonly onPress?:
      | NoInfer<Msg>
      | ((press: DialogTriggerPress) => NoInfer<Msg>)
      | undefined
  }
): DialogTriggerElement<Msg, R> => {
  const element: DialogTriggerElement<Msg, R> = options.element ?? h.button
  const { onPress } = options
  const { open, popupId } = options.props
  return element.forward((node) => {
    if (onPress !== undefined && node.handlers.click !== undefined) {
      throw new Error(
        "DialogTrigger: the element already handles click, which DialogTrigger would replace. Send the message from onPress"
      )
    }
    const button = triggerAttrs(node, open, popupId)
    if (onPress === undefined) return button
    if (typeof onPress !== "function") return button.on("click", onPress)
    const triggerId = idOf(node)
    const press = onPress as (press: DialogTriggerPress) => Msg
    return button.on(
      "click",
      ({ pointerType }) => press({ triggerId, method: methodOf(pointerType) })
    )
  })
}

/**
 * A headless dialog. Call it with the consumer's `h` and a `view` closure that
 * draws the trigger with `dialog.trigger` and the dialog with `dialog.portal` and the
 * parts inside it.
 *
 * **Details**
 *
 * The parts also return plain values for markup that depends on them:
 * `open`, `mounted` (the dialog shows, through its exit transition),
 * `transitionStatus`, `nested`, `nestedDialogs`, `triggerId`, the `id` of the
 * trigger the dialog is open for or last was, and `openMethod` and
 * `closeMethod`, how the user opened the open dialog and last closed it.
 * Draw `initialFocus` on a field only for some ways of opening by branching
 * on `dialog.openMethod`, which is `null` once the dialog closes.
 *
 * A trigger reports the `id` the consumer gave it in `RequestedOpen`: set it
 * on the builder before the part,
 * `dialog.trigger(h.button.attr("id", "edit-" + row.id))`. A trigger without
 * one gets a generated `id`. The dialog remembers the trigger that opened
 * it: only that one reports it open, and focus goes back to it. Pressing it
 * asks the dialog to close, and pressing another one while it is open asks
 * it to open for that one, which it then remembers.
 *
 * Each part's attributes win over the ones the consumer set on the builder
 * it passes in, including the ones a state leaves absent: on the trigger
 * `type`, `aria-haspopup`, `aria-expanded`, `aria-controls`, `data-popup-open`,
 * and `data-dialog-trigger`, which the dialog tells its triggers by; on the
 * portal `id`, `popover`, `open` and `aria-modal` (`open` alone with
 * `topLayer: false`); `role` on the backdrop and the viewport; the data
 * attributes on the backdrop (including `data-dialog-backdrop`), viewport and
 * popup; `id`, `tabindex` and `inert` on the popup; `type` on the close
 * part; `autofocus` on `initialFocus`; and
 * `data-final-focus`, which the dialog finds the element by, on `finalFocus`.
 * The title and description keep an `id` the consumer gives them, and get a
 * generated one otherwise. The portal's `aria-labelledby` and `aria-describedby`
 * point at the title and description that are drawn, after the consumer's
 * own. The portal's box, the backdrop's `user-select`, the `pointer-events` of
 * the closing backdrop and viewport, and the popup's `--nested-dialogs` are added
 * after the consumer's inline style. A handler the consumer adds to a part
 * runs after the dialog's own.
 *
 * On a host that doesn't run mounts, such as `TestHost`, an open dialog
 * shows, so `HtmlPlay` finds it. On the server, an open dialog in place
 * renders `open`, and one in the top layer stays hidden until the client's
 * first commit. On both, the dialog stays at `data-starting-style` and
 * closes without waiting for a transition.
 *
 * History restore saves nothing of it: after Back, forward or a reload it
 * starts from `init`.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const Dialog = Html.component({
  name: "Dialog",
  props: DialogProps,
  model: DialogModel,
  message: DialogMessage,
  events: DialogEvents,
  shares: {
    value: ({ props }) => ({ open: props.open }),
    collects: {
      schema: Schema.Number,
      onChange: (counts) =>
        DialogMessage.ChangedNested({
          count: counts.reduce((sum, count) => sum + count, 0)
        })
    }
  },
  reads: {
    parent: {
      owner: "self",
      optional: true,
      report: (
        model,
        props
      ) => (props.open && props.nested !== false ? 1 + model.nestedOpen : 0)
    }
  },
  restore: false
}).make({
  init: () => ({
    mounted: false,
    started: false,
    nestedOpen: 0,
    trigger: null,
    reason: null,
    openMethod: null,
    closeMethod: null
  }),
  update: {
    ClickedTrigger: ($, { key, pointerType, triggerId }) => {
      const method = methodOf(pointerType)
      const active = $.props.triggerId ?? $.model.trigger
      if ($.props.open && (active === null || active === key)) {
        return dismiss($, "trigger-press", method)
      }
      return $.evolve({ trigger: key, reason: null, openMethod: method }).emit(
        DialogEvents.RequestedOpen({ triggerId })
      )
    },
    ClickedClose: ($, { pointerType }) =>
      $.props.open ? dismiss($, "close-press", methodOf(pointerType)) : $.model,
    PressedEscape: ($) =>
      $.props.open && topmost($.model)
        ? dismiss($, "escape-key", "keyboard")
        : $.model,
    PressedOutside: ($, { pointerType }) =>
      $.props.open && topmost($.model) &&
        $.props.disablePointerDismissal !== true
        ? dismiss($, "outside-press", methodOf(pointerType))
        : $.model,
    CancelledCloseWatcher: ($) =>
      $.props.open && topmost($.model)
        ? dismiss($, "close-watcher", null)
        : $.model,
    FocusedOutside: ($) =>
      $.props.open && topmost($.model) && modalOf($.props) === false &&
        $.props.disablePointerDismissal !== true
        ? dismiss($, "focus-out", null)
        : $.model,
    ShowedPortal: ($) =>
      $.props.open
        ? $.evolve({ mounted: true, reason: null, closeMethod: null })
        : $.evolve({ mounted: true }),
    RenderedFirstFrame: ($) =>
      $.props.open ? $.evolve({ started: true }) : $.model,
    FinishedTransition: ($, { open }) => {
      if (open !== $.props.open) return $.model
      if (open) return $.emit(DialogEvents.Settled({ open }))
      return $.model.mounted && $.props.holdExit !== true
        ? $.evolve({ mounted: false, started: false, openMethod: null }).emit(
          DialogEvents.Settled({ open })
        )
        : $.model
    },
    ChangedNested: ($, { count }) => $.evolve({ nestedOpen: count })
  },
  parts: (p, model) => {
    const props = p.props
    const topLayer = props.topLayer !== false
    const modal = modalOf(props)
    const open = props.open
    const shown = open || model.mounted
    const transitionStatus: DialogTransitionStatus = statusOf(model, props)
    const nested = p.reads.parent !== undefined && props.nested !== false
    const nestedDialogs = model.nestedOpen
    const portalId = props.id ?? p.id("portal")
    const openMethod = open ? props.openMethod ?? model.openMethod : null
    const activeTrigger = props.triggerId ?? model.trigger
    const popupId = p.id("popup")
    let triggers = 0
    let titleId: string | undefined
    let descriptionId: string | undefined
    const states = <B extends Attributed<B>>(builder: B): B =>
      transitionAttrs(builder, open, transitionStatus)
    const nesting = <B extends Attributed<B>>(builder: B): B =>
      states(builder)
        .attrs({
          "data-nested": flag(nested),
          "data-nested-dialog-open": flag(nestedDialogs > 0)
        })
    const passThrough = "pointer-events:none"

    const triggerPart = p.part(
      "button",
      (b, triggerId: string | null, key: string, disabled: boolean) => {
        const button = triggerAttrs(
          b.attr("id", key),
          open && (activeTrigger === null || activeTrigger === key),
          portalId
        )
        // A click can still reach a disabled button from an element inside it.
        return disabled
          ? button
          : button.on(
            "click",
            ({ pointerType }) =>
              DialogMessage.ClickedTrigger({ triggerId, key, pointerType })
          )
      }
    )
    const trigger = View.wrapPart(
      triggerPart,
      <B extends View.PartTarget<"button">>(
        element: B
      ): ReturnType<B["attr"]> => {
        const id = idOf(element)
        return triggerPart(
          element,
          id,
          id ?? p.id("trigger", triggers++),
          attrOf(element, "disabled") !== undefined
        )
      }
    )

    const portalPart = p.part("dialog", (b) => {
      const identified = b
        .attr("id", portalId)
        .attr("aria-modal", modal === false ? "false" : undefined)
      // In place, set `open` directly: `.open()` calls `dialog.show()`, which ignores `initialFocus: false`.
      const placed = topLayer
        ? identified.open(false).popover("manual", shown)
        : identified.attr("open", flag(shown))
      const dialog = placed
        .forward((node) =>
          node
            .attrs({
              style: withStyle(
                node.elementAttrs.style,
                topLayer ? portalBox : inPlaceBox
              ),
              "aria-labelledby": withTokens(
                node.elementAttrs["aria-labelledby"],
                titleId
              ),
              "aria-describedby": withTokens(
                node.elementAttrs["aria-describedby"],
                descriptionId
              )
            })
        )
        .children(modal === true && (open ? layer : inertLayer))
      if (!shown) return dialog
      return dialog.onMount(
        TrackDialog({
          modal,
          open,
          mounted: model.mounted,
          started: model.started,
          topmost: nestedDialogs === 0,
          dismissible: props.disablePointerDismissal !== true,
          initialFocus: props.initialFocus !== false,
          finalFocus: props.finalFocus !== false,
          openMethod,
          closeMethod: model.closeMethod,
          closedByFocusOut: model.reason === "focus-out",
          closedByOutsidePress: model.reason === "outside-press",
          triggerId: activeTrigger,
          holdExit: props.holdExit === true,
          portalId,
          popupId
        })
      )
    })
    const portal = View.wrapPart(
      portalPart,
      <B extends View.PartTarget<"dialog">>(
        element: B
      ): ReturnType<B["attr"]> | undefined => {
        const out = portalPart(element)
        return shown || props.keepMounted === true ? out : undefined
      }
    )

    const backdropPart = p.part("div", (b) =>
      states(b)
        .attrs({ role: "presentation", "data-dialog-backdrop": portalId })
        .forward((node) =>
          node.attr(
            "style",
            withStyle(
              node.elementAttrs.style,
              open ? noSelect : noSelect + ";" + passThrough
            )
          )
        ))
    const backdrop = View.wrapPart(
      backdropPart,
      <B extends View.PartTarget<"div">>(
        element: B
      ): ReturnType<B["attr"]> | undefined => {
        const out = backdropPart(element)
        return nested && props.forceRenderBackdrop !== true ? undefined : out
      }
    )
    const viewport = p.part("div", (b) =>
      nesting(b)
        .attr("role", "presentation")
        .forward((node) =>
          open
            ? node
            : node.attr(
              "style",
              withStyle(node.elementAttrs.style, passThrough)
            )
        ))
    const popup = p.part("div", (b) =>
      nesting(b)
        .attrs({ id: popupId, tabindex: "-1", inert: flag(!open) })
        .forward((node) =>
          node.attr(
            "style",
            withStyle(
              node.elementAttrs.style,
              `--nested-dialogs:${nestedDialogs}`
            )
          )
        ))

    const titlePart = p.part(
      ["h1", "h2", "h3", "h4", "h5", "h6"],
      (b, id: string) =>
        b.attr("id", id).forward((node) => {
          titleId = node.elementAttrs.id ?? id
          return node
        })
    )
    const title = View.wrapPart(
      titlePart,
      <B extends View.PartTarget<"h1" | "h2" | "h3" | "h4" | "h5" | "h6">>(
        element: B
      ): ReturnType<B["attr"]> => {
        titleId = idOf(element) ?? p.id("title")
        return titlePart(element, titleId)
      }
    )
    const descriptionPart = p.part(
      "p",
      (b, id: string) =>
        b.attr("id", id).forward((node) => {
          descriptionId = node.elementAttrs.id ?? id
          return node
        })
    )
    const description = View.wrapPart(
      descriptionPart,
      <B extends View.PartTarget<"p">>(element: B): ReturnType<B["attr"]> => {
        descriptionId = idOf(element) ?? p.id("description")
        return descriptionPart(element, descriptionId)
      }
    )
    const close = p.part(
      "button",
      (b) =>
        b.attr("type", "button").on(
          "click",
          ({ pointerType }) => DialogMessage.ClickedClose({ pointerType })
        )
    )
    const initialFocus = p.part((b) =>
      b.attr("autofocus", props.initialFocus === false ? undefined : "")
    )
    const finalFocus = p.part((b) => b.attr("data-final-focus", portalId))
    return {
      open,
      mounted: shown,
      transitionStatus,
      nested,
      nestedDialogs,
      openMethod,
      closeMethod: model.closeMethod,
      triggerId: activeTrigger,
      trigger,
      portal,
      backdrop,
      viewport,
      popup,
      title,
      description,
      close,
      initialFocus,
      finalFocus
    }
  }
})
