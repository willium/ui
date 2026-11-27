// @vitest-environment happy-dom
import { UiSchema } from "@effect/ui"
import { Calendar, Field } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { DateTime, Effect, Schema } from "effect"
import { byId, click, container, tick } from "./utils/document.ts"

const utc = (iso: string) => DateTime.makeUnsafe(iso + "T00:00:00Z")

const Message = UiSchema.TaggedEnum({
  Jumped: {},
  Reset: {},
  RequestedMonth: { month: Schema.DateTimeUtc }
})

// The parent moves to a month whose days are all before its new `min`.
const november = { month: utc("2026-11-01"), min: utc("2026-12-01") }

const Page = Html.component({
  name: "Page",
  model: Schema.Struct({
    month: Schema.DateTimeUtc,
    min: Schema.NullOr(Schema.DateTimeUtc)
  }),
  message: Message
}).make({
  init: () => ({ month: utc("2026-12-01"), min: null }),
  update: {
    Jumped: () => november,
    Reset: () => ({ month: utc("2026-12-01"), min: null }),
    RequestedMonth: (_, { month }) => ({ ...november, month })
  },
  view: (h, model) =>
    h.div(
      h.button.attrs({ id: "jump", type: "button" }).on(
        "click",
        Message.Jumped()
      ),
      h.button.attrs({ id: "reset", type: "button" }).on(
        "click",
        Message.Reset()
      ),
      Calendar(h, {
        props: {
          value: null,
          month: model.month,
          today: utc("2026-12-15"),
          min: model.min ?? undefined,
          firstDayOfWeek: 0,
          locale: "en-US"
        },
        onEmit: {
          Picked: () => undefined,
          RequestedMonth: ({ month }) => Message.RequestedMonth({ month })
        },
        view: (calendar) =>
          calendar.root(h.div).children(
            ...calendar.months.map((month) =>
              month.grid(h.table).children(
                h.tbody(
                  ...month.weeks.map((week) =>
                    h.tr(
                      ...week.map((date) =>
                        month.cell({ element: h.td, date }).children(
                          month.day({
                            element: h.button.attr(
                              "id",
                              DateTime.formatIsoDateUtc(date)
                            ),
                            date
                          })
                        )
                      )
                    )
                  )
                )
              )
            )
          )
      })
    )
})

const FieldMessage = UiSchema.TaggedEnum({
  Applied: {},
  RequestedMonth: { month: Schema.DateTimeUtc }
})

// The parent holds a requested month until `apply` is clicked.
const FieldPage = Html.component({
  name: "FieldPage",
  model: Schema.Struct({
    month: Schema.DateTimeUtc,
    requested: Schema.DateTimeUtc
  }),
  message: FieldMessage
}).make({
  init: () => ({ month: utc("2026-12-01"), requested: utc("2026-12-01") }),
  update: {
    Applied: ($) => $.evolve({ month: $.model.requested }),
    RequestedMonth: ($, { month }) => $.evolve({ requested: month })
  },
  view: (h, model) =>
    h.div(
      h.button.attrs({ id: "apply", type: "button" }).on(
        "click",
        FieldMessage.Applied()
      ),
      Field(h, {
        view: (field) =>
          Calendar(h, {
            props: {
              value: null,
              month: model.month,
              today: utc("2026-12-15"),
              locale: "en-US"
            },
            onEmit: {
              Picked: () => undefined,
              RequestedMonth: ({ month }) =>
                FieldMessage.RequestedMonth({ month })
            },
            view: (calendar) =>
              calendar.root(field.group(h.div.attr("id", "group"))).children(
                // Keyed by month, so each month change replaces the grid.
                ...calendar.months.map((month) =>
                  month.grid(
                    h.table.key(DateTime.formatIsoDateUtc(month.month))
                  ).children(
                    h.tbody(
                      ...month.weeks.map((week) =>
                        h.tr(
                          ...week.map((date) =>
                            month.cell({ element: h.td, date }).children(
                              month.day({
                                element: field.member(
                                  h.button.attr(
                                    "id",
                                    DateTime.formatIsoDateUtc(date)
                                  )
                                ),
                                date
                              })
                            )
                          )
                        )
                      )
                    )
                  )
                )
              )
          })
      })
    )
})

const MonthsMessage = UiSchema.TaggedEnum({
  RequestedMonth: { month: Schema.DateTimeUtc }
})

