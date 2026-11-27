import type { Component, Mount, View } from "@effect/ui"
import {
  Calendar,
  DateField,
  DatePicker,
  type DatePickerChangeReason,
  DatePickerEvents,
  type DatePickerProps
} from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { HtmlScene } from "@effect/ui/html/testing"
import { Locator } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { DateTime, Effect } from "effect"

type Parts = Component.Headless.Parts<typeof DatePicker>
type H = View.Helper<never, DatePickerProps> & View.Tags<Html.Elements, never>

const standIn = {
  elements: Html,
  view: (datePicker: Parts, h: H) =>
    h.div(
      datePicker.input(h.input.class("input")),
      datePicker.trigger(
        h.button.attrs({
          class: "trigger",
          type: "submit",
          "aria-expanded": "x",
          "data-popup-open": "x"
        })
      ),
      datePicker.positioner(h.div.class("positioner")).children(
        datePicker.popup(h.div.attrs({ class: "popup", role: "x" })).children(
          datePicker.months[0].grid(h.table.class("grid")).children(
            h.tbody(
              ...datePicker.months[0].weeks.map((week) =>
                h.tr(
                  ...week.map((date) =>
                    datePicker.months[0].cell({
                      element: h.td.attr(
                        "data-cell",
                        DateTime.formatIsoDateUtc(date)
                      ),
                      date
                    }).children(
                      datePicker.months[0].day({ element: h.button, date })
                        .children(DateTime.formatIsoDateUtc(date))
                    )
                  )
                )
              )
            )
          )
        )
      )
    )
}

type Rendered = { readonly get: (locator: Locator.Locator) => Locator.Node }
type Track = Mount.Issued<unknown, never, never, unknown>

const utc = (iso: string) => DateTime.makeUnsafe(iso + "T00:00:00Z")
const input = Locator.attr("class", "input")
const trigger = Locator.attr("class", "trigger")
const positioner = Locator.attr("class", "positioner")
const popup = Locator.attr("class", "popup")
const grid = Locator.attr("class", "grid")
const day = (iso: string) => Locator.text(iso, { exact: true })
const tracked = (scene: Rendered): Track =>
  (scene.get(positioner) as unknown as View.Element<unknown>).owned?.find((
    layer
  ) => layer.mount !== undefined)?.mount as unknown as Track
const dismissed = (reason: "escape-key") =>
  ({ _tag: "Dismissed", reason }) as never
const props = (more: Partial<DatePickerProps> = {}): DatePickerProps => ({
  value: utc("2026-11-15"),
  open: false,
  month: utc("2026-11-01"),
  today: utc("2026-11-26"),
  locale: "en-GB",
  ...more
})
const opened = DatePickerEvents.RequestedOpen({ reason: "trigger-press" })
const closed = (reason: DatePickerChangeReason) =>
  DatePickerEvents.RequestedClose({ reason })
const picked = (date: DateTime.Utc | null) => DatePickerEvents.Picked({ date })
const month = (iso: string) =>
  DatePickerEvents.RequestedMonth({ month: utc(iso) })
const quiet = (
  scene: { readonly current: { readonly emitted: ReadonlyArray<unknown> } }
) => assert.deepStrictEqual(scene.current.emitted, [])

