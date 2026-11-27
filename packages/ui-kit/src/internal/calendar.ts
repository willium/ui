import * as Command from "@effect/ui/Command"
import * as Html from "@effect/ui/html/Html"
import * as HtmlCommand from "@effect/ui/html/HtmlCommand"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { cached, type Locale } from "./number.ts"

export const CalendarDate = Schema.Union([
  Schema.DateTimeUtc,
  Schema.DateTimeZoned
])

export const CalendarLocale = Schema.Union([
  Schema.String,
  Schema.Array(Schema.String)
])

const CalendarWeekdayNumber = Schema.Literals([0, 1, 2, 3, 4, 5, 6])

export type CalendarWeekdayNumber = typeof CalendarWeekdayNumber.Type

export interface CalendarWeekdayName {
  readonly short: string
  readonly long: string
}

export const CalendarGridKey = Schema.Literals([
  "previousDay",
  "nextDay",
  "previousWeek",
  "nextWeek",
  "startOfWeek",
  "endOfWeek",
  "previousMonth",
  "nextMonth",
  "previousYear",
  "nextYear"
])

export type CalendarGridKey = typeof CalendarGridKey.Type

export const CalendarGridPropsFields = {
  month: CalendarDate,
  today: CalendarDate,
  min: Schema.optional(CalendarDate),
  max: Schema.optional(CalendarDate),
  months: Schema.optional(Schema.Number),
  firstDayOfWeek: Schema.optional(CalendarWeekdayNumber),
  locale: Schema.optional(CalendarLocale),
  disabled: Schema.optional(Schema.Boolean),
  readOnly: Schema.optional(Schema.Boolean)
} as const

export const CalendarGridModel = Schema.Struct({
  focusedDay: Schema.NullOr(Schema.DateTimeUtc),
  focused: Schema.Boolean,
  shownMonth: Schema.DateTimeUtc,
  shownMonths: Schema.Number,
  pendingFocus: Schema.NullOr(Schema.DateTimeUtc),
  // The root's CSS `direction` is right-to-left.
  rtl: Schema.Boolean
})

export type CalendarGridModel = typeof CalendarGridModel.Type

type CalendarGridPhase =
  & Pick<CalendarGridModel, "focusedDay" | "focused" | "pendingFocus">
  & { readonly shouldFocus: boolean }

export const CalendarDayRef = Html.ref("CalendarDay", "button")

const dayMillis = 86_400_000

export const toDay = (date: DateTime.DateTime): DateTime.Utc =>
  DateTime.isUtc(date) && date.epochMilliseconds % dayMillis === 0
    ? date
    : DateTime.removeTime(date)

export const normalizeOptional = (
  date: DateTime.DateTime | null | undefined
): DateTime.Utc | null => date == null ? null : toDay(date)

export const startOfMonth = (date: DateTime.DateTime): DateTime.Utc =>
  DateTime.startOf(toDay(date), "month")

export const addMonths = (date: DateTime.Utc, months: number): DateTime.Utc =>
  DateTime.add(date, { months })

// The number of months shown: `months` as a positive integer, or 1.
export const monthCount = (months: number | undefined): number =>
  Math.max(1, Math.floor(months ?? 1)) || 1

const endOfMonth = (date: DateTime.Utc): DateTime.Utc =>
  DateTime.removeTime(DateTime.endOf(date, "month"))

export const dateKey = (date: DateTime.Utc): string =>
  DateTime.formatIsoDateUtc(date)

export const sameDay = (a: DateTime.Utc, b: DateTime.Utc): boolean =>
  DateTime.Equivalence(a, b)

export const sameMonth = (a: DateTime.Utc, b: DateTime.Utc): boolean =>
  DateTime.getPartUtc(a, "year") === DateTime.getPartUtc(b, "year") &&
  DateTime.getPartUtc(a, "month") === DateTime.getPartUtc(b, "month")

export const isOutOfRange = (
  date: DateTime.Utc,
  min: DateTime.Utc | null,
  max: DateTime.Utc | null
): boolean =>
  (min !== null && DateTime.isLessThan(date, min)) ||
  (max !== null && DateTime.isGreaterThan(date, max))

// The shown months, from the first to the last.
export interface CalendarWindow {
  readonly monthStart: DateTime.Utc
  readonly lastMonth: DateTime.Utc
}

export const inWindow = (window: CalendarWindow, date: DateTime.Utc): boolean =>
  !isOutOfRange(date, window.monthStart, endOfMonth(window.lastMonth))

// A day of another shown month that this grid renders as a disabled copy.
export const isCopy = (
  window: CalendarWindow,
  gridMonth: DateTime.Utc,
  date: DateTime.Utc
): boolean => !sameMonth(date, gridMonth) && inWindow(window, date)

const clampDate = (
  date: DateTime.Utc,
  min: DateTime.Utc | null,
  max: DateTime.Utc | null
): DateTime.Utc => {
  const lower = min === null ? date : DateTime.max(date, min)
  return max === null ? lower : DateTime.min(lower, max)
}

