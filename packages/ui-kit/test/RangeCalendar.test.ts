import { UiSchema } from "@effect/ui"
import { RangeCalendar } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { HtmlPlay } from "@effect/ui/html/testing"
import { Locator, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { DateTime, Effect, Schema } from "effect"

const utc = (day: number): DateTime.Utc =>
  DateTime.makeUnsafe(`2026-11-${String(day).padStart(2, "0")}T00:00:00Z`)

const Range = Schema.Struct({
  start: Schema.DateTimeUtc,
  end: Schema.DateTimeUtc
})

const StayMessage = UiSchema.TaggedEnum({
  Locked: {},
  Picked: { start: Schema.DateTimeUtc, end: Schema.DateTimeUtc },
  RequestedMonth: { month: Schema.DateTimeUtc }
})

const Stay = Html.component({
  name: "Stay",
  props: Schema.Struct({
    lock: Schema.optional(Schema.Literals(["disabled", "readOnly"])),
    unavailable: Schema.optional(Schema.Number)
  }),
  model: Schema.Struct({ value: Schema.NullOr(Range), locked: Schema.Boolean }),
  message: StayMessage
}).make({
  init: () => ({ value: { start: utc(2), end: utc(4) }, locked: false }),
  update: {
    Locked: ($) => $.evolve({ locked: true }),
    Picked: ($, { end, start }) => $.evolve({ value: { start, end } }),
    RequestedMonth: ($) => $.model
  },
  view: (h, model) =>
    h.div(
      h.button.class("lock").on("click", StayMessage.Locked()),
      h.output.class("picked").children(
        model.value === null
          ? ""
          : DateTime.formatIsoDateUtc(model.value.start) + "/" +
            DateTime.formatIsoDateUtc(model.value.end)
      ),
      RangeCalendar(h, {
        props: {
          value: model.value,
          month: utc(1),
          today: utc(26),
          locale: "en-US",
          disabled: model.locked && h.props.lock === "disabled",
          readOnly: model.locked && h.props.lock === "readOnly"
        },
        onEmit: {
          Picked: ({ end, start }) => StayMessage.Picked({ start, end }),
          RequestedMonth: ({ month }) => StayMessage.RequestedMonth({ month })
        },
        view: (rangeCalendar) => {
          const [month] = rangeCalendar.months
          return rangeCalendar.root(h.div).children(
            month.grid(
              h.table.class("grid").attr("aria-multiselectable", "false")
            ).children(
              h.tbody(
                ...month.weeks.map((week) =>
                  h.tr(
                    ...week.map((date) => {
                      const day = DateTime.getPartUtc(date, "month") === 11
                        ? DateTime.getPartUtc(date, "day")
                        : 0
                      return month.cell({
                        element: h.td.attr("aria-selected", "mixed").class(
                          "cell-" + day
                        ),
                        date
                      }).children(
                        month.day({
                          element: h.button.attrs({
                            class: "day-" + day,
                            "data-selected": "x",
                            "data-range-start": "x",
                            "data-range-end": "x",
                            "data-in-range": "x"
                          }),
                          date,
                          unavailable: day === h.props.unavailable
                        }).children(String(day))
                      )
                    })
                  )
                )
              )
            )
          )
        }
      })
    )
})

const day = (n: number) => Locator.attr("class", "day-" + n)

type Play = {
  readonly root: { readonly get: (locator: Locator.Locator) => Locator.Node }
}

const span = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i)

const november = span(1, 30)

// The days of November marked by each attribute, in order.
const shows = (
  play: Play,
  selected: ReadonlyArray<number>,
  shown: ReadonlyArray<number>
) => {
  const marked = (name: string) =>
    november.filter((n) => play.root.get(day(n)).attrs?.[name] !== undefined)
  assert.deepStrictEqual({
    selected: november.filter((n) =>
      play.root.get(Locator.attr("class", "cell-" + n)).attrs?.[
        "aria-selected"
      ] === "true"
    ),
    dataSelected: marked("data-selected"),
    start: marked("data-range-start"),
    end: marked("data-range-end"),
    inRange: marked("data-in-range")
  }, {
    selected,
    dataSelected: selected,
    start: shown.slice(0, 1),
    end: shown.slice(-1),
    inRange: shown
  })
}