describe("DatePicker", () => {
  it.effect("asks to open and close from the trigger, and to close on a picked day", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(DatePicker, props(), standIn)
      assert.deepInclude(scene.get(trigger).attrs, {
        type: "button",
        "aria-haspopup": "dialog",
        "aria-expanded": "false",
        "aria-label": "Choose date"
      })
      assert.isUndefined(scene.get(trigger).attrs?.["data-popup-open"])
      assert.isUndefined(scene.get(trigger).attrs?.["aria-controls"])
      assert.deepInclude(scene.get(positioner).attrs, {
        role: "presentation",
        "data-closed": "",
        "data-side": "bottom",
        "data-align": "start"
      })
      assert.strictEqual(scene.get(popup).attrs?.role, "dialog")
      scene.click(trigger).emitted(opened)

      scene.props(props({ open: true })).expectMount(tracked(scene))
      assert.deepInclude(scene.get(trigger).attrs, {
        "aria-expanded": "true",
        "aria-controls": scene.get(popup).attrs?.id,
        "data-popup-open": ""
      })
      assert.deepInclude(scene.get(positioner).attrs, { "data-open": "" })
      scene.click(trigger).emitted(closed("trigger-press"))
      scene.childEmit(Calendar, { _tag: "Picked", date: utc("2026-11-20") })
        .emitted(picked(utc("2026-11-20")), closed("day-press"))
      // A day of the next month asks for that month too
      scene.childEmit(Calendar, { _tag: "Picked", date: utc("2026-12-01") })
        .emitted(
          picked(utc("2026-12-01")),
          month("2026-12-01"),
          closed("day-press")
        )
      scene.childEmit(Calendar, {
        _tag: "RequestedMonth",
        month: utc("2026-10-01")
      }).emitted(
        month("2026-10-01")
      )
    }))

  it.effect("a typed date outside the shown month also asks for that month, counting a Zoned month by its local day, and one before min asks for nothing", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(DatePicker, props(), standIn)
      const committed = (date: DateTime.Utc | null) =>
        scene.childEmit(DateField, { _tag: "Committed", date })
      committed(utc("2027-01-03")).emitted(
        picked(utc("2027-01-03")),
        month("2027-01-01")
      )
      committed(null).emitted(picked(null))
      scene.props(props({ min: utc("2026-11-01") }))
      committed(utc("2026-10-31"))
      quiet(scene)
      // 02:00Z on Dec 1 is still Nov 30 in Los Angeles, so Nov 30 is in the shown month
      scene.props(props({
        month: DateTime.makeZonedUnsafe("2026-12-01T02:00:00Z", {
          timeZone: "America/Los_Angeles"
        })
      }))
      committed(utc("2026-11-30")).emitted(picked(utc("2026-11-30")))
    }))

  it.effect("disabled, it disables every control and asks for nothing", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(
        DatePicker,
        props({ open: true, disabled: true }),
        standIn
      ).pipe(Effect.map((scene) => scene.expectMount(tracked(scene))))
      assert.deepInclude(scene.get(trigger).attrs, {
        disabled: "",
        "data-disabled": ""
      })
      assert.strictEqual(scene.get(input).attrs?.disabled, "")
      assert.strictEqual(scene.get(day("2026-11-20")).attrs?.disabled, "")
      scene.mounted(tracked(scene), dismissed("escape-key"))
      quiet(scene)
    }))

  it.effect("read-only, it still opens, and its input and calendar are read-only", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(
        DatePicker,
        props({ readOnly: true }),
        standIn
      )
      assert.deepInclude(scene.get(trigger).attrs, { "data-readonly": "" })
      assert.isUndefined(scene.get(trigger).attrs?.disabled)
      assert.strictEqual(scene.get(input).attrs?.readonly, "")
      assert.strictEqual(scene.get(grid).attrs?.["aria-readonly"], "true")
      scene.click(trigger).emitted(opened)
    }))

  it.effect("multi-month picker does not request a new month when picking or typing a date in another visible month", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(
        DatePicker,
        props({ months: 2 }),
        {
          elements: Html,
          view: (datePicker: Parts, h: H) =>
            h.div(
              datePicker.input(h.input.class("input")),
              datePicker.trigger(h.button.class("trigger")),
              datePicker.positioner(h.div.class("positioner")).children(
                datePicker.popup(h.div.class("popup")).children(
                  ...datePicker.months.map((m, i) =>
                    m.grid(h.table.class("grid-" + i)).children(
                      h.tbody(
                        ...m.weeks.map((week) =>
                          h.tr(
                            ...week.map((date) =>
                              m.cell({ element: h.td, date }).children(
                                m.day({ element: h.button, date }).children(
                                  DateTime.formatIsoDateUtc(date)
                                )
                              )
                            )
                          )
                        )
                      )
                    )
                  )
                )
              )
            )
        }
      )

      scene.parts((datePicker) => {
        assert.strictEqual(datePicker.months.length, 2)
      })

      // Picking or typing a date in December (already visible alongside November) emits no RequestedMonth
      scene.childEmit(Calendar, { _tag: "Picked", date: utc("2026-12-10") })
        .emitted(picked(utc("2026-12-10")), closed("day-press"))
      scene.childEmit(DateField, { _tag: "Committed", date: utc("2026-12-20") })
        .emitted(picked(utc("2026-12-20")))
      // Typing a date outside the 2-month window still requests that month
      scene.childEmit(DateField, { _tag: "Committed", date: utc("2027-01-05") })
        .emitted(picked(utc("2027-01-05")), month("2027-01-01"))
    }))
})
