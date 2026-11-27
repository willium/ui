/**
 * A controlled calendar for picking a range of dates, built on `Calendar`,
 * showing one month or several consecutive months. Pass the committed range
 * as `value`, the first visible month as `month`, the number of months as
 * `months` and the current day as `today`. Handle `Picked` to update
 * `value` and `RequestedMonth` to update `month`.
 *
 * **Anatomy**
 *
 * | Part       | Element    |
 * | :--------- | :--------- |
 * | `root`     | any element, around the header and the grids |
 * | `heading`  | any element, showing the month's `title` |
 * | `previous` | `<button>` |
 * | `next`     | `<button>` |
 * | `grid`     | `<table>` |
 * | `weekday`  | `<th>` inside the grid header |
 * | `cell`     | `<td>` inside the grid body |
 * | `day`      | `<button>` inside each `cell` |
 *
 * The parts are `Calendar`'s, with `heading`, `grid`, `cell` and `day` in
 * each entry of `months`. They take `Calendar`'s arguments and add no
 * markup. The parts object also carries `Calendar`'s `weekdays` and
 * `anchor`: the first day of a range in progress, or `null`.
 *
 * Inside a `Field`, apply `field.group` to `root`, `field.member` to each
 * `day`, and pass `disabled: field.disabled`.
 *
 * **Selection**
 *
 * The first press sets the anchor. Until the second press, the range from
 * the anchor to the day last hovered or focused is the preview; `value`
 * stays committed, and spans every shown month. Hovering a disabled day
 * previews nothing. The second press emits `Picked` with the two days in
 * order. Pressing the anchor again picks that one day. An unavailable day
 * can't be an anchor or an end, but a range may span unavailable days:
 * validate that in the consumer.
 *
 * **Data attributes**
 *
 * Those of `Calendar`, plus these on `day`, each present with an empty value
 * or absent:
 *
 * - `data-selected`: the day is in `value`, the committed range
 * - `data-range-start`, `data-range-end`, `data-in-range`: the day is the
 *   first day, the last day, or any day of the range shown: the preview while
 *   an anchor is set, and `value` otherwise
 *
 * **Keyboard**
 *
 * As `Calendar`, plus Escape on a day, which clears the anchor when one is
 * set.
 *
 * **Usage**
 *
 * A range field is two `DateField`s and a `RangeCalendar` in a `Popover`:
 * a typed commit updates one end of the range, and `Picked` updates both.
 *
 * **Example** (A controlled range calendar whose range and month live in the consumer's Model)
 *
 * ```ts import.meta.vitest
 * import { UiSchema } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { RangeCalendar } from "@effect/ui-kit"
 * import { DateTime, Effect, Schema } from "effect"
 *
 * const StayMessage = UiSchema.TaggedEnum({
 *   PickedStay: { start: Schema.DateTimeUtc, end: Schema.DateTimeUtc },
 *   RequestedMonth: { month: Schema.DateTimeUtc }
 * })
 *
 * const Stay = Html.component({
 *   name: "Stay",
 *   model: Schema.Struct({
 *     stay: Schema.NullOr(
 *       Schema.Struct({ start: Schema.DateTimeUtc, end: Schema.DateTimeUtc })
 *     ),
 *     month: Schema.DateTimeUtc
 *   }),
 *   message: StayMessage
 * }).make({
 *   init: () => ({
 *     stay: {
 *       start: DateTime.makeUnsafe("2026-11-12T00:00:00Z"),
 *       end: DateTime.makeUnsafe("2026-11-15T00:00:00Z")
 *     },
 *     month: DateTime.makeUnsafe("2026-11-01T00:00:00Z")
 *   }),
 *   update: {
 *     PickedStay: ($, stay) => $.evolve({ stay: { start: stay.start, end: stay.end } }),
 *     RequestedMonth: ($, { month }) => $.evolve({ month })
 *   },
 *   view: (h, model) =>
 *     RangeCalendar(h, {
 *       props: {
 *         value: model.stay,
 *         month: model.month,
 *         today: DateTime.makeUnsafe("2026-11-26T00:00:00Z"),
 *         locale: "en-US"
 *       },
 *       onEmit: {
 *         Picked: ({ end, start }) => StayMessage.PickedStay({ start, end }),
 *         RequestedMonth: ({ month }) => StayMessage.RequestedMonth({ month })
 *       },
 *       view: (rangeCalendar) => {
 *         const [month] = rangeCalendar.months
 *         return rangeCalendar.root(h.div).children(
 *           month.heading(h.h2).children(month.title),
 *           month.grid(h.table).children(
 *             h.tbody(
 *               ...month.weeks.map((week) =>
 *                 h.tr(
 *                   ...week.map((date) =>
 *                     month.cell({ element: h.td, date }).children(
 *                       month.day({ element: h.button, date }).children(
 *                         String(DateTime.getPartUtc(date, "day"))
 *                       )
 *                     )
 *                   )
 *                 )
 *               )
 *             )
 *           )
 *         )
 *       }
 *     })
 * })
 *
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Stay, {}))
 * const selected = html.match(/aria-selected="true"/g) ?? []
 * if (selected.length !== 4) throw new Error("the stay isn't four selected days")
 * if (!/November 12, 2026"[^>]* data-range-start/.test(html)) throw new Error("the stay doesn't start on the 12th")
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Html from "@effect/ui/html/Html"
import * as UiSchema from "@effect/ui/UiSchema"
import * as View from "@effect/ui/View"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { Calendar } from "./Calendar.ts"
import { flag, type Keyed } from "./internal/attributes.ts"
import {
  CalendarDate,
  CalendarGridPropsFields,
  isCopy,
  isOutOfRange,
  normalizeOptional,
  sameDay,
  toDay
} from "./internal/calendar.ts"

/**
 * Props for a `RangeCalendar`.
 *
 * **Details**
 *
 * - `value`: the committed range, or `null`. Both ends are normalized with
 *   `DateTime.removeTime`, and a `start` after `end` is read in order.
 * - The rest are `Calendar`'s: `month`, `months`, `today`, `min`, `max`,
 *   `firstDayOfWeek`, `locale`, `disabled` and `readOnly`. A disabled or
 *   read-only range calendar sets no anchor and shows no preview.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const RangeCalendarProps = Schema.Struct({
  value: Schema.NullOr(
    Schema.Struct({ start: CalendarDate, end: CalendarDate })
  ),
  ...CalendarGridPropsFields
})

/**
 * The props of a `RangeCalendar`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type RangeCalendarProps = typeof RangeCalendarProps.Type

/**
 * Events emitted by `RangeCalendar`.
 *
 * **Details**
 *
 * - `Picked`: the second press of a range, with its midnight-UTC `start` and
 *   `end` in order.
 * - `RequestedMonth`: as `Calendar`'s.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const RangeCalendarEvents = UiSchema.TaggedEnum({
  Picked: { start: Schema.DateTimeUtc, end: Schema.DateTimeUtc },
  RequestedMonth: { month: Schema.DateTimeUtc }
})

/**
 * What a `RangeCalendar` emits.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type RangeCalendarEvents = typeof RangeCalendarEvents.Type

const RangeCalendarModel = Schema.Struct({
  // The range in progress: its first day, and the day last hovered or focused.
  draft: Schema.NullOr(
    Schema.Struct({ anchor: Schema.DateTimeUtc, target: Schema.DateTimeUtc })
  )
})

const RangeCalendarMessage = UiSchema.TaggedEnum({
  PickedDay: { date: Schema.DateTimeUtc },
  RequestedMonth: { month: Schema.DateTimeUtc },
  PreviewedDay: { date: Schema.DateTimeUtc },
  PressedEscape: {}
})

interface Range {
  readonly start: DateTime.Utc
  readonly end: DateTime.Utc
}

const rangeOf = (a: DateTime.DateTime, b: DateTime.DateTime): Range => {
  const x = toDay(a)
  const y = toDay(b)
  return { start: DateTime.min(x, y), end: DateTime.max(x, y) }
}

const inRange = (date: DateTime.Utc, range: Range | null): boolean =>
  range !== null &&
  DateTime.between(date, { minimum: range.start, maximum: range.end })

/**
 * A headless range calendar grid. Call it with the consumer's `h`, the
 * `props`, `onEmit`, and a `view` closure that draws `Calendar`'s parts.
 *
 * **Details**
 *
 * The parts write what `Calendar`'s do, and these over any values the
 * consumer set:
 *
 * - `grid`: `aria-multiselectable="true"`
 * - `cell`: `aria-selected="true"` on every day of `value`, even during a
 *   preview
 * - `day`: the data attributes above
 *
 * History restore drops the range in progress.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const RangeCalendar = Html.component({
  name: "RangeCalendar",
  props: RangeCalendarProps,
  model: RangeCalendarModel,
  message: RangeCalendarMessage,
  events: RangeCalendarEvents,
  restore: false
}).make({
  init: () => ({ draft: null }),
  update: {
    PickedDay: ($, { date }) =>
      $.model.draft === null
        ? $.evolve({ draft: { anchor: date, target: date } })
        : $.evolve({ draft: null }).emit(
          RangeCalendarEvents.Picked(rangeOf($.model.draft.anchor, date))
        ),
    RequestedMonth: ($, { month }) =>
      $.emit(RangeCalendarEvents.RequestedMonth({ month })),
    PreviewedDay: ($, { date }) =>
      $.model.draft === null || sameDay($.model.draft.target, date)
        ? $.model
        : $.evolve({ draft: { anchor: $.model.draft.anchor, target: date } }),
    PressedEscape: ($) => $.evolve({ draft: null })
  },
  parts: (p, model) => {
    const { value, ...props } = p.props
    const selected = value === null ? null : rangeOf(value.start, value.end)
    const draft = props.disabled === true || props.readOnly === true
      ? null
      : model.draft
    const anchor = draft?.anchor ?? null
    const shown = draft === null
      ? selected
      : rangeOf(draft.anchor, draft.target)
    const preview = (date: DateTime.Utc) =>
      draft === null ? undefined : RangeCalendarMessage.PreviewedDay({ date })

    const gridPart = p.part(
      "table",
      (b) => b.attr("aria-multiselectable", "true")
    )

    const cellPart = p.part(
      "td",
      (b, date: DateTime.Utc) =>
        b.attr("aria-selected", String(inRange(date, selected)))
    )

    const min = normalizeOptional(props.min)
    const max = normalizeOptional(props.max)

    // `inert`: a natively disabled day, which a hover doesn't preview.
    const dayPart = p.part(
      "button",
      (b, date: DateTime.Utc, inert: boolean) =>
        b
          .attrs({
            "data-selected": flag(inRange(date, selected)),
            "data-range-start": flag(
              shown !== null && sameDay(date, shown.start)
            ),
            "data-range-end": flag(shown !== null && sameDay(date, shown.end)),
            "data-in-range": flag(inRange(date, shown))
          })
          .on("mouseenter", () => inert ? undefined : preview(date))
          .on("focus", () => preview(date))
          .on(
            "keydown",
            ({ key }) =>
              key === "Escape" && draft !== null
                ? RangeCalendarMessage.PressedEscape()
                : undefined,
            { preventDefault: true }
          )
    )

    return p.child(Calendar, {
      // Only places the tab stop; the parts below override the selection.
      props: { ...props, value: anchor ?? selected?.start ?? null },
      onEmit: {
        Picked: ({ date }) => RangeCalendarMessage.PickedDay({ date }),
        RequestedMonth: ({ month }) =>
          RangeCalendarMessage.RequestedMonth({ month })
      },
      parts: (calendar) => {
        const visible = {
          monthStart: calendar.months[0].month,
          lastMonth: calendar.months[calendar.months.length - 1]!.month
        }
        const wrap = (month: typeof calendar.months[0]) => ({
          ...month,
          grid: View.wrapPart(
            gridPart,
            <B extends View.PartTarget<"table">>(
              element: B
            ): ReturnType<B["attr"]> => gridPart(month.grid(element))
          ),
          cell: View.wrapPart(
            cellPart,
            <B extends Keyed<"td">>(
              { date, element }: {
                readonly element: B
                readonly date: DateTime.DateTime
              }
            ): ReturnType<B["attr"]> => {
              const day = toDay(date)
              return cellPart(month.cell({ element, date: day }), day)
            }
          ),
          day: View.wrapPart(
            dayPart,
            <B extends Keyed<"button">>(
              { date, element, unavailable }: {
                readonly element: B
                readonly date: DateTime.DateTime
                readonly unavailable?: boolean | undefined
              }
            ): ReturnType<B["attr"]> => {
              const day = toDay(date)
              return dayPart(
                month.day({ element, date: day, unavailable }),
                day,
                isCopy(visible, month.month, day) || isOutOfRange(day, min, max)
              )
            }
          )
        })
        const [first, ...rest] = calendar.months
        return {
          ...calendar,
          anchor,
          months: [wrap(first), ...rest.map(wrap)] as const
        }
      }
    })
  }
})