describe("RangeCalendar", () => {
  it.effect("picks a range in either order, previewing it from the anchor to the day hovered or focused", () =>
    Effect.gen(function*() {
      const play = yield* HtmlPlay.make(Stay, {})
      shows(play, span(2, 4), span(2, 4))
      assert.strictEqual(
        play.root.get(Locator.attr("class", "grid")).attrs?.[
          "aria-multiselectable"
        ],
        "true"
      )

      yield* play.click(day(12))
      yield* play.fire(day(15), "mouseenter")
      yield* play.click(day(15))

      yield* play.click(day(20))
      yield* play.fire(day(17), "focus")
      shows(play, span(12, 15), span(17, 20))
      yield* play.click(day(17))
      yield* play.expect(Locator.attr("class", "picked")).toHaveText(
        "2026-11-17/2026-11-20"
      )
    }).pipe(Effect.scoped, Effect.provide(TestHost.layer())))

  it.effect("Escape clears the anchor, and keeps its default without one", () =>
    Effect.gen(function*() {
      const play = yield* HtmlPlay.make(Stay, {})
      yield* play.click(day(12))
      yield* play.keydown(day(12), "Escape")
      shows(play, span(2, 4), span(2, 4))
      yield* play.keydown(day(12), "Escape")
      yield* play.expectIgnored()
    }).pipe(Effect.scoped, Effect.provide(TestHost.layer())))

  it.effect("an unavailable day is neither an anchor nor an end, but a range spans it", () =>
    Effect.gen(function*() {
      const play = yield* HtmlPlay.make(Stay, { unavailable: 14 })
      yield* play.click(day(14))
      yield* play.click(day(12))
      yield* play.click(day(14))
      yield* play.click(day(16))
      shows(play, span(12, 16), span(12, 16))
    }).pipe(Effect.scoped, Effect.provide(TestHost.layer())))

  it.effect("disabled hides the anchor and its preview", () =>
    Effect.gen(function*() {
      const play = yield* HtmlPlay.make(Stay, { lock: "disabled" })
      yield* play.click(day(12))
      yield* play.click(Locator.attr("class", "lock"))
      shows(play, span(2, 4), span(2, 4))
    }).pipe(Effect.scoped, Effect.provide(TestHost.layer())))

  it.effect("read-only hides the anchor and its preview", () =>
    Effect.gen(function*() {
      const play = yield* HtmlPlay.make(Stay, { lock: "readOnly" })
      yield* play.click(day(12))
      yield* play.click(Locator.attr("class", "lock"))
      shows(play, span(2, 4), span(2, 4))
    }).pipe(Effect.scoped, Effect.provide(TestHost.layer())))

  it.effect("previews and picks a range across visible months without previewing disabled duplicate days", () =>
    Effect.gen(function*() {
      const MultiMonthStay = Html.component({
        name: "MultiMonthStay",
        model: Schema.Struct({ value: Schema.NullOr(Range) }),
        message: StayMessage
      }).make({
        init: () => ({ value: null }),
        update: {
          Locked: ($) => $.model,
          Picked: ($, { end, start }) => $.evolve({ value: { start, end } }),
          RequestedMonth: ($) => $.model
        },
        view: (h, model) =>
          h.div(
            h.output.class("picked").children(
              model.value === null
                ? ""
                : DateTime.formatIsoDateUtc(model.value.start) + "/" +
                  DateTime.formatIsoDateUtc(model.value.end)
            ),
            RangeCalendar(h, {
              props: {
                value: model.value,
                month: utc(1),
                today: utc(26),
                months: 2,
                firstDayOfWeek: 1,
                locale: "en-US"
              },
              onEmit: {
                Picked: ({ end, start }) => StayMessage.Picked({ start, end }),
                RequestedMonth: ({ month }) =>
                  StayMessage.RequestedMonth({ month })
              },
              view: (rangeCalendar) =>
                rangeCalendar.root(h.div).children(
                  ...rangeCalendar.months.map((month, monthIndex) =>
                    month.grid(h.table.class("grid-" + monthIndex)).children(
                      h.tbody(
                        ...month.weeks.map((week) =>
                          h.tr(
                            ...week.map((date) => {
                              const key = DateTime.formatIsoDateUtc(date)
                              return month.cell({ element: h.td, date })
                                .children(
                                  month.day({
                                    element: h.button.class(
                                      `day-${monthIndex}-${key}`
                                    ),
                                    date
                                  }).children(key)
                                )
                            })
                          )
                        )
                      )
                    )
                  )
                )
            })
          )
      })

      const dayIn = (monthIndex: number, iso: string) =>
        Locator.attr("class", `day-${monthIndex}-${iso}`)
      const play = yield* HtmlPlay.make(MultiMonthStay, {})

      yield* play.click(dayIn(0, "2026-11-28"))
      yield* play.fire(dayIn(1, "2026-12-03"), "mouseenter")

      assert.strictEqual(
        play.root.get(dayIn(0, "2026-11-28")).attrs?.["data-range-start"],
        ""
      )
      assert.strictEqual(
        play.root.get(dayIn(0, "2026-11-30")).attrs?.["data-in-range"],
        ""
      )
      assert.strictEqual(
        play.root.get(dayIn(1, "2026-12-01")).attrs?.["data-in-range"],
        ""
      )
      assert.strictEqual(
        play.root.get(dayIn(1, "2026-12-03")).attrs?.["data-range-end"],
        ""
      )

      // Hovering the disabled duplicate Dec 1 in November's grid does not alter the preview
      yield* play.fire(dayIn(0, "2026-12-01"), "mouseenter")
      yield* play.expectIgnored()
      assert.strictEqual(
        play.root.get(dayIn(1, "2026-12-03")).attrs?.["data-range-end"],
        ""
      )

      yield* play.click(dayIn(1, "2026-12-03"))
      yield* play.expect(Locator.attr("class", "picked")).toHaveText(
        "2026-11-28/2026-12-03"
      )
    }).pipe(Effect.scoped, Effect.provide(TestHost.layer())))
})
