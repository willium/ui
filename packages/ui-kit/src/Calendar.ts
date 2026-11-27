/**
 * A controlled calendar for picking a date, showing one month or several
 * consecutive months. Pass the selected date as `value`, the first visible
 * month as `month`, the number of months as `months` and the current day as
 * `today`. Handle `Picked` to update `value` and `RequestedMonth` to update
 * `month`. Your view supplies the markup; the component computes the grid
 * dates and attributes and manages keyboard navigation and focus.
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
 * `root`, `previous`, `next`, `weekday` and `weekdays` (short and long names
 * in display order) are shared. `months` holds one entry per shown month,
 * never empty, with that month's `month` (its normalized first day), `title`
 * (localized month and year), `weeks` (`DateTime.Utc[][]`, whole weeks) and
 * its `heading`, `grid`, `cell` and `day` parts. Use each month's parts
 * inside its own grid.
 *
 * `root`, `heading`, `previous`, `next` and `grid` take the consumer's
 * builder and return it. `weekday({ element, index })` takes the column index
 * (`0` to `6`), `cell({ element, date })` takes the cell's date, and
 * `day({ element, date, unavailable? })` takes the day's date and an optional
 * `unavailable` flag. No part adds markup.
 *
 * Inside a `Field`, apply `field.group` to `root`, `field.member` to each
 * `day`, and pass `disabled: field.disabled`.
 *
 * **Date values**
 *
 * Every date prop accepts any `DateTime` (`DateTime.Utc` or
 * `DateTime.Zoned`) and is normalized with `DateTime.removeTime` to a
 * `DateTime.Utc` at midnight UTC. A `Zoned` value uses its calendar day in
 * its own time zone; a `Utc` value uses its UTC day. Because a UTC "now"
 * gives the UTC day, obtain `today` from `DateTime.nowInCurrentZone` or
 * another zoned `DateTime`. Every date the component emits or exposes in part
 * values is a normalized `DateTime.Utc`, and all localized formatting uses
 * `timeZone: "UTC"` so formatting preserves the normalized day.
 *
 * **Data attributes**
 *
 * Each present with an empty value or absent:
 *
 * - `root`, `heading`, `grid`: `data-disabled`, `data-readonly`
 * - `previous`, `next`: `data-disabled`
 * - `day`: `data-selected`, `data-today`, `data-outside-month`,
 *   `data-unavailable`, `data-disabled`, `data-focused`
 *
 * **Keyboard**
 *
 * When a grid has an enabled day, one day across all grids sits in the
 * page's Tab order (`tabindex="0"`); the rest have `tabindex="-1"`.
 *
 * - ArrowLeft / ArrowRight move by one day (swapped in a right-to-left layout)
 * - ArrowUp / ArrowDown move by one week
 * - Home / End move to the start / end of the week
 * - PageUp / PageDown move by one month
 * - Shift + PageUp / Shift + PageDown move by one year
 * - Enter and Space activate the focused day natively
 *
 * Unavailable days stay focusable with `aria-disabled="true"`, are not
 * skipped by arrow keys, and emit nothing when pressed. Days outside `min`
 * and `max` are natively `disabled`, and keyboard navigation clamps to the
 * range. Moves between shown months stay in the calendar. Moves that leave
 * them emit `RequestedMonth` with the first month shifted the least that
 * shows the target; if the consumer leaves `month` unchanged, focus stays
 * where it was. When `month` or `months` changes while a day has focus,
 * focus moves through `root` to the new tab stop without leaving the
 * calendar, unless the focused day is still shown in the same grid. Keep the
 * same `root` element mounted across month changes; the grids and days can
 * be replaced. If no shown day is in range, a visible day from an adjacent
 * month can receive focus.
 *
 * **Several months**
 *
 * A day outside its grid's month that another grid shows, such as December
 * 1st in November's grid, is a copy: natively `disabled` with
 * `data-disabled`, and never the tab stop. Outside days before the first
 * month and after the last behave as in a single month. `previous` and
 * `next` step one month.
 *
 * **Usage**
 *
 * The calendar follows the nearest `DirectionProvider` above it or, without
 * one, the root's CSS `direction`. The server formats with its own default
 * locale, which may differ from the browser's; pass `locale` when rendering
 * on a server.
 *
 * **Example** (A controlled two-month calendar whose selected date and first month live in the consumer's Model)
 *
 * ```ts import.meta.vitest
 * import { UiSchema } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { Calendar } from "@effect/ui-kit"
 * import { DateTime, Effect, Schema } from "effect"
 *
 * const BookingMessage = UiSchema.TaggedEnum({
 *   PickedDate: { date: Schema.DateTimeUtc },
 *   RequestedMonth: { month: Schema.DateTimeUtc }
 * })
 *
 * const Booking = Html.component({
 *   name: "Booking",
 *   model: Schema.Struct({
 *     date: Schema.NullOr(Schema.DateTimeUtc),
 *     month: Schema.DateTimeUtc
 *   }),
 *   message: BookingMessage
 * }).make({
 *   init: () => ({
 *     date: DateTime.makeUnsafe("2026-11-15T00:00:00Z"),
 *     month: DateTime.makeUnsafe("2026-11-01T00:00:00Z")
 *   }),
 *   update: {
 *     PickedDate: ($, { date }) => $.evolve({ date }),
 *     RequestedMonth: ($, { month }) => $.evolve({ month })
 *   },
 *   view: (h, model) =>
 *     Calendar(h, {
 *       props: {
 *         value: model.date,
 *         month: model.month,
 *         months: 2,
 *         today: DateTime.makeUnsafe("2026-11-26T00:00:00Z"),
 *         locale: "en-US"
 *       },
 *       onEmit: {
 *         Picked: ({ date }) => BookingMessage.PickedDate({ date }),
 *         RequestedMonth: ({ month }) => BookingMessage.RequestedMonth({ month })
 *       },
 *       view: (calendar) =>
 *         calendar.root(h.div.class("calendar")).children(
 *           calendar.previous(h.button).children("Prev"),
 *           calendar.next(h.button).children("Next"),
 *           ...calendar.months.map((month) =>
 *             h.section(
 *               month.heading(h.h2).children(month.title),
 *               month.grid(h.table.class("grid")).children(
 *                 h.thead(
 *                   h.tr(
 *                     ...calendar.weekdays.map((day, index) =>
 *                       calendar.weekday({ element: h.th, index }).children(day.short)
 *                     )
 *                   )
 *                 ),
 *                 h.tbody(
 *                   ...month.weeks.map((week) =>
 *                     h.tr(
 *                       ...week.map((date) =>
 *                         month.cell({ element: h.td, date }).children(
 *                           month.day({ element: h.button, date }).children(
 *                             String(DateTime.getPartUtc(date, "day"))
 *                           )
 *                         )
 *                       )
 *                     )
 *                   )
 *                 )
 *               )
 *             )
 *           )
 *         )
 *     })
 * })
 *
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Booking, {}))
 * if (!/<table class="grid"[^>]* role="grid"/.test(html)) throw new Error("the grid isn't a styled grid")
 * if (!/<td[^>]* role="gridcell"[^>]* aria-selected="true"/.test(html)) throw new Error("no selected cell")
 * if (html.match(/role="grid"/g)?.length !== 2) throw new Error("not two grids")
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Command from "@effect/ui/Command"
import type * as Component from "@effect/ui/Component"
import * as Html from "@effect/ui/html/Html"
import * as HtmlCommand from "@effect/ui/html/HtmlCommand"
import * as Mount from "@effect/ui/Mount"
import * as Renderer from "@effect/ui/Renderer"
import * as Subscription from "@effect/ui/Subscription"
import * as UiSchema from "@effect/ui/UiSchema"
import * as View from "@effect/ui/View"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { DirectionProvider } from "./DirectionProvider.ts"
import { fallbackLabel, flag, type Keyed } from "./internal/attributes.ts"
import {
  addMonths,
  CalendarDate,
  CalendarDayRef,
  CalendarGridKey,
  CalendarGridModel,
  CalendarGridPropsFields,
  type CalendarWeekdayName,
  canStepMonth,
  dateKey,
  firstDayOfWeek,
  focusDay,
  formatMonthTitle,
  fullDateFormatter,
  gridKeyOf,
  inWindow,
  isCopy,
  isOutOfRange,
  monthCount,
  moveDate,
  normalizeOptional,
  sameDay,
  sameMonth,
  startOfMonth,
  syncMonthPhase,
  tabStopOf,
  toDay,
  weekdayNames,
  weeksOfMonth
} from "./internal/calendar.ts"
import { rightToLeft, TrackDirection } from "./internal/direction.ts"

/**
 * Short and long localized names for a day of the week in `Calendar`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type CalendarWeekday = CalendarWeekdayName

/**
 * Props for a `Calendar`.
 *
 * **Details**
 *
 * - `value`: the selected date, or `null` for none. Normalized with
 *   `DateTime.removeTime`.
 * - `month`: any date in the first month to display. Controlled so
 *   consumers can jump to a month and load its availability.
 * - `months`: how many consecutive months to show, a positive integer.
 *   Defaults to `1`.
 * - `today`: the current day, passed as a prop so `init` stays pure and
 *   server HTML matches the client. Prefer `DateTime.nowInCurrentZone` or
 *   another zoned `DateTime`.
 * - `min` and `max`: optional inclusive date bounds. Days outside the range
 *   are natively `disabled` and keyboard focus clamps to the bounds.
 * - `firstDayOfWeek`: `0` (Sunday) to `6` (Saturday). Defaults to the
 *   locale's first day via `Intl.Locale#getWeekInfo` (including a `-u-fw-`
 *   extension), or Monday (`1`) when unavailable.
 * - `locale`: BCP 47 locale tag or tags for month titles, weekday names and
 *   day labels, which always use the Gregorian calendar of the grid. Defaults
 *   to the runtime's default locale.
 * - `disabled`: disables every button and suppresses all interaction.
 * - `readOnly`: allows focus, keyboard navigation and month requests while
 *   suppressing `Picked`.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const CalendarProps = Schema.Struct({
  value: Schema.NullOr(CalendarDate),
  ...CalendarGridPropsFields
})

/**
 * The props of a `Calendar`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type CalendarProps = typeof CalendarProps.Type

/**
 * Events emitted by `Calendar`.
 *
 * **Details**
 *
 * - `Picked`: emitted when the user presses an enabled, available day while
 *   not `readOnly`. Carries the normalized midnight-UTC `date`.
 * - `RequestedMonth`: emitted when the user presses `previous` or `next` or
 *   navigates with the keyboard outside the shown months. Carries the
 *   normalized first day of the requested first `month`.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const CalendarEvents = UiSchema.TaggedEnum({
  Picked: { date: Schema.DateTimeUtc },
  RequestedMonth: { month: Schema.DateTimeUtc }
})

/**
 * What a `Calendar` emits.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type CalendarEvents = typeof CalendarEvents.Type

const CalendarMessage = UiSchema.TaggedEnum({
  ClickedDay: { date: Schema.DateTimeUtc, unavailable: Schema.Boolean },
  ClickedStep: { months: Schema.Literals([-1, 1]) },
  FocusedDay: { date: Schema.DateTimeUtc },
  BlurredDay: {},
  PressedKey: { date: Schema.DateTimeUtc, move: CalendarGridKey },
  SyncedMonth: {},
  ParkedFocus: { date: Schema.DateTimeUtc },
  FoundDirection: { rtl: Schema.Boolean }
})

type CalendarMessage = typeof CalendarMessage.Type

type CalendarUpdate = Component.Update<
  CalendarGridModel,
  CalendarMessage,
  CalendarEvents,
  CalendarProps
>

const disabledWhileFocused = Subscription.make(
  "disabledWhileFocused",
  Stream.make(CalendarMessage.BlurredDay())
)

const CalendarRootRef = Renderer.ref("CalendarRoot")

const monthOf = (props: CalendarProps) => startOfMonth(props.month)

const contextOf = (
  props: CalendarProps,
  monthStart = monthOf(props),
  months = monthCount(props.months)
) => ({
  monthStart,
  lastMonth: addMonths(monthStart, months - 1),
  months,
  weekStartsOn: props.firstDayOfWeek ?? firstDayOfWeek(props.locale),
  preferred: normalizeOptional(props.value),
  today: toDay(props.today),
  min: normalizeOptional(props.min),
  max: normalizeOptional(props.max)
})

const settled = ($: CalendarUpdate) =>
  $.model.pendingFocus === null ? $.model : $.evolve({ pendingFocus: null })

const navigate = (
  $: CalendarUpdate,
  date: DateTime.Utc,
  move: CalendarGridKey
) => {
  if ($.props.disabled === true) return $.model
  const context = contextOf($.props)
  const target = moveDate(
    date,
    move,
    context.weekStartsOn,
    context.min,
    context.max
  )
  if (sameDay(target, date)) return settled($)
  if (inWindow(context, target)) {
    return $.evolve({
      focusedDay: target,
      pendingFocus: null
    }).run(focusDay(target))
  }
  // Shift the window the least that shows the target.
  const month = startOfMonth(target)
  return $.evolve({ pendingFocus: target }).emit(
    CalendarEvents.RequestedMonth({
      month: DateTime.isLessThan(target, context.monthStart)
        ? month
        : addMonths(month, 1 - context.months)
    })
  )
}

/**
 * A headless calendar. Call it with the consumer's `h`, the `props`,
 * `onEmit`, and a `view` closure that draws `root`, `previous`, `next`,
 * `weekday`, and each entry of `months`: its `heading`, `grid`, `cell` and
 * `day`.
 *
 * **Details**
 *
 * The parts object also exposes `weekdays`, and each entry of `months` its
 * `month`, `title` and `weeks`.
 *
 * Each part's owned attributes win over values the consumer set on the
 * builder before applying the part, including attributes a state leaves
 * absent:
 *
 * - `root`: `tabindex="-1"`, `data-disabled` and `data-readonly`
 * - `heading`: `id`, `aria-live="polite"`, `data-disabled` and `data-readonly`
 * - `previous`, `next`: `type="button"`, `disabled`, `aria-disabled` and
 *   `data-disabled` (plus a fallback `aria-label` when the button has no
 *   accessible name)
 * - `grid`: `role="grid"`, `aria-labelledby` (appending the heading's id),
 *   `aria-disabled`, `aria-readonly`, `data-disabled` and `data-readonly`
 * - `weekday`: `scope="col"` and `abbr`
 * - `cell`: `role="gridcell"` and `aria-selected`
 * - `day`: `type="button"`, `tabindex`, `disabled`, `aria-label`,
 *   `aria-disabled`, `aria-current`, `data-selected`, `data-today`,
 *   `data-outside-month`, `data-unavailable`, `data-disabled` and
 *   `data-focused`
 *
 * `weekday` throws when `index` is not an integer between `0` and `6`.
 *
 * History restore saves nothing of the calendar's transient focus state:
 * after Back, forward or a reload it starts from `init`.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const Calendar = Html.component({
  name: "Calendar",
  props: CalendarProps,
  model: CalendarGridModel,
  message: CalendarMessage,
  events: CalendarEvents,
  reads: {
    provider: { owner: DirectionProvider, optional: true }
  },
  restore: false
}).make({
  init: ({ props }) => ({
    focusedDay: null,
    focused: false,
    shownMonth: monthOf(props),
    shownMonths: monthCount(props.months),
    pendingFocus: null,
    rtl: false
  }),
  update: {
    ClickedDay: ($, { date, unavailable }) => {
      const { max, min } = contextOf($.props)
      if ($.props.disabled === true || isOutOfRange(date, min, max)) {
        return $.model
      }
      if (unavailable || $.props.readOnly === true) return settled($)
      return $.evolve({ focusedDay: date, pendingFocus: null }).emit(
        CalendarEvents.Picked({ date })
      )
    },
    ClickedStep: ($, { months }) => {
      const { lastMonth, max, min, monthStart } = contextOf($.props)
      if (
        $.props.disabled === true ||
        !canStepMonth(months < 0 ? monthStart : lastMonth, months, min, max)
      ) {
        return $.model
      }
      return $.evolve({ pendingFocus: null }).emit(
        CalendarEvents.RequestedMonth({
          month: DateTime.add(monthStart, { months })
        })
      )
    },
    FocusedDay: ($, { date }) => {
      const { max, min } = contextOf($.props)
      if ($.props.disabled === true || isOutOfRange(date, min, max)) {
        return $.model
      }
      return $.evolve({ focusedDay: date, focused: true, pendingFocus: null })
    },
    BlurredDay: ($) =>
      $.model.focused || $.model.pendingFocus !== null
        ? $.evolve({ focused: false, pendingFocus: null })
        : $.model,
    PressedKey: ($, { date, move }) => navigate($, date, move),
    SyncedMonth: ($) => {
      const context = contextOf($.props)
      const { shouldFocus, ...phase } = syncMonthPhase($.model, context)
      const date = phase.focusedDay
      if (!shouldFocus || date === null) {
        return $.evolve({
          ...phase,
          shownMonth: context.monthStart,
          shownMonths: context.months
        })
      }
      // Focus the stable root before replacing the day to avoid focus
      // falling to `<body>` and marking an enclosing Field touched.
      return $.run(
        HtmlCommand.Focus.make({
          ref: CalendarRootRef,
          options: { preventScroll: true }
        }).pipe(Command.map(() => CalendarMessage.ParkedFocus({ date })))
      )
    },
    ParkedFocus: ($, { date }) =>
      $.evolve({
        focusedDay: date,
        pendingFocus: null,
        shownMonth: monthOf($.props),
        shownMonths: monthCount($.props.months)
      }).run(focusDay(date)),
    FoundDirection: ($, { rtl }) => $.evolve({ rtl })
  },
  subscriptions: ({ model, props }) => {
    const monthStart = monthOf(props)
    const months = monthCount(props.months)
    return [
      (!sameMonth(monthStart, model.shownMonth) ||
        months !== model.shownMonths) &&
      Subscription.make(
        "syncedMonth",
        [dateKey(monthStart), months],
        () => Stream.make(CalendarMessage.SyncedMonth())
      ),
      model.focused && props.disabled === true && disabledWhileFocused
    ]
  },
  parts: (p, model) => {
    const props = p.props
    const disabled = props.disabled === true
    const readOnly = props.readOnly === true
    const rtl = rightToLeft(p.reads.provider, model.rtl)
    // Keep the focused day mounted until focus moves to the root.
    const context = model.focused
      ? contextOf(props, model.shownMonth, model.shownMonths)
      : contextOf(props)
    const { max, min, monthStart, preferred: value, today, weekStartsOn } =
      context
    const weekdays = weekdayNames(props.locale, weekStartsOn)
    const phase = syncMonthPhase(model, context)
    const tabStop = tabStopOf(phase.focusedDay, context)
    const fullDate = fullDateFormatter(props.locale)
    const isSelected = (date: DateTime.Utc) =>
      value !== null && sameDay(date, value)
    const state = {
      "data-disabled": flag(disabled),
      "data-readonly": flag(readOnly)
    }

    const step = (months: -1 | 1, label: string) => {
      const stepDisabled = disabled ||
        !canStepMonth(
          months < 0 ? monthStart : context.lastMonth,
          months,
          min,
          max
        )
      return p.part("button", (b) =>
        b
          .attrs({
            type: "button",
            "aria-disabled": undefined,
            "data-disabled": flag(stepDisabled)
          })
          .disabled(stepDisabled)
          .on("click", CalendarMessage.ClickedStep({ months }))
          .forward(fallbackLabel(label)))
    }

    const weekdayPart = p.part("th", (b, index: number) => {
      const weekday = Number.isInteger(index) ? weekdays[index] : undefined
      if (weekday === undefined) {
        throw new Error(
          "Calendar: weekday index must be an integer between 0 and 6, got " +
            String(index)
        )
      }
      return b.attrs({
        scope: "col",
        abbr: weekday.long
      })
    })

    const cellPart = p.part("td", (b, date: DateTime.Utc) =>
      b.attrs({
        role: "gridcell",
        "aria-selected": String(isSelected(date))
      }))

    const dayPart = p.part(
      "button",
      (
        b,
        date: DateTime.Utc,
        key: string,
        unavailable: boolean,
        gridMonth: DateTime.Utc
      ) => {
        // A copy of a day another grid shows stays inert, so the one it
        // copies owns the ref and the tab stop.
        const copy = isCopy(context, gridMonth, date)
        const dayDisabled = disabled || copy || isOutOfRange(date, min, max)
        const isToday = sameDay(date, today)
        const isFocused = !dayDisabled &&
          phase.focused &&
          phase.focusedDay !== null &&
          sameDay(date, phase.focusedDay)
        const isTabStop = !dayDisabled &&
          tabStop !== null &&
          sameDay(date, tabStop)
        const day = b
          .attrs({
            type: "button",
            tabindex: isTabStop ? "0" : "-1",
            "aria-label": DateTime.formatIntl(date, fullDate),
            "aria-disabled": !dayDisabled && unavailable ? "true" : undefined,
            "aria-current": isToday ? "date" : undefined,
            "data-selected": flag(isSelected(date)),
            "data-today": flag(isToday),
            "data-outside-month": flag(!sameMonth(date, gridMonth)),
            "data-unavailable": flag(unavailable),
            "data-disabled": flag(dayDisabled),
            "data-focused": flag(isFocused)
          })
          .disabled(dayDisabled)
        return (copy ? day : day.ref(CalendarDayRef.at(key)))
          .on(
            "click",
            CalendarMessage.ClickedDay({ date, unavailable }),
            unavailable ? { preventDefault: "always" } : undefined
          )
          .on("focus", CalendarMessage.FocusedDay({ date }))
          .on("blur", CalendarMessage.BlurredDay())
          .on(
            "keydown",
            ({ alt, ctrl, key: pressed, meta, shift }) => {
              if (disabled || alt || ctrl || meta) return undefined
              const move = gridKeyOf(pressed, shift, rtl)
              return move === undefined
                ? undefined
                : CalendarMessage.PressedKey({ date, move })
            },
            { preventDefault: true }
          )
      }
    )

    const cell = View.wrapPart(
      cellPart,
      <B extends Keyed<"td">>(
        { date, element }: {
          readonly element: B
          readonly date: DateTime.DateTime
        }
      ): ReturnType<B["attr"]> => {
        const day = toDay(date)
        return cellPart(element.key(dateKey(day)), day)
      }
    )

    const monthParts = (index: number) => {
      const month = addMonths(monthStart, index)
      // Keyed by slot, so `aria-live` stays on the same element.
      const headingId = p.id("heading", index)
      return {
        month,
        title: formatMonthTitle(month, props.locale),
        weeks: weeksOfMonth(month, weekStartsOn),
        heading: p.part((b) =>
          b.attrs({
            id: headingId,
            "aria-live": "polite",
            ...state
          })
        ),
        grid: p.part("table", (b) =>
          b.attrs({
            role: "grid",
            "aria-labelledby": headingId,
            "aria-disabled": disabled ? "true" : undefined,
            "aria-readonly": readOnly ? "true" : undefined,
            ...state
          })),
        cell,
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
            const key = dateKey(day)
            return dayPart(
              element.key(key),
              day,
              key,
              unavailable === true,
              month
            )
          }
        )
      }
    }

    return {
      months: [
        monthParts(0),
        ...Array.from(
          { length: context.months - 1 },
          (_, index) => monthParts(index + 1)
        )
      ] as const,
      weekdays,
      root: p.part((b) => {
        const root = b.attrs({ tabindex: "-1", ...state }).ref(CalendarRootRef)
        return p.reads.provider !== undefined ? root : root.onMount(
          TrackDirection().pipe(
            Mount.map((rtl) => CalendarMessage.FoundDirection({ rtl }))
          )
        )
      }),
      previous: step(-1, "Previous month"),
      next: step(1, "Next month"),
      weekday: View.wrapPart(
        weekdayPart,
        <B extends Keyed<"th">>(
          { element, index }: { readonly element: B; readonly index: number }
        ): ReturnType<B["attr"]> =>
          weekdayPart(element.key(String(index)), index)
      )
    }
  }
})
