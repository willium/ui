/**
 * A button that opens a list of options, showing the selected one.
 *
 * `Select` is headless: it owns the keyboard and pointer behaviour, focus,
 * placement, the data attributes and the form inputs, and the consumer draws
 * the markup. The consumer owns whether the popup is open and what's
 * selected, passes them as `open` and `value`, and stores what the
 * `RequestedOpen`, `RequestedClose` and `Picked` events ask for. Values are
 * strings, and `items` lists every option with its label, in the order
 * they're drawn.
 *
 * **Anatomy**
 *
 * | Part              | Element                                              |
 * | :---------------- | :--------------------------------------------------- |
 * | `label`           | `<div>` that names the trigger                       |
 * | `trigger`         | `<button>` that opens the popup                      |
 * | `value`           | `<span>` inside the trigger, the selected label      |
 * | `icon`            | `<span>` inside the trigger                          |
 * | `backdrop`        | `<div>`, a manual popover under the positioner       |
 * | `positioner`      | `<div>`, a manual popover placed by the select       |
 * | `popup`           | `<div>` inside the positioner                        |
 * | `list`            | `<div>` inside the popup, when it holds more than items |
 * | `arrow`           | `<div>` inside the popup                             |
 * | `item`            | `<div>`, one per value, inside the popup or the list |
 * | `itemText`        | `<div>` inside an item, its label                    |
 * | `itemIndicator`   | `<span>` inside an item, shown while it's selected   |
 * | `group`           | `<div>` around items                                 |
 * | `groupLabel`      | `<div>` inside a group                               |
 * | `separator`       | `<div>` between items                                |
 * | `scrollUpArrow`   | `<div>` inside the popup                             |
 * | `scrollDownArrow` | `<div>` inside the popup                             |
 * | `finalFocus`      | any focusable element, focused on close              |
 *
 * Each part takes the consumer's builder and returns it with the part
 * applied, and the consumer adds the children. `item` and `itemIndicator`
 * take an options object, `{ element, value }`, and `group` and
 * `groupLabel` take `{ element, group }`, where `group` is the `group` of
 * the items inside. The scroll arrows take `{ element }`. `arrow`,
 * `itemIndicator` and the scroll arrows return `undefined` while they're
 * hidden; a `keepMounted` field keeps the indicator and the scroll arrows
 * drawn. Every `item` value has to be in `items`, and `item` keys its
 * element with the value.
 *
 * In a `Field`, wrap the trigger and the positioner in `field.focusWithin`
 * and draw the trigger with `field.member`, so focus moving into the popup
 * doesn't mark the field touched. Name it with `select.label`, not a field
 * label: `select.label` names the trigger, and a click on it focuses the
 * trigger without opening.
 *
 * The positioner is a manual popover, so it renders in the top layer and
 * needs no portal. The browser gives a popover a border, padding, a
 * background and `overflow: auto`, so reset those on the positioner and
 * the backdrop and style the popup instead.
 *
 * **CSS variables**
 *
 * Set on the positioner:
 *
 * - `--anchor-width`, `--anchor-height`: the trigger's size
 * - `--available-width`, `--available-height`: the space between the
 *   trigger and the edge of the collision boundary, for a `max-height`
 *
 * Set on the popup: `--transform-origin`, the point the popup grows from.
 *
 * **Data attributes**
 *
 * Each present with an empty value or absent, except `data-side`,
 * `data-align`, `data-popup-side`, `data-direction` and
 * `data-orientation`, which hold a value:
 *
 * - `trigger`: `data-popup-open`, `data-pressed`, `data-popup-side`,
 *   `data-disabled`, `data-readonly`, `data-required`,
 *   `data-placeholder`
 * - `value`: `data-placeholder`
 * - `icon`: `data-popup-open`
 * - `backdrop`: `data-open` / `data-closed`, `data-starting-style`,
 *   `data-ending-style`
 * - `positioner`: `data-open` / `data-closed`, `data-starting-style`,
 *   `data-ending-style`, `data-side`, `data-align`, `data-anchor-hidden`
 * - `popup`, `arrow`: as on the positioner, without
 *   `data-anchor-hidden`; the arrow adds `data-uncentered`
 * - `item`: `data-selected`, `data-highlighted`, `data-disabled`
 * - `separator`: `data-orientation`
 * - `scrollUpArrow`, `scrollDownArrow`: `data-direction`, `data-side`,
 *   `data-visible`
 *
 * `data-side` is `none` while the popup is aligned with the trigger.
 *
 * **Keyboard**
 *
 * On the trigger, Enter, Space, ArrowDown and ArrowUp open the popup and
 * move focus to the selected item, or to the first or, for ArrowUp, the
 * last item. Inside a vertical `Toolbar`, ArrowDown and ArrowUp move focus
 * instead. Typing a letter selects the next matching item without
 * opening. In the popup, ArrowDown, ArrowUp, Home and End move between
 * items, disabled ones included, and typing moves to the next item whose
 * label starts with what's typed, skipping disabled ones. Enter and Space
 * pick the focused item. Escape closes the popup, and Shift+Tab closes it
 * and returns focus to the trigger.
 *
 * **Placement**
 *
 * By default the popup covers the trigger, with the selected item over the
 * trigger's text, and grows as its list scrolls. It falls back to placing
 * the popup below the trigger when the trigger is within 20px of the top
 * or bottom of the viewport, when there's no room for the popup's
 * `min-height` (100px when unset), and for a select opened by touch.
 * While aligned, the positioner's `margin-top` and `margin-bottom` in CSS
 * are the gaps it keeps to the top and bottom of the viewport, 10px each
 * when unset. A margin of 0 puts it against that edge, also when the 0
 * comes from a reset such as `* { margin: 0 }`. A resize of the window
 * closes an aligned popup. Set
 * `alignItemWithTrigger: false` to always place it next to the trigger,
 * where the `Positioning` props apply and it flips when it doesn't fit.
 *
 * **In place**
 *
 * With `topLayer: false`, the backdrop and the positioner render in place
 * as ordinary elements, `hidden` while closed, and the popup is placed and
 * clipped inside its containing block, as `Positioning` describes. The
 * backdrop covers that block, and the select is never modal or aligned with
 * its trigger, whatever `modal` and `alignItemWithTrigger` say.
 *
 * **Form**
 *
 * With `name`, `required` or `autoComplete`, the trigger is wrapped in
 * a `display: contents` span that holds a visually hidden input, so
 * `required` blocks a form's submission, the browser can autofill it, and
 * the value is submitted. A `multiple` select submits one hidden input per
 * value. A `modal` select locks the page's scroll and blocks presses
 * outside, except on the trigger. An empty string counts as no value.
 *
 * **Example** (A theme picker in a field, with the open state and the value in the consumer's Model)
 *
 * ```ts import.meta.vitest
 * import { UiSchema } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { Field, Select } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const themes = [
 *   { value: "light", label: "Light" },
 *   { value: "dark", label: "Dark" },
 *   { value: "system", label: "System" }
 * ]
 *
 * const SettingsMessage = UiSchema.TaggedEnum({
 *   RequestedOpenTheme: {},
 *   RequestedCloseTheme: {},
 *   PickedTheme: { theme: Schema.String }
 * })
 *
 * const Settings = Html.component({
 *   name: "Settings",
 *   model: Schema.Struct({ open: Schema.Boolean, theme: Schema.String }),
 *   message: SettingsMessage
 * }).make({
 *   init: () => ({ open: false, theme: "system" }),
 *   update: {
 *     RequestedOpenTheme: ($) => $.evolve({ open: true }),
 *     RequestedCloseTheme: ($) => $.evolve({ open: false }),
 *     PickedTheme: ($, { theme }) => $.evolve({ theme })
 *   },
 *   view: (h, model) =>
 *     Field(h, {
 *       props: { filled: true },
 *       view: (field) =>
 *         Select(h, {
 *           props: { open: model.open, value: model.theme, items: themes, name: "theme", disabled: field.disabled },
 *           onEmit: {
 *             RequestedOpen: () => SettingsMessage.RequestedOpenTheme(),
 *             RequestedClose: () => SettingsMessage.RequestedCloseTheme(),
 *             Picked: ({ value }) => SettingsMessage.PickedTheme({ theme: String(value) }),
 *             Settled: () => undefined
 *           },
 *           view: (select) =>
 *             field.root(h.div).children(
 *               select.label(h.div).children("Theme"),
 *               field.focusWithin(h.div).children(
 *                 select.trigger(field.member(h.button)).children(select.value(h.span), select.icon(h.span).children("▾")),
 *                 select.positioner(h.div).children(
 *                   select.popup(h.div).children(
 *                     themes.map(({ label, value }) =>
 *                       select.item({ element: h.div, value }).children(
 *                         select.itemText(h.div).children(label),
 *                         select.itemIndicator({ element: h.span, value })?.children("✓")
 *                       )
 *                     )
 *                   )
 *                 )
 *               )
 *             )
 *         })
 *     })
 * })
 *
 * // The trigger is a combobox that shows the selected theme.
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Settings, {}))
 * if (!/<button[^>]* role="combobox"[^>]*>.*System/.test(html)) throw new Error("the trigger doesn't show the theme")
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
import * as UiSchema from "@effect/ui/UiSchema"
import * as UiStruct from "@effect/ui/UiStruct"
import * as View from "@effect/ui/View"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import {
  type Attributed,
  fallbackLabelledBy,
  flag,
  idSelector,
  type Named,
  ownStyle,
  separatorAttrs,
  withStyle
} from "./internal/attributes.ts"
import {
  backdropStyle,
  blockers,
  cutPath,
  dismissAttrs,
  dismissSpan
} from "./internal/blocker.ts"
import {
  focusedOf,
  focusFinal,
  isElement,
  isHTMLElement,
  listenTrees,
  override,
  rootOf
} from "./internal/dom.ts"
import {
  autofillMatch,
  filledOf,
  formInputs,
  toggled,
  valueSchema,
  valuesOf
} from "./internal/formInputs.ts"
import { methodOf } from "./internal/interaction.ts"
import { grouped, valued } from "./internal/list.ts"
import { holdLayer, nextLayerOrder } from "./internal/modal.ts"
import { listenOutside, releasedOutside } from "./internal/outside.ts"
import { clamp, fillValue } from "./internal/range.ts"
import { layered, raiseAbove } from "./internal/topLayer.ts"
import {
  frameOf,
  settling,
  statusOf,
  transitionAttrs
} from "./internal/transition.ts"
import * as ListNavigation from "./ListNavigation.ts"
import * as Positioning from "./Positioning.ts"
import { Toolbar } from "./Toolbar.ts"
import * as Typeahead from "./Typeahead.ts"

const itemSchema = <S extends Schema.Codec<string, string>>(value: S) =>
  Schema.Struct({
    value,
    label: Schema.String,
    disabled: Schema.optional(Schema.Boolean)
  })

/**
 * One option of a `Select`: the value it submits, the text the trigger shows
 * and typeahead matches, and whether it can be picked.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const SelectItem = itemSchema(Schema.String)

/**
 * One option of a `Select`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type SelectItem<V extends string = string> = ReturnType<
  typeof itemSchema<Schema.Codec<V, string>>
>["Type"]

/**
 * What a `Select` holds: one value, the values of a `multiple` select, or
 * `null` for none. An empty string counts as no value too.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const SelectValue = valueSchema(Schema.String)

/**
 * What a `Select` holds.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type SelectValue<V extends string = string> = ReturnType<
  typeof valueSchema<Schema.Codec<V, string>>
>["Type"]

/**
 * How the select was opened or closed: `"keyboard"` for a key or a click
 * from no pointer.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const SelectInteraction = Schema.Literals([
  "mouse",
  "touch",
  "pen",
  "keyboard"
])

/**
 * How the select was opened or closed.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type SelectInteraction = typeof SelectInteraction.Type

/**
 * Why a `Select` asks to open, close or change its value.
 *
 * **Details**
 *
 * - `"trigger-press"`: a press, or Enter or Space, on the trigger
 * - `"list-navigation"`: ArrowDown or ArrowUp on the closed trigger
 * - `"item-press"`: an item was picked
 * - `"outside-press"`: a press outside the trigger and the popup, other
 *   than on a scrollbar
 * - `"escape-key"`: Escape in the popup
 * - `"focus-out"`: focus left the trigger and the popup, or Shift+Tab in
 *   the popup
 * - `"close-press"`: the visually hidden dismiss button in a `modal`
 *   popup, for screen readers
 * - `"cancel-open"`: the press that opened it was released away from the
 *   trigger and the popup
 * - `"window-resize"`: the window resized while the popup covered the
 *   trigger
 * - `"none"`: typeahead on the closed trigger, autofill, or focus coming
 *   back to the trigger while the popup covers it
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const SelectChangeReason = Schema.Literals([
  "trigger-press",
  "list-navigation",
  "item-press",
  "outside-press",
  "escape-key",
  "focus-out",
  "close-press",
  "cancel-open",
  "window-resize",
  "none"
])

/**
 * Why a `Select` asks to open, close or change its value.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type SelectChangeReason = typeof SelectChangeReason.Type

const propsSchema = <S extends Schema.Codec<string, string>>(value: S) =>
  Schema.Struct({
    open: Schema.Boolean,
    items: Schema.Array(itemSchema(value)),
    value: Schema.optional(valueSchema(value)),
    multiple: Schema.optional(Schema.Boolean),
    placeholder: Schema.optional(Schema.String),
    disabled: Schema.optional(Schema.Boolean),
    readOnly: Schema.optional(Schema.Boolean),
    required: Schema.optional(Schema.Boolean),
    name: Schema.optional(Schema.String),
    form: Schema.optional(Schema.String),
    autoComplete: Schema.optional(Schema.String),
    id: Schema.optional(Schema.String),
    modal: Schema.optional(Schema.Boolean),
    dismissLabel: Schema.optional(Schema.String),
    highlightItemOnHover: Schema.optional(Schema.Boolean),
    alignItemWithTrigger: Schema.optional(Schema.Boolean),
    finalFocus: Schema.optional(Schema.Boolean),
    holdExit: Schema.optional(Schema.Boolean),
    ...Positioning.PositionerFields
  })

/**
 * The props of a `Select`.
 *
 * **Details**
 *
 * - `open`: whether the popup shows. The select only asks, with `RequestedOpen`
 *   and `RequestedClose`.
 * - `items`: every option, in the order they're drawn. Navigation,
 *   typeahead and the trigger's text read them, so list each item drawn.
 * - `value`: the selected value, or values with `multiple`. `null` when
 *   left out. The select only asks, with `Picked`.
 * - `multiple`: more than one item can be selected, and picking one
 *   leaves the popup open. False when left out.
 * - `placeholder`: the trigger's text while nothing is selected.
 * - `disabled`, `readOnly`, `required`: as on a native `<select>`.
 *   A read-only select opens and can be browsed but not changed.
 * - `name`, `form`, `autoComplete`: the form field.
 * - `id`: the trigger's id. Generated when left out.
 * - `modal`: while open, the page doesn't scroll, a press outside only
 *   closes the popup, and screen readers see only the trigger and the
 *   popup. True when left out.
 * - `dismissLabel`: the name of the visually hidden dismiss button in a
 *   `modal` popup. `"Dismiss"` when left out.
 * - `highlightItemOnHover`: the pointer highlights the item it's over.
 *   True when left out.
 * - `alignItemWithTrigger`: the popup covers the trigger, with the
 *   selected item over the trigger's text. True when left out. It's off for
 *   a select opened by touch, and falls back to placing the popup next to
 *   the trigger when there isn't room.
 * - `finalFocus`: on close, focus goes back to the trigger, or to a
 *   `finalFocus` part. False leaves it where it is. True when left out.
 * - `holdExit`: keeps the closing popup shown, for an exit animation the
 *   consumer ends by clearing it.
 * - the `Positioning.PositionerFields`, for the popup when it isn't
 *   aligned with the trigger. `side` is `"bottom"` when left out.
 *   `topLayer: false` draws the backdrop and the positioner in place, as
 *   the module describes.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const SelectProps = propsSchema(Schema.String)

/**
 * The props of a `Select`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type SelectProps<V extends string = string> = ReturnType<
  typeof propsSchema<Schema.Codec<V, string>>
>["Type"]

const eventsSchema = <S extends Schema.Codec<string, string>>(value: S) =>
  UiSchema.TaggedEnum({
    RequestedOpen: { reason: SelectChangeReason },
    RequestedClose: { reason: SelectChangeReason },
    Picked: { value: valueSchema(value), reason: SelectChangeReason },
    Settled: { open: Schema.Boolean }
  })

type SelectEventsSchema<V extends string> = ReturnType<
  typeof eventsSchema<Schema.Codec<V, string>>
>

/**
 * What a `Select` emits.
 *
 * **Details**
 *
 * - `RequestedOpen`: asks for `open` to be true.
 * - `RequestedClose`: asks for `open` to be false.
 * - `Picked`: asks for `value` to be `value`, the whole new selection.
 * - `Settled`: reports that the popup's transitions ended, after it
 *   opened or closed.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const SelectEvents = eventsSchema(Schema.String)

/**
 * What a `Select` emits.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type SelectEvents<V extends string = string> = SelectEventsSchema<
  V
>["Type"]

/**
 * Where a select's popup is in its transitions: `"starting"` for the
 * first frame after it opens, `"ending"` while it closes, `null` otherwise.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type SelectTransitionStatus = "starting" | "ending" | null

const SelectMessage = UiSchema.TaggedEnum({
  PressedTrigger: { pointerType: Schema.String },
  ReleasedTrigger: {},
  ClickedTrigger: { pointerType: Schema.String },
  PressedTriggerKey: { key: Schema.String },
  ClickedLabel: {},
  FocusedInput: {},
  Autofilled: { value: Schema.String },
  PressedPopupKey: { key: Schema.String },
  ReleasedSpace: {},
  EnteredItem: { value: Schema.String },
  LeftItem: {},
  PressedItem: {},
  ReleasedItem: { value: Schema.String, pointerType: Schema.String },
  ClickedItem: { value: Schema.String, pointerType: Schema.String },
  CompletedWaitBeforeResetTyping: {},
  ShowedPopup: {},
  RenderedFirstFrame: {},
  FinishedTransition: { open: Schema.Boolean },
  ChangedPlacement: { placement: Positioning.Placement },
  PressedOutside: { pointerType: Schema.String },
  PressedDismiss: {},
  FocusedOutside: {},
  FocusedTrigger: {},
  ReleasedPointer: { outside: Schema.Boolean },
  ResizedWindow: {},
  FellBack: {},
  ChangedScrollArrows: { up: Schema.Boolean, down: Schema.Boolean },
  ScrolledByArrow: {},
  AllowedRelease: {},
  DraggedPointer: {}
})

type SelectMessage = typeof SelectMessage.Type

const SelectModel = Schema.Struct({
  mounted: Schema.Boolean,
  started: Schema.Boolean,
  openMethod: Schema.NullOr(SelectInteraction),
  closeMethod: Schema.NullOr(SelectInteraction),
  focusLeft: Schema.Boolean,
  active: Schema.NullOr(Schema.String),
  activeByKey: Schema.Boolean,
  typeahead: Typeahead.State,
  spaceDown: Schema.Boolean,
  placement: Schema.NullOr(Positioning.Placement),
  fellBack: Schema.Boolean,
  scrollUp: Schema.Boolean,
  scrollDown: Schema.Boolean,
  pressing: Schema.Boolean,
  pressedItem: Schema.Boolean,
  releaseSelected: Schema.Boolean,
  releaseUnselected: Schema.Boolean
})

type SelectModel = typeof SelectModel.Type

type SelectUpdate<V extends string> = Component.Update<
  SelectModel,
  SelectMessage,
  SelectEvents<V>,
  SelectProps<V>
>

const Trigger = Html.ref("SelectTrigger", "button")

const selectedIndexOf = (props: SelectProps): number => {
  const values = valuesOf(props)
  return props.items.findIndex((item) => values.includes(item.value))
}

const indexOf = (props: SelectProps, value: string | null): number =>
  value === null ? -1 : props.items.findIndex((item) => item.value === value)

const alignedOf = (model: SelectModel, props: SelectProps): boolean =>
  props.alignItemWithTrigger !== false && props.topLayer !== false &&
  !model.fellBack && model.openMethod !== "touch"

const startOf = (model: SelectModel, props: SelectProps): number => {
  const selected = selectedIndexOf(props)
  return selected !== -1 ? selected : indexOf(props, model.active)
}

const open = <V extends string>(
  $: SelectUpdate<V>,
  reason: SelectChangeReason,
  method: SelectInteraction,
  key?: string
) => {
  const props = $.props
  const items = props.items
  let active = selectedIndexOf(props)
  if (active === -1 && items.length > 0) {
    if (method === "keyboard") active = key === "ArrowUp" ? items.length - 1 : 0
    else if (
      props.alignItemWithTrigger !== false && method !== "touch" &&
      props.highlightItemOnHover !== false
    ) {
      active = 0
    }
  }
  return $.evolve({
    openMethod: method,
    closeMethod: null,
    focusLeft: false,
    active: items[active]?.value ?? null,
    activeByKey: method === "keyboard",
    typeahead: Typeahead.reset,
    spaceDown: false,
    fellBack: false,
    pressing: reason === "trigger-press" &&
      (method === "mouse" || method === "pen"),
    pressedItem: false,
    releaseSelected: false,
    releaseUnselected: false
  }).emit(SelectEvents.RequestedOpen({ reason }))
}

const dismiss = <V extends string>(
  model: SelectModel,
  $: SelectUpdate<V>,
  reason: SelectChangeReason,
  method: SelectInteraction | null,
  focusLeft = false
) =>
  $.props.open
    ? $.set(model).evolve({
      closeMethod: method,
      focusLeft,
      pressing: false,
      spaceDown: false
    }).emit(
      SelectEvents.RequestedClose({ reason })
    )
    : model

const toggle = <V extends string>(
  $: SelectUpdate<V>,
  method: SelectInteraction
) =>
  $.props.disabled === true
    ? $.model
    : $.props.open
    ? dismiss($.model, $, "trigger-press", method)
    : open($, "trigger-press", method)

const pick = <V extends string>(
  model: SelectModel,
  $: SelectUpdate<V>,
  events: SelectEventsSchema<V>,
  value: string,
  method: SelectInteraction
) => {
  const props = $.props
  const item = props.items.find((candidate) => candidate.value === value)
  if (
    !ListNavigation.available(item) || props.disabled === true ||
    props.readOnly === true
  ) {
    return model
  }
  const next = UiStruct.evolve(model, { active: value, pressedItem: false })
  if (props.multiple === true) {
    return $.set(next).emit(
      events.Picked({
        value: toggled(valuesOf(props), item.value),
        reason: "item-press"
      })
    )
  }
  return $.set(next).evolve({
    closeMethod: method,
    focusLeft: false,
    pressing: false
  })
    .emit(events.Picked({ value: item.value, reason: "item-press" }))
    .emit(events.RequestedClose({ reason: "item-press" }))
}

const highlight = (
  model: SelectModel,
  props: SelectProps,
  index: number
): SelectModel => {
  const item = props.items[index]
  return item === undefined
    ? model
    : UiStruct.evolve(model, { active: item.value, activeByKey: true })
}

const hover = (model: SelectModel, active: string | null): SelectModel =>
  model.active === active
    ? model
    : UiStruct.evolve(model, { active, activeByKey: false })

const typeKey = <V extends string>(
  $: SelectUpdate<V>,
  events: SelectEventsSchema<V>,
  key: string
) => {
  const props = $.props
  const { index, state } = Typeahead.step(
    $.model.typeahead,
    key,
    props.items,
    startOf($.model, props)
  )
  const item = props.items[index]
  const moved = props.open && item !== undefined
    ? { active: item.value, activeByKey: true }
    : undefined
  const typed = $.evolve({ typeahead: state, ...moved }).run(
    Typeahead.waitReset(SelectMessage.CompletedWaitBeforeResetTyping)
  )
  return item === undefined || props.open ||
      valuesOf(props).includes(item.value)
    ? typed
    : typed.emit(events.Picked({ value: item.value, reason: "none" }))
}

const focusTrigger = <V extends string>($: SelectUpdate<V>) =>
  $.run(HtmlCommand.Focus.make({ ref: Trigger }).pipe(Command.asNoop))

const tolerance = 1

const maxScrollOf = (scroller: HTMLElement): number =>
  Math.max(0, scroller.scrollHeight - scroller.clientHeight)

const normalized = (value: number, max: number): number => {
  if (max <= 0) return 0
  const clamped = clamp(value, 0, max)
  return clamped <= tolerance ? 0 : max - clamped <= tolerance ? max : clamped
}

const maxHeightOf = (style: CSSStyleDeclaration): number =>
  style.maxHeight.endsWith("px")
    ? parseFloat(style.maxHeight) || Infinity
    : Infinity

const arrowScrollTop = (
  items: ReadonlyArray<HTMLElement>,
  up: boolean,
  scrollTop: number,
  clientHeight: number,
  arrowHeight: number,
  maxScrollTop: number
): number => {
  if (up) {
    let first = 0
    const visibleTop = scrollTop + arrowHeight - tolerance
    for (let i = 0; i < items.length; i++) {
      if (items[i]!.offsetTop >= visibleTop) {
        first = i
        break
      }
    }
    const target = Math.max(0, first - 1)
    const item = items[target]
    return target < first && item !== undefined
      ? normalized(item.offsetTop - arrowHeight, maxScrollTop)
      : 0
  }
  let last = items.length - 1
  const visibleBottom = scrollTop + clientHeight - arrowHeight + tolerance
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!
    if (item.offsetTop + item.offsetHeight > visibleBottom) {
      last = Math.max(0, i - 1)
      break
    }
  }
  const target = Math.min(items.length - 1, last + 1)
  const item = items[target]
  return target > last && item !== undefined
    ? normalized(
      item.offsetTop + item.offsetHeight - clientHeight + arrowHeight,
      maxScrollTop
    )
    : maxScrollTop
}

const withoutTransforms = (element: HTMLElement): () => void =>
  override(
    element,
    { transform: "none", scale: "1", translate: "0 0" },
    "important"
  )

const webkit = (): boolean =>
  typeof navigator !== "undefined" && /AppleWebKit/.test(navigator.userAgent) &&
  !/Chrome|Chromium|Edg|Android/.test(navigator.userAgent)

const TrackSelectArgs = {
  position: Positioning.TrackPositionArgs,
  open: Schema.Boolean,
  mounted: Schema.Boolean,
  started: Schema.Boolean,
  holdExit: Schema.Boolean,
  aligned: Schema.Boolean,
  lock: Schema.Boolean,
  modal: Schema.Boolean,
  touch: Schema.Boolean,
  active: Schema.NullOr(Schema.String),
  scroll: Schema.Boolean,
  pressing: Schema.Boolean,
  finalFocus: Schema.Boolean,
  focusLeft: Schema.Boolean,
  closeMethod: Schema.NullOr(SelectInteraction),
  triggerId: Schema.String,
  popupId: Schema.String,
  listId: Schema.String,
  alignId: Schema.NullOr(Schema.String)
}

type TrackSelectArgs = Schema.Struct<typeof TrackSelectArgs>["Type"]

const blocking = blockers("data-select-blocker")

const watch = (
  node: HTMLElement,
  args: TrackSelectArgs,
  changes: Stream.Stream<TrackSelectArgs>
) =>
  Stream.callback<SelectMessage>((queue) => {
    const document = node.ownerDocument
    const view = document.defaultView
    const html = document.documentElement
    const frame = frameOf(view)
    let current = args
    const send = (message: SelectMessage) => Queue.offerUnsafe(queue, message)
    const trigger = (): HTMLElement | null =>
      rootOf(node).getElementById(current.triggerId)
    const popup = (): HTMLElement =>
      rootOf(node).getElementById(current.popupId) ?? node
    const scroller = (): HTMLElement =>
      rootOf(node).getElementById(current.listId) ?? popup()
    const inside = (target: Node): boolean =>
      (node.contains(target) && !blocking.is(target)) ||
      trigger()?.contains(target) === true

    const saved = new Map<HTMLElement, Map<string, () => void>>()
    const write = (element: HTMLElement, name: string, value: string) => {
      let own = saved.get(element)
      if (own === undefined) saved.set(element, own = new Map())
      if (own.has(name)) element.style.setProperty(name, value)
      else own.set(name, override(element, { [name]: value }))
    }
    let placed = false
    let reachedMax = false
    const clear = () => {
      for (const own of saved.values()) own.forEach((undo) => undo())
      saved.clear()
      placed = false
      reachedMax = false
    }

    let shownUp = false
    let shownDown = false
    const arrows = () => {
      const element = scroller()
      const max = maxScrollOf(element)
      const top = normalized(element.scrollTop, max)
      const up = top > 0
      const down = top < max
      if (up === shownUp && down === shownDown) return
      shownUp = up
      shownDown = down
      send(SelectMessage.ChangedScrollArrows({ up, down }))
    }

    const cut = () => {
      const layer = Array.from(node.children).find(blocking.is) as
        | HTMLElement
        | undefined
      const anchor = trigger()
      if (layer === undefined || anchor === null) return
      write(layer, "clip-path", cutPath([anchor.getBoundingClientRect()]))
    }

    const gaps = (
      style: CSSStyleDeclaration
    ): readonly [top: number, bottom: number] => {
      const top = parseFloat(style.marginTop)
      const bottom = parseFloat(style.marginBottom)
      if (top !== 0 && bottom !== 0) return [top || 10, bottom || 10]
      // An unset margin is `auto`, which reads as 0px like a margin set to 0, until
      // the box is held to both edges and its `auto` margins take the space left.
      const restore = override(node, {
        top: "0px",
        bottom: "0px",
        height: "0px"
      })
      const heldTop = parseFloat(style.marginTop)
      const heldBottom = parseFloat(style.marginBottom)
      restore()
      return [
        top === 0 && heldTop === 0 ? 0 : top || 10,
        bottom === 0 && heldBottom === 0 ? 0 : bottom || 10
      ]
    }

    const align = () => {
      const anchor = trigger()
      const list = popup()
      if (
        anchor === null || view === null || !current.open || !current.aligned ||
        placed
      ) return
      placed = true
      const restore = withoutTransforms(list)
      try {
        const text = current.alignId === null
          ? null
          : rootOf(node).getElementById(current.alignId)?.querySelector<
            HTMLElement
          >("[data-select-item-text]") ?? null
        const value = anchor.querySelector<HTMLElement>("[data-select-value]")
        const positionerStyle = view.getComputedStyle(node)
        const popupStyle = view.getComputedStyle(list)
        const rtl = positionerStyle.direction === "rtl"
        const triggerRect = anchor.getBoundingClientRect()
        const positionerRect = node.getBoundingClientRect()
        const element = scroller()
        const scrollHeight = element.scrollHeight
        const borderBottom = parseFloat(popupStyle.borderBottomWidth) || 0
        const [marginTop, marginBottom] = gaps(positionerStyle)
        const minHeight = parseFloat(positionerStyle.minHeight) || 100
        const maxPopupHeight = maxHeightOf(popupStyle)
        const viewportHeight = html.clientHeight - marginTop - marginBottom
        const viewportWidth = html.clientWidth
        const beneath = viewportHeight - triggerRect.bottom + triggerRect.height
        let left = rtl
          ? triggerRect.right - positionerRect.width
          : triggerRect.left
        let offsetY = 0
        let textRect: DOMRect | undefined
        if (text !== null && value !== null) {
          const valueRect = value.getBoundingClientRect()
          textRect = text.getBoundingClientRect()
          left = positionerRect.left + (rtl
            ? valueRect.right - textRect.right
            : valueRect.left - textRect.left)
          const valueCenter = valueRect.top - triggerRect.top +
            valueRect.height / 2
          const textCenter = textRect.top - positionerRect.top +
            textRect.height / 2
          offsetY = textCenter - valueCenter
        }
        const ideal = beneath + offsetY + marginTop + borderBottom
        let height = Math.min(viewportHeight, ideal)
        const maxHeight = viewportHeight - marginTop - marginBottom
        const scrollTop = ideal - height
        write(
          node,
          "left",
          clamp(left, 5, viewportWidth - 5 - positionerRect.width) + "px"
        )
        write(node, "height", height + "px")
        write(node, "max-height", "none")
        write(node, "margin-top", marginTop + "px")
        write(node, "margin-bottom", marginBottom + "px")
        write(list, "height", "100%")
        const maxScrollTop = maxScrollOf(element)
        const fromTop = scrollTop >= maxScrollTop - tolerance
        if (fromTop) {
          height = Math.min(viewportHeight, positionerRect.height) -
            (scrollTop - maxScrollTop)
        }
        const fallBack = triggerRect.top < 20 ||
          triggerRect.bottom > viewportHeight - 20 ||
          Math.ceil(height) + tolerance < Math.min(scrollHeight, minHeight)
        // WebKit misplaces the popup while the page is pinch-zoomed.
        const zoomed = (view.visualViewport?.scale ?? 1) !== 1 && webkit()
        if (fallBack || zoomed) {
          clear()
          send(SelectMessage.FellBack())
          return
        }
        if (fromTop) {
          write(
            node,
            "top",
            positionerRect.height >= maxHeight
              ? "0px"
              : Math.max(0, viewportHeight - ideal) + "px"
          )
          write(node, "height", height + "px")
          element.scrollTop = maxScrollOf(element)
        } else {
          write(node, "top", "auto")
          write(node, "bottom", "0px")
          element.scrollTop = scrollTop
        }
        if (textRect !== undefined) {
          const y = positionerRect.height > 0
            ? ((textRect.top + textRect.height / 2 - positionerRect.top) /
              positionerRect.height) * 100
            : 50
          write(list, "--transform-origin", "50% " + clamp(y, 0, 100) + "%")
        }
        if (
          Math.max(minHeight, height) === viewportHeight ||
          height >= maxPopupHeight
        ) reachedMax = true
      } finally {
        restore()
      }
    }

    const grow = () => {
      if (!placed || reachedMax || !current.aligned || view === null) return
      const fromTop = node.style.top === "0px"
      const fromBottom = node.style.bottom === "0px"
      if (!fromTop && !fromBottom) return
      const element = scroller()
      const height = node.getBoundingClientRect().height
      const positionerStyle = view.getComputedStyle(node)
      const available = Math.min(
        html.clientHeight - parseFloat(positionerStyle.marginTop) -
          parseFloat(positionerStyle.marginBottom),
        maxHeightOf(view.getComputedStyle(popup()))
      )
      const scrollTop = element.scrollTop
      const maxScrollTop = maxScrollOf(element)
      const diff = fromTop ? maxScrollTop - scrollTop : scrollTop
      const next = Math.min(height + diff, available)
      if (diff <= tolerance) {
        const delta = clamp(diff, 0, available - height)
        if (delta > 0) write(node, "height", height + delta + "px")
        element.scrollTop = fromTop ? maxScrollTop : 0
        if (available - (height + delta) <= tolerance) reachedMax = true
        return
      }
      let target: number | null = null
      if (available - next > tolerance) target = fromTop ? Infinity : 0
      else if (fromBottom && scrollTop < maxScrollTop) {
        target = scrollTop -
          (diff - (height + diff - available))
      }
      const rounded = Math.ceil(next)
      if (rounded !== 0) write(node, "height", rounded + "px")
      if (target !== null) {
        const clamped = clamp(target, 0, maxScrollOf(element))
        if (Math.abs(element.scrollTop - clamped) > tolerance) {
          element
            .scrollTop = clamped
        }
      }
      if (rounded >= available - tolerance) reachedMax = true
    }

    const focusActive = (scroll: boolean) => {
      if (!current.open) return
      const item = current.active === null
        ? null
        : rootOf(node).getElementById(current.active)
      if (item === null) {
        if (focusedOf(node) !== popup()) {
          popup().focus({
            preventScroll: true
          })
        }
        return
      }
      if (focusedOf(node) !== item) item.focus({ preventScroll: true })
      if (scroll) item.scrollIntoView({ block: "nearest" })
    }

    const reveal = () =>
      frame(() => {
        if (current.open && current.active !== null) {
          rootOf(node).getElementById(current.active)?.scrollIntoView({
            block: "nearest"
          })
        }
      })

    const order = nextLayerOrder()
    let release: (() => void) | undefined
    const hold = () => {
      release?.()
      release = current.open
        ? holdLayer(node, order, {
          scroll: current.lock,
          touch: current.touch,
          hide: current.modal
            ? [trigger()].filter((anchor) => anchor !== null)
            : undefined
        })
        : undefined
    }

    let timer: ReturnType<typeof setTimeout> | undefined
    const opening = () => {
      send(SelectMessage.ShowedPopup())
      node.inert = false
      clear()
      clearTimeout(timer)
      timer = setTimeout(() => send(SelectMessage.AllowedRelease()), 400)
      cut()
      align()
      arrows()
      focusActive(false)
      if (current.pressing) keepFocus()
      if (!current.aligned) reveal()
      if (!current.started) {
        frame(() => frame(() => send(SelectMessage.RenderedFirstFrame())))
      }
    }

    // Opening during capture lets this listener cancel the same press before
    // its default action moves focus back to the trigger. The timestamp check
    // leaves later presses alone if the popup opened after dispatch ended.
    const keepFocus = () => {
      const openedAt = performance.now()
      const onMouseDown = (event: Event) => {
        event.currentTarget!.removeEventListener("mousedown", onMouseDown)
        if (event.timeStamp <= openedAt) event.preventDefault()
      }
      trigger()?.addEventListener("mousedown", onMouseDown, { signal })
    }

    const closing = () => {
      clearTimeout(timer)
      stopArrow()
      const focused = focusedOf(node)
      const lost = focused === null || focused === document.body ||
        node.contains(focused)
      if (current.finalFocus && (lost || !current.focusLeft)) {
        focusFinal(
          rootOf(node),
          current.popupId,
          trigger(),
          lost,
          current.closeMethod === "keyboard"
        )
      } else if (isHTMLElement(focused) && node.contains(focused)) {
        focused.blur()
      }
      node.inert = true
    }

    let arrowTimer: ReturnType<typeof setTimeout> | undefined
    const stopArrow = () => {
      clearTimeout(arrowTimer)
      arrowTimer = undefined
    }
    const unhighlight = () => {
      if (current.active !== null) send(SelectMessage.ScrolledByArrow())
    }
    const scrollBy = (arrow: Element, up: boolean) => {
      const step = () => {
        const element = scroller()
        unhighlight()
        const max = maxScrollOf(element)
        const top = normalized(element.scrollTop, max)
        if (top !== element.scrollTop) element.scrollTop = top
        if (top === (up ? 0 : max)) return stopArrow()
        const items = Array.from(
          element.querySelectorAll<HTMLElement>("[role=\"option\"]")
        )
        if (items.length > 0) {
          element.scrollTop = arrowScrollTop(
            items,
            up,
            top,
            element.clientHeight,
            (arrow as HTMLElement).offsetHeight || 0,
            max
          )
        }
        arrowTimer = setTimeout(step, 40)
      }
      arrowTimer = setTimeout(step, 40)
    }

    const onPointerDown = () => {
      dragY = 0
    }
    const onMouseUp = (event: MouseEvent) => {
      dragY = 0
      if (current.pressing) {
        send(
          SelectMessage.ReleasedPointer({
            outside: releasedOutside(event, inside, trigger())
          })
        )
      }
    }
    let dragY = 0
    let dragged = false
    const onPointerMove = (event: PointerEvent) => {
      if (
        event.pointerType !== "mouse" || event.buttons !== 1 || dragged
      ) return
      if (
        !isElement(event.target) ||
        event.target.closest("[role=\"option\"]") === null
      ) return
      dragY += event.movementY
      if (dragY ** 2 >= 64) {
        dragged = true
        send(SelectMessage.DraggedPointer())
      }
    }
    const onMouseMove = (event: MouseEvent) => {
      const arrow = isElement(event.target)
        ? event.target.closest("[data-select-scroll-arrow]")
        : null
      if (arrow === null || !node.contains(arrow)) return stopArrow()
      if (
        (event.movementX === 0 && event.movementY === 0) ||
        arrowTimer !== undefined
      ) return
      unhighlight()
      scrollBy(arrow, arrow.getAttribute("data-select-scroll-arrow") === "up")
    }
    const onMouseDown = (event: MouseEvent) => {
      if (blocking.is(event.target)) {
        event
          .preventDefault()
      }
    }
    const onFocusIn = (event: FocusEvent) => {
      if (current.open && current.aligned && event.target === trigger()) {
        send(
          SelectMessage.FocusedTrigger()
        )
      }
    }
    const onScroll = (event: Event) => {
      if (event.target !== scroller()) return
      grow()
      arrows()
    }
    const onResize = () => {
      if (current.open && current.aligned) send(SelectMessage.ResizedWindow())
    }

    const transition = settling(
      node,
      popup,
      frame,
      (open) => send(SelectMessage.FinishedTransition({ open }))
    )

    const onChange = (next: TrackSelectArgs) => {
      const previous = current
      current = next
      if (
        next.open !== previous.open || next.lock !== previous.lock ||
        next.modal !== previous.modal || next.touch !== previous.touch
      ) hold()
      if (previous.aligned && !next.aligned) {
        clear()
        cut()
        if (previous.open) reveal()
      }
      if (previous.open && !next.open) closing()
      else if (!previous.open && next.open) {
        dragged = false
        opening()
      } else if (next.open && next.active !== previous.active) {
        focusActive(
          next.scroll
        )
      }
      transition.follow(previous, next)
    }

    const controller = new AbortController()
    const { signal } = controller

    return Effect.acquireRelease(
      Effect.sync(() => {
        listenOutside(node, signal, {
          open: () => current.open,
          inside,
          pressed: (pointerType) =>
            send(SelectMessage.PressedOutside({ pointerType })),
          focused: () => send(SelectMessage.FocusedOutside())
        })
        document.addEventListener("pointerdown", onPointerDown, {
          capture: true,
          signal
        })
        listenTrees(node, "mouseup", onMouseUp, {
          capture: true,
          signal
        })
        listenTrees(node, "focusin", onFocusIn, {
          capture: true,
          signal
        })
        node.addEventListener("pointermove", onPointerMove, { signal })
        node.addEventListener("mousemove", onMouseMove, { signal })
        node.addEventListener("mouseleave", stopArrow, { signal })
        node.addEventListener("mousedown", onMouseDown, { signal })
        node.addEventListener("scroll", onScroll, {
          capture: true,
          passive: true,
          signal
        })
        view?.addEventListener("resize", onResize, { signal })
        hold()
        raiseAbove(node)
        if (current.open) opening()
        else node.inert = true
      }).pipe(
        Effect.tap(() =>
          Effect.forkScoped(Stream.runForEach(changes, (next) =>
            Effect.sync(() =>
              onChange(next)
            )))
        )
      ),
      () =>
        Effect.sync(() => {
          controller.abort()
          clearTimeout(timer)
          stopArrow()
          release?.()
          release = undefined
          transition.cancel()
          clear()
          node.inert = false
        })
    )
  })

const TrackSelect = Mount.makeStream(
  "TrackSelect",
  { args: TrackSelectArgs },
  (node: HTMLElement, args, changes) =>
    Stream.merge(
      watch(node, args, changes),
      Positioning.trackPosition(
        node,
        args.position,
        Stream.map(changes, (next) => next.position)
      ).pipe(
        Stream.map((placement) => SelectMessage.ChangedPlacement({ placement }))
      )
    )
)

const alignedBox =
  "position:fixed;inset:auto;margin-left:0;margin-right:0;--available-width:100vw;--available-height:100vh"

const scrolling =
  "position:relative;max-height:100%;overflow-x:hidden;overflow-y:auto;scrollbar-width:none"

/**
 * Creates a select whose selected values, items, `item` and `itemIndicator`
 * parts and `Picked` event use the supplied string-valued schema. Autofill
 * selects only a matching item.
 *
 * The schema must encode to a string. Create the component once at module
 * level: each call creates a new component. The existing `Select` export
 * uses `Schema.String`.
 *
 * **Example** (A select typed by a literal union)
 *
 * ```ts import.meta.vitest
 * import { UiSchema } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { makeSelect } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const Theme = Schema.Literals(["light", "dark"])
 * const ThemeSelect = makeSelect({ value: Theme })
 * const items = [{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }] as const
 *
 * const Message = UiSchema.TaggedEnum({
 *   PickedTheme: { theme: Theme },
 *   Toggled: { open: Schema.Boolean }
 * })
 *
 * const Settings = Html.component({
 *   name: "Settings",
 *   model: Schema.Struct({ theme: Theme, open: Schema.Boolean }),
 *   message: Message
 * }).make({
 *   init: () => ({ theme: "light" as const, open: false }),
 *   update: {
 *     PickedTheme: ($, { theme }) => $.evolve({ theme }),
 *     Toggled: ($, { open }) => $.evolve({ open })
 *   },
 *   view: (h, model) =>
 *     ThemeSelect(h, {
 *       props: { open: model.open, value: model.theme, items },
 *       onEmit: {
 *         // `value` is "light" | "dark" | ReadonlyArray<"light" | "dark"> | null
 *         Picked: ({ value }) => typeof value === "string" ? Message.PickedTheme({ theme: value }) : undefined,
 *         RequestedOpen: () => Message.Toggled({ open: true }),
 *         RequestedClose: () => Message.Toggled({ open: false }),
 *         Settled: () => undefined
 *       },
 *       view: (select) => select.trigger(h.button).children(select.value(h.span))
 *     })
 * })
 *
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Settings, {}))
 * if (!html.includes("Light")) throw new Error("the trigger doesn't show the value")
 * ```
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const makeSelect = <V extends string>(
  options: { readonly value: Schema.Codec<V, string> }
) => {
  const events = eventsSchema(options.value)
  return Html.component({
    name: "Select",
    props: propsSchema(options.value),
    model: SelectModel,
    message: SelectMessage,
    events,
    restore: false,
    reads: {
      toolbar: { owner: Toolbar, optional: true }
    }
  }).make({
    init: () => ({
      mounted: false,
      started: false,
      openMethod: null,
      closeMethod: null,
      focusLeft: false,
      active: null,
      activeByKey: false,
      typeahead: Typeahead.initial,
      spaceDown: false,
      placement: null,
      fellBack: false,
      scrollUp: false,
      scrollDown: false,
      pressing: false,
      pressedItem: false,
      releaseSelected: false,
      releaseUnselected: false
    }),
    update: {
      PressedTrigger: ($, { pointerType }) => toggle($, methodOf(pointerType)),
      ReleasedTrigger: ($) => $.evolve({ pressing: false }),
      ClickedTrigger: ($, { pointerType }) => toggle($, methodOf(pointerType)),
      PressedTriggerKey: ($, { key }) => {
        const props = $.props
        if (props.disabled === true) return $.model
        if (key === "ArrowDown" || key === "ArrowUp") {
          return props.open
            ? $.model
            : open($, "list-navigation", "keyboard", key)
        }
        if (
          !props.open && (props.readOnly === true || props.multiple === true)
        ) {
          return $.model
        }
        return typeKey($, events, key)
      },
      ClickedLabel: focusTrigger,
      FocusedInput: focusTrigger,
      Autofilled: ($, { value }) => {
        const props = $.props
        if (
          props.disabled === true || props.readOnly === true ||
          props.multiple === true
        ) return $.model
        const item = autofillMatch(props.items, value)
        return !ListNavigation.available(item) ||
            valuesOf(props).includes(item.value)
          ? $.model
          : $.emit(events.Picked({ value: item.value, reason: "none" }))
      },
      PressedPopupKey: ($, { key }) => {
        const props = $.props
        if (!props.open) return $.model
        const to = ListNavigation.target(key, {
          at: indexOf(props, $.model.active),
          last: props.items.length - 1,
          orientation: "vertical",
          loop: "none"
        })
        if (to !== undefined) return highlight($.model, props, to)
        switch (key) {
          case "Enter":
            return $.model.active === null
              ? $.model
              : pick($.model, $, events, $.model.active, "keyboard")
          case "Escape":
            return dismiss($.model, $, "escape-key", "keyboard")
          case "Tab":
            return dismiss($.model, $, "focus-out", "keyboard")
          case " ":
            return Typeahead.isTyping($.model.typeahead)
              ? typeKey($, events, key)
              : $.evolve({ spaceDown: true })
          default:
            return typeKey($, events, key)
        }
      },
      ReleasedSpace: ($) => {
        if (!$.model.spaceDown) return $.model
        const next = UiStruct.evolve($.model, { spaceDown: false })
        return $.props.open && $.model.active !== null
          ? pick(next, $, events, $.model.active, "keyboard")
          : next
      },
      EnteredItem: ($, { value }) => hover($.model, value),
      LeftItem: ($) => hover($.model, null),
      PressedItem: ($) => $.evolve({ pressedItem: true }),
      ReleasedItem: ($, { pointerType, value }) => {
        if ($.model.pressedItem || !$.props.open) return $.model
        const selected = valuesOf<string>($.props).includes(value)
        if (selected ? !$.model.releaseSelected : !$.model.releaseUnselected) {
          return $.model
        }
        return pick($.model, $, events, value, methodOf(pointerType))
      },
      ClickedItem: ($, { pointerType, value }) => {
        const next = UiStruct.evolve($.model, { pressedItem: false })
        if (!$.props.open) return next
        return pointerType === "touch" || pointerType === "" ||
            $.model.pressedItem
          ? pick(next, $, events, value, methodOf(pointerType))
          : next
      },
      CompletedWaitBeforeResetTyping: ($) =>
        $.evolve({ typeahead: Typeahead.reset }),
      ShowedPopup: ($) =>
        $.evolve(
          $.props.open
            ? { mounted: true, closeMethod: null, focusLeft: false }
            : { mounted: true }
        ),
      RenderedFirstFrame: ($) =>
        $.props.open ? $.evolve({ started: true }) : $.model,
      FinishedTransition: ($, { open }) => {
        if (open !== $.props.open) return $.model
        if (open) return $.emit(events.Settled({ open }))
        return $.model.mounted && $.props.holdExit !== true
          ? $.evolve({
            mounted: false,
            started: false,
            fellBack: false,
            scrollUp: false,
            scrollDown: false,
            pressedItem: false
          }).emit(events.Settled({ open }))
          : $.model
      },
      ChangedPlacement: ($, { placement }) => $.evolve({ placement }),
      PressedOutside: ($, { pointerType }) =>
        dismiss($.model, $, "outside-press", methodOf(pointerType)),
      PressedDismiss: ($) => dismiss($.model, $, "close-press", null),
      FocusedOutside: ($) => dismiss($.model, $, "focus-out", null, true),
      FocusedTrigger: ($) =>
        alignedOf($.model, $.props)
          ? dismiss($.model, $, "none", null)
          : $.model,
      ReleasedPointer: ($, { outside }) => {
        if (!$.model.pressing) return $.model
        const next = UiStruct.evolve($.model, { pressing: false })
        return outside ? dismiss(next, $, "cancel-open", "mouse") : next
      },
      ResizedWindow: ($) =>
        alignedOf($.model, $.props)
          ? dismiss($.model, $, "window-resize", null)
          : $.model,
      FellBack: ($) => $.evolve({ fellBack: true }),
      ChangedScrollArrows: ($, { down, up }) =>
        $.evolve({ scrollUp: up, scrollDown: down }),
      ScrolledByArrow: ($) => hover($.model, null),
      AllowedRelease: ($) =>
        $.evolve({ releaseSelected: true, releaseUnselected: true }),
      DraggedPointer: ($) => $.evolve({ releaseUnselected: true })
    },
    parts: (p, model) => {
      const props = p.props
      const open = props.open
      const shown = open || model.mounted
      const transitionStatus: SelectTransitionStatus = statusOf(model, props)
      const disabled = props.disabled === true
      const readOnly = props.readOnly === true
      const required = props.required === true
      const multiple = props.multiple === true
      const arrowsOpen = p.reads.toolbar?.orientation !== "vertical"
      const values = valuesOf(props)
      const chosen = new Set(values)
      const filled = filledOf(props)
      const aligned = alignedOf(model, props)
      const topLayer = props.topLayer !== false
      const modal = topLayer && props.modal !== false
      const touch = model.openMethod === "touch"
      const triggerId = props.id ?? p.id("trigger")
      const labelId = p.id("label")
      const popupId = p.id("popup")
      const listId = p.id("list")
      const arrowId = p.id("arrow")
      const itemId = (value: string) => p.id("item", value)
      const groupLabelId = (group: string) => p.id("group-label", group)
      const tracked = Positioning.trackArgs(props, {
        side: "bottom",
        collisionAvoidance: Positioning.dropdownCollisionAvoidance,
        anchorSelector: idSelector(triggerId),
        arrowId,
        leaveCoordinates: aligned
      })
      const position = aligned
        ? {
          ...tracked,
          disableAnchorTracking: props.disableAnchorTracking ?? true
        }
        : tracked
      const side = model.placement?.side ?? tracked.options.side
      const align = model.placement?.align ?? tracked.options.align
      const shownSide = aligned ? "none" : side
      const items = new Map<string, SelectItem<V>>(
        props.items.map((item) => [item.value, item])
      )
      const itemOf = (value: string): SelectItem<V> => {
        const item = items.get(value)
        if (item === undefined) {
          throw new Error(
            "Select: no item in the items prop has the value \"" + value + "\""
          )
        }
        return item
      }
      const text = !filled && props.placeholder !== undefined
        ? props.placeholder
        : values.map((value) => items.get(value)?.label ?? value).join(", ")
      const hovers = open && props.highlightItemOnHover !== false
      // The active key can be stale after the items change, so resolve it to an item.
      const highlighted = model.active === null
        ? null
        : items.get(model.active)?.value ?? null
      let labelled = false
      let listed = false

      const states = <B extends Attributed<B>>(builder: B): B =>
        transitionAttrs(builder, open, transitionStatus)
      const placed = <B extends Attributed<B>>(builder: B): B =>
        states(builder).attrs({ "data-side": shownSide, "data-align": align })

      const inputs = formInputs(p, {
        name: props.name,
        form: props.form,
        autoComplete: props.autoComplete,
        required,
        readOnly,
        disabled,
        multiple,
        values,
        filled
      }, {
        focused: SelectMessage.FocusedInput(),
        autofilled: (value) => SelectMessage.Autofilled({ value })
      })
      const inputsBox = new Html.Element<SelectMessage>("span").attr(
        "style",
        "display:contents"
      )

      const label = p.part("div", (b) => {
        labelled = true
        return b.attr("id", labelId).on("click", SelectMessage.ClickedLabel())
      })

      const trigger = p.part("button", (b) =>
        b.ref(Trigger)
          .attrs({
            id: triggerId,
            type: "button",
            role: "combobox",
            "aria-haspopup": "listbox",
            "aria-expanded": String(open),
            "aria-readonly": readOnly ? "true" : undefined,
            "aria-required": required ? "true" : undefined,
            "aria-disabled": undefined,
            "data-popup-open": flag(open),
            "data-pressed": flag(open),
            "data-popup-side": shown ? side : undefined,
            "data-disabled": flag(disabled),
            "data-readonly": flag(readOnly),
            "data-required": flag(required),
            "data-placeholder": flag(!filled)
          })
          .disabled(disabled)
          .on("mousedown", ({ button, pointerType }) =>
            button === 0 && pointerType !== "touch"
              ? SelectMessage.PressedTrigger({ pointerType })
              : undefined)
          .on("mouseup", SelectMessage.ReleasedTrigger())
          .on("click", ({ pointerType }) =>
            pointerType === "" || pointerType === "touch"
              ? SelectMessage.ClickedTrigger({ pointerType })
              : undefined)
          .on(
            "keydown",
            (event) =>
              event.composing
                ? undefined
                : (arrowsOpen &&
                    (event.key === "ArrowDown" || event.key === "ArrowUp")) ||
                    (Typeahead.isPrintable(event) &&
                      (event.key !== " " ||
                        Typeahead.isTyping(model.typeahead)))
                ? SelectMessage.PressedTriggerKey({ key: event.key })
                : undefined,
            { preventDefault: true }
          )
          .forward((node) => {
            const named = node
              .attrs({
                "aria-controls": open ? (listed ? listId : popupId) : undefined,
                "aria-labelledby": node.elementAttrs["aria-labelledby"] ??
                  (labelled ? labelId : undefined)
              })
            return inputs.length === 0
              ? named
              : inputsBox.children(named, ...inputs)
          }))

      const value = p.part(
        "span",
        (b) =>
          b.attrs({
            "data-select-value": "",
            "data-placeholder": flag(!filled)
          })
            .forward((node) => fillValue(node, text))
      )

      const icon = p.part(
        "span",
        (b) => b.attrs({ "aria-hidden": "true", "data-popup-open": flag(open) })
      )

      const backdrop = p.part(
        "div",
        (b) =>
          layered(states(b).attr("role", "presentation"), topLayer, shown)
            .forward(ownStyle(backdropStyle(topLayer, open)))
      )

      const dismissPart = p.part(
        "span",
        (b) =>
          b.attrs(dismissAttrs(props.dismissLabel, open))
            .on("click", SelectMessage.PressedDismiss())
      )

      const positionerStyle = aligned
        ? alignedBox
        : Positioning.positionerStyle(tracked.positionMethod)
      const positioner = p.part("div", (b) => {
        const decorated = layered(
          placed(b).attrs({
            role: "presentation",
            "data-anchor-hidden": flag(
              shown && !aligned && model.placement?.anchorHidden
            )
          }),
          topLayer,
          shown
        )
          .forward((node) => {
            const styled = node.attr(
              "style",
              withStyle(node.elementAttrs.style, positionerStyle)
            )
            return modal ? styled.children(dismissPart(dismissSpan())) : styled
          })
        const blocked = modal
          ? decorated.children(open ? blocking.open : blocking.closed)
          : decorated
        if (!shown) return blocked
        const alignItem = props.items.find((item) => chosen.has(item.value)) ??
          props.items[0]
        return blocked.onMount(
          TrackSelect({
            position,
            open,
            mounted: model.mounted,
            started: model.started,
            holdExit: props.holdExit === true,
            aligned,
            lock: open && (modal || aligned),
            modal,
            touch,
            active: open && highlighted !== null
              ? itemId(highlighted)
              : null,
            scroll: model.activeByKey,
            pressing: model.pressing,
            finalFocus: props.finalFocus !== false,
            focusLeft: model.focusLeft,
            closeMethod: model.closeMethod,
            triggerId,
            popupId,
            listId,
            alignId: alignItem === undefined ? null : itemId(alignItem.value)
          })
        )
      })

      const listbox = <B extends Attributed<B>>(builder: B): B =>
        builder
          .attrs({
            role: "listbox",
            "aria-multiselectable": multiple ? "true" : undefined,
            "aria-readonly": readOnly ? "true" : undefined
          })
      const named = <B extends Attributed<B> & Named>(node: B): B =>
        fallbackLabelledBy(node, labelled ? labelId : undefined)

      const popup = p.part("div", (b) =>
        placed(b)
          .attrs({ id: popupId, tabindex: "-1" })
          .on(
            "keydown",
            (event) =>
              event.composing
                ? undefined
                : event.key === "ArrowDown" || event.key === "ArrowUp" ||
                    event.key === "Home" || event.key === "End" ||
                    event.key === "Enter" || event.key === "Escape" ||
                    (event.key === "Tab" && event.shift) ||
                    Typeahead.isPrintable(event)
                ? SelectMessage.PressedPopupKey({ key: event.key })
                : undefined,
            { preventDefault: true }
          )
          .on("keyup", ({ key }) =>
            key === " " ? SelectMessage.ReleasedSpace() : undefined)
          .forward((node) => {
            const own = listed
              ? node.attr("role", "presentation")
              : named(listbox(node))
            return aligned && !listed
              ? own.attr("style", withStyle(node.elementAttrs.style, scrolling))
              : own
          }))

      const list = p.part("div", (b) => {
        listed = true
        const own = listbox(b).attr("id", listId)
        return aligned
          ? own.forward((node) =>
            named(node).attr(
              "style",
              withStyle(node.elementAttrs.style, scrolling)
            )
          )
          : own.forward(named)
      })

      const arrowStyle = Positioning.arrowStyle(side)
      const arrowPart = p.part("div", (b) =>
        placed(b)
          .attrs({
            id: arrowId,
            "aria-hidden": "true",
            "data-uncentered": flag(model.placement?.arrowUncentered)
          })
          .forward((node) =>
            node.attr("style", withStyle(node.elementAttrs.style, arrowStyle))
          ))
      const arrow = View.wrapPart(
        arrowPart,
        <B extends View.PartTarget<"div">>(
          element: B
        ): ReturnType<B["attr"]> | undefined => {
          const applied = arrowPart(element)
          return aligned ? undefined : applied
        }
      )

      const itemPart = p.part("div", (b, value: V) => {
        const option = itemOf(value)
        const selected = chosen.has(value)
        const active = highlighted === value
        const off = option.disabled === true
        return b
          .attrs({
            id: itemId(value),
            role: "option",
            "aria-selected": String(selected),
            "aria-disabled": off ? "true" : undefined,
            tabindex: open && active ? "0" : "-1",
            "data-selected": flag(selected),
            "data-highlighted": flag(active),
            "data-disabled": flag(off)
          })
          .on(
            "mouseenter",
            () => hovers ? SelectMessage.EnteredItem({ value }) : undefined
          )
          .on("mouseleave", () => hovers ? SelectMessage.LeftItem() : undefined)
          .on("mousedown", SelectMessage.PressedItem())
          .on(
            "mouseup",
            ({ pointerType }) =>
              pointerType === "touch"
                ? undefined
                : SelectMessage.ReleasedItem({ value, pointerType })
          )
          .on(
            "click",
            ({ pointerType }) =>
              SelectMessage.ClickedItem({ value, pointerType })
          )
      })
      const item = valued(itemPart)

      const itemText = p.part("div", (b) => b.attr("data-select-item-text", ""))

      const indicatorPart = p.part("span", (b) => b.attr("aria-hidden", "true"))
      const itemIndicator = View.wrapPart(
        indicatorPart,
        <B extends View.PartTarget<"span">>(
          { element, keepMounted, value }: {
            readonly element: B
            readonly value: V
            readonly keepMounted?: boolean | undefined
          }
        ): ReturnType<B["attr"]> | undefined => {
          const applied = indicatorPart(element)
          return chosen.has(itemOf(value).value) || keepMounted === true
            ? applied
            : undefined
        }
      )

      const group = grouped(
        p.part(
          "div",
          (b, key: string) =>
            b.attrs({ role: "group", "aria-labelledby": groupLabelId(key) })
        )
      )
      const groupLabel = grouped(
        p.part(
          "div",
          (b, key: string) =>
            b.attrs({ id: groupLabelId(key), "aria-hidden": "true" })
        )
      )
      const separator = p.part("div", (b) => separatorAttrs(b, "horizontal"))

      const scrollArrow = (direction: "up" | "down") => {
        const visible =
          (direction === "up" ? model.scrollUp : model.scrollDown) && !touch &&
          shown
        const part = p.part("div", (b) =>
          b.attrs({
            "aria-hidden": "true",
            "data-select-scroll-arrow": direction,
            "data-direction": direction,
            "data-side": shownSide,
            "data-visible": flag(visible)
          })
            .forward((node) =>
              node.attr(
                "style",
                withStyle(node.elementAttrs.style, "position:absolute")
              )
            ))
        return View.wrapPart(
          part,
          <B extends View.PartTarget<"div">>(
            { element, keepMounted }: {
              readonly element: B
              readonly keepMounted?: boolean | undefined
            }
          ): ReturnType<B["attr"]> | undefined => {
            const applied = part(element)
            return visible || keepMounted === true ? applied : undefined
          }
        )
      }

      const finalFocus = p.part((b) => b.attr("data-final-focus", popupId))

      return {
        open,
        mounted: shown,
        transitionStatus,
        selected: props.value ?? null,
        placeholder: !filled,
        disabled,
        readOnly,
        required,
        multiple,
        side: shownSide,
        align,
        alignedWithTrigger: shown && aligned,
        highlighted,
        openMethod: open ? model.openMethod : null,
        label,
        trigger,
        value,
        icon,
        backdrop,
        positioner,
        popup,
        list,
        arrow,
        item,
        itemText,
        itemIndicator,
        group,
        groupLabel,
        separator,
        scrollUpArrow: scrollArrow("up"),
        scrollDownArrow: scrollArrow("down"),
        finalFocus
      }
    }
  })
}

/**
 * A select: a button that opens a list of options, the selected one shown on
 * the button.
 *
 * **Details**
 *
 * The parts also return plain values for markup that depends on them:
 * `open`, `mounted` (the popup shows, through its exit transition),
 * `transitionStatus`, `selected` (the `value` prop, or `null`),
 * `placeholder` (nothing is selected), `disabled`, `readOnly`,
 * `required`, `multiple`, `side` and `align` (where the popup ended up,
 * `side` being `"none"` while it's aligned with the trigger),
 * `alignedWithTrigger`, `highlighted` (the value of the item with focus) and
 * `openMethod`, which is `null` once the popup closes.
 *
 * Each part's attributes win over the ones the consumer set on the builder
 * before the part, including the ones a state leaves absent. Besides the
 * ones under **Data attributes** in the module docs, they are:
 *
 * - `trigger`: `id`, which the `id` prop sets, `type="button"`,
 *   `role="combobox"`, `aria-haspopup="listbox"`, `aria-expanded`,
 *   `aria-readonly`, `aria-required`, `disabled`, no `aria-disabled`,
 *   `aria-controls` while open, pointing at the list or else the popup, and
 *   `aria-labelledby` pointing at `label` unless the builder has one
 * - `label`: `id`
 * - `backdrop`, `positioner`: `role="presentation"` and
 *   `popover="manual"`
 * - `popup`: `id`, `tabindex="-1"`, and `role="listbox"`,
 *   `aria-multiselectable`, `aria-readonly` and `aria-labelledby`
 *   pointing at `label` unless the builder has a name, or
 *   `role="presentation"` when a `list` is drawn inside it
 * - `list`: `id`, `role="listbox"`, `aria-multiselectable`,
 *   `aria-readonly`, and `aria-labelledby` as on the popup
 * - `item`: `id`, `role="option"`, `aria-selected`, `aria-disabled`,
 *   and `tabindex`, `"0"` while it's highlighted in an open popup and
 *   `"-1"` otherwise
 * - `group`: `role="group"` and `aria-labelledby` pointing at its
 *   `groupLabel`
 * - `groupLabel`: `id` and `aria-hidden="true"`
 * - `icon`, `arrow`, `itemIndicator`, `scrollUpArrow`,
 *   `scrollDownArrow`: `aria-hidden="true"`, and `id` on the arrow
 * - `separator`: `role="separator"`, `aria-orientation="horizontal"`
 *
 * With `modal`, the positioner also holds a visually hidden Dismiss button
 * for screen readers.
 *
 * The parts handle these events on a layer of their own, so the
 * consumer's handlers for them still run:
 *
 * - `trigger`: `mousedown`, `mouseup`, `click` and `keydown`
 * - `label`: `click`
 * - `popup`: `keydown` and `keyup`
 * - `item`: `mouseenter`, `mouseleave`, `mousedown`, `mouseup` and
 *   `click`
 *
 * The trigger and the popup cancel the keys they handle. The positioner's
 * mount places the popup, moves focus into it, scrolls it and listens for
 * presses and focus outside it. If it opens during `mousedown`, it cancels
 * the default action to keep focus in the popup.
 *
 * It emits `RequestedOpen`, `RequestedClose`, `Picked` and `Settled`.
 *
 * History restore saves nothing of it: after Back, forward or a reload it
 * starts from `init`.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const Select = makeSelect({ value: Schema.String })