export const canStepMonth = (
  monthStart: DateTime.Utc,
  months: -1 | 1,
  min: DateTime.Utc | null,
  max: DateTime.Utc | null
): boolean =>
  months < 0
    ? min === null || DateTime.isGreaterThan(monthStart, min)
    : max === null || DateTime.isLessThan(endOfMonth(monthStart), max)

export const focusDay = (date: DateTime.Utc) =>
  HtmlCommand.Focus.make({ ref: CalendarDayRef.at(dateKey(date)) }).pipe(
    Command.asNoop
  )

interface LocaleWithWeekInfo extends Intl.Locale {
  readonly getWeekInfo?: (() => { readonly firstDay: number }) | undefined
  readonly weekInfo?: { readonly firstDay: number } | undefined
}

const formatters = new Map<string, Intl.DateTimeFormat>()

export const formatterOf = (
  locale: Locale,
  options: Intl.DateTimeFormatOptions
): Intl.DateTimeFormat =>
  cached(
    formatters,
    { locale, options },
    () =>
      new Intl.DateTimeFormat(
        locale as string | Array<string> | undefined,
        // The grid is Gregorian, so labels must be too, whatever the locale's
        // default calendar.
        { ...options, calendar: "gregory", timeZone: "UTC" }
      )
  )

const weekStarts = new Map<string, CalendarWeekdayNumber>()

export const firstDayOfWeek = (locale: Locale): CalendarWeekdayNumber =>
  cached(weekStarts, { locale }, () => {
    try {
      // `supportedLocalesOf` keeps a `-u-fw-` override that a resolved locale
      // drops.
      const loc = new Intl.Locale(
        Intl.DateTimeFormat.supportedLocalesOf(
          locale as string | Array<string> | undefined
        )[0] ?? formatterOf(locale, {}).resolvedOptions().locale
      ) as LocaleWithWeekInfo
      const info = typeof loc.getWeekInfo === "function"
        ? loc.getWeekInfo()
        : loc.weekInfo
      const firstDay = info?.firstDay
      if (typeof firstDay === "number" && firstDay >= 1 && firstDay <= 7) {
        return (firstDay % 7) as CalendarWeekdayNumber
      }
    } catch {
      // Fall back to Monday when Intl.Locale week info is unavailable.
    }
    return 1
  })

export const weeksOfMonth = (
  monthStart: DateTime.Utc,
  weekStartsOn: CalendarWeekdayNumber
): ReadonlyArray<ReadonlyArray<DateTime.Utc>> => {
  const first = DateTime.startOf(monthStart, "week", { weekStartsOn })
  const last = DateTime.removeTime(
    DateTime.endOf(endOfMonth(monthStart), "week", { weekStartsOn })
  )
  const weeks: Array<Array<DateTime.Utc>> = []
  let day = first
  while (DateTime.isLessThanOrEqualTo(day, last)) {
    const week: Array<DateTime.Utc> = []
    for (let i = 0; i < 7; i++) {
      week.push(day)
      day = DateTime.add(day, { days: 1 })
    }
    weeks.push(week)
  }
  return weeks
}

// 2023-01-01 is a Sunday in UTC (weekDay === 0).
const referenceSunday = DateTime.makeUnsafe("2023-01-01T00:00:00Z")

const weekdays = new Map<string, ReadonlyArray<CalendarWeekdayName>>()

export const weekdayNames = (
  locale: Locale,
  weekStartsOn: CalendarWeekdayNumber
): ReadonlyArray<CalendarWeekdayName> =>
  cached(weekdays, { locale, weekStartsOn }, () => {
    const shortFmt = formatterOf(locale, { weekday: "short" })
    const longFmt = formatterOf(locale, { weekday: "long" })
    return Array.from({ length: 7 }, (_, i) => {
      const day = DateTime.add(referenceSunday, {
        days: (weekStartsOn + i) % 7
      })
      return {
        short: DateTime.formatIntl(day, shortFmt),
        long: DateTime.formatIntl(day, longFmt)
      }
    })
  })

export const formatMonthTitle = (
  monthStart: DateTime.Utc,
  locale: Locale
): string =>
  DateTime.formatIntl(
    monthStart,
    formatterOf(locale, { month: "long", year: "numeric" })
  )

export const fullDateFormatter = (locale: Locale): Intl.DateTimeFormat =>
  formatterOf(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  })

export const gridKeyOf = (
  key: string,
  shift: boolean,
  rtl: boolean
): CalendarGridKey | undefined => {
  if (key === "PageUp") return shift ? "previousYear" : "previousMonth"
  if (key === "PageDown") return shift ? "nextYear" : "nextMonth"
  if (shift) return undefined
  if (key === "ArrowLeft") return rtl ? "nextDay" : "previousDay"
  if (key === "ArrowRight") return rtl ? "previousDay" : "nextDay"
  if (key === "ArrowUp") return "previousWeek"
  if (key === "ArrowDown") return "nextWeek"
  if (key === "Home") return "startOfWeek"
  if (key === "End") return "endOfWeek"
  return undefined
}

