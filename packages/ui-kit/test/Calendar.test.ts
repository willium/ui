import type { Component, Mount, View } from "@effect/ui"
import { View as V } from "@effect/ui"
import {
  Calendar,
  CalendarEvents,
  type CalendarProps,
  DirectionProvider
} from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { HtmlScene } from "@effect/ui/html/testing"
import { Locator, Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { DateTime, Effect } from "effect"

type Parts = Component.Headless.Parts<typeof Calendar>
type H = View.Helper<never, CalendarProps> & View.Tags<Html.Elements, never>

const utc = (iso: string): DateTime.Utc =>
  DateTime.makeUnsafe(iso + "T00:00:00Z")
const iso = (date: DateTime.Utc): string => DateTime.formatIsoDateUtc(date)

const consumer = <B extends { attr(name: string, value: string): B }>(
  builder: B,
  attrs: Record<string, string>
) =>
  Object.entries(attrs).reduce(
    (b, [name, value]) => b.attr(name, value),
    builder
  )

const ownedDay = {
  type: "submit",
  tabindex: "4",
  disabled: "",
  "aria-label": "Custom day",
  "aria-disabled": "true",
  "aria-current": "step",
  "data-selected": "x",
  "data-today": "x",
  "data-outside-month": "x",
  "data-unavailable": "x",
  "data-disabled": "x",
  "data-focused": "x"
}

const makeStandIn = (unavailable: ReadonlySet<string> = new Set()) => ({
  elements: Html,
  view: (calendar: Parts, h: H) => {
    const [month] = calendar.months
    return calendar.root(
      consumer(h.div.class("root"), {
        "data-disabled": "x",
        "data-readonly": "x",
        "data-keep": "yes"
      })
    ).children(
      month.heading(
        consumer(h.h2.class("heading"), {
          id: "mine",
          "aria-live": "assertive",
          "data-disabled": "x",
          "data-readonly": "x"
        })
      ).children(month.title),
      calendar.previous(
        consumer(h.button.class("prev"), {
          type: "submit",
          disabled: "",
          "aria-disabled": "true",
          "data-disabled": "x"
        })
      ).children("‹"),
      calendar.next(
        consumer(h.button.class("next"), {
          type: "submit",
          disabled: "",
          "aria-disabled": "true",
          "data-disabled": "x"
        })
      ).children("›"),
      month.grid(
        consumer(h.table.class("grid"), {
          role: "presentation",
          "aria-labelledby": "elsewhere",
          "aria-disabled": "true",
          "aria-readonly": "true",
          "data-disabled": "x",
          "data-readonly": "x"
        })
      ).children(
        h.thead(
          h.tr(
            ...calendar.weekdays.map((weekday, index) =>
              calendar.weekday({
                element: consumer(h.th.class("weekday-" + index), {
                  scope: "row",
                  abbr: "Wrong"
                }),
                index
              }).children(weekday.short)
            )
          )
        ),
        h.tbody(
          ...month.weeks.map((week) =>
            h.tr(
              ...week.map((date) => {
                const key = iso(date)
                return month.cell({
                  element: consumer(h.td.class("cell-" + key), {
                    role: "cell",
                    "aria-selected": "mixed"
                  }),
                  date
                }).children(
                  month.day({
                    element: consumer(
                      h.button.class("day-" + key).attr("data-custom", key),
                      ownedDay
                    ),
                    date,
                    unavailable: unavailable.has(key)
                  }).children(String(DateTime.getPartUtc(date, "day")))
                )
              })
            )
          )
        )
      )
    )
  }
})

const loc = (name: string) => Locator.attr("class", name)
const dayLoc = (date: string) => loc("day-" + date)
const cellLoc = (date: string) => loc("cell-" + date)

const baseProps = (extra: Partial<CalendarProps> = {}): CalendarProps => ({
  value: utc("2026-11-15"),
  month: utc("2026-11-01"),
  today: utc("2026-11-26"),
  locale: "en-US",
  ...extra
})

type Issued = Mount.Issued<unknown, never, never, unknown>
type Rendered = { readonly get: (locator: Locator.Locator) => Locator.Node }
const mountOf = (scene: Rendered, locator: Locator.Locator): Issued =>
  (scene.get(locator) as unknown as View.Element<unknown>).owned?.find((
    layer
  ) => layer.mount !== undefined)?.mount as unknown as Issued

const makeScene = (
  initial: CalendarProps = baseProps(),
  unavailable: ReadonlySet<string> = new Set()
) =>
  HtmlScene.make(Calendar, initial, makeStandIn(unavailable)).pipe(
    Effect.map((scene) => {
      scene.expectMount(mountOf(scene, loc("root")))
      return scene
    })
  )

type Scene = Effect.Success<ReturnType<typeof makeScene>>

const owns = (
  scene: Scene,
  locator: Locator.Locator,
  expected: Record<string, string | undefined>
) => {
  const attrs = scene.get(locator).attrs ?? {}
  for (const [name, value] of Object.entries(expected)) {
    assert.strictEqual(attrs[name], value, name)
  }
}

const focused = (scene: Scene): ReadonlyArray<string> =>
  scene.current.pending.map(({ command }) => {
    scene.resolve(command as never, { found: true } as never)
    return (command.args as { readonly ref: { readonly key: string } }).ref.key
      .replace(/^CalendarDay\[(.*)\]$/, "$1")
  })

const syncMonth = (scene: Scene, next: CalendarProps) => {
  scene.props(next)
  const sub = scene.subscriptions.find((key) => key.startsWith("syncedMonth"))
  if (sub !== undefined) {
    scene.subscription(sub, { _tag: "SyncedMonth" } as never)
  }
  // A focused day parks focus on the root before its month goes.
  const park = scene.current.pending.find(({ command }) =>
    (command.args as { readonly ref: { readonly key: string } }).ref.key ===
      "CalendarRoot"
  )
  if (park !== undefined) {
    scene.resolve(park.command as never, { found: true } as never)
  }
  return scene
}

describe("Calendar", () => {
  it.effect("parts carry roles, ARIA, data attributes, part values, and override consumer-owned attributes", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene(
        baseProps({
          min: utc("2026-11-05"),
          max: utc("2026-11-28"),
          firstDayOfWeek: 1
        }),
        new Set(["2026-11-18"])
      )

      scene.parts((calendar) => {
        const [month] = calendar.months
        assert.strictEqual(calendar.months.length, 1)
        assert.strictEqual(iso(month.month), "2026-11-01")
        assert.strictEqual(month.title, "November 2026")
        assert.strictEqual(calendar.weekdays.length, 7)
        assert.strictEqual(calendar.weekdays[0]!.long, "Monday")
        assert.strictEqual(calendar.weekdays[6]!.long, "Sunday")
        // Nov 2026 starting Monday: Oct 26 .. Dec 6 (6 weeks)
        assert.strictEqual(month.weeks.length, 6)
        assert.strictEqual(iso(month.weeks[0]![0]!), "2026-10-26")
        assert.strictEqual(iso(month.weeks[5]![6]!), "2026-12-06")
      })

      const headingId = scene.get(loc("heading")).attrs!.id!
      assert.notStrictEqual(headingId, "mine")

      owns(scene, loc("root"), {
        class: "root",
        "data-keep": "yes",
        "data-disabled": undefined,
        "data-readonly": undefined
      })
      owns(scene, loc("heading"), {
        class: "heading",
        id: headingId,
        "aria-live": "polite",
        "data-disabled": undefined,
        "data-readonly": undefined
      })
      // min is Nov 5 and max is Nov 28, so both previous and next are disabled
      owns(scene, loc("prev"), {
        type: "button",
        disabled: "",
        "aria-disabled": undefined,
        "aria-label": "Previous month",
        "data-disabled": ""
      })
      owns(scene, loc("next"), {
        type: "button",
        disabled: "",
        "aria-disabled": undefined,
        "aria-label": "Next month",
        "data-disabled": ""
      })
      owns(scene, loc("grid"), {
        role: "grid",
        "aria-labelledby": "elsewhere " + headingId,
        "aria-disabled": undefined,
        "aria-readonly": undefined,
        "data-disabled": undefined,
        "data-readonly": undefined
      })
      owns(scene, loc("weekday-0"), { scope: "col", abbr: "Monday" })
      owns(scene, loc("weekday-6"), { scope: "col", abbr: "Sunday" })

      owns(scene, cellLoc("2026-11-15"), {
        role: "gridcell",
        "aria-selected": "true"
      })
      owns(scene, dayLoc("2026-11-15"), {
        type: "button",
        tabindex: "0",
        disabled: undefined,
        "aria-label": "Sunday, November 15, 2026",
        "aria-disabled": undefined,
        "aria-current": undefined,
        "data-selected": "",
        "data-today": undefined,
        "data-outside-month": undefined,
        "data-unavailable": undefined,
        "data-disabled": undefined,
        "data-focused": undefined,
        "data-custom": "2026-11-15"
      })

      owns(scene, cellLoc("2026-11-26"), {
        role: "gridcell",
        "aria-selected": "false"
      })
      owns(scene, dayLoc("2026-11-26"), {
        tabindex: "-1",
        "aria-current": "date",
        "data-today": "",
        "data-selected": undefined
      })

      owns(scene, dayLoc("2026-10-26"), {
        disabled: "",
        tabindex: "-1",
        "aria-disabled": undefined,
        "data-outside-month": "",
        "data-disabled": ""
      })

      owns(scene, dayLoc("2026-11-29"), {
        disabled: "",
        tabindex: "-1",
        "data-disabled": "",
        "data-outside-month": undefined
      })

      owns(scene, dayLoc("2026-11-18"), {
        disabled: undefined,
        "aria-disabled": "true",
        "data-unavailable": "",
        "data-disabled": undefined
      })

      scene.focus(dayLoc("2026-11-20"))
      owns(scene, dayLoc("2026-11-20"), { "data-focused": "", tabindex: "0" })
      owns(scene, dayLoc("2026-11-15"), {
        "data-focused": undefined,
        tabindex: "-1"
      })

      // Default firstDayOfWeek comes from the locale, including a `-u-fw-` override
      const us = yield* makeScene(baseProps({ locale: "en-US" }))
      us.parts((cal) => assert.strictEqual(cal.weekdays[0]!.long, "Sunday"))
      const fw = yield* makeScene(baseProps({ locale: "en-US-u-fw-mon" }))
      fw.parts((cal) => assert.strictEqual(cal.weekdays[0]!.long, "Monday"))
      // Labels use the grid's Gregorian months, in the locale's digits
      const fa = yield* makeScene(baseProps({ locale: "fa-IR" }))
      fa.parts((cal) => assert.include(cal.months[0].title, "۲۰۲۶"))

      const h = V.makeHelper<never, {}, Html.Elements>({}, Html)
      const p = Story.parts(Calendar, {
        model: {
          focusedDay: null,
          focused: false,
          shownMonth: utc("2026-11-01"),
          shownMonths: 1,
          pendingFocus: null,
          rtl: false
        },
        props: baseProps()
      })
      assert.throws(() => p.weekday({ element: h.th, index: 7 }))
      assert.throws(() => p.weekday({ element: h.th, index: -1 }))
      assert.throws(() =>
        p.months[0].day({ element: h.div as never, date: utc("2026-11-15") })
      )
      assert.throws(() => p.previous(h.div as never))
      assert.throws(() => p.months[0].grid(h.div as never))
    }))

  it.effect("emits Picked and RequestedMonth, and moves focus on month change", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene(
        baseProps({
          value: null,
          month: utc("2026-01-15"),
          today: utc("2026-01-10"),
          min: utc("2025-12-31"),
          max: utc("2026-02-01")
        })
      )

      // Initial tab stop is today when value is null
      owns(scene, dayLoc("2026-01-10"), { tabindex: "0" })

      scene.click(dayLoc("2026-01-31")).emitted(
        CalendarEvents.Picked({ date: utc("2026-01-31") })
      )

      scene.click(loc("prev")).emitted(
        CalendarEvents.RequestedMonth({ month: utc("2025-12-01") })
      )
      scene.click(loc("next")).emitted(
        CalendarEvents.RequestedMonth({ month: utc("2026-02-01") })
      )

      // Preserve the day of the month, clamping to February's last day.
      scene.focus(dayLoc("2026-01-31"))
      syncMonth(
        scene,
        baseProps({
          value: null,
          month: utc("2026-02-01"),
          today: utc("2026-01-10")
        })
      )
      owns(scene, dayLoc("2026-02-28"), { tabindex: "0" })
      assert.deepStrictEqual(focused(scene), ["2026-02-28"])

      // Changing month to one containing value moves focus stop to value
      syncMonth(
        scene,
        baseProps({
          value: utc("2026-03-12"),
          month: utc("2026-03-01"),
          today: utc("2026-01-10")
        })
      )
      owns(scene, dayLoc("2026-03-12"), { tabindex: "0" })
      assert.deepStrictEqual(focused(scene), ["2026-03-12"])
    }))

  it.effect("handles every APG grid key, RTL swap, cross-month requests (accepted and refused), and min/max clamping", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene(
        baseProps({
          value: null,
          month: utc("2026-11-01"),
          today: utc("2026-11-15"),
          firstDayOfWeek: 0
        })
      )

      scene.focus(dayLoc("2026-11-15"))

      assert.deepStrictEqual(
        focused(
          scene.keydown(dayLoc("2026-11-15"), "ArrowRight")
            .expectDefaultPrevented()
        ),
        ["2026-11-16"]
      )
      assert.deepStrictEqual(
        focused(
          scene.keydown(dayLoc("2026-11-16"), "ArrowLeft")
            .expectDefaultPrevented()
        ),
        ["2026-11-15"]
      )
      assert.deepStrictEqual(
        focused(
          scene.keydown(dayLoc("2026-11-15"), "ArrowDown")
            .expectDefaultPrevented()
        ),
        ["2026-11-22"]
      )
      assert.deepStrictEqual(
        focused(
          scene.keydown(dayLoc("2026-11-22"), "ArrowUp")
            .expectDefaultPrevented()
        ),
        ["2026-11-15"]
      )

      assert.deepStrictEqual(
        focused(
          scene.keydown(dayLoc("2026-11-18"), "Home").expectDefaultPrevented()
        ),
        ["2026-11-15"]
      )
      assert.deepStrictEqual(
        focused(
          scene.keydown(dayLoc("2026-11-18"), "End").expectDefaultPrevented()
        ),
        ["2026-11-21"]
      )

      scene.keydown(dayLoc("2026-11-15"), "ArrowRight", { alt: true })
        .expectIgnored().expectDefaultPrevented(false)
      scene.keydown(dayLoc("2026-11-15"), "Enter")
        .expectIgnored().expectDefaultPrevented(false)

      scene.shared(DirectionProvider, { direction: "rtl" })
      assert.deepStrictEqual(
        focused(
          scene.keydown(dayLoc("2026-11-15"), "ArrowLeft")
            .expectDefaultPrevented()
        ),
        ["2026-11-16"]
      )
      assert.deepStrictEqual(
        focused(
          scene.keydown(dayLoc("2026-11-16"), "ArrowRight")
            .expectDefaultPrevented()
        ),
        ["2026-11-15"]
      )
      scene.shared(DirectionProvider, { direction: "ltr" })

      // Leaving shown month: consumer refuses -> focus stays in shown month
      scene.focus(dayLoc("2026-11-30"))
      scene.keydown(dayLoc("2026-11-30"), "ArrowRight")
        .expectDefaultPrevented()
        .emitted(CalendarEvents.RequestedMonth({ month: utc("2026-12-01") }))
      assert.deepStrictEqual(focused(scene), [])
      owns(scene, dayLoc("2026-11-30"), { tabindex: "0", "data-focused": "" })

      // PageDown -> consumer accepts -> focus lands on target day in Dec
      scene.keydown(dayLoc("2026-11-30"), "PageDown")
        .expectDefaultPrevented()
        .emitted(CalendarEvents.RequestedMonth({ month: utc("2026-12-01") }))
      syncMonth(
        scene,
        baseProps({
          value: null,
          month: utc("2026-12-01"),
          today: utc("2026-11-15"),
          firstDayOfWeek: 0
        })
      )
      assert.deepStrictEqual(focused(scene), ["2026-12-30"])
      owns(scene, dayLoc("2026-12-30"), { tabindex: "0" })

      scene.keydown(dayLoc("2026-12-30"), "PageUp")
        .expectDefaultPrevented()
        .emitted(CalendarEvents.RequestedMonth({ month: utc("2026-11-01") }))
      scene.keydown(dayLoc("2026-12-30"), "PageUp", { shift: true })
        .expectDefaultPrevented()
        .emitted(CalendarEvents.RequestedMonth({ month: utc("2025-12-01") }))
      scene.keydown(dayLoc("2026-12-30"), "PageDown", { shift: true })
        .expectDefaultPrevented()
        .emitted(CalendarEvents.RequestedMonth({ month: utc("2027-12-01") }))

      // Min/max clamping keeps focus within bounds without leaving month
      const bounded = yield* makeScene(
        baseProps({
          value: null,
          month: utc("2026-11-01"),
          today: utc("2026-11-15"),
          min: utc("2026-11-10"),
          max: utc("2026-11-20")
        })
      )
      bounded.focus(dayLoc("2026-11-15"))
      assert.deepStrictEqual(
        focused(bounded.keydown(dayLoc("2026-11-15"), "ArrowDown")),
        ["2026-11-20"]
      )
      bounded.keydown(dayLoc("2026-11-20"), "ArrowRight")
      assert.deepStrictEqual(bounded.current.emitted, [])
      assert.deepStrictEqual(focused(bounded), [])
      assert.deepStrictEqual(
        focused(bounded.keydown(dayLoc("2026-11-20"), "PageUp")),
        ["2026-11-10"]
      )
      assert.deepStrictEqual(bounded.current.emitted, [])

      // With no day of the shown month in range, a rendered day in range is the tab stop
      const later = yield* makeScene(
        baseProps({ value: null, firstDayOfWeek: 0, min: utc("2026-12-01") })
      )
      owns(later, dayLoc("2026-12-01"), { tabindex: "0" })
    }))

  it.effect("unavailable days stay focusable and reachable by arrow keys, and never emit Picked", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene(
        baseProps({ value: null, today: utc("2026-11-15") }),
        new Set(["2026-11-16"])
      )

      scene.focus(dayLoc("2026-11-15"))
      assert.deepStrictEqual(
        focused(scene.keydown(dayLoc("2026-11-15"), "ArrowRight")),
        ["2026-11-16"]
      )
      scene.focus(dayLoc("2026-11-16"))
      owns(scene, dayLoc("2026-11-16"), { tabindex: "0", "data-focused": "" })

      scene.click(dayLoc("2026-11-16")).expectDefaultPrevented()
      assert.deepStrictEqual(scene.current.emitted, [])
    }))

  it.effect("disabled suppresses all interactions, disables buttons natively, and clears focus state", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene(baseProps({ disabled: false }))
      scene.focus(dayLoc("2026-11-15"))
      owns(scene, dayLoc("2026-11-15"), { "data-focused": "" })

      scene.props(baseProps({ disabled: true }))
      owns(scene, loc("root"), { "data-disabled": "" })
      owns(scene, loc("grid"), {
        "aria-disabled": "true",
        "data-disabled": ""
      })
      owns(scene, loc("prev"), { disabled: "", "data-disabled": "" })
      owns(scene, loc("next"), { disabled: "", "data-disabled": "" })
      owns(scene, dayLoc("2026-11-15"), {
        disabled: "",
        tabindex: "-1",
        "data-disabled": "",
        "data-focused": undefined
      })

      scene.fire(dayLoc("2026-11-15"), "click")
      assert.deepStrictEqual(scene.current.emitted, [])
      scene.fire(loc("prev"), "click")
      assert.deepStrictEqual(scene.current.emitted, [])
      scene.fire(loc("next"), "click")
      assert.deepStrictEqual(scene.current.emitted, [])
      scene.fire(dayLoc("2026-11-15"), "focus")
      scene.keydown(dayLoc("2026-11-15"), "ArrowRight").expectIgnored()
      assert.deepStrictEqual(scene.current.emitted, [])
      assert.deepStrictEqual(scene.current.pending, [])

      // Re-enabling after disabledWhileFocused keeps data-focused cleared
      const sub = scene.subscriptions.find((key) =>
        key.startsWith("disabledWhileFocused")
      )
      if (sub !== undefined) {
        scene.subscription(sub, { _tag: "BlurredDay" } as never)
      }
      scene.props(baseProps({ disabled: false }))
      owns(scene, dayLoc("2026-11-15"), { "data-focused": undefined })
    }))

  it.effect("read-only allows navigation and month requests but suppresses Picked", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene(baseProps({ readOnly: true }))

      owns(scene, loc("root"), { "data-readonly": "" })
      owns(scene, loc("grid"), {
        "aria-readonly": "true",
        "data-readonly": ""
      })

      scene.focus(dayLoc("2026-11-15"))
      assert.deepStrictEqual(
        focused(scene.keydown(dayLoc("2026-11-15"), "ArrowRight")),
        ["2026-11-16"]
      )
      scene.click(loc("next")).emitted(
        CalendarEvents.RequestedMonth({ month: utc("2026-12-01") })
      )

      scene.click(dayLoc("2026-11-16"))
      assert.deepStrictEqual(scene.current.emitted, [])
    }))

  it.effect("Zoned value and today whose UTC day differs from their local day show their local day", () =>
    Effect.gen(function*() {
      // 2026-11-26T02:00:00Z is Nov 25 in America/Los_Angeles (UTC-8)
      const zonedValue = DateTime.makeZonedUnsafe("2026-11-26T02:00:00Z", {
        timeZone: "America/Los_Angeles"
      })
      // 2026-11-26T22:00:00Z is Nov 27 in Pacific/Auckland (UTC+13)
      const zonedToday = DateTime.makeZonedUnsafe("2026-11-26T22:00:00Z", {
        timeZone: "Pacific/Auckland"
      })
      const scene = yield* makeScene({
        value: zonedValue,
        month: zonedValue,
        today: zonedToday,
        locale: "en-US"
      })

      owns(scene, cellLoc("2026-11-25"), { "aria-selected": "true" })
      owns(scene, cellLoc("2026-11-26"), { "aria-selected": "false" })
      owns(scene, dayLoc("2026-11-26"), { "data-today": undefined })
      owns(scene, dayLoc("2026-11-27"), { "data-today": "" })

      scene.click(dayLoc("2026-11-25")).emitted(
        CalendarEvents.Picked({ date: utc("2026-11-25") })
      )
    }))

  it.effect("shows multiple consecutive months with one tab stop, disabled duplicate outside days, and cross-grid keyboard navigation", () =>
    Effect.gen(function*() {
      const dayIn = (monthIndex: number, date: string) =>
        loc(`day-${monthIndex}-${date}`)
      const scene = yield* HtmlScene.make(
        Calendar,
        baseProps({
          value: utc("2026-11-15"),
          month: utc("2026-11-01"),
          today: utc("2026-11-26"),
          months: 2,
          firstDayOfWeek: 1
        }),
        {
          elements: Html,
          view: (calendar: Parts, h: H) =>
            calendar.root(h.div.class("root")).children(
              calendar.previous(h.button.class("prev")).children("‹"),
              calendar.next(h.button.class("next")).children("›"),
              ...calendar.months.map((month, monthIndex) =>
                h.section(
                  month.heading(h.h2.class("heading-" + monthIndex)).children(
                    month.title
                  ),
                  month.grid(h.table.class("grid-" + monthIndex)).children(
                    h.tbody(
                      ...month.weeks.map((week) =>
                        h.tr(
                          ...week.map((date) => {
                            const key = iso(date)
                            return month.cell({ element: h.td, date }).children(
                              month.day({
                                element: h.button.class(
                                  `day-${monthIndex}-${key}`
                                ),
                                date
                              }).children(
                                String(DateTime.getPartUtc(date, "day"))
                              )
                            )
                          })
                        )
                      )
                    )
                  )
                )
              )
            )
        }
      ).pipe(
        Effect.map((scene) => {
          scene.expectMount(mountOf(scene, loc("root")))
          return scene
        })
      )

      scene.parts((calendar) => {
        assert.strictEqual(calendar.months.length, 2)
        assert.strictEqual(iso(calendar.months[0].month), "2026-11-01")
        assert.strictEqual(calendar.months[0].title, "November 2026")
        assert.strictEqual(iso(calendar.months[1].month), "2026-12-01")
        assert.strictEqual(calendar.months[1].title, "December 2026")
      })

      const heading0 = scene.get(loc("heading-0")).attrs!.id!
      const heading1 = scene.get(loc("heading-1")).attrs!.id!
      assert.notStrictEqual(heading0, heading1)
      owns(scene, loc("grid-0"), { "aria-labelledby": heading0 })
      owns(scene, loc("grid-1"), { "aria-labelledby": heading1 })

      // One roving tab stop across both grids
      assert.strictEqual(scene.all(Locator.attr("tabindex", "0")).length, 1)
      owns(scene, dayIn(0, "2026-11-15"), { tabindex: "0" })

      // Duplicate outside-month days in a neighbour's grid are disabled; real and outer-edge days stay enabled
      owns(scene, dayIn(0, "2026-12-01"), {
        disabled: "",
        "data-disabled": "",
        "data-outside-month": "",
        tabindex: "-1",
        "data-focused": undefined
      })
      owns(scene, dayIn(1, "2026-12-01"), {
        disabled: undefined,
        "data-disabled": undefined,
        "data-outside-month": undefined
      })
      owns(scene, dayIn(1, "2026-11-30"), {
        disabled: "",
        "data-disabled": "",
        "data-outside-month": "",
        tabindex: "-1"
      })
      owns(scene, dayIn(0, "2026-10-26"), {
        disabled: undefined,
        "data-outside-month": ""
      })

      // ArrowRight from the last day of month 0 focuses month 1 with no RequestedMonth
      scene.focus(dayIn(0, "2026-11-30"))
      assert.deepStrictEqual(
        focused(
          scene.keydown(dayIn(0, "2026-11-30"), "ArrowRight")
            .expectDefaultPrevented()
        ),
        ["2026-12-01"]
      )
      assert.deepStrictEqual(scene.current.emitted, [])
      scene.focus(dayIn(1, "2026-12-01"))
      assert.strictEqual(scene.all(Locator.attr("tabindex", "0")).length, 1)
      owns(scene, dayIn(1, "2026-12-01"), {
        tabindex: "0",
        "data-focused": ""
      })
      owns(scene, dayIn(0, "2026-12-01"), {
        tabindex: "-1",
        "data-focused": undefined
      })

      // Leaving the end of the window shifts the first month minimally so target is last shown
      scene.focus(dayIn(1, "2026-12-31"))
      scene.keydown(dayIn(1, "2026-12-31"), "ArrowRight")
        .expectDefaultPrevented()
        .emitted(CalendarEvents.RequestedMonth({ month: utc("2026-12-01") }))
      syncMonth(
        scene,
        baseProps({
          value: null,
          month: utc("2026-12-01"),
          today: utc("2026-11-26"),
          months: 2,
          firstDayOfWeek: 1
        })
      )
      assert.deepStrictEqual(focused(scene), ["2027-01-01"])
      owns(scene, dayIn(1, "2027-01-01"), { tabindex: "0" })

      // Leaving the start of the window puts the target's month first
      scene.focus(dayIn(0, "2026-12-01"))
      scene.keydown(dayIn(0, "2026-12-01"), "ArrowLeft")
        .expectDefaultPrevented()
        .emitted(CalendarEvents.RequestedMonth({ month: utc("2026-11-01") }))

      // Next steps by 1 month and disables against the window's last month
      scene.click(loc("next")).emitted(
        CalendarEvents.RequestedMonth({ month: utc("2027-01-01") })
      )
      scene.props(
        baseProps({
          value: null,
          month: utc("2026-12-01"),
          today: utc("2026-11-26"),
          months: 2,
          max: utc("2027-01-31"),
          firstDayOfWeek: 1
        })
      )
      owns(scene, loc("next"), { disabled: "", "data-disabled": "" })

      // Shrinking `months` moves focus out of a dropped month, and preserves focus when still in window
      scene.focus(dayIn(1, "2027-01-15"))
      syncMonth(
        scene,
        baseProps({
          value: null,
          month: utc("2026-12-01"),
          today: utc("2026-11-26"),
          months: 1,
          firstDayOfWeek: 1
        })
      )
      assert.deepStrictEqual(focused(scene), ["2026-12-15"])
      owns(scene, dayIn(0, "2026-12-15"), { tabindex: "0" })

      scene.focus(dayIn(0, "2026-12-20"))
      syncMonth(
        scene,
        baseProps({
          value: utc("2026-12-05"),
          month: utc("2026-12-01"),
          today: utc("2026-11-26"),
          months: 2,
          firstDayOfWeek: 1
        })
      )
      owns(scene, dayIn(0, "2026-12-20"), { tabindex: "0", "data-focused": "" })
    }))
})
