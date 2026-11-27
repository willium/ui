/**
 * A card that shows a preview of what a link leads to while the link is
 * hovered or focused with the keyboard.
 *
 * `PreviewCard` is headless: it owns the hover and focus timing, the data
 * attributes, the popup's place in the top layer and its position, and the
 * consumer draws the markup. The consumer owns whether the card is open,
 * passes it as `open`, and stores what the `RequestedOpen` and `RequestedClose`
 * events ask for. The card stays as it is until `open` changes, so a
 * consumer can refuse a close.
 *
 * The link stays the only way in for assistive technology: the trigger
 * gets no ARIA from the card, the popup has no role, and focus never moves
 * into it. Put nothing in the card that the link's own page doesn't also
 * offer.
 *
 * **Anatomy**
 *
 * | Part         | Element                                              |
 * | :----------- | :--------------------------------------------------- |
 * | `trigger`    | `<a>` the card previews                              |
 * | `portal`     | `<div>` in the top layer, around the parts below     |
 * | `backdrop`   | `<div>` that covers the page                         |
 * | `positioner` | `<div>` placed next to the trigger                   |
 * | `popup`      | `<div>` with the card's content                      |
 * | `viewport`   | `<div>` around content that changes with the trigger |
 * | `arrow`      | `<div>` that points at the trigger                   |
 *
 * Each part takes the consumer's builder and returns it with the part
 * applied, and the consumer adds the children:
 * `previewCard.portal(h.div)?.children(previewCard.positioner(h.div).children(previewCard.popup(h.div).children("…")))`.
 * The trigger takes an options object, `previewCard.trigger({ element: h.a })`,
 * since each trigger has its own delays. The portal returns `undefined`
 * while the card is closed, unless `keepMounted`. `backdrop`, `viewport`
 * and `arrow` are optional.
 *
 * The portal is shown as a manual popover, so the card sits in the top layer.
 * The kit resets its box inline to an empty one with nothing visible of its
 * own, at the document's origin, or at the viewport's corner with
 * `positionMethod: "fixed"`. The positioner is placed inside it, so style the
 * popup and the arrow, and a backdrop as a fixed layer:
 * `.backdrop { position: fixed; inset: 0 }`. The backdrop takes no presses.
 *
 * With `topLayer: false`, the portal renders in place as a `<div>` with no
 * box of its own, `hidden` while closed, and the preview is placed and
 * clipped inside the positioner's containing block, as `Positioning`
 * describes.
 *
 * The positioner's inline style carries `left` and `top`, and the variables
 * `--anchor-width`, `--anchor-height`, `--available-width`,
 * `--available-height` and `--transform-origin`. `sideOffset` is padding on
 * the positioner's side facing the trigger, so the pointer can cross the gap
 * without leaving the card.
 *
 * A link that wraps over several lines is measured line by line: the card
 * is placed against the line the pointer rested on, which it keeps when the
 * lines move before the card opens. Opened by focus, it is
 * placed against the last line for `side: "bottom"`, the first for `"top"`,
 * and the lines that reach furthest toward the side for the other two.
 *
 * **Data attributes**
 *
 * Each present with an empty value or absent, except the ones with a value:
 *
 * - `trigger`: `data-popup-open` while the card is open for it
 * - `backdrop`: `data-open` / `data-closed`, `data-starting-style`,
 *   `data-ending-style`
 * - `positioner`: `data-open` / `data-closed`, `data-side`, `data-align`,
 *   `data-anchor-hidden`, `data-instant`
 * - `popup`: the backdrop's, and `data-side`, `data-align`, `data-instant`
 * - `viewport`: `data-transitioning`, `data-activation-direction`,
 *   `data-instant`
 * - `arrow`: `data-open` / `data-closed`, `data-side`, `data-align`,
 *   `data-uncentered`
 *
 * `data-side` and `data-align` name where the popup ended up, after it
 * flipped or shifted to fit. `data-instant` names a change that should skip
 * its transition: `focus` while the card is open by keyboard focus, and
 * `dismiss` once Escape closed it. `data-starting-style` is present for the
 * first frame after the card opens and `data-ending-style` while it closes.
 * The card stays shown until the popup's own transitions and animations
 * finish, then closes and emits `Settled`.
 *
 * **Keyboard**
 *
 * Focusing the trigger with the keyboard opens the card after the same
 * `delay` as a hover, and focus leaving the trigger and the card closes it.
 * Only focus that shows a focus ring, as `:focus-visible` tells, opens it,
 * so focus from a press, on the trigger or on a button that moves focus to
 * it, doesn't. Escape closes an open card wherever focus is. With focus in
 * the card, focus goes back to the trigger as the close starts, without
 * opening the card again, and the card is `inert` through its exit. The
 * card's own links follow the trigger in the tab order when the portal is
 * drawn right after it. A card opened from a detached trigger isn't next to
 * the link in the page, so Tab from the link skips the card's content and
 * the card closes. Anything interactive in such a card must also be
 * reachable from the link's own page.
 *
 * **Hover**
 *
 * The card asks to open once the mouse has rested on a trigger for its
 * `delay`, 600 milliseconds by default, and to close `closeDelay`
 * milliseconds, 300 by default, after the pointer has left the trigger and
 * the card. On its way from the trigger to the card, the pointer can cross
 * the triangle between where it left the trigger and the card's near edge
 * without starting the close, so a short link and a wide card can be crossed
 * diagonally. Keyboard focus on the trigger or in the card holds it open. A
 * touch on the trigger opens nothing, and a click on it doesn't close the
 * card. A press outside the trigger and the card closes it. A layer that
 * covers the trigger and gives the pointer back where it rested is no new
 * hover. If the trigger the card is open for leaves the page, the card asks
 * to close.
 *
 * **Several triggers**
 *
 * Every trigger reports its `id` in `RequestedOpen`, the consumer's or a
 * generated one. Store it and pass it as `triggerId`: the popup is placed
 * against that trigger, and the consumer draws the content for it. Hovering
 * another trigger while the card is open moves it there at once.
 *
 * To animate the content as the card moves from one trigger to another,
 * draw it inside `previewCard.viewport(h.div)`, in the popup. The viewport puts its
 * children in a `<div data-current>`. While the card moves, it keeps what the
 * last trigger showed in a `<div data-previous>` before it, inert and out of
 * the flow, has `data-transitioning`, and names where the new trigger is from
 * the last one in `data-activation-direction`: `left` or `right`, a space,
 * then `up` or `down`, each left out within 5 pixels. The new content has
 * `data-starting-style` for the first frame and the old one
 * `data-ending-style` after it, and the old content is removed once the new
 * content's transitions finish.
 *
 * With a viewport, the positioner's inline style also carries
 * `--positioner-width` and `--positioner-height`, the popup's size for the
 * current content, and the popup's `--popup-width` and `--popup-height`.
 * Those two are `auto`, except while the card moves: they then go from the
 * old content's size to the new one's, so
 * `.popup { width: var(--popup-width, auto); transition: width 200ms }`
 * animates the resize.
 *
 * A `PreviewCardTrigger` opens a card from another part of the page. Give the
 * card an `id` and the trigger the same `popupId`. Its hovers and focus reach
 * the card by themselves, so they arrive as the card's own `RequestedOpen` and
 * `RequestedClose`.
 *
 * **Limits**
 *
 * - There is no `payload`, handle or `defaultOpen`: `open` and `triggerId`
 *   live in the consumer's Model, which also decides the content.
 * - A pointer that stops in the triangle between the trigger and the card
 *   keeps the card open until it moves out.
 *
 * **Example** (A link with a preview whose open state lives in the consumer's Model)
 *
 * ```ts import.meta.vitest
 * import { UiSchema } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { PreviewCard } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const ArticleMessage = UiSchema.TaggedEnum({ RequestedOpenPreview: {}, RequestedClosePreview: {} })
 *
 * const Article = Html.component({
 *   name: "Article",
 *   model: Schema.Struct({ preview: Schema.Boolean }),
 *   message: ArticleMessage
 * }).make({
 *   init: () => ({ preview: true }),
 *   update: {
 *     RequestedOpenPreview: ($) => $.evolve({ preview: true }),
 *     RequestedClosePreview: ($) => $.evolve({ preview: false })
 *   },
 *   view: (h, model) =>
 *     PreviewCard(h, {
 *       props: { open: model.preview, sideOffset: 8 },
 *       onEmit: {
 *         RequestedOpen: () => ArticleMessage.RequestedOpenPreview(),
 *         RequestedClose: () => ArticleMessage.RequestedClosePreview(),
 *         Settled: () => undefined
 *       },
 *       view: (previewCard) =>
 *         h.div(
 *           h.p(
 *             "Good ",
 *             previewCard.trigger({ element: h.a.attr("href", "/typography") }).children("typography"),
 *             " makes text easy to read."
 *           ),
 *           previewCard.portal(h.div)?.children(
 *             previewCard.positioner(h.div).children(
 *               previewCard.popup(h.div.class("card")).children("Typography is the art of arranging type.")
 *             )
 *           )
 *         )
 *     })
 * })
 *
 * // The trigger has no ARIA of its own, and the popup takes no focus from Tab.
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Article, {}))
 * if (html.includes("aria-expanded")) throw new Error("the link announces a popup")
 * if (!/<div class="card"[^>]* tabindex="-1"/.test(html)) throw new Error("the popup is in the tab order")
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Command from "@effect/ui/Command"
import type * as Component from "@effect/ui/Component"
import * as Html from "@effect/ui/html/Html"
import * as Mount from "@effect/ui/Mount"
import * as UiSchema from "@effect/ui/UiSchema"
import * as UiStruct from "@effect/ui/UiStruct"
import * as View from "@effect/ui/View"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import {
  type Attributed,
  attrSelector,
  flag,
  idOf,
  idSelector,
  type Keyed,
  withStyle
} from "./internal/attributes.ts"
import { detachedChannel } from "./internal/detached.ts"
import { elementOf, focusVisible, isHTMLElement } from "./internal/dom.ts"
import { watchHoverArea } from "./internal/hoverArea.ts"
import { lineUnder } from "./internal/inlineRect.ts"
import { onEscape, Point, pointOf } from "./internal/interaction.ts"
import { listenOutside } from "./internal/outside.ts"
import {
  atDocumentOrigin,
  inPlaceBox,
  layered,
  portalBox,
  raiseAbove
} from "./internal/topLayer.ts"
import {
  frameOf,
  settling,
  statusOf,
  transitionAttrs,
  type TransitionStatus
} from "./internal/transition.ts"
import {
  stepViewport,
  TrackViewport,
  ViewportChange,
  viewportContent,
  ViewportTransition
} from "./internal/viewport.ts"
import * as Positioning from "./Positioning.ts"

/**
 * The side of the trigger a preview card shows on.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const PreviewCardSide = Positioning.Side

/**
 * The side of the trigger a preview card shows on.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type PreviewCardSide = typeof PreviewCardSide.Type

/**
 * How a preview card lines up with its trigger along the side it shows on.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const PreviewCardAlign = Positioning.Align

/**
 * How a preview card lines up with its trigger along the side it shows on.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type PreviewCardAlign = typeof PreviewCardAlign.Type

/**
 * Controls whether the preview card is open, which trigger it is open for,
 * and where the popup appears.
 *
 * **Details**
 *
 * - `open`: whether the card shows. Required: the consumer owns it.
 * - `triggerId`: the `id` of the trigger the card is open for, from
 *   `RequestedOpen`. The popup is placed against it, and only it gets
 *   `data-popup-open`. With none, the card remembers the trigger that last
 *   asked to open it.
 * - `keepMounted`: the portal stays in the page while the card is closed,
 *   hidden.
 * - `holdExit`: a closed card stays shown, in its ending state, while this
 *   is `true`, for an exit animation that the consumer runs itself.
 * - `id`: the portal's `id`, generated when left out. Set it to pair the
 *   card with a `PreviewCardTrigger` drawn somewhere else, as its `popupId`.
 * - `side`: the side of the trigger the popup shows on, `"bottom"` by
 *   default. `"inline-start"` and `"inline-end"` follow the writing direction.
 * - `align`: how the popup lines up with the trigger along that side,
 *   `"center"` by default.
 * - `sideOffset`: the gap between the trigger and the popup, in pixels.
 * - `alignOffset`: pixels the popup moves along the side.
 * - `collisionAvoidance`, `collisionBoundary`, `collisionPadding`, `sticky`,
 *   `arrowPadding`, `disableAnchorTracking`: as `Positioning` describes them.
 * - `positionMethod`: `"absolute"`, the default, which scrolls with the page,
 *   or `"fixed"`, which is placed again on every scroll and doesn't make the
 *   page taller when the popup reaches past its end.
 * - `anchor`: the id of an element, or a `Rect` in the viewport, to place
 *   the popup against instead of the trigger.
 * - `topLayer`: `false` draws the portal in place, out of the top layer, as
 *   the module describes. `true` when left out.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const PreviewCardProps = Schema.Struct({
  open: Schema.Boolean,
  triggerId: Schema.optional(Schema.NullOr(Schema.String)),
  keepMounted: Schema.optional(Schema.Boolean),
  holdExit: Schema.optional(Schema.Boolean),
  id: Schema.optional(Schema.String),
  ...Positioning.PositionerFields
})

/**
 * The props of a `PreviewCard`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type PreviewCardProps = typeof PreviewCardProps.Type

/**
 * Why a preview card asks to open: the mouse resting on a trigger, or the
 * keyboard focusing one.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const PreviewCardOpenReason = Schema.Literals([
  "trigger-hover",
  "trigger-focus"
])

/**
 * Why a preview card asks to open.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type PreviewCardOpenReason = typeof PreviewCardOpenReason.Type

/**
 * Why a preview card asks to close: the pointer left, focus left, a press
 * outside, Escape, or the trigger it is open for left the page.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const PreviewCardDismissReason = Schema.Literals([
  "trigger-hover",
  "trigger-focus",
  "outside-press",
  "escape-key",
  "trigger-removed"
])

/**
 * Why a preview card asks to close.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type PreviewCardDismissReason = typeof PreviewCardDismissReason.Type

/**
 * `RequestedOpen` asks for the card to open, with the `id` of the trigger and
 * the reason. It is also emitted while the card is open, when another
 * trigger asks for it. `RequestedClose` asks for it to close, with the reason.
 * The consumer decides whether to change `open`. `Settled` reports that the
 * transitions and animations of an open or a close finished.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const PreviewCardEvents = UiSchema.TaggedEnum({
  RequestedOpen: {
    triggerId: Schema.NullOr(Schema.String),
    reason: PreviewCardOpenReason
  },
  RequestedClose: { reason: PreviewCardDismissReason },
  Settled: { open: Schema.Boolean }
})

/**
 * What a `PreviewCard` emits.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type PreviewCardEvents = typeof PreviewCardEvents.Type

/**
 * Why a change of a preview card skips its transition, as `data-instant`
 * reports it: `focus` for an open by keyboard focus, `dismiss` for a close
 * by Escape.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type PreviewCardInstant = "focus" | "dismiss"

/**
 * Where a preview card is in its transitions: `"starting"` for the first
 * frame after it opens, `"ending"` while it closes, `null` otherwise.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type PreviewCardTransitionStatus = TransitionStatus

const Delays = Schema.Struct({
  delay: Schema.Number,
  closeDelay: Schema.Number
})

type Delays = typeof Delays.Type

const TriggerId = Schema.NullOr(Schema.String)

const PreviewCardMessage = UiSchema.TaggedEnum({
  EnteredTrigger: {
    triggerId: TriggerId,
    ...Delays.fields,
    at: Schema.NullOr(Point)
  },
  LeftTrigger: { triggerId: TriggerId, at: Schema.NullOr(Point) },
  MovedToLine: { triggerId: TriggerId, at: Point, line: Schema.Number },
  TouchedTrigger: {},
  FocusedTrigger: {
    triggerId: TriggerId,
    ...Delays.fields,
    visible: Schema.Boolean
  },
  BlurredTrigger: {},
  FocusedPopup: {},
  BlurredPopup: {},
  FocusedOutside: {},
  LeftHoverArea: {},
  ReturnedToHoverArea: {},
  PressedOutside: {},
  PressedEscape: {},
  RemovedTrigger: {},
  CompletedWaitBeforeOpening: {},
  CompletedWaitBeforeClosing: {},
  ShowedPortal: {},
  RenderedFirstFrame: {},
  FinishedTransition: { open: Schema.Boolean },
  ChangedViewport: { change: ViewportChange },
  ChangedPlacement: { placement: Positioning.Placement }
})

type PreviewCardMessage = typeof PreviewCardMessage.Type

const PreviewCardModel = Schema.Struct({
  onTrigger: Schema.Boolean,
  hoverTrigger: TriggerId,
  point: Schema.NullOr(Positioning.InlineHit),
  rest: Schema.NullOr(Schema.Struct({ triggerId: TriggerId, ...Point.fields })),
  touched: Schema.Boolean,
  away: Schema.Boolean,
  focused: Schema.Boolean,
  focusTrigger: TriggerId,
  focusInside: Schema.Boolean,
  pending: Schema.NullOr(PreviewCardOpenReason),
  pendingTrigger: TriggerId,
  closeDelay: Schema.Number,
  asked: Schema.Boolean,
  reason: Schema.NullOr(PreviewCardOpenReason),
  trigger: TriggerId,
  anchorHit: Schema.NullOr(Positioning.InlineHit),
  closeReason: Schema.NullOr(PreviewCardDismissReason),
  mounted: Schema.Boolean,
  started: Schema.Boolean,
  transition: Schema.NullOr(ViewportTransition),
  placement: Schema.NullOr(Positioning.Placement)
})

type PreviewCardModel = typeof PreviewCardModel.Type

type PreviewCardUpdate = Component.Update<
  PreviewCardModel,
  PreviewCardMessage,
  PreviewCardEvents,
  PreviewCardProps
>

const delaysOf = (options: {
  readonly delay?: number | undefined
  readonly closeDelay?: number | undefined
}): Delays => ({
  delay: options.delay ?? 600,
  closeDelay: options.closeDelay ?? 300
})

const WaitBeforeOpening = Command.make(
  "WaitBeforeOpening",
  { args: { delay: Schema.Number }, mode: "switch" },
  ({ delay }) =>
    Effect.as(
      Effect.sleep(Duration.millis(delay)),
      PreviewCardMessage.CompletedWaitBeforeOpening()
    )
)

const WaitBeforeClosing = Command.make(
  "WaitBeforeClosing",
  { args: { delay: Schema.Number }, mode: "switch" },
  ({ delay }) =>
    Effect.as(
      Effect.sleep(Duration.millis(delay)),
      PreviewCardMessage.CompletedWaitBeforeClosing()
    )
)

const escape = onEscape(PreviewCardMessage.PressedEscape())

const detached = detachedChannel<PreviewCardMessage>(
  "detachedPreviewCardTriggers"
)

let returning = 0
const returnFocus = (element: HTMLElement): void => {
  returning++
  try {
    element.focus({ preventScroll: true, focusVisible: true } as FocusOptions)
  } finally {
    returning--
  }
}

const activeOf = (
  model: PreviewCardModel,
  props: PreviewCardProps
): string | null => props.triggerId ?? model.trigger

const hovering = (model: PreviewCardModel): boolean =>
  model.onTrigger || !model.away

const held = (model: PreviewCardModel): boolean =>
  model.focused || model.focusInside

const openFor = (
  model: PreviewCardModel,
  $: PreviewCardUpdate,
  triggerId: string | null,
  reason: PreviewCardOpenReason
) =>
  $.set(model).evolve({
    away: !model.onTrigger,
    pending: null,
    pendingTrigger: null,
    asked: !$.props.open,
    reason,
    trigger: triggerId,
    anchorHit: reason === "trigger-hover" ? model.point : null,
    closeReason: null,
    transition: $.props.open ? model.transition : null
  }).run(
    Command.interrupt(WaitBeforeOpening),
    Command.interrupt(WaitBeforeClosing)
  ).emit(
    PreviewCardEvents.RequestedOpen({ triggerId, reason })
  )

const dismiss = ($: PreviewCardUpdate, reason: PreviewCardDismissReason) =>
  $.props.open
    ? $.evolve({ closeReason: reason }).run(
      Command.interrupt(WaitBeforeClosing)
    ).emit(
      PreviewCardEvents.RequestedClose({ reason })
    )
    : $.model

const cancelled = (
  model: PreviewCardModel,
  $: PreviewCardUpdate,
  reason: PreviewCardOpenReason
) =>
  !$.props.open && model.pending === reason
    ? $.set(model).evolve({ pending: null, pendingTrigger: null }).run(
      Command.interrupt(WaitBeforeOpening)
    )
    : model

const watchLines = (
  node: HTMLElement,
  signal: AbortSignal,
  moved: (at: Point, line: number) => void
): void => {
  let line: number | null = null
  const measure = (event: MouseEvent) => {
    const at = { x: event.clientX, y: event.clientY }
    const next = lineUnder(node.getClientRects(), at)
    if (next === null || next === line) return
    line = next
    moved(at, next)
  }
  node.addEventListener("mouseenter", measure, { signal })
  node.addEventListener("mousemove", measure, { signal })
  node.addEventListener("mouseleave", () => {
    line = null
  }, { signal })
}

const TrackPreviewCardTrigger = Mount.makeStream(
  "TrackPreviewCardTrigger",
  { args: { triggerId: Schema.String } },
  (node: HTMLElement, args, changes) =>
    Stream.callback<PreviewCardMessage>((queue) => {
      let current = args
      const controller = new AbortController()
      return Effect.acquireRelease(
        Effect.sync(() =>
          watchLines(node, controller.signal, (at, line) => {
            Queue.offerUnsafe(
              queue,
              PreviewCardMessage.MovedToLine({
                triggerId: current.triggerId,
                at,
                line
              })
            )
          })
        ).pipe(
          Effect.tap(() =>
            Effect.forkScoped(
              Stream.runForEach(changes, (next) =>
                Effect.sync(() => {
                  current = next
                }))
            )
          )
        ),
        () => Effect.sync(() => controller.abort())
      )
    })
)

const TrackDetachedPreviewCardTrigger = Mount.makeStream(
  "TrackDetachedPreviewCardTrigger",
  { args: { popupId: Schema.String, ...Delays.fields } },
  (node: HTMLElement, args, changes) =>
    Stream.callback<never>(() => {
      let current = args
      const send = (message: PreviewCardMessage) =>
        detached.send(node.ownerDocument, current.popupId, message)
      const triggerId = () => node.id === "" ? null : node.id
      const delays = () => ({
        delay: current.delay,
        closeDelay: current.closeDelay
      })
      const controller = new AbortController()
      const { signal } = controller
      return Effect.acquireRelease(
        Effect.sync(() => {
          node.addEventListener("mouseenter", (event) => {
            send(
              PreviewCardMessage.EnteredTrigger({
                triggerId: triggerId(),
                ...delays(),
                at: { x: event.clientX, y: event.clientY }
              })
            )
          }, { signal })
          node.addEventListener("mouseleave", (event) => {
            send(
              PreviewCardMessage.LeftTrigger({
                triggerId: triggerId(),
                at: { x: event.clientX, y: event.clientY }
              })
            )
          }, { signal })
          node.addEventListener("pointerdown", (event) => {
            if (event.pointerType !== "mouse") {
              send(PreviewCardMessage.TouchedTrigger())
            }
          }, { signal })
          node.addEventListener("focus", () => {
            if (returning > 0) return
            send(
              PreviewCardMessage.FocusedTrigger({
                triggerId: triggerId(),
                ...delays(),
                visible: focusVisible(node)
              })
            )
          }, { signal })
          node.addEventListener("blur", () =>
            send(PreviewCardMessage.BlurredTrigger()), { signal })
          watchLines(
            node,
            signal,
            (at, line) =>
              send(
                PreviewCardMessage.MovedToLine({
                  triggerId: triggerId(),
                  at,
                  line
                })
              )
          )
        }).pipe(
          Effect.tap(() =>
            Effect.forkScoped(Stream.runForEach(changes, (next) =>
              Effect.sync(() => {
                current = next
              })))
          )
        ),
        () =>
          Effect.sync(() =>
            controller.abort()
          )
      )
    })
)

const TrackPositionerArgs = Schema.Struct({
  position: Positioning.TrackPositionArgs,
  triggers: Schema.String,
  active: Schema.NullOr(Schema.String)
})

type TrackPositionerArgs = typeof TrackPositionerArgs.Type

const watchPointer = (
  node: HTMLElement,
  args: TrackPositionerArgs,
  changes: Stream.Stream<TrackPositionerArgs>
) =>
  Stream.callback<PreviewCardMessage>((queue) => {
    const document = node.ownerDocument
    let current = args
    let removed = false
    const send = (message: PreviewCardMessage) => {
      Queue.offerUnsafe(queue, message)
    }
    const within = (target: EventTarget | null) =>
      elementOf(target) !== null && node.contains(target as Node)
    const onTrigger = (target: EventTarget | null) =>
      elementOf(target)?.closest(current.triggers) != null
    const inside = (target: EventTarget | null) =>
      within(target) || onTrigger(target)
    const onFocusIn = (event: FocusEvent) => {
      if (!within(event.relatedTarget)) send(PreviewCardMessage.FocusedPopup())
    }
    const onFocusOut = (event: FocusEvent) => {
      if (!within(event.relatedTarget)) send(PreviewCardMessage.BlurredPopup())
    }
    let settle: ReturnType<typeof setTimeout> | undefined
    const onLeftFocus = (event: FocusEvent) => {
      if (!inside(event.target)) return
      clearTimeout(settle)
      settle = setTimeout(() => {
        if (!inside(document.activeElement)) {
          send(PreviewCardMessage.FocusedOutside())
        }
      }, 0)
    }
    const check = () => {
      if (
        removed || current.active === null ||
        document.querySelector(current.active) !== null
      ) return
      removed = true
      send(PreviewCardMessage.RemovedTrigger())
    }
    const page = new MutationObserver(check)
    const controller = new AbortController()
    const { signal } = controller
    return Effect.acquireRelease(
      Effect.sync(() => {
        listenOutside(node, signal, {
          open: () => true,
          inside: (target) => inside(target),
          pressed: () => send(PreviewCardMessage.PressedOutside())
        })
        document.addEventListener("focusout", onLeftFocus, {
          capture: true,
          signal
        })
        watchHoverArea(node, signal, () => current.triggers, (away) =>
          send(
            away
              ? PreviewCardMessage.LeftHoverArea()
              : PreviewCardMessage.ReturnedToHoverArea()
          ))
        node.addEventListener("focusin", onFocusIn, { signal })
        node.addEventListener("focusout", onFocusOut, { signal })
        if (document.body !== null) {
          page.observe(document.body, { subtree: true, childList: true })
        }
      }).pipe(
        Effect.tap(() =>
          Effect.forkScoped(Stream.runForEach(changes, (next) =>
            Effect.sync(() => {
              if (next.active !== current.active) removed = false
              current = next
              check()
            })))
        )
      ),
      () =>
        Effect.sync(() => {
          controller.abort()
          clearTimeout(settle)
          page.disconnect()
        })
    )
  })

const TrackPreviewCard = Mount.makeStream(
  "TrackPreviewCard",
  { args: TrackPositionerArgs },
  (node: HTMLElement, args, changes) =>
    Stream.merge(
      watchPointer(node, args, changes),
      Positioning.trackPosition(
        node,
        args.position,
        Stream.map(changes, (next) => next.position)
      ).pipe(
        Stream.map((placement) =>
          PreviewCardMessage.ChangedPlacement({ placement })
        )
      )
    )
)

const TrackPreviewCardPresence = Mount.makeStream(
  "TrackPreviewCardPresence",
  {
    args: {
      open: Schema.Boolean,
      mounted: Schema.Boolean,
      started: Schema.Boolean,
      holdExit: Schema.Boolean,
      popupId: Schema.String,
      trigger: Schema.String
    }
  },
  (node: HTMLElement, args, changes) =>
    Stream.callback<PreviewCardMessage>((queue) => {
      const document = node.ownerDocument
      const frame = frameOf(document.defaultView)
      const send = (message: PreviewCardMessage) => {
        Queue.offerUnsafe(queue, message)
      }
      let current = args
      const popup = () => document.getElementById(current.popupId) ?? node
      const opening = () =>
        frame(() => {
          if (current.open && !current.started) {
            frame(() => send(PreviewCardMessage.RenderedFirstFrame()))
          }
        })
      const transition = settling(
        node,
        popup,
        frame,
        (open) => send(PreviewCardMessage.FinishedTransition({ open }))
      )
      const closing = () => {
        const focused = document.activeElement
        if (isHTMLElement(focused) && node.contains(focused)) {
          const trigger = document.querySelector<HTMLElement>(current.trigger)
          if (trigger === null) focused.blur()
          else returnFocus(trigger)
        }
        node.inert = true
      }
      const onChange = (next: typeof args) => {
        const previous = current
        current = next
        if (previous.open && !next.open) closing()
        if (!previous.open && next.open) {
          node.inert = false
          raiseAbove(node)
          send(PreviewCardMessage.ShowedPortal())
          opening()
        }
        transition.follow(previous, next)
      }
      return Effect.acquireRelease(
        Effect.sync(() => {
          raiseAbove(node)
          node.inert = !current.open
          if (!current.mounted) send(PreviewCardMessage.ShowedPortal())
          if (current.open) opening()
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
            transition.cancel()
            node.inert = false
          })
      )
    })
)

/**
 * An `<a>` builder: what a preview card's trigger accepts as `element`, from
 * the caller's `h.a`, and what it returns.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type PreviewCardTriggerElement<Msg, R = never> = Html.Element<
  Msg,
  R,
  Html.EventsOf<"a">,
  HTMLAnchorElement,
  "a"
>

/**
 * The options of a `PreviewCardTrigger`.
 *
 * **Details**
 *
 * - `open`: whether the card is open for this trigger.
 * - `popupId`: the card's `id`.
 * - `delay`: milliseconds the mouse rests on the link, or keyboard focus
 *   stays on it, before the card opens, 600 by default.
 * - `closeDelay`: milliseconds after the pointer leaves the link and the
 *   card before the card closes, 300 by default.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface PreviewCardTriggerProps {
  readonly open: boolean
  readonly popupId: string
  readonly delay?: number | undefined
  readonly closeDelay?: number | undefined
}

/**
 * A link that opens a preview card drawn somewhere else, such as in another
 * component. Call it with the caller's `h`, whether the card is open for this
 * link and the card's `id` as `popupId`, then chain the `href` and the label.
 *
 * **Details**
 *
 * Its hovers and focus reach the card with that `id` by themselves, so the card
 * emits `RequestedOpen` and `RequestedClose` for them as for its own `trigger`
 * part, with this link's `id`. Give the link an `id` and pass the one
 * `RequestedOpen` reports as the card's `triggerId`, so the popup is placed
 * against it. Nothing happens while no card with that `id` is drawn.
 *
 * The card isn't next to this link in the page, so Tab from the link skips
 * the card's content and the card closes. Anything interactive in the card
 * must also be reachable from the link's own page.
 *
 * It sets `data-popup-open` and the attribute the card finds its triggers by,
 * in `forward`, so they win over the caller's. It takes the element's mount,
 * so the caller can't set another one on it.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const PreviewCardTrigger = <Msg, R = never>(
  h: { readonly a: PreviewCardTriggerElement<Msg> },
  options: {
    /** The caller's `h.a`, to stack a part on it. `h.a` when left out. */
    readonly element?: PreviewCardTriggerElement<Msg, R> | undefined
    readonly props: PreviewCardTriggerProps
  }
): PreviewCardTriggerElement<Msg, R> => {
  const element: PreviewCardTriggerElement<Msg, R> = options.element ?? h.a
  const { open, popupId } = options.props
  return element
    .forward((node) =>
      node.attrs({
        "data-popup-open": flag(open),
        "data-preview-card-trigger": popupId
      })
    )
    .onMount(
      TrackDetachedPreviewCardTrigger({ popupId, ...delaysOf(options.props) })
    )
}

