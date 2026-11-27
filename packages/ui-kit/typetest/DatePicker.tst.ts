import { Component, Mount, UiSchema, View } from "@effect/ui"
import { DatePicker, type DatePickerChangeReason, Field } from "@effect/ui-kit"
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
  PickedDate: { date: Schema.NullOr(Schema.DateTimeUtc) },
  Opened: {},
  Closed: {}
})
type Msg = typeof Msg.Type

type Input<R> = Html.VoidElement<
  Msg,
  R,
  Html.EventsOf<"input">,
  HTMLInputElement,
  "input"
>
type Button<R> = Html.Element<
  Msg,
  R,
  Html.EventsOf<"button">,
  HTMLButtonElement,
  "button"
>
type Div<R> = Html.Element<Msg, R, Html.EventsOf<"div">, HTMLDivElement, "div">
type Table<R> = Html.Element<
  Msg,
  R,
  Html.EventsOf<"table">,
  HTMLTableElement,
  "table"
>

const h = View.makeHelper<Msg, {}, Html.Elements>({}, Html)
const utc = DateTime.makeUnsafe("2026-11-15T00:00:00Z")
const zoned = DateTime.makeZonedUnsafe("2026-11-26T02:00:00Z", {
  timeZone: "America/Los_Angeles"
})

describe("DatePicker", () => {
  it("needs no provider", () => {
    expect<Component.Headless.Requirements<typeof DatePicker>>().type.toBe<
      never
    >()
  })

  it("each part returns the builder it was given and keeps its requirements", () => {
    Field(h, {
      view: (field) => {
        const child = DatePicker(h, {
          props: { value: zoned, open: false, month: utc, today: zoned },
          view: (datePicker) => {
            expect(datePicker.input(h.input)).type.toBe<Input<never>>()
            expect(datePicker.trigger(h.button)).type.toBe<Button<never>>()
            expect(datePicker.positioner(h.div)).type.toBe<Div<never>>()
            expect(datePicker.popup(h.div)).type.toBe<Div<never>>()
            const [month] = datePicker.months
            expect(month.grid(h.table)).type.toBe<Table<never>>()
            expect(month.weeks).type.toBe<
              ReadonlyArray<ReadonlyArray<DateTime.Utc>>
            >()
            const input = datePicker.input(
              field.member(h.input.onMount(NeedsClock()))
            )
            expect(input).type.toBe<Input<Clock>>()
            return field.root(h.div).children(input)
          }
        })
        expect<View.Requirements<typeof child>>().type.toBe<Clock>()
        return child
      }
    })
  })

  it("emits Picked with a normalized Utc or null, and open and close requests with a reason", () => {
    DatePicker(h, {
      props: { value: null, open: true, month: utc, today: utc },
      onEmit: {
        Picked: (event) => {
          expect(event.date).type.toBe<DateTime.Utc | null>()
          return Msg.PickedDate({ date: event.date })
        },
        RequestedOpen: (event) => {
          expect(event.reason).type.toBe<DatePickerChangeReason>()
          return Msg.Opened()
        },
        RequestedClose: (event) => {
          expect(event.reason).type.toBe<DatePickerChangeReason>()
          return Msg.Closed()
        },
        RequestedMonth: (event) => {
          expect(event.month).type.toBe<DateTime.Utc>()
          return undefined
        }
      },
      view: (datePicker) => datePicker.input(h.input)
    })
  })

  it("requires value, open, month and today, and rejects other tags for its parts", () => {
    expect(DatePicker).type.not.toBeCallableWith(h, {
      props: { value: utc, month: utc, today: utc },
      view: () => h.div
    })
    expect(DatePicker).type.not.toBeCallableWith(h, {
      props: { value: "2026-11-15", open: false, month: utc, today: utc },
      view: () => h.div
    })
    DatePicker(h, {
      props: { value: null, open: false, month: utc, today: utc },
      view: (datePicker) => {
        expect(datePicker.input).type.not.toBeCallableWith(h.div)
        expect(datePicker.trigger).type.not.toBeCallableWith(h.div)
        expect(datePicker.positioner).type.not.toBeCallableWith(h.span)
        expect(datePicker.popup).type.not.toBeCallableWith(h.span)
        return datePicker.input(h.input)
      }
    })
  })
})