const steps: Record<
  Exclude<CalendarGridKey, "startOfWeek" | "endOfWeek">,
  Partial<DateTime.DateTime.PartsForMath>
> = {
  previousDay: { days: -1 },
  nextDay: { days: 1 },
  previousWeek: { weeks: -1 },
  nextWeek: { weeks: 1 },
  previousMonth: { months: -1 },
  nextMonth: { months: 1 },
  previousYear: { years: -1 },
  nextYear: { years: 1 }
}

export const moveDate = (
  date: DateTime.Utc,
  move: CalendarGridKey,
  weekStartsOn: CalendarWeekdayNumber,
  min: DateTime.Utc | null,
  max: DateTime.Utc | null
): DateTime.Utc => {
  const raw = move === "startOfWeek"
    ? DateTime.startOf(date, "week", { weekStartsOn })
    : move === "endOfWeek"
    ? DateTime.removeTime(DateTime.endOf(date, "week", { weekStartsOn }))
    : DateTime.add(date, steps[move])
  const clamped = clampDate(raw, min, max)
  // An empty range (`min` after `max`) has no day to move to.
  return isOutOfRange(clamped, min, max) ? date : clamped
}

export interface FocusContext extends CalendarWindow {
  readonly months: number
  readonly weekStartsOn: CalendarWeekdayNumber
  readonly preferred: DateTime.Utc | null
  readonly today: DateTime.Utc
  readonly min: DateTime.Utc | null
  readonly max: DateTime.Utc | null
}

const withDayInMonth = (
  monthStart: DateTime.Utc,
  dayNumber: number
): DateTime.Utc => {
  const maxDay = DateTime.getPartUtc(endOfMonth(monthStart), "day")
  return DateTime.setPartsUtc(monthStart, { day: Math.min(dayNumber, maxDay) })
}

const shown = (
  context: FocusContext,
  date: DateTime.Utc | null
): DateTime.Utc | null =>
  date !== null &&
    inWindow(context, date) &&
    !isOutOfRange(date, context.min, context.max)
    ? date
    : null

const clampedShown = (
  context: FocusContext,
  date: DateTime.Utc
): DateTime.Utc | null =>
  shown(context, clampDate(date, context.min, context.max))

const focusInWindow = (
  context: FocusContext,
  previousFocusedDay: DateTime.Utc | null
): DateTime.Utc | null =>
  shown(context, context.preferred) ??
    (previousFocusedDay === null ? null : clampedShown(
      context,
      withDayInMonth(
        // The shown month nearest the previous one.
        clampDate(
          startOfMonth(previousFocusedDay),
          context.monthStart,
          context.lastMonth
        ),
        DateTime.getPartUtc(previousFocusedDay, "day")
      )
    )) ??
    shown(context, context.today) ??
    clampedShown(context, context.monthStart)

const rendered = (
  context: FocusContext,
  date: DateTime.Utc | null
): DateTime.Utc | null => {
  const { weekStartsOn } = context
  return date !== null &&
      !isOutOfRange(
        date,
        DateTime.startOf(context.monthStart, "week", { weekStartsOn }),
        DateTime.removeTime(
          DateTime.endOf(endOfMonth(context.lastMonth), "week", {
            weekStartsOn
          })
        )
      ) &&
      !isOutOfRange(date, context.min, context.max)
    ? date
    : null
}

// `focusInWindow`, or when no shown day is in range, the rendered day nearest
// to the window.
const focusInGrid = (
  context: FocusContext,
  previousFocusedDay: DateTime.Utc | null
): DateTime.Utc | null =>
  focusInWindow(context, previousFocusedDay) ??
    rendered(context, clampDate(context.monthStart, context.min, context.max))

export const syncMonthPhase = (
  model: CalendarGridModel,
  context: FocusContext
): CalendarGridPhase => {
  const sameStart = sameMonth(model.shownMonth, context.monthStart)
  if (sameStart && model.shownMonths === context.months) {
    return {
      focusedDay: model.focusedDay,
      focused: model.focused,
      pendingFocus: model.pendingFocus,
      shouldFocus: false
    }
  }
  if (model.pendingFocus !== null && inWindow(context, model.pendingFocus)) {
    const target = clampedShown(context, model.pendingFocus) ??
      focusInGrid(context, model.focusedDay)
    return {
      focusedDay: target,
      focused: model.focused && target !== null,
      pendingFocus: null,
      shouldFocus: target !== null
    }
  }
  const kept = shown(context, model.focusedDay)
  const focusedDay = model.focusedDay === null
    ? null
    : kept ?? focusInGrid(context, model.focusedDay)
  const focused = model.focused && focusedDay !== null
  return {
    focusedDay,
    focused,
    pendingFocus: null,
    // The focused day left the DOM, or moved to another grid when the first
    // month changed, so focus follows the tab stop.
    shouldFocus: focused && (kept === null || !sameStart)
  }
}

export const tabStopOf = (
  focusedDay: DateTime.Utc | null,
  context: FocusContext
): DateTime.Utc | null =>
  rendered(context, focusedDay) ?? focusInGrid(context, focusedDay)
