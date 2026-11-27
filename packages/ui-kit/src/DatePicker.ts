/**
 * A headless date input with a popup calendar, built on `DateField` and
 * `Calendar`. Supply `value`, `open`, `month` and `today`; handle the events
 * to update the controlled value, open state and displayed month.
 *
 * **Anatomy**
 *
 * | Part         | Element                                      |
 * | :----------- | :------------------------------------------- |
 * | `input`      | `<input>`, the `DateField`'s typed date      |
 * | `trigger`    | `<button>` that opens and closes the popup   |
 * | `positioner` | `<div>`, a manual popover next to the input  |
 * | `popup`      | `<div>` inside the positioner                |
 *
 * The `Calendar`'s parts, `root`, `heading`, `previous`, `next`, `grid`,
 * `weekday`, `cell` and `day`, go inside the popup, as `Calendar`
 * describes. Each part takes the consumer's builder and returns it. `input`
 * adds the `DateField`'s wrapper and hidden form input. No other part adds
 * markup.
 *
 * The parts also carry `open`, `side` and `align`, and the values of
 * `DateField` (`value`, `inputValue`, `pattern`, `disabled`, `readOnly`,
 * `required`) and `Calendar` (`weeks`, `weekdays`, `month`, `title`).
 *
 * The positioner uses a manual popover in the top layer unless
 * `topLayer: false`. It anchors to the input with `side: "bottom"` and
 * `align: "start"` by default. Its inline style carries `left`, `top` and
 * the CSS variables described in `Positioning`.
 *
 * **Date values**
 *
 * As in `Calendar` and `DateField`, every date prop accepts any `DateTime`
 * and is normalized with `DateTime.removeTime`, and every date the picker
 * emits is a `DateTime.Utc` at midnight UTC. Take `today` from
 * `DateTime.nowInCurrentZone` or another zoned value.
 *
 * **Data attributes**
 *
 * Each present with an empty value or absent, except the ones with a value:
 *
 * - `trigger`: `data-popup-open`, `data-disabled`, `data-readonly`
 * - `positioner`, `popup`: `data-open` / `data-closed`, `data-side`,
 *   `data-align`
 * - `input` and the calendar's parts: as `DateField` and `Calendar` list
 *
 * **Keyboard**
 *
 * Enter and Space press the trigger. Opening focuses the calendar's focused
 * day; see `Calendar` for its navigation keys. Picking a day, pressing
 * Escape or pressing or moving focus outside the picker requests a close.
 * Escape during input-method composition does not close the popup.
 * When `open` turns false with focus still in the popup, focus goes back to
 * the trigger. Focus that already left stays where it went.
 *
 * **Field**
 *
 * Wrap the input, trigger and positioner in `field.focusWithin` and apply
 * `field.member` to the input, as below. Moving focus between them then
 * keeps the field focused without marking it touched. Pass
 * `disabled: field.disabled`. Label the input explicitly with `aria-label`
 * or an `id` and `<label for>`, and give the popup an `aria-label`.
 *
 * **Example** (A controlled departure date picker inside a Field)
 *
 * ```ts import.meta.vitest
 * import { UiSchema } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { DatePicker, Field } from "@effect/ui-kit"
 * import { DateTime, Effect, Schema } from "effect"
 *
 * const TripMessage = UiSchema.TaggedEnum({
 *   PickedDate: { date: Schema.NullOr(Schema.DateTimeUtc) },
 *   RequestedOpenDatePicker: {},
 *   RequestedCloseDatePicker: {},
 *   RequestedMonth: { month: Schema.DateTimeUtc }
 * })
 *
 * const Trip = Html.component({
 *   name: "Trip",
 *   model: Schema.Struct({
 *     date: Schema.NullOr(Schema.DateTimeUtc),
 *     month: Schema.DateTimeUtc,
 *     open: Schema.Boolean
 *   }),
 *   message: TripMessage
 * }).make({
 *   init: () => ({
 *     date: DateTime.makeUnsafe("2026-11-15T00:00:00Z"),
 *     month: DateTime.makeUnsafe("2026-11-01T00:00:00Z"),
 *     open: false
 *   }),
 *   update: {
 *     PickedDate: ($, { date }) => $.evolve({ date }),
 *     RequestedOpenDatePicker: ($) => $.evolve({ open: true }),
 *     RequestedCloseDatePicker: ($) => $.evolve({ open: false }),
 *     RequestedMonth: ($, { month }) => $.evolve({ month })
 *   },
 *   view: (h, model) =>
 *     Field(h, {
 *       view: (field) =>
 *         DatePicker(h, {
 *           props: {
 *             value: model.date,
 *             open: model.open,
 *             month: model.month,
 *             today: DateTime.makeUnsafe("2026-11-26T00:00:00Z"),
 *             locale: "en-GB",
 *             disabled: field.disabled
 *           },
 *           onEmit: {
 *             Picked: ({ date }) => TripMessage.PickedDate({ date }),
 *             RequestedOpen: () => TripMessage.RequestedOpenDatePicker(),
 *             RequestedClose: () => TripMessage.RequestedCloseDatePicker(),
 *             RequestedMonth: ({ month }) => TripMessage.RequestedMonth({ month })
 *           },
 *           view: (datePicker) =>
 *             field.root(field.focusWithin(h.div)).children(
 *               datePicker.input(field.member(h.input.class("date"))).attr("aria-label", "Departure"),
 *               datePicker.trigger(h.button).children("Choose date"),
 *               datePicker.positioner(h.div).children(
 *                 datePicker.popup(h.div.attr("aria-label", "Departure")).children(
 *                   datePicker.root(h.div).children(
 *                     datePicker.heading(h.h2).children(datePicker.title),
 *                     datePicker.grid(h.table).children(
 *                       h.tbody(
 *                         ...datePicker.weeks.map((week) =>
 *                           h.tr(
 *                             ...week.map((date) =>
 *                               datePicker.cell({ element: h.td, date }).children(
 *                                 datePicker.day({ element: h.button, date }).children(
 *                                   String(DateTime.getPartUtc(date, "day"))
 *                                 )
 *                               )
 *                             )
 *                           )
 *                         )
 *                       )
 *                     )
 *                   )
 *                 )
 *               )
 *             )
 *         })
 *     })
 * })
 *
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Trip, {}))
 * if (!/<input class="date"[^>]* value="15\/11\/2026"/.test(html)) throw new Error("the input doesn't show the date")
 * if (!/<button[^>]* aria-haspopup="dialog" aria-expanded="false"/.test(html)) throw new Error("the trigger doesn't name its popup")
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
import type * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as Struct from "effect/Struct"
import { Calendar } from "./Calendar.ts"
import { DateField, DateFieldProps } from "./DateField.ts"
import {
  type Attributed,
  attrSelector,
  fallbackLabel,
  flag,
  ownStyle
} from "./internal/attributes.ts"
import {
  CalendarDate,
  CalendarGridPropsFields,
  isOutOfRange,
  normalizeOptional,
  sameMonth,
  startOfMonth
} from "./internal/calendar.ts"
import { isElement } from "./internal/dom.ts"
import { trackComposing } from "./internal/interaction.ts"
import { listenOutside } from "./internal/outside.ts"
import { layered, raiseAbove } from "./internal/topLayer.ts"
import { frameOf } from "./internal/transition.ts"
import * as Positioning from "./Positioning.ts"

/**
 * Props for a `DatePicker`.
 *
 * **Details**
 *
 * - `value`: the date, any `DateTime`, or `null` for none.
 * - `open`: whether the popup shows. Required: the consumer owns it.
 * - `month`, `today`, `min`, `max`, `firstDayOfWeek`: as `Calendar` takes
 *   them. A typed date outside `min` or `max` emits nothing, and the input
 *   reverts to `value`.
 * - `locale`: the locale of both the input and the calendar.
 * - `name`, `form`, `required`: as `DateField` takes them.
 * - `disabled`: disables the input, the trigger and the calendar, and
 *   suppresses every request.
 * - `readOnly`: the popup still opens and the calendar can be browsed, but
 *   neither typing nor a day press asks for a date.
 * - `side`, `align` and the other positioning options: as `Positioning`
 *   describes them. `side` is `"bottom"` and `align` `"start"` by default.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const DatePickerProps = Schema.Struct({
  value: Schema.NullOr(CalendarDate),
  open: Schema.Boolean,
  ...CalendarGridPropsFields,
  ...Struct.pick(DateFieldProps.fields, ["name", "form", "required"]),
  ...Positioning.PositionerFields
})

/**
 * The props of a `DatePicker`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type DatePickerProps = typeof DatePickerProps.Type

/**
 * Why a `DatePicker` asks to open or close its popup.
 *
 * **Details**
 *
 * - `"trigger-press"`: a press, or Enter or Space, on the trigger
 * - `"escape-key"`: Escape in the popup, the input or the trigger
 * - `"outside-press"`: a press outside the input, the trigger and the popup
 * - `"focus-out"`: focus left the input, the trigger and the popup
 * - `"day-press"`: a day was picked
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const DatePickerChangeReason = Schema.Literals([
  "trigger-press",
  "escape-key",
  "outside-press",
  "focus-out",
  "day-press"
])

/**
 * Why a `DatePicker` asks to open or close its popup.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type DatePickerChangeReason = typeof DatePickerChangeReason.Type

/**
 * What a `DatePicker` emits.
 *
 * **Details**
 *
 * - `Picked`: requests a new `value` after a typed commit or day press
 *   within `min` and `max`. Carries `date: null` when the input is cleared.
 * - `RequestedOpen` and `RequestedClose`: ask for `open` to change, with
 *   the reason. A day press emits `Picked`, then `RequestedClose`.
 * - `RequestedMonth`: asks for the calendar to show `month`, the first of
 *   that month. Emitted from the calendar's own navigation, and after a
 *   `Picked` whose date is outside the shown month, so the popup opens on it.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const DatePickerEvents = UiSchema.TaggedEnum({
  Picked: { date: Schema.NullOr(Schema.DateTimeUtc) },
  RequestedOpen: { reason: DatePickerChangeReason },
  RequestedClose: { reason: DatePickerChangeReason },
  RequestedMonth: { month: Schema.DateTimeUtc }
})

/**
 * What a `DatePicker` emits.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type DatePickerEvents = typeof DatePickerEvents.Type

const DatePickerModel = Schema.Struct({
  placement: Schema.NullOr(Positioning.Placement)
})

type DatePickerModel = typeof DatePickerModel.Type

const DismissReason = Schema.Literals([
  "escape-key",
  "outside-press",
  "focus-out"
])

const DatePickerMessage = UiSchema.TaggedEnum({
  CommittedDateField: { date: Schema.NullOr(Schema.DateTimeUtc) },
  PickedCalendar: { date: Schema.DateTimeUtc },
  RequestedCalendarMonth: { month: Schema.DateTimeUtc },
  ClickedTrigger: {},
  Dismissed: { reason: DismissReason },
  ChangedPlacement: { placement: Positioning.Placement }
})

type DatePickerMessage = typeof DatePickerMessage.Type

type DatePickerUpdate = Component.Update<
  DatePickerModel,
  DatePickerMessage,
  DatePickerEvents,
  DatePickerProps
>

const pick = ($: DatePickerUpdate, date: DateTime.Utc | null) => {
  const picked = $.emit(DatePickerEvents.Picked({ date }))
  return date === null || sameMonth(date, startOfMonth($.props.month))
    ? picked
    : picked.emit(
      DatePickerEvents.RequestedMonth({ month: startOfMonth(date) })
    )
}

const TrackDatePicker = Mount.makeStream(
  "TrackDatePicker",
  {
    args: Schema.Struct({
      position: Positioning.TrackPositionArgs,
      input: Schema.String,
      trigger: Schema.String
    })
  },
  (node: HTMLElement, args, changes) =>
    Stream.merge(
      Stream.callback<DatePickerMessage>((queue) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const document = node.ownerDocument
            const controller = new AbortController()
            const anchors = args.input + "," + args.trigger
            const dismiss = (reason: typeof DismissReason.Type) =>
              Queue.offerUnsafe(queue, DatePickerMessage.Dismissed({ reason }))
            const inside = (target: Node) =>
              node.contains(target) ||
              (isElement(target) && target.closest(anchors) !== null)
            const composing = trackComposing(document, controller.signal)
            raiseAbove(node)
            listenOutside(node, controller.signal, {
              open: () => true,
              inside,
              pressed: () => dismiss("outside-press"),
              focused: () => dismiss("focus-out")
            })
            // Capture Escape before day handlers or an enclosing Dialog.
            document.addEventListener("keydown", (event) => {
              const target = event.target as Node | null
              if (
                event.key !== "Escape" || event.defaultPrevented ||
                composing(event) || target === null || !inside(target)
              ) return
              event.preventDefault()
              dismiss("escape-key")
            }, { capture: true, signal: controller.signal })
            frameOf(document.defaultView)(() => {
              if (controller.signal.aborted) return
              node.querySelector<HTMLElement>(
                "[role=\"grid\"] [tabindex=\"0\"]"
              )?.focus()
            })
            return controller
          }),
          // Restore focus before the browser blurs the hidden day and touches the Field.
          (controller) =>
            Effect.sync(() => {
              controller.abort()
              const document = node.ownerDocument
              const focused = document.activeElement
              if (focused !== null && node.contains(focused)) {
                document.querySelector<HTMLElement>(args.trigger)?.focus({
                  preventScroll: true
                })
              }
            })
        )
      ),
      Positioning.trackPosition(
        node,
        args.position,
        Stream.map(changes, (next) => next.position)
      ).pipe(
        Stream.map((placement) =>
          DatePickerMessage.ChangedPlacement({ placement })
        )
      )
    )
)

/**
 * A headless date picker. Supply `h`, `props`, `onEmit` and a `view` that
 * renders the input, trigger and positioner, with the popup and calendar
 * inside the positioner.
 *
 * **Details**
 *
 * Each part's attributes win over the ones the consumer set on the builder
 * before the part, including the ones a state leaves absent:
 *
 * - `input`: what `DateField`'s input writes
 * - `trigger`: `type="button"`, `aria-haspopup="dialog"`, `aria-expanded`,
 *   `aria-controls` while open, `disabled`, `aria-disabled` (removed) and
 *   its data attributes, plus a fallback `aria-label` when the button has no
 *   accessible name
 * - `positioner`: `role="presentation"`, the popover and its data
 *   attributes, and its placement in its inline style
 * - `popup`: `id`, `role="dialog"` and its data attributes
 * - the calendar's parts: what `Calendar` writes
 *
 * Internal placement state is not restored from history.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const DatePicker = Html.component({
  name: "DatePicker",
  props: DatePickerProps,
  model: DatePickerModel,
  message: DatePickerMessage,
  events: DatePickerEvents,
  restore: false
}).make({
  init: () => ({ placement: null }),
  update: {
    CommittedDateField: ($, { date }) =>
      date !== null &&
        isOutOfRange(
          date,
          normalizeOptional($.props.min),
          normalizeOptional($.props.max)
        )
        ? $.model
        : pick($, date),
    PickedCalendar: ($, { date }) =>
      pick($, date).emit(
        DatePickerEvents.RequestedClose({ reason: "day-press" })
      ),
    RequestedCalendarMonth: ($, { month }) =>
      $.emit(DatePickerEvents.RequestedMonth({ month })),
    ClickedTrigger: ($) =>
      $.props.disabled === true
        ? $.model
        : $.props.open
        ? $.emit(DatePickerEvents.RequestedClose({ reason: "trigger-press" }))
        : $.emit(DatePickerEvents.RequestedOpen({ reason: "trigger-press" })),
    Dismissed: ($, { reason }) =>
      $.props.open && $.props.disabled !== true
        ? $.emit(DatePickerEvents.RequestedClose({ reason }))
        : $.model,
    ChangedPlacement: ($, { placement }) => $.evolve({ placement })
  },
  parts: (p, model) => {
    const props = p.props
    const open = props.open
    const disabled = props.disabled === true
    const readOnly = props.readOnly === true
    const pickerId = p.id("picker")
    const popupId = p.id("popup")
    const inputSelector = attrSelector("data-date-picker-input", pickerId)
    const triggerSelector = attrSelector("data-date-picker-trigger", pickerId)
    const tracked = Positioning.trackArgs(
      { ...props, align: props.align ?? "start" },
      { side: "bottom", anchorSelector: inputSelector }
    )
    const side = model.placement?.side ?? tracked.options.side
    const align = model.placement?.align ?? tracked.options.align
    const placed = <B extends Attributed<B>>(builder: B): B =>
      builder.attrs({
        "data-open": flag(open),
        "data-closed": flag(!open),
        "data-side": side,
        "data-align": align
      })

    const trigger = p.part("button", (b) =>
      b
        .attrs({
          type: "button",
          "aria-haspopup": "dialog",
          "aria-expanded": String(open),
          "aria-controls": open ? popupId : undefined,
          "aria-disabled": undefined,
          "data-popup-open": flag(open),
          "data-disabled": flag(disabled),
          "data-readonly": flag(readOnly),
          "data-date-picker-trigger": pickerId
        })
        .disabled(disabled)
        .on("click", DatePickerMessage.ClickedTrigger())
        .forward(fallbackLabel("Choose date")))

    const positionerStyle = Positioning.positionerStyle(tracked.positionMethod)
    const positioner = p.part("div", (b) => {
      const layer = layered(
        placed(b)
          .attr("role", "presentation")
          .forward(ownStyle(positionerStyle)),
        tracked.topLayer !== false,
        open
      )
      return open
        ? layer.onMount(
          TrackDatePicker({
            position: tracked,
            input: inputSelector,
            trigger: triggerSelector
          })
        )
        : layer
    })

    const popup = p.part(
      "div",
      (b) => placed(b).attrs({ id: popupId, role: "dialog" })
    )

    const inputPart = p.part(
      "input",
      (b) => b.attr("data-date-picker-input", pickerId)
    )

    return p.child(DateField, {
      props: {
        value: props.value,
        locale: props.locale,
        name: props.name,
        form: props.form,
        disabled: props.disabled,
        readOnly: props.readOnly,
        required: props.required
      },
      onEmit: {
        Committed: ({ date }) => DatePickerMessage.CommittedDateField({ date })
      },
      parts: (dateField) =>
        p.child(Calendar, {
          props: {
            value: props.value,
            month: props.month,
            today: props.today,
            min: props.min,
            max: props.max,
            firstDayOfWeek: props.firstDayOfWeek,
            locale: props.locale,
            disabled: props.disabled,
            readOnly: props.readOnly
          },
          onEmit: {
            Picked: ({ date }) => DatePickerMessage.PickedCalendar({ date }),
            RequestedMonth: ({ month }) =>
              DatePickerMessage.RequestedCalendarMonth({ month })
          },
          parts: (calendar) => ({
            ...dateField,
            ...calendar,
            open,
            side,
            align,
            input: View.wrapPart(
              inputPart,
              <B extends View.PartTarget<"input">>(
                element: B
              ): ReturnType<B["attr"]> => dateField.input(inputPart(element))
            ),
            trigger,
            positioner,
            popup
          })
        })
    })
  }
})