/**
 * A headless preview card. Call it with the consumer's `h` and a `view`
 * closure that draws the link with `previewCard.trigger` and the card with
 * `previewCard.portal` and the parts inside it.
 *
 * **Details**
 *
 * The parts also return plain values for markup that depends on them:
 * `open`, `mounted` (the card shows, through its exit transition),
 * `transitionStatus`, `triggerId`, the `id` of the trigger the card is open
 * for or last was, `openReason`, `side` and `align`, where the popup is,
 * and `instant`.
 *
 * The `trigger` part takes `{ element, delay, closeDelay }`. It reports the
 * `id` the consumer gave the element in `RequestedOpen`, and gives a trigger
 * without one a generated `id`.
 *
 * Each part's attributes win over the ones the consumer set on the builder
 * it passes in, including the ones a state leaves absent: `id`,
 * `data-popup-open` and `data-preview-card-trigger` on the trigger; `id` and
 * `popover` on the portal; `role` on the backdrop; `id` and `role` on the
 * positioner; `id` and `tabindex` on the popup; `id` and `aria-hidden` on
 * the arrow; and the data attributes on every part. The viewport's children
 * are drawn inside its `data-current` container. The portal's box, the
 * positioner's and the arrow's position and the backdrop's `pointer-events`
 * are added after the consumer's inline style. A handler the consumer adds
 * to a part runs after the card's own. The trigger takes the element's
 * mount.
 *
 * It emits `RequestedOpen`, `RequestedClose` and `Settled`.
 *
 * On the server and on a host that doesn't run mounts, the card renders
 * closed and isn't placed.
 *
 * History restore saves nothing of it: after Back, forward or a reload it
 * starts from `init`.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const PreviewCard = Html.component({
  name: "PreviewCard",
  props: PreviewCardProps,
  model: PreviewCardModel,
  message: PreviewCardMessage,
  events: PreviewCardEvents,
  restore: false
}).make({
  init: () => ({
    onTrigger: false,
    hoverTrigger: null,
    point: null,
    rest: null,
    touched: false,
    away: true,
    focused: false,
    focusTrigger: null,
    focusInside: false,
    pending: null,
    pendingTrigger: null,
    closeDelay: 300,
    asked: false,
    reason: null,
    trigger: null,
    anchorHit: null,
    closeReason: null,
    mounted: false,
    started: false,
    transition: null,
    placement: null
  }),
  update: {
    EnteredTrigger: ($, { at, closeDelay, delay, triggerId }) => {
      const uncovered = at !== null && $.model.rest !== null &&
        $.model.rest.triggerId === triggerId &&
        at.x === $.model.rest.x && at.y === $.model.rest.y
      const next = UiStruct.evolve($.model, {
        onTrigger: true,
        hoverTrigger: triggerId,
        point: at === null ? null : { ...at, line: null },
        rest: null,
        away: false
      })
      if (!$.props.open) {
        return uncovered || $.model.touched
          ? next
          : $.set(next).evolve({
            closeDelay,
            pending: "trigger-hover",
            pendingTrigger: triggerId
          }).run(
            WaitBeforeOpening.make({ delay })
          )
      }
      const active = activeOf($.model, $.props)
      return uncovered || $.model.touched || active === null ||
          active === triggerId
        ? $.set(next).run(Command.interrupt(WaitBeforeClosing))
        : openFor(
          UiStruct.evolve(next, { closeDelay }),
          $,
          triggerId,
          "trigger-hover"
        )
    },
    LeftTrigger: ($, { at, triggerId }) =>
      cancelled(
        UiStruct.evolve($.model, {
          onTrigger: false,
          hoverTrigger: null,
          rest: at === null ? null : { triggerId, ...at },
          touched: false
        }),
        $,
        "trigger-hover"
      ),
    MovedToLine: ($, { at, line, triggerId }) =>
      $.model.hoverTrigger === triggerId && !$.props.open
        ? $.evolve({ point: { ...at, line } })
        : $.model,
    TouchedTrigger: ($) =>
      cancelled(
        UiStruct.evolve($.model, { touched: true }),
        $,
        "trigger-hover"
      ),
    FocusedTrigger: ($, { closeDelay, delay, triggerId, visible }) => {
      if (!visible) return $.model
      const next = UiStruct.evolve($.model, {
        focused: true,
        focusTrigger: triggerId
      })
      if (!$.props.open) {
        return $.set(next).evolve({
          closeDelay,
          pending: "trigger-focus",
          pendingTrigger: triggerId
        }).run(
          WaitBeforeOpening.make({ delay })
        )
      }
      const active = activeOf($.model, $.props)
      return active === null || active === triggerId
        ? $.set(next).run(Command.interrupt(WaitBeforeClosing))
        : openFor(
          UiStruct.evolve(next, { closeDelay }),
          $,
          triggerId,
          "trigger-focus"
        )
    },
    BlurredTrigger: ($) =>
      cancelled(
        UiStruct.evolve($.model, { focused: false, focusTrigger: null }),
        $,
        "trigger-focus"
      ),
    FocusedPopup: ($) => $.evolve({ focusInside: true }),
    BlurredPopup: ($) => $.evolve({ focusInside: false }),
    FocusedOutside: ($) => dismiss($, "trigger-focus"),
    LeftHoverArea: ($) => {
      if ($.model.away) return $.model
      const next = UiStruct.evolve($.model, { away: true })
      return $.props.open && !held(next)
        ? $.set(next).run(WaitBeforeClosing.make({ delay: $.model.closeDelay }))
        : next
    },
    ReturnedToHoverArea: ($) =>
      $.evolve({ away: false }).run(Command.interrupt(WaitBeforeClosing)),
    PressedOutside: ($) => dismiss($, "outside-press"),
    PressedEscape: ($) => dismiss($, "escape-key"),
    RemovedTrigger: ($) => dismiss($, "trigger-removed"),
    CompletedWaitBeforeOpening: ($) => {
      if ($.props.open || $.model.pending === null) return $.model
      const ready = $.model.pending === "trigger-hover"
        ? $.model.onTrigger && $.model.hoverTrigger === $.model.pendingTrigger
        : $.model.focused && $.model.focusTrigger === $.model.pendingTrigger
      return ready
        ? openFor($.model, $, $.model.pendingTrigger, $.model.pending)
        : $.evolve({ pending: null, pendingTrigger: null })
    },
    CompletedWaitBeforeClosing: ($) =>
      !hovering($.model) && !held($.model)
        ? dismiss($, "trigger-hover")
        : $.model,
    ShowedPortal: ($) =>
      $.props.open
        ? $.evolve({
          mounted: true,
          focusInside: false,
          asked: false,
          reason: $.model.asked ? $.model.reason : null,
          anchorHit: $.model.asked ? $.model.anchorHit : null,
          closeReason: null
        })
        : $.evolve({ mounted: true }),
    RenderedFirstFrame: ($) =>
      $.props.open ? $.evolve({ started: true }) : $.model,
    FinishedTransition: ($, { open }) => {
      if (open !== $.props.open) return $.model
      if (open) return $.emit(PreviewCardEvents.Settled({ open }))
      return $.model.mounted && $.props.holdExit !== true
        ? $.evolve({ mounted: false, started: false, transition: null }).emit(
          PreviewCardEvents.Settled({ open })
        )
        : $.model
    },
    ChangedViewport: ($, { change }) =>
      stepViewport($.model, change, $.props.open),
    ChangedPlacement: ($, { placement }) => $.evolve({ placement })
  },
  subscriptions: ({ props }) => [
    ...(props.open ? [escape] : []),
    ...(props.id === undefined ? [] : [detached.subscription(props.id)])
  ],
  parts: (p, model) => {
    const props = p.props
    const open = props.open
    const shown = open || model.mounted
    const transitionStatus: PreviewCardTransitionStatus = statusOf(model, props)
    const cardId = props.id ?? p.id("portal")
    const positionerId = p.id("positioner")
    const popupId = p.id("popup")
    const arrowId = p.id("arrow")
    const backdropKey = p.id("backdrop")
    const active = activeOf(model, props)
    const placement = model.placement
    const triggers = attrSelector("data-preview-card-trigger", cardId)
    const triggerSelector = active === null ? triggers : idSelector(active)
    const tracked = Positioning.trackArgs(props, {
      side: "bottom",
      anchorSelector: triggerSelector,
      arrowId,
      offsetAsPadding: true,
      inline: true,
      inlineHit: active !== null && model.trigger === active
        ? model.anchorHit
        : null
    })
    const side = placement?.side ?? tracked.options.side
    const align = placement?.align ?? tracked.options.align
    const instant: PreviewCardInstant | undefined = open
      ? model.reason === "trigger-focus" ? "focus" : undefined
      : model.closeReason === "escape-key"
      ? "dismiss"
      : undefined
    const transition = open ? model.transition : null
    let count = 0

    const placed = <B extends Attributed<B>>(builder: B): B =>
      builder.attrs({ "data-side": side, "data-align": align })
    const states = <B extends Attributed<B>>(builder: B): B =>
      placed(builder).attrs({
        "data-open": flag(open),
        "data-closed": flag(!open)
      })

    const triggerPart = p.part(
      "a",
      (b, key: string, delays: Delays) =>
        b
          .attrs({
            id: key,
            "data-popup-open": flag(open && active === key),
            "data-preview-card-trigger": cardId
          })
          .on(
            "mouseenter",
            (payload: Partial<Html.HoverPayload>) =>
              PreviewCardMessage.EnteredTrigger({
                triggerId: key,
                ...delays,
                at: pointOf(payload)
              })
          )
          .on(
            "mouseleave",
            (payload: Partial<Html.HoverPayload>) =>
              PreviewCardMessage.LeftTrigger({
                triggerId: key,
                at: pointOf(payload)
              })
          )
          .on(
            "mousedown",
            ({ pointerType }: Html.PointerPayload) =>
              pointerType === "mouse"
                ? undefined
                : PreviewCardMessage.TouchedTrigger()
          )
          .on("focus", ({ focusVisible }: Html.FocusPayload) =>
            returning > 0
              ? undefined
              : PreviewCardMessage.FocusedTrigger({
                triggerId: key,
                ...delays,
                visible: focusVisible
              }))
          .on("blur", PreviewCardMessage.BlurredTrigger())
          .onMount(TrackPreviewCardTrigger({ triggerId: key }))
    )
    const trigger = View.wrapPart(
      triggerPart,
      <B extends View.PartTarget<"a">>(options: {
        /** The trigger's element. */
        readonly element: B
        /** Milliseconds the mouse rests on the link, or keyboard focus stays on it, before the card opens, 600 by default. */
        readonly delay?: number | undefined
        /** Milliseconds after the pointer leaves the link and the card before the card closes, 300 by default. */
        readonly closeDelay?: number | undefined
      }): ReturnType<B["attr"]> =>
        triggerPart(
          options.element,
          idOf(options.element) ?? p.id("trigger", count++),
          delaysOf(options)
        )
    )

    const topLayer = tracked.topLayer !== false
    const portalStyle = !topLayer
      ? inPlaceBox
      : tracked.positionMethod === "absolute"
      ? portalBox + ";" + atDocumentOrigin
      : portalBox
    const portalPart = p.part("div", (b) => {
      const portal = layered(b.attr("id", cardId), topLayer, shown)
        .forward((node) =>
          node.attr("style", withStyle(node.elementAttrs.style, portalStyle))
        )
      return shown
        ? portal.onMount(
          TrackPreviewCardPresence({
            open,
            mounted: model.mounted,
            started: model.started,
            holdExit: props.holdExit === true,
            popupId,
            trigger: triggerSelector
          })
        )
        : portal
    })
    const portal = View.wrapPart(
      portalPart,
      <B extends View.PartTarget<"div">>(
        element: B
      ): ReturnType<B["attr"]> | undefined => {
        const out = portalPart(element)
        return shown || props.keepMounted === true ? out : undefined
      }
    )

    const backdropPart = p.part(
      "div",
      (b) =>
        transitionAttrs(b, open, transitionStatus)
          .attr("role", "presentation")
          .forward((node) =>
            node.attr(
              "style",
              withStyle(node.elementAttrs.style, "pointer-events:none")
            )
          )
    )
    const backdrop = View.wrapPart(
      backdropPart,
      <B extends Keyed<"div">>(element: B): ReturnType<B["attr"]> =>
        backdropPart(element.key(backdropKey))
    )

    const positionerStyle = Positioning.positionerStyle(tracked.positionMethod)
    const positionerPart = p.part("div", (b) => {
      const decorated = states(b)
        .attrs({
          id: positionerId,
          role: "presentation",
          "data-anchor-hidden": flag(open && placement?.anchorHidden),
          "data-instant": instant
        })
        .forward((node) =>
          node.attr(
            "style",
            withStyle(node.elementAttrs.style, positionerStyle)
          )
        )
      return open
        ? decorated.onMount(
          TrackPreviewCard({
            position: tracked,
            triggers,
            active: active === null ? null : triggerSelector
          })
        )
        : decorated
    })
    const positioner = View.wrapPart(
      positionerPart,
      <B extends Keyed<"div">>(element: B): ReturnType<B["attr"]> =>
        positionerPart(element.key(positionerId))
    )

    const popup = p.part(
      "div",
      (b) =>
        transitionAttrs(placed(b), open, transitionStatus).attrs({
          id: popupId,
          tabindex: "-1",
          "data-instant": instant
        })
    )

    const arrowStyle = Positioning.arrowStyle(side)
    const arrow = p.part("div", (b) =>
      states(b)
        .attrs({
          id: arrowId,
          "aria-hidden": "true",
          "data-uncentered": flag(placement?.arrowUncentered)
        })
        .forward((node) =>
          node.attr("style", withStyle(node.elementAttrs.style, arrowStyle))
        ))

    const viewport = p.part("div", (b) => {
      const decorated = b
        .attrs({
          "data-activation-direction": transition?.direction ?? undefined,
          "data-transitioning": flag(transition !== null),
          "data-instant": instant
        })
        .forward((node) => viewportContent(node, active ?? "", transition))
      return shown
        ? decorated.onMount(
          TrackViewport({
            open,
            trigger: triggerSelector,
            side,
            positionerId,
            transitioning: transition !== null
          }).pipe(
            Mount.map((change) =>
              PreviewCardMessage.ChangedViewport({ change })
            )
          )
        )
        : decorated
    })

    return {
      open,
      mounted: shown,
      transitionStatus,
      triggerId: active,
      openReason: open ? model.reason : null,
      side,
      align,
      instant,
      trigger,
      portal,
      backdrop,
      positioner,
      popup,
      arrow,
      viewport
    }
  }
})
