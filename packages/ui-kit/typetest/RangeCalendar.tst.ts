import { Component, Mount, UiSchema, View } from "@effect/ui"
import { RangeCalendar, type RangeCalendarEvents } from "@effect/ui-kit"
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
  PickedStay: { start: Schema.DateTimeUtc, end: Schema.DateTimeUtc }
})
type Msg = typeof Msg.Type

type Td<R> = Html.Element<
  Msg,
  R,
  Html.EventsOf<"td">,
  HTMLTableCellElement,
  "td"
>
type Button<R> = Html.Element<
  Msg,
  R,
  Html.EventsOf<"button">,
  HTMLButtonElement,
  "button"
>

const h = View.makeHelper<Msg, {}, Html.Elements>({}, Html)
const utc = DateTime.makeUnsafe("2026-11-15T00:00:00Z")
const zoned = DateTime.makeZonedUnsafe("2026-11-26T02:00:00Z", {
  timeZone: "America/Los_Angeles"
})

describe("RangeCalendar", () => {
  it("needs no provider", () => {
    expect<Component.Headless.Requirements<typeof RangeCalendar>>().type.toBe<
      never
    >()
  })

  it("emits an ordered Utc range, and its range parts return the builder they were given", () => {
    const child = RangeCalendar(h, {
      props: { value: { start: zoned, end: utc }, month: utc, today: zoned },
      onEmit: {
        Picked: (event) => {
          expect(event).type.toBe<
            Extract<RangeCalendarEvents, { readonly _tag: "Picked" }>
          >()
          expect(event.start).type.toBe<DateTime.Utc>()
          expect(event.end).type.toBe<DateTime.Utc>()
          return Msg.PickedStay({ start: event.start, end: event.end })
        },
        RequestedMonth: () => undefined
      },
      view: (rangeCalendar) => {
        const [month] = rangeCalendar.months
        expect(rangeCalendar.anchor).type.toBe<DateTime.Utc | null>()
        expect(month.month).type.toBe<DateTime.Utc>()
        expect(month.cell({ element: h.td, date: utc })).type.toBe<
          Td<never>
        >()
        const day = month.day({
          element: h.button.onMount(NeedsClock()),
          date: utc,
          unavailable: true
        })
        expect(day).type.toBe<Button<Clock>>()
        return rangeCalendar.root(h.div).children(day)
      }
    })
    expect<View.Requirements<typeof child>>().type.toBe<Clock>()
  })

  it("takes a range as its value and rejects wrong element tags", () => {
    expect(RangeCalendar).type.not.toBeCallableWith(h, {
      props: { value: { start: utc }, month: utc, today: utc },
      view: () => h.div
    })

    RangeCalendar(h, {
      props: { value: null, month: utc, today: utc },
      view: (rangeCalendar) => {
        const [month] = rangeCalendar.months
        expect(month.grid).type.not.toBeCallableWith(h.div)
        expect(month.cell).type.not.toBeCallableWith({
          element: h.div,
          date: utc
        })
        expect(month.day).type.not.toBeCallableWith({
          element: h.div,
          date: utc
        })
        return rangeCalendar.root(h.div)
      }
    })
  })
})