const TwoMonths = Html.component({
  name: "TwoMonths",
  model: Schema.Struct({ month: Schema.DateTimeUtc }),
  message: MonthsMessage
}).make({
  init: () => ({ month: utc("2026-11-01") }),
  update: {
    RequestedMonth: ($, { month }) => $.evolve({ month })
  },
  view: (h, model) =>
    Calendar(h, {
      props: {
        value: null,
        month: model.month,
        months: 2,
        today: utc("2026-11-15"),
        firstDayOfWeek: 1,
        locale: "en-US"
      },
      onEmit: {
        Picked: () => undefined,
        RequestedMonth: ({ month }) => MonthsMessage.RequestedMonth({ month })
      },
      view: (calendar) =>
        calendar.root(h.div).children(
          ...calendar.months.map((month, index) =>
            month.grid(h.table).children(
              h.tbody(
                ...month.weeks.map((week) =>
                  h.tr(
                    ...week.map((date) =>
                      month.cell({ element: h.td, date }).children(
                        month.day({
                          element: h.button.attr(
                            "id",
                            index + "-" + DateTime.formatIsoDateUtc(date)
                          ),
                          date
                        })
                      )
                    )
                  )
                )
              )
            )
          )
        )
    })
})

// A browser blurs an element that has focus as it leaves the document.
const blurOnRemoval = Effect.acquireRelease(
  Effect.sync(() => {
    const proto = window.Node.prototype
    const removeChild = proto.removeChild
    proto.removeChild = function<T extends Node>(this: Node, child: T): T {
      const active = document.activeElement as HTMLElement | null
      if (active !== null && child.contains(active)) active.blur()
      return removeChild.call(this, child) as T
    }
    return removeChild
  }),
  (removeChild) =>
    Effect.sync(() => (window.Node.prototype.removeChild = removeChild))
)

const keydown = (id: string, key: string) =>
  byId(id).dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
  )

describe("Calendar in a document", { concurrent: false }, () => {
  it.effect("a month change moves focus to the new tab stop, even outside the shown month", () =>
    Effect.gen(function*() {
      yield* BrowserHost.mountEffect(Page, {}, yield* container)
      yield* tick
      const landsOnFirst = Effect.fnUntraced(function*(change: () => void) {
        byId("2026-12-15").focus()
        yield* tick
        change()
        yield* tick
        assert.strictEqual(byId("2026-12-01").getAttribute("tabindex"), "0")
        assert.strictEqual(document.activeElement?.id, "2026-12-01")
        click(byId("reset"))
        yield* tick
      })
      // The parent changes `month` on its own
      yield* landsOnFirst(() => click(byId("jump")))
      // The parent accepts a keyboard month request
      yield* landsOnFirst(() => keydown("2026-12-15", "PageUp"))
    }).pipe(Effect.scoped))

  it.effect("a month change keeps focus inside the calendar, unless the user left", () =>
    Effect.gen(function*() {
      yield* blurOnRemoval
      yield* BrowserHost.mountEffect(FieldPage, {}, yield* container)
      yield* tick
      byId("2026-12-15").focus()
      yield* tick
      keydown("2026-12-15", "PageDown")
      yield* tick
      // `click` sends the event without moving focus.
      click(byId("apply"))
      yield* tick
      assert.strictEqual(document.activeElement?.id, "2027-01-15")
      assert.isFalse(byId("group").hasAttribute("data-touched"))

      keydown("2027-01-15", "PageDown")
      yield* tick
      byId("apply").focus()
      yield* tick
      assert.isTrue(byId("group").hasAttribute("data-touched"))
      click(byId("apply"))
      yield* tick
      assert.isNotNull(document.getElementById("2027-02-15"))
      assert.strictEqual(document.activeElement?.id, "apply")
    }).pipe(Effect.scoped))

  it.effect("keyboard focus crosses grids to the day's own month, not its copy", () =>
    Effect.gen(function*() {
      yield* BrowserHost.mountEffect(TwoMonths, {}, yield* container)
      yield* tick
      byId("0-2026-11-30").focus()
      yield* tick
      keydown("0-2026-11-30", "ArrowRight")
      yield* tick
      assert.strictEqual(document.activeElement?.id, "1-2026-12-01")

      byId("1-2026-12-31").focus()
      yield* tick
      keydown("1-2026-12-31", "ArrowRight")
      yield* tick
      // The window moves to December and January.
      assert.strictEqual(document.activeElement?.id, "1-2027-01-01")
    }).pipe(Effect.scoped))
})
