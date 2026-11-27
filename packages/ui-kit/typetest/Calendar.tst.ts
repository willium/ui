import { Component, Mount, UiSchema, View } from "@effect/ui"
import {
  Calendar,
  type CalendarEvents,
  type CalendarWeekday
} from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Context, DateTime, Effect, Schema } from "effect"
import { describe, expect, it } from "tstyche"

class Clock extends Context.Service<Clock, {}>()("Clock") {}

const NeedsClock = Mount.make(
  "NeedsClock",
  { args: {} },
  () => Clock.use(() => Effect.succeed(Component.noop))
)

const Msg = UiSchema.TaggedEnum({
  PickedDate: { date: Schema.DateTimeUtc },
  ChangedMonth: { month: Schema.DateTimeUtc }
})
type Msg = typeof Msg.Type

declare const needsClock: View.Child<never, Clock>

type Div<R> = Html.Element<Msg, R, Html.EventsOf<"div">, HTMLDivElement, "div">
type Heading<R> = Html.Element<
  Msg,
  R,
  Html.EventsOf<"h2">,
  HTMLHeadingElement,
  "h2"
>
type Button<R> = Html.Element<
  Msg,
  R,
  Html.EventsOf<"button">,
  HTMLButtonElement,
  "button"
>
type Table<R> = Html.Element<
  Msg,
  R,
  Html.EventsOf<"table">,
  HTMLTableElement,
  "table"
>
type Th<R> = Html.Element<
  Msg,
  R,
  Html.EventsOf<"th">,
  HTMLTableCellElement,
  "th"
>
type Td<R> = Html.Element<
  Msg,
  R,
  Html.EventsOf<"td">,
  HTMLTableCellElement,
  "td"
>

const h = View.makeHelper<Msg, {}, Html.Elements>({}, Html)
const utc = DateTime.makeUnsafe("2026-11-15T00:00:00Z")
const zoned = DateTime.makeZonedUnsafe("2026-11-26T02:00:00Z", {
  timeZone: "America/Los_Angeles"
})

describe("Calendar", () => {
  it("needs no provider: its read of a DirectionProvider is optional", () => {
    expect<Component.Headless.Requirements<typeof Calendar>>().type.toBe<
      never
    >()
  })

  it("each part returns the builder it was given, exposes typed part values, and emits normalized Utc dates", () => {
    const child = Calendar(h, {
      props: { value: zoned, month: utc, today: zoned },
      onEmit: {
        Picked: (event) => {
          expect(event).type.toBe<
            Extract<CalendarEvents, { readonly _tag: "Picked" }>
          >()
          expect(event.date).type.toBe<DateTime.Utc>()
          return Msg.PickedDate({ date: event.date })
        },
        RequestedMonth: (event) => {
          expect(event).type.toBe<
            Extract<CalendarEvents, { readonly _tag: "RequestedMonth" }>
          >()
          expect(event.month).type.toBe<DateTime.Utc>()
          return Msg.ChangedMonth({ month: event.month })
        }
      },
      view: (calendar) => {
        // Never empty, so the first month needs no check.
        const [month] = calendar.months
        expect(month.weeks).type.toBe<
          ReadonlyArray<ReadonlyArray<DateTime.Utc>>
        >()
        expect(calendar.weekdays).type.toBe<ReadonlyArray<CalendarWeekday>>()
        expect(month.month).type.toBe<DateTime.Utc>()
        expect(month.title).type.toBe<string>()

        expect(calendar.root(h.div.children(needsClock))).type.toBe<
          Div<Clock>
        >()
        expect(month.heading(h.h2)).type.toBe<Heading<never>>()
        expect(calendar.previous(h.button)).type.toBe<Button<never>>()
        expect(calendar.next(h.button)).type.toBe<Button<never>>()
        expect(month.grid(h.table)).type.toBe<Table<never>>()
        expect(calendar.weekday({ element: h.th, index: 0 })).type.toBe<
          Th<never>
        >()
        expect(month.cell({ element: h.td, date: utc })).type.toBe<
          Td<never>
        >()
        expect(
          month.day({
            element: h.button.onMount(NeedsClock()),
            date: utc,
            unavailable: false
          })
        ).type.toBe<Button<Clock>>()

        return calendar.root(h.div).children(
          month.day({ element: h.button.onMount(NeedsClock()), date: utc })
        )
      }
    })
    expect<View.Requirements<typeof child>>().type.toBe<Clock>()
  })

  it("requires value, month and today, and rejects wrong element tags on typed parts", () => {
    expect(Calendar).type.not.toBeCallableWith(h, {
      props: { month: utc, today: utc },
      view: () => h.div
    })
    expect(Calendar).type.not.toBeCallableWith(h, {
      props: { value: null, today: utc },
      view: () => h.div
    })
    expect(Calendar).type.not.toBeCallableWith(h, {
      props: { value: null, month: utc },
      view: () => h.div
    })
    expect(Calendar).type.not.toBeCallableWith(h, {
      props: { value: null, month: utc, today: utc, firstDayOfWeek: 7 },
      view: () => h.div
    })
    expect(Calendar).type.not.toBeCallableWith(h, {
      props: { value: null, month: utc, today: utc, months: "2" },
      view: () => h.div
    })

    Calendar(h, {
      props: { value: null, month: utc, today: utc },
      view: (calendar) => {
        const [month] = calendar.months
        expect(calendar.previous).type.not.toBeCallableWith(h.div)
        expect(calendar.next).type.not.toBeCallableWith(h.a)
        expect(month.grid).type.not.toBeCallableWith(h.div)
        expect(calendar.weekday).type.not.toBeCallableWith({
          element: h.td,
          index: 0
        })
        expect(month.cell).type.not.toBeCallableWith({
          element: h.div,
          date: utc
        })
        expect(month.day).type.not.toBeCallableWith({
          element: h.div,
          date: utc
        })
        expect(month.day).type.not.toBeCallableWith(h.button)
        return calendar.root(h.div)
      }
    })
  })
})
