import * as Command from "@effect/ui/Command"
import type * as Component from "@effect/ui/Component"
import * as Html from "@effect/ui/html/Html"
import * as HtmlCommand from "@effect/ui/html/HtmlCommand"
import * as Mount from "@effect/ui/Mount"
import * as UiSchema from "@effect/ui/UiSchema"
import * as View from "@effect/ui/View"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as ListNavigation from "../ListNavigation.ts"
import * as Positioning from "../Positioning.ts"
import * as Typeahead from "../Typeahead.ts"
import {
  type Attributed,
  attrSelector,
  defaults,
  fallbackLabel,
  fallbackLabelledBy,
  flag,
  type Named,
  ownStyle,
  separatorAttrs,
  visuallyHidden,
  withStyle
} from "./attributes.ts"
import {
  backdropStyle,
  blockers,
  cutPath,
  dismissAttrs,
  dismissSpan
} from "./blocker.ts"
import {
  type Directed,
  isRtl,
  rightToLeft,
  watchDirectionWhile
} from "./direction.ts"
import {
  byAttribute,
  focusFinal,
  isElement,
  isHTMLElement,
  trapTab
} from "./dom.ts"
import { textFilter } from "./filter.ts"
import {
  autofillMatch,
  filledOf,
  formInputs,
  toggled,
  valuesOf
} from "./formInputs.ts"
import { methodOf } from "./interaction.ts"
import { grouped, valued } from "./list.ts"
import { holdLayer, nextLayerOrder } from "./modal.ts"
import { listenOutside, releasedOutside } from "./outside.ts"
import { fillValue } from "./range.ts"
import { layered, raiseAbove } from "./topLayer.ts"
import {
  frameOf,
  settling,
  statusOf,
  transitionAttrs,
  type TransitionStatus
} from "./transition.ts"

export const itemSchema = <S extends Schema.Codec<string, string>>(value: S) =>
  Schema.Struct({
    value,
    label: Schema.String,
    disabled: Schema.optional(Schema.Boolean),
    group: Schema.optional(Schema.String),
    row: Schema.optional(Schema.Number)
  })

export const Item = itemSchema(Schema.String)

export type Item<V extends string = string> = ReturnType<
  typeof itemSchema<Schema.Codec<V, string>>
>["Type"]

export interface Group<V extends string = string> {
  readonly key: string | undefined
  readonly items: ReadonlyArray<Item<V>>
  readonly rows: ReadonlyArray<ReadonlyArray<Item<V>>>
}

export type { TransitionStatus }

export const Interaction = Schema.Literals([
  "mouse",
  "touch",
  "pen",
  "keyboard"
])

export type Interaction = typeof Interaction.Type

export const TextReason = Schema.Literals([
  "trigger-press",
  "input-press",
  "outside-press",
  "item-press",
  "close-press",
  "escape-key",
  "list-navigation",
  "focus-out",
  "input-change",
  "input-clear",
  "clear-press",
  "cancel-open",
  "none"
])

export type TextReason = typeof TextReason.Type

export const ChangeReason = Schema.Literals([
  ...TextReason.literals,
  "chip-remove-press"
])

export type ChangeReason = typeof ChangeReason.Type

export const HighlightReason = Schema.Literals(["keyboard", "pointer", "none"])

export type HighlightReason = typeof HighlightReason.Type

export const FilterMode = Schema.Literals([
  "contains",
  "startsWith",
  "endsWith",
  "none"
])

export type FilterMode = typeof FilterMode.Type

export interface Emits<E, V extends string = string> {
  readonly requestedOpen: (reason: TextReason) => E
  readonly requestedClose: (reason: TextReason) => E
  readonly picked?:
    | ((
      value: V | ReadonlyArray<V> | null,
      reason: ChangeReason
    ) => E)
    | undefined
  readonly edited: (inputValue: string, reason: TextReason) => E
  readonly highlighted: (
    value: V | null,
    index: number,
    reason: HighlightReason
  ) => E
  readonly settled: (open: boolean) => E
}

export interface Settings<E, V extends string = string>
  extends Positioning.PositionerOptions
{
  readonly emits: Emits<E, V>
  readonly open: boolean
  readonly inputValue: string
  readonly items: ReadonlyArray<Item<V>>
  readonly value?: V | ReadonlyArray<V> | null | undefined
  readonly multiple?: boolean | undefined
  readonly filter?: FilterMode | undefined
  readonly filteredItems?: ReadonlyArray<Item<V>> | undefined
  readonly locale?: string | undefined
  readonly limit?: number | undefined
  readonly autoHighlight?: boolean | "always" | undefined
  readonly mode?: "list" | "both" | "inline" | "none" | undefined
  readonly keepHighlight?: boolean | undefined
  readonly submitOnItemClick?: boolean | undefined
  readonly highlightItemOnHover?: boolean | undefined
  readonly loopFocus?: boolean | undefined
  readonly openOnInputClick?: boolean | undefined
  readonly inputInPopup?: boolean | undefined
  readonly inline?: boolean | undefined
  readonly grid?: boolean | undefined
  readonly virtualized?: boolean | undefined
  readonly placeholder?: string | undefined
  readonly disabled?: boolean | undefined
  readonly readOnly?: boolean | undefined
  readonly required?: boolean | undefined
  readonly name?: string | undefined
  readonly form?: string | undefined
  readonly autoComplete?: string | undefined
  readonly id?: string | undefined
  readonly dir?: "ltr" | "rtl" | undefined
  readonly modal?: boolean | undefined
  readonly dismissLabel?: string | undefined
  readonly removedLabel?: string | undefined
  readonly finalFocus?: boolean | undefined
  readonly holdExit?: boolean | undefined
}

type AnySettings = Settings<unknown, any>

export const Message = UiSchema.TaggedEnum({
  PressedInput: { pointerType: Schema.String },
  PressedGroup: { pointerType: Schema.String },
  ChangedInput: {
    value: Schema.String,
    inputType: Schema.String,
    composing: Schema.Boolean
  },
  PressedInputKey: { key: Schema.String, chips: Schema.Boolean },
  ReleasedInputKey: { key: Schema.String },
  FocusedInput: {},
  BlurredInput: {},
  PressedTrigger: { pointerType: Schema.String },
  ReleasedTrigger: {},
  ClickedTrigger: { pointerType: Schema.String },
  PressedTriggerKey: { key: Schema.String },
  ClickedLabel: {},
  FocusedFormInput: {},
  Autofilled: { value: Schema.String },
  PressedClear: {},
  RequestedChipRemoval: { value: Schema.String, reason: ChangeReason },
  PressedChipArrow: { key: Schema.String },
  EnteredItem: { value: Schema.String },
  LeftItem: {},
  PressedItem: { value: Schema.String },
  ReleasedItem: { value: Schema.String, button: Schema.Number },
  ClickedItem: { value: Schema.String, pointerType: Schema.String },
  PressedDismiss: {},
  CompletedWaitBeforeResetTyping: {},
  ShowedPopup: {},
  RenderedFirstFrame: {},
  FinishedTransition: { open: Schema.Boolean },
  ChangedPlacement: { placement: Positioning.Placement },
  PressedOutside: { pointerType: Schema.String },
  FocusedOutside: {},
  ReleasedPointer: { outside: Schema.Boolean },
  FoundDirection: { rtl: Schema.Boolean },
  FoundChipsDirection: { rtl: Schema.Boolean }
})

export type Message = typeof Message.Type

export const Model = Schema.Struct({
  mounted: Schema.Boolean,
  started: Schema.Boolean,
  openMethod: Schema.NullOr(Interaction),
  closeMethod: Schema.NullOr(Interaction),
  focusLeft: Schema.Boolean,
  active: Schema.NullOr(Schema.String),
  activeByKey: Schema.Boolean,
  autoFirst: Schema.Boolean,
  saved: Schema.NullOr(Schema.String),
  queryChanged: Schema.Boolean,
  closeQuery: Schema.NullOr(Schema.String),
  pressedItem: Schema.NullOr(Schema.String),
  pressing: Schema.Boolean,
  typeahead: Typeahead.State,
  placement: Schema.NullOr(Positioning.Placement),
  completion: Schema.NullOr(
    Schema.Struct({ label: Schema.String, from: Schema.String })
  ),
  // The CSS `direction` of the list or its positioner, and of the chips.
  rtl: Schema.Boolean,
  chipsRtl: Schema.Boolean,
  removing: Schema.NullOr(
    Schema.Struct({ value: Schema.String, label: Schema.String })
  )
})

export type Model = typeof Model.Type

export const init = (): Model => ({
  mounted: false,
  started: false,
  openMethod: null,
  closeMethod: null,
  focusLeft: false,
  active: null,
  activeByKey: false,
  autoFirst: false,
  saved: null,
  queryChanged: false,
  closeQuery: null,
  pressedItem: null,
  pressing: false,
  typeahead: Typeahead.initial,
  placement: null,
  completion: null,
  rtl: false,
  chipsRtl: false,
  removing: null
})

type Step<E> = Component.Step<Model, Message, E>

const Input = Html.ref("ComboboxInput", "input")
const Trigger = Html.ref("ComboboxTrigger", "button")
const Chip = Html.ref("ComboboxChip", "div")

const lockedOf = (props: AnySettings): boolean =>
  props.disabled === true || props.readOnly === true

const navigableOf = (props: AnySettings): boolean =>
  props.open || props.inline === true

const selectableOf = (props: AnySettings): boolean =>
  props.emits.picked !== undefined

const autoOf = (props: AnySettings): boolean =>
  props.autoHighlight !== undefined && props.autoHighlight !== false

const completesOf = (props: AnySettings): boolean =>
  (props.mode === "inline" || props.mode === "both") && props.readOnly !== true

const nonEmptyOf = (props: AnySettings): boolean =>
  selectableOf(props) ? filledOf(props) : props.inputValue !== ""

const displayedOf = (model: Model, props: AnySettings): string =>
  model.completion !== null && model.completion.from === props.inputValue &&
    completesOf(props) &&
    navigableOf(props)
    ? model.completion.label
    : props.inputValue

const itemOf = <V extends string>(
  props: Settings<unknown, V>,
  value: string
): Item<V> | undefined =>
  props.items.find((item) => item.value === value) ??
    props.filteredItems?.find((item) => item.value === value)

const selectedLabelOf = (props: AnySettings): string => {
  if (props.multiple === true) return ""
  const value = valuesOf(props)[0]
  return value === undefined || value === ""
    ? ""
    : itemOf(props, value)?.label ?? value
}

const queryOf = (model: Model, props: AnySettings, open: boolean): string =>
  !open && model.closeQuery !== null
    ? model.closeQuery
    : props.inputValue.trim()

const bypassed = (model: Model, props: AnySettings, query: string): boolean => {
  if (props.multiple === true || model.queryChanged || query === "") {
    return false
  }
  const label = selectedLabelOf(props)
  return label.length === query.length &&
    textFilter(props.locale).contains(label, query)
}

const shownOf = <V extends string>(
  model: Model,
  props: Settings<unknown, V>,
  open = props.open
): ReadonlyArray<Item<V>> => {
  const query = queryOf(model, props, open)
  const bypass = bypassed(model, props, query)
  if (props.filteredItems !== undefined && !bypass) return props.filteredItems
  const filter = props.mode === "inline" || props.mode === "none"
    ? "none"
    : props.filter ?? "contains"
  const match = textFilter(props.locale)
  const text = bypass ? "" : query
  const limit = props.limit ?? -1
  const shown: Array<Item<V>> = []
  for (const item of props.items) {
    if (limit > -1 && shown.length >= limit) break
    if (filter === "none" || match[filter](item.label, text)) shown.push(item)
  }
  return shown
}

const highlightedOf = <V extends string>(
  model: Model,
  props: AnySettings,
  shown: ReadonlyArray<Item<V>>
): V | null => {
  const active = model.active === null
    ? undefined
    : shown.find((item) => item.value === model.active)
  return active !== undefined
    ? active.value
    : model.autoFirst ||
        (props.autoHighlight === "always" && navigableOf(props))
    ? shown[0]?.value ?? null
    : null
}

const rowsOf = (
  items: ReadonlyArray<Item>
): ReadonlyArray<ReadonlyArray<number>> => {
  const rows: Array<Array<number>> = []
  items.forEach((item, index) => {
    const before = items[index - 1]
    const last = rows[rows.length - 1]
    if (
      last !== undefined && before !== undefined && item.row !== undefined &&
      before.row === item.row &&
      before.group === item.group
    ) last.push(index)
    else rows.push([index])
  })
  return rows
}

const groupsOf = <V extends string>(
  items: ReadonlyArray<Item<V>>
): ReadonlyArray<Group<V>> => {
  const groups: Array<{ key: string | undefined; items: Array<Item<V>> }> = []
  for (const item of items) {
    const last = groups[groups.length - 1]
    if (last !== undefined && last.key === item.group) last.items.push(item)
    else groups.push({ key: item.group, items: [item] })
  }
  return groups.map(({ items, key }) => ({
    key,
    items,
    rows: rowsOf(items).map((row) => row.map((index) => items[index]!))
  }))
}

const focus = <E>(
  step: Step<E>,
  ref: typeof Input | typeof Trigger | typeof Chip
): Step<E> => step.run(HtmlCommand.Focus.make({ ref }).pipe(Command.asNoop))

const picked = <E, V extends string>(
  step: Step<E>,
  props: Settings<E, V>,
  value: V | ReadonlyArray<V> | null,
  reason: ChangeReason
): Step<E> =>
  props.emits.picked === undefined
    ? step
    : step.evolve({ removing: null }).emit(props.emits.picked(value, reason))

const rewrite = <E, V extends string>(
  step: Step<E>,
  props: Settings<E, V>,
  inputValue: string,
  reason: TextReason
): Step<E> =>
  props.inputValue === inputValue
    ? step
    : step.emit(props.emits.edited(inputValue, reason))

const highlight = <E, V extends string>(
  step: Step<E>,
  props: Settings<E, V>,
  shown: ReadonlyArray<Item<V>>,
  value: string | null,
  reason: HighlightReason,
  byKey = false,
  before = highlightedOf(step.model, props, shown)
): Step<E> => {
  const label = reason !== "keyboard" || value === null || !completesOf(props)
    ? undefined
    : shown.find((item) => item.value === value)?.label
  const completion = reason === "pointer"
    ? step.model.completion
    : label === undefined
    ? null
    : { label, from: props.inputValue }
  const next = step.evolve({
    active: value,
    activeByKey: byKey,
    autoFirst: false,
    completion
  })
  const after = highlightedOf(next.model, props, shown)
  return before === after ? next : next.emit(
    props.emits.highlighted(
      after,
      after === null ? -1 : shown.findIndex((item) => item.value === after),
      reason
    )
  )
}

const unhighlight = <E, V extends string>(
  step: Step<E>,
  props: Settings<E, V>,
  reason: HighlightReason,
  listed = step.model
): Step<E> =>
  step.model.active === null && !step.model.autoFirst
    ? step.evolve({ activeByKey: false })
    : highlight(step, props, shownOf(listed, props), null, reason)

const open = <E, V extends string>(
  step: Step<E>,
  props: Settings<E, V>,
  reason: TextReason,
  method: Interaction,
  key?: string
): Step<E> => {
  if (props.open || props.disabled === true) return step
  let next = step
  let inputValue = props.inputValue
  const closeQuery = next.model.closeQuery
  if (closeQuery !== null) {
    const typed = reason === "input-change"
    const label = selectedLabelOf(props)
    const clears = !typed && selectableOf(props) &&
      props.inputInPopup === true && props.inline !== true &&
      inputValue !== "" &&
      (inputValue.trim() === closeQuery || inputValue === label)
    const matchesSelected = props.multiple !== true &&
      props.inputInPopup !== true && inputValue === label
    if (!typed && (clears || inputValue === "" || matchesSelected)) {
      next = next.evolve({ queryChanged: false })
    }
    next = next.evolve({ closeQuery: null })
    if (clears) {
      next = rewrite(next, props, "", "input-clear")
      inputValue = ""
    }
  }
  next = next.evolve({
    openMethod: method,
    closeMethod: null,
    focusLeft: false,
    pressedItem: null,
    typeahead: Typeahead.reset,
    pressing: reason === "trigger-press" && props.inputInPopup === true &&
      (method === "mouse" || method === "pen")
  }).emit(props.emits.requestedOpen(reason))
  const opened = { ...props, open: true, inputValue }
  const shown = shownOf(next.model, opened, true)
  let target: string | null = null
  if (reason !== "input-change" && !next.model.queryChanged) {
    const chosen = new Set(valuesOf(props))
    target = shown.find((item) => chosen.has(item.value))?.value ?? null
    if (
      target === null && reason === "list-navigation" &&
      (selectableOf(props) || autoOf(props))
    ) {
      target =
        (key === "ArrowUp" ? shown[shown.length - 1] : shown[0])?.value ?? null
    }
  }
  next = highlight(
    next,
    opened,
    shown,
    target,
    method === "keyboard" ? "keyboard" : "none",
    method === "keyboard",
    highlightedOf(next.model, props, shown)
  )
  return reason === "input-change" && autoOf(props)
    ? next.evolve({ autoFirst: true })
    : next
}

const dismiss = <E, V extends string>(
  step: Step<E>,
  props: Settings<E, V>,
  reason: TextReason,
  method: Interaction | null,
  focusLeft = false
): Step<E> => {
  if (!props.open) return step
  let next = step
  const inline = props.inline === true
  if (next.model.queryChanged) {
    const query = props.inputValue.trim()
    if (!inline) next = next.evolve({ closeQuery: query })
    if (props.multiple !== true) {
      if (query === "") next = next.evolve({ queryChanged: false })
    } else {
      if (props.inputInPopup === true) next = unhighlight(next, props, "none")
      if (props.inputInPopup !== true || inline) {
        next = rewrite(next, props, "", "input-clear")
      }
    }
  }
  return next.evolve({
    closeMethod: method,
    focusLeft,
    pressing: false,
    completion: null
  })
    .emit(props.emits.requestedClose(reason))
}

const toggle = <E, V extends string>(
  step: Step<E>,
  props: Settings<E, V>,
  method: Interaction
): Step<E> =>
  props.disabled === true
    ? step
    : props.open
    ? dismiss(step, props, "trigger-press", method)
    : open(step, props, "trigger-press", method)

const pick = <E, V extends string>(
  step: Step<E>,
  props: Settings<E, V>,
  value: string,
  method: Interaction
): Step<E> => {
  const item = itemOf(props, value)
  if (
    item === undefined || !ListNavigation.available(item) || lockedOf(props)
  ) {
    return step
  }
  if (props.multiple === true) {
    const added = picked(
      step,
      props,
      toggled(valuesOf(props), item.value),
      "item-press"
    )
    if (props.inputValue.trim() === "") return added
    return props.inputInPopup === true
      ? rewrite(added, props, "", "input-clear")
      : dismiss(added, props, "item-press", method)
  }
  const chosen = picked(step, props, item.value, "item-press")
  const closed = dismiss(
    props.inputInPopup === true && selectableOf(props)
      ? chosen
      : rewrite(chosen, props, item.label, "item-press"),
    props,
    "item-press",
    method
  )
  return props.submitOnItemClick === true
    ? closed.run(
      HtmlCommand.RequestSubmit.make({
        ref: props.inputInPopup === true ? Trigger : Input
      }).pipe(Command.asNoop)
    )
    : closed
}

const clear = <E, V extends string>(
  step: Step<E>,
  props: Settings<E, V>,
  reason: TextReason
): Step<E> => {
  if (lockedOf(props)) return step
  const cleared = rewrite(step, props, "", reason)
  return filledOf(props)
    ? picked(cleared, props, props.multiple === true ? [] : null, reason)
    : cleared
}

const navigate = <E, V extends string>(
  step: Step<E>,
  props: Settings<E, V>,
  shown: ReadonlyArray<Item<V>>,
  key: string
): Step<E> => {
  const highlighted = highlightedOf(step.model, props, shown)
  const at = shown.findIndex((item) => item.value === highlighted)
  const last = shown.length - 1
  const loops = props.loopFocus !== false
  const loop: ListNavigation.Loop = !loops
    ? "none"
    : autoOf(props)
    ? "wrap"
    : "escape"
  let index: number
  if (props.grid === true && (key === "ArrowLeft" || key === "ArrowRight")) {
    index = ListNavigation.step(
      at,
      last,
      (key === "ArrowRight") !== (props.dir === "rtl") ? 1 : -1,
      loops ? "wrap" : "none"
    )
  } else if (props.grid === true && at !== -1) {
    const rows = rowsOf(shown)
    const row = rows.findIndex((cells) => cells.includes(at))
    const column = rows[row]!.indexOf(at)
    const next = rows[
      ListNavigation.step(
        row,
        rows.length - 1,
        key === "ArrowDown" ? 1 : -1,
        loop
      )
    ]
    index = next === undefined ? -1 : next[Math.min(column, next.length - 1)]!
  } else {
    index = ListNavigation.step(at, last, key === "ArrowDown" ? 1 : -1, loop)
  }
  return highlight(
    step,
    props,
    shown,
    shown[index]?.value ?? null,
    "keyboard",
    true
  )
}

const edit = <E, V extends string>(
  step: Step<E>,
  props: Settings<E, V>,
  value: string,
  inputType: string,
  composing: boolean
): Step<E> => {
  if (lockedOf(props)) return step
  const query = value.trim()
  const auto = autoOf(props)
  const navigable = navigableOf(props)
  const inPopup = props.inputInPopup === true
  let next = step
  if (composing) {
    if (value === "" && props.openOnInputClick === false && !inPopup) {
      next = dismiss(next, props, "input-clear", null)
    }
    if (!props.open && query !== "") {
      return open(next, props, "input-change", "keyboard")
    }
    return navigable && !(auto && query !== "")
      ? unhighlight(next, props, "none", step.model)
      : next
  }
  const typed = inputType !== "" && inputType !== "insertReplacementText"
  next = next.emit(props.emits.edited(value, "input-change"))
  if (typed) {
    if (query !== "") next = next.evolve({ queryChanged: true })
    if (props.open) next = next.evolve({ closeQuery: null })
  }
  if (value === "" && !inPopup) {
    if (props.multiple !== true && filledOf(props)) {
      next = picked(next, props, null, "input-clear")
    }
    if (props.openOnInputClick === false) {
      next = dismiss(next, props, "input-clear", null)
    }
  }
  if (!props.open && typed && query !== "") {
    return open(
      next,
      { ...props, inputValue: value },
      "input-change",
      "keyboard"
    )
  }
  if (auto && typed) {
    return next.evolve({ active: null, autoFirst: query !== "" })
  }
  return navigable ? unhighlight(next, props, "none", step.model) : next
}

const removeChip = <E, V extends string>(
  step: Step<E>,
  props: Settings<E, V>,
  value: string,
  reason: ChangeReason
): Step<E> => {
  if (lockedOf(props)) return step
  const values = valuesOf(props)
  const kept = values.filter((other) => other !== value)
  if (kept.length === values.length) return step
  const removed = picked(
    unhighlight(step, props, "keyboard"),
    props,
    kept,
    reason
  ).evolve({ removing: { value, label: itemOf(props, value)?.label ?? value } })
  return reason === "chip-remove-press" ? focus(removed, Input) : removed
}

const hover = <E, V extends string>(
  step: Step<E>,
  props: Settings<E, V>,
  value: string | null
): Step<E> =>
  props.highlightItemOnHover === false || !navigableOf(props) ||
    (value === null && props.keepHighlight === true)
    ? step
    : value === null
    ? unhighlight(step, props, "pointer")
    : highlight(step, props, shownOf(step.model, props), value, "pointer")

const pressInputKey = <E, V extends string>(
  step: Step<E>,
  props: Settings<E, V>,
  key: string,
  chips: boolean
): Step<E> => {
  const values = valuesOf(props)
  switch (key) {
    case "ArrowDown":
    case "ArrowUp":
      return navigableOf(props)
        ? navigate(step, props, shownOf(step.model, props), key)
        : open(step, props, "list-navigation", "keyboard", key)
    case "ArrowLeft":
    case "ArrowRight": {
      if (props.grid === true && navigableOf(props)) {
        const shown = shownOf(step.model, props)
        if (highlightedOf(step.model, props, shown) !== null) {
          return navigate(step, props, shown, key)
        }
      }
      return chips && values.length > 0
        ? focus(step, Chip.at(values[values.length - 1]!))
        : step
    }
    case "Enter":
    case " ": {
      const highlighted = highlightedOf(
        step.model,
        props,
        shownOf(step.model, props)
      )
      return highlighted === null
        ? step
        : pick(step, props, highlighted, "keyboard")
    }
    case "Escape":
      return props.open
        ? dismiss(step, props, "escape-key", "keyboard")
        : clear(step, props, "escape-key")
    case "Backspace":
      return values.length > 0
        ? removeChip(step, props, values[values.length - 1]!, "none")
        : step
    default:
      return step
  }
}

const ListArgs = Schema.Struct({
  active: Schema.NullOr(Schema.String),
  scroll: Schema.Boolean,
  query: Schema.String,
  virtualized: Schema.Boolean,
  owner: Schema.String,
  completed: Schema.NullOr(
    Schema.Struct({ text: Schema.String, from: Schema.Number })
  )
})

type ListArgs = typeof ListArgs.Type

const scrollsY = (element: HTMLElement): boolean => {
  const view = element.ownerDocument.defaultView
  return view !== null && element.scrollHeight - element.clientHeight > 1 &&
    /auto|scroll|overlay/.test(view.getComputedStyle(element).overflowY)
}

// The input types `setSelectionRange` works on.
const selectingTypes = new Set(["text", "search", "url", "tel", "password"])

const folded = (text: string): string => text.normalize("NFC").toLowerCase()

// The offset in `text` where `prefix` ends, ignoring case and Unicode form
// and never between a letter and its marks.
const prefixEnd = (text: string, prefix: string): number | null => {
  const target = folded(prefix)
  for (let end = 0; end <= text.length; end++) {
    const head = folded(text.slice(0, end))
    if (head === target && !/^\p{M}/u.test(text.slice(end))) return end
    if (head.length > target.length + 1) return null
  }
  return null
}

const selectSuffix = (
  document: Document,
  owner: string,
  completed: NonNullable<ListArgs["completed"]>,
  frame: (f: () => void) => void
) => {
  const input = byAttribute(
    document,
    "data-combobox-input",
    owner
  ) as HTMLInputElement | null
  if (input === null || !selectingTypes.has(input.type)) return
  const select = () => {
    if (input.value === completed.text && document.activeElement === input) {
      input.setSelectionRange(completed.from, completed.text.length)
    }
  }
  if (input.value === completed.text) select()
  else frame(select)
}

const following = (document: Document, list: () => HTMLElement | null) => {
  const frame = frameOf(document.defaultView)
  let current: ListArgs | null = null
  const reveal = () =>
    frame(() => {
      if (current !== null && current.active !== null && !current.virtualized) {
        document.getElementById(current.active)?.scrollIntoView({
          block: "nearest"
        })
      }
    })
  const toTop = () => {
    for (let at = list(); at !== null; at = at.parentElement) {
      if (scrollsY(at)) {
        at.scrollTop = 0
        return
      }
      if (at.hasAttribute("data-combobox-positioner")) return
    }
  }
  return (next: ListArgs | null) => {
    const previous = current
    current = next
    const completed = next?.completed ?? null
    const before = previous?.completed
    if (
      next !== null && completed !== null &&
      (before?.text !== completed.text || before.from !== completed.from)
    ) selectSuffix(document, next.owner, completed, frame)
    if (next === null || next.virtualized) return
    if (previous === null) reveal()
    else {
      if (next.query !== previous.query) toTop()
      if (next.active !== previous.active && next.scroll) reveal()
    }
  }
}

const TrackComboboxArgs = {
  position: Positioning.TrackPositionArgs,
  open: Schema.Boolean,
  mounted: Schema.Boolean,
  started: Schema.Boolean,
  holdExit: Schema.Boolean,
  inputInPopup: Schema.Boolean,
  modal: Schema.Boolean,
  hide: Schema.Boolean,
  touch: Schema.Boolean,
  pressing: Schema.Boolean,
  finalFocus: Schema.Boolean,
  focusLeft: Schema.Boolean,
  closeMethod: Schema.NullOr(Interaction),
  owner: Schema.String,
  popupId: Schema.String,
  listId: Schema.String,
  list: ListArgs,
  // No `dir` prop or `DirectionProvider` decides the direction.
  css: Schema.Boolean
}

type TrackComboboxArgs = Schema.Struct<typeof TrackComboboxArgs>["Type"]

const blocking = blockers("data-combobox-blocker")

const removedStatus = new Html.Element<Message>("span")
  .attrs({ role: "status", style: visuallyHidden })

const watch = (
  node: HTMLElement,
  args: TrackComboboxArgs,
  changes: Stream.Stream<TrackComboboxArgs>
) =>
  Stream.callback<Message>((queue) => {
    const document = node.ownerDocument
    const view = document.defaultView
    const frame = frameOf(view)
    let current = args
    const send = (message: Message) => Queue.offerUnsafe(queue, message)
    const popup = (): HTMLElement =>
      document.getElementById(current.popupId) ?? node
    const list = (): HTMLElement | null =>
      document.getElementById(current.listId)
    const owned = (): Array<HTMLElement> =>
      Array.from(
        document.querySelectorAll<HTMLElement>(
          attrSelector("data-combobox-inside", current.owner)
        )
      )
    const find = (name: string): HTMLElement | null =>
      byAttribute(document, name, current.owner)
    const inside = (target: Node): boolean =>
      (node.contains(target) && !blocking.owns(node, target)) ||
      owned().some((element) => element.contains(target))

    const cut = () => {
      const layer = Array.from(node.children).find(blocking.is) as
        | HTMLElement
        | undefined
      if (layer === undefined) return
      const holes = owned().filter((element) => !node.contains(element)).map((
        element
      ) => element.getBoundingClientRect())
      layer.style.setProperty("clip-path", cutPath(holes))
    }

    const order = nextLayerOrder()
    let release: (() => void) | undefined
    const hold = () => {
      release?.()
      release = current.open
        ? holdLayer(node, order, {
          scroll: current.modal,
          touch: current.touch,
          hide: current.hide ? owned() : undefined
        })
        : undefined
    }

    const opening = () => {
      send(Message.ShowedPopup())
      node.inert = false
      cut()
      if (current.inputInPopup) {
        const focusIn = () => {
          const input = popup().querySelector<HTMLElement>(
            attrSelector("data-combobox-input", current.owner)
          )
          ;(current.touch || input === null ? popup() : input).focus({
            preventScroll: true
          })
        }
        focusIn()
        // The default action of the press that opened it focuses the trigger.
        frame(() => {
          if (
            current.open &&
            document.activeElement === find("data-combobox-trigger")
          ) focusIn()
        })
      }
      if (!current.started) {
        frame(() => frame(() => send(Message.RenderedFirstFrame())))
      }
    }

    const closing = () => {
      const focused = document.activeElement
      const lost = focused === null || focused === document.body ||
        node.contains(focused)
      if (
        current.inputInPopup && current.finalFocus &&
        (lost || !current.focusLeft)
      ) {
        focusFinal(
          document,
          current.popupId,
          find("data-combobox-trigger"),
          lost,
          current.closeMethod === "keyboard"
        )
      } else if (isHTMLElement(focused) && node.contains(focused)) {
        if (current.inputInPopup) focused.blur()
        else find("data-combobox-input")?.focus({ preventScroll: true })
      }
      node.inert = true
    }

    const onMouseUp = (event: MouseEvent) => {
      if (!current.pressing) return
      send(
        Message.ReleasedPointer({
          outside: releasedOutside(event, inside, find("data-combobox-trigger"))
        })
      )
    }
    const onFocusIn = (event: FocusEvent) => {
      if (current.inputInPopup || current.touch || !current.open) return
      const target = event.target
      if (!isElement(target)) return
      if (target !== popup()) {
        const owner = list()
        if (
          owner === null || !owner.contains(target) ||
          target.closest("[role=listbox],[role=grid]") !== owner
        ) return
        const marked = target.closest(
          "[data-combobox-inside],[data-combobox-positioner]"
        )
        if (
          marked !== node &&
          marked?.getAttribute("data-combobox-inside") !== current.owner
        ) return
      }
      find("data-combobox-input")?.focus({ preventScroll: true })
    }
    const onMouseDown = (event: MouseEvent) => {
      if (blocking.owns(node, event.target)) event.preventDefault()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "Tab" && !event.defaultPrevented && current.open &&
        current.inputInPopup && current.modal
      ) trapTab(event, popup())
    }

    const transition = settling(node, popup, frame, (open) =>
      send(Message.FinishedTransition({ open })))
    const follow = following(document, list)

    const onChange = (next: TrackComboboxArgs) => {
      const previous = current
      current = next
      if (
        next.open !== previous.open || next.modal !== previous.modal ||
        next.hide !== previous.hide ||
        next.touch !== previous.touch
      ) {
        hold()
      }
      if (previous.open && !next.open) {
        closing()
      } else if (!previous.open && next.open) {
        opening()
      }
      transition.follow(previous, next)
      follow(next.open ? next.list : null)
    }

    const controller = new AbortController()
    const { signal } = controller

    return Effect.acquireRelease(
      Effect.sync(() => {
        listenOutside(node, signal, {
          open: () =>
            current.open,
          inside,
          pressed: (pointerType) =>
            send(Message.PressedOutside({ pointerType })),
          focused: () => send(Message.FocusedOutside())
        })
        document.addEventListener("mouseup", onMouseUp, {
          capture: true,
          signal
        })
        node.addEventListener("focusin", onFocusIn, { signal })
        node.addEventListener("mousedown", onMouseDown, { signal })
        node.addEventListener("keydown", onKeyDown, { signal })
        hold()
        raiseAbove(node)
        if (current.open) opening()
        else node.inert = true
        follow(current.open ? current.list : null)
      }).pipe(
        Effect.tap(() =>
          Effect.forkScoped(
            Stream.runForEach(
              changes,
              (next) => Effect.sync(() => onChange(next))
            )
          )
        ),
        Effect.tap(() =>
          watchDirectionWhile(
            node,
            args,
            changes,
            (rtl) => send(Message.FoundDirection({ rtl }))
          )
        )
      ),
      () =>
        Effect.sync(() => {
          controller.abort()
          release?.()
          release = undefined
          transition.cancel()
          node.inert = false
        })
    )
  })

const TrackCombobox = Mount.makeStream(
  "TrackCombobox",
  { args: TrackComboboxArgs },
  (node: HTMLElement, args, changes) =>
    Stream.merge(
      watch(node, args, changes),
      Positioning.trackPosition(
        node,
        args.position,
        Stream.map(changes, (next) => next.position)
      ).pipe(
        Stream.map((placement) => Message.ChangedPlacement({ placement }))
      )
    )
)

const TrackComboboxList = Mount.makeStream(
  "TrackComboboxList",
  { args: { list: ListArgs, css: Schema.Boolean } },
  (node: HTMLElement, args, changes) =>
    Stream.callback<Message>((queue) => {
      const follow = following(node.ownerDocument, () => node)
      return watchDirectionWhile(
        node,
        args,
        changes,
        (rtl) => Queue.offerUnsafe(queue, Message.FoundDirection({ rtl }))
      ).pipe(
        Effect.andThen(Effect.sync(() => follow(args.list))),
        Effect.andThen(Effect.forkScoped(Stream.runForEach(changes, (next) =>
          Effect.sync(() =>
            follow(next.list)
          ))))
      )
    })
)

const TrackComboboxChips = Mount.makeStream(
  "TrackComboboxChips",
  {
    args: {
      owner: Schema.String,
      // Set by `dir` or a provider; else the chips' CSS as the key lands.
      rtl: Schema.NullOr(Schema.Boolean),
      css: Schema.Boolean,
      locked: Schema.Boolean
    }
  },
  (node: HTMLElement, args, changes) =>
    Stream.callback<Message>((queue) => {
      let current = args
      const send = (message: Message) => Queue.offerUnsafe(queue, message)
      const chips = () =>
        Array.from(node.querySelectorAll<HTMLElement>("[data-combobox-chip]"))
          .filter((chip) => chip.closest("[data-combobox-chips]") === node)
      const input = () =>
        byAttribute(node.ownerDocument, "data-combobox-input", current.owner)
      const onKeyDown = (event: KeyboardEvent) => {
        const chip = event.target
        if (
          event.defaultPrevented || current.locked || event.isComposing ||
          !isHTMLElement(chip) ||
          !chip.hasAttribute("data-combobox-chip")
        ) return
        const all = chips()
        const index = all.indexOf(chip)
        if (index === -1) return
        const move = (target: HTMLElement | undefined) =>
          (target ?? input())?.focus()
        const [previous, next] = (current.rtl ?? isRtl(node))
          ? ["ArrowRight", "ArrowLeft"]
          : ["ArrowLeft", "ArrowRight"]
        const key = event.key
        if (key === previous || key === next) {
          event.preventDefault()
          move(all[key === previous ? index - 1 : index + 1])
        } else if (key === "Backspace" || key === "Delete") {
          event.preventDefault()
          move(index >= all.length - 1 ? all[index - 1] : all[index + 1])
          send(
            Message.RequestedChipRemoval({
              value: chip.getAttribute("data-combobox-chip") ?? "",
              reason: "none"
            })
          )
        } else if (key === "Enter" || key === " ") {
          event.preventDefault()
          move(undefined)
        } else if (key === "ArrowDown" || key === "ArrowUp") {
          event.preventDefault()
          send(Message.PressedChipArrow({ key }))
          move(undefined)
        } else if (
          Typeahead.isPrintable({
            key,
            alt: event.altKey,
            ctrl: event.ctrlKey,
            meta: event.metaKey,
            composing: event.isComposing
          })
        ) {
          move(undefined)
        }
      }
      const controller = new AbortController()
      return Effect.acquireRelease(
        Effect.sync(() => {
          node.addEventListener("keydown", onKeyDown, {
            signal: controller.signal
          })
        }).pipe(
          Effect.tap(() =>
            Effect.forkScoped(Stream.runForEach(changes, (next) =>
              Effect.sync(() => {
                current = next
              })))
          ),
          Effect.tap(() =>
            watchDirectionWhile(
              node,
              args,
              changes,
              (rtl) =>
                send(Message.FoundChipsDirection({ rtl }))
            )
          )
        ),
        () => Effect.sync(() => controller.abort())
      )
    })
)

type Update<P, E> = Component.Update<Model, Message, E, P> & Directed

// The `dir` prop wins, then the nearest `DirectionProvider`, then the CSS
// `direction` a mount found.
const rtlOf = (
  dir: "ltr" | "rtl" | undefined,
  reads: Directed["reads"],
  css: boolean
): boolean =>
  dir !== undefined ? dir === "rtl" : rightToLeft(reads.provider, css)

type Handlers<P, E> = {
  readonly [K in Message["_tag"]]: (
    $: Update<P, E>,
    message: Extract<Message, { readonly _tag: K }>
  ) => Model | Step<E>
}

export const make = <P, E, V extends string = string>(
  name: string,
  settingsOf: (props: P) => Settings<E, V>
) => {
  // With `dir` resolved for the list's keys.
  const s = ($: Update<P, E>): Settings<E, V> => {
    const settings = settingsOf($.props)
    return {
      ...settings,
      dir: rtlOf(settings.dir, $.reads, $.model.rtl) ? "rtl" : "ltr"
    }
  }

  const focusInput = ($: Update<P, E>) => {
    const props = s($)
    return focus(
      $,
      props.inputInPopup === true && !props.open ? Trigger : Input
    )
  }

  const update: Handlers<P, E> = {
    PressedInput: ($, { pointerType }) =>
      open($, s($), "input-press", methodOf(pointerType)),
    PressedGroup: ($, { pointerType }) => {
      const props = s($)
      if (props.disabled === true) return $.model
      const focused = focus($, Input)
      return props.openOnInputClick === false
        ? focused
        : open(focused, props, "input-press", methodOf(pointerType))
    },
    ChangedInput: ($, { composing, inputType, value }) =>
      edit($, s($), value, inputType, composing),
    PressedInputKey: ($, { chips, key }) => pressInputKey($, s($), key, chips),
    ReleasedInputKey: ($, { key }) =>
      key === "Enter"
        ? dismiss($, s($), "none", "keyboard")
        : clear($, s($), "escape-key"),
    FocusedInput: ($) => {
      if ($.model.saved === null) return $.model
      const props = s($)
      return highlight($, props, shownOf($.model, props), $.model.saved, "none")
        .evolve({ saved: null })
    },
    BlurredInput: ($) => {
      const props = s($)
      const shown = shownOf($.model, props)
      const highlighted = highlightedOf($.model, props, shown)
      return highlighted === null
        ? $.model
        : highlight($, props, shown, null, "none").evolve({
          saved: highlighted
        })
    },
    PressedTrigger: ($, { pointerType }) => {
      const props = s($)
      return toggle(
        props.inputInPopup === true ? $ : focus($, Input),
        props,
        methodOf(pointerType)
      )
    },
    ReleasedTrigger: ($) => $.evolve({ pressing: false }),
    ClickedTrigger: ($, { pointerType }) =>
      toggle($, s($), methodOf(pointerType)),
    PressedTriggerKey: ($, { key }) => {
      const props = s($)
      if (props.disabled === true) return $.model
      if (key === "ArrowDown" || key === "ArrowUp") {
        const opened = open($, props, "list-navigation", "keyboard", key)
        return props.inputInPopup === true ? opened : focus(opened, Input)
      }
      if (props.readOnly === true) return $.model
      const values = valuesOf(props)
      const { index, state } = Typeahead.step(
        $.model.typeahead,
        key,
        props.items,
        props.items.findIndex((item) => values.includes(item.value))
      )
      const item = props.items[index]
      const typed = $.evolve({ typeahead: state }).run(
        Typeahead.waitReset(Message.CompletedWaitBeforeResetTyping)
      )
      return item === undefined || values.includes(item.value)
        ? typed
        : picked(typed, props, item.value, "none")
    },
    ClickedLabel: focusInput,
    FocusedFormInput: focusInput,
    Autofilled: ($, { value }) => {
      const props = s($)
      if (lockedOf(props) || props.multiple === true) return $.model
      if (!selectableOf(props)) return rewrite($, props, value, "none")
      const item = autofillMatch(props.items, value)
      if (
        !ListNavigation.available(item) || valuesOf(props).includes(item.value)
      ) {
        return $.model
      }
      const chosen = picked($, props, item.value, "none")
      return props.inputInPopup === true
        ? chosen
        : rewrite(chosen, props, item.label, "none")
    },
    PressedClear: ($) => {
      const props = s($)
      return lockedOf(props)
        ? $.model
        : focus(
          clear(unhighlight($, props, "pointer"), props, "clear-press"),
          Input
        )
    },
    RequestedChipRemoval: ($, { reason, value }) =>
      removeChip($, s($), value, reason),
    PressedChipArrow: ($, { key }) =>
      open($, s($), "list-navigation", "keyboard", key),
    EnteredItem: ($, { value }) => hover($, s($), value),
    LeftItem: ($) => hover($, s($), null),
    PressedItem: ($, { value }) => $.evolve({ pressedItem: value }),
    ReleasedItem: ($, { button, value }) => {
      const props = s($)
      const next = $.evolve({ pressedItem: null })
      if (
        $.model.pressedItem === value || button !== 0 || !navigableOf(props)
      ) return next
      return highlightedOf($.model, props, shownOf($.model, props)) === value
        ? pick(next, props, value, "mouse")
        : next
    },
    ClickedItem: ($, { pointerType, value }) =>
      pick($, s($), value, methodOf(pointerType)),
    PressedDismiss: ($) => dismiss($, s($), "close-press", null),
    CompletedWaitBeforeResetTyping: ($) =>
      $.evolve({ typeahead: Typeahead.reset }),
    ShowedPopup: ($) =>
      $.evolve(
        s($).open
          ? { mounted: true, closeMethod: null, focusLeft: false }
          : { mounted: true }
      ),
    RenderedFirstFrame: ($) =>
      s($).open ? $.evolve({ started: true }) : $.model,
    FinishedTransition: ($, { open }) => {
      const props = s($)
      if (open !== props.open) return $.model
      if (open) return $.emit(props.emits.settled(open))
      if (!$.model.mounted || props.holdExit === true) return $.model
      const rest = props.inputInPopup === true ? "" : selectedLabelOf(props)
      const closed = unhighlight($, props, "none").evolve({
        mounted: false,
        started: false,
        queryChanged: false,
        closeQuery: null,
        pressedItem: null,
        pressing: false
      })
      const settled = selectableOf(props)
        ? rewrite(closed, props, rest, rest === "" ? "input-clear" : "none")
        : closed
      return settled.emit(props.emits.settled(open))
    },
    ChangedPlacement: ($, { placement }) => $.evolve({ placement }),
    PressedOutside: ($, { pointerType }) =>
      dismiss($, s($), "outside-press", methodOf(pointerType)),
    FocusedOutside: ($) => dismiss($, s($), "focus-out", null, true),
    ReleasedPointer: ($, { outside }) => {
      if (!$.model.pressing) return $.model
      const next = $.evolve({ pressing: false })
      return outside ? dismiss(next, s($), "cancel-open", "mouse") : next
    },
    FoundDirection: ($, { rtl }) => $.evolve({ rtl }),
    FoundChipsDirection: ($, { rtl }) => $.evolve({ chipsRtl: rtl })
  }

  const parts = (
    p: Component.PartsHelper<Message, P, Html.Elements> & Directed,
    model: Model
  ) => {
    const props = settingsOf(p.props)
    const chipsRtl = rtlOf(props.dir, p.reads, model.chipsRtl)
    const css = props.dir === undefined && p.reads.provider === undefined
    const open = props.open
    const inline = props.inline === true
    const inPopup = props.inputInPopup === true
    const navigable = open || inline
    const shown = open || model.mounted
    const transitionStatus: TransitionStatus = statusOf(model, props)
    const disabled = props.disabled === true
    const readOnly = props.readOnly === true
    const required = props.required === true
    const multiple = props.multiple === true
    const grid = props.grid === true
    const topLayer = props.topLayer !== false
    const modal = topLayer && props.modal === true
    const values = valuesOf(props)
    const chosen = new Set<string>(values)
    const selectable = selectableOf(props)
    const filled = nonEmptyOf(props)
    const placeholding = selectable && !filled
    const nativeField = !selectable && !inPopup
    const displayed = displayedOf(model, props)
    const items = shownOf(model, props)
    const listEmpty = items.length === 0
    const highlighted = navigable || model.mounted
      ? highlightedOf(model, props, items)
      : null
    const known = new Map<string, Item<V>>(
      [...(props.filteredItems ?? []), ...props.items].map((
        item
      ) => [item.value, item])
    )
    const owner = p.id("combobox")
    const inputId = inPopup ? p.id("input") : props.id ?? p.id("input")
    const triggerId = inPopup ? props.id ?? p.id("trigger") : p.id("trigger")
    const labelId = p.id("label")
    const popupId = p.id("popup")
    const listId = p.id("list")
    const arrowId = p.id("arrow")
    const itemId = (value: string) => p.id("item", value)
    const groupLabelId = (group: string) => p.id("group-label", group)
    const tracked = Positioning.trackArgs(props, {
      side: "bottom",
      collisionAvoidance: Positioning.dropdownCollisionAvoidance,
      anchorSelector: inPopup
        ? attrSelector("data-combobox-trigger", owner)
        : attrSelector("data-combobox-group", owner) + "," +
          attrSelector("data-combobox-input", owner),
      arrowId
    })
    const side = model.placement?.side ?? tracked.options.side
    const align = model.placement?.align ?? tracked.options.align
    const popupSide = shown ? side : undefined
    const selectedItems = values.map((value) =>
      known.get(value) ?? { value, label: value }
    )
    const text = !selectable
      ? displayed
      : placeholding && props.placeholder !== undefined
      ? props.placeholder
      : selectedItems.map((item) => item.label).join(", ")
    const hovers = navigable && props.highlightItemOnHover !== false
    const listArgs: ListArgs = {
      active: highlighted === null ? null : itemId(highlighted),
      scroll: model.activeByKey,
      query: props.inputValue,
      virtualized: props.virtualized === true,
      owner,
      completed: (() => {
        if (displayed === props.inputValue) return null
        const from = prefixEnd(displayed, props.inputValue)
        return from === null ? null : { text: displayed, from }
      })()
    }
    const dismissable = !inline && (!inPopup || modal)
    let labelled = false
    let chipsDrawn = false

    const inside = <B extends Attributed<B>>(builder: B): B =>
      builder.attr("data-combobox-inside", owner)
    const labelledBy = <B extends Attributed<B> & Named>(node: B): B =>
      fallbackLabelledBy(node, labelled ? labelId : undefined)
    const states = <B extends Attributed<B>>(builder: B): B =>
      transitionAttrs(builder, open, transitionStatus)
    const placed = <B extends Attributed<B>>(builder: B): B =>
      states(builder).attrs({ "data-side": side, "data-align": align })
    const control = <B extends Attributed<B>>(builder: B): B =>
      builder
        .attrs({
          "data-popup-open": flag(open),
          "data-pressed": flag(open),
          "data-popup-side": popupSide,
          "data-list-empty": flag(listEmpty),
          "data-disabled": flag(disabled),
          "data-readonly": flag(readOnly)
        })

    const inputs = nativeField ? [] : formInputs(p, {
      name: props.name,
      form: props.form,
      autoComplete: props.autoComplete,
      required,
      readOnly,
      disabled,
      multiple,
      values: selectable ? values : [props.inputValue],
      filled
    }, {
      focused: Message.FocusedFormInput(),
      autofilled: (value) => Message.Autofilled({ value })
    })
    const inputsBox = new Html.Element<Message>("span").attr(
      "style",
      "display:contents"
    )

    const dismissPart = p.part("span", (b) =>
      inside(b)
        .attrs(dismissAttrs(props.dismissLabel, open))
        .on("click", Message.PressedDismiss()))

    const label = p.part("div", (b) => {
      labelled = true
      return b.attr("id", labelId).on("click", Message.ClickedLabel())
    })

    const value = p.part(
      "span",
      (b) =>
        b.attr("data-placeholder", flag(placeholding))
          .forward((node) => fillValue(node, text))
    )

    const pressGroup = ({ button, pointerType }: Html.PointerPayload) =>
      button === 0 ? Message.PressedGroup({ pointerType }) : undefined

    const inputGroup = p.part("div", (b) =>
      inside(control(b))
        .attrs({
          role: "group",
          "data-combobox-group": owner,
          "data-placeholder": flag(placeholding)
        })
        .on("mousedown", pressGroup, { preventDefault: true }))

    const keyHandled = (
      key: string,
      selectionStart: number | null
    ): boolean => {
      switch (key) {
        case "ArrowDown":
        case "ArrowUp":
          return true
        case "ArrowLeft":
        case "ArrowRight":
          return (grid && navigable && highlighted !== null) ||
            (!readOnly && chipsDrawn && values.length > 0 &&
              selectionStart === 0 &&
              key === (chipsRtl ? "ArrowRight" : "ArrowLeft"))
        case "Enter":
          return navigable && highlighted !== null
        case " ":
          return !readOnly && open && props.inputValue === ""
        case "Escape":
          return open ||
            (!readOnly && !inline && !model.mounted &&
              (props.inputValue !== "" || filled))
        case "Backspace":
          return !readOnly && chipsDrawn && props.inputValue === "" &&
            values.length > 0
        default:
          return false
      }
    }

    const input = p.part("input", (b) => {
      const decorated = inside(control(b))
        .ref(Input)
        .attrs({
          "data-combobox-input": owner,
          "data-required": flag(required),
          value: displayed
        })
        .value(displayed)
        .attrs({
          role: "combobox",
          "aria-expanded": String(navigable),
          "aria-haspopup": grid ? "grid" : "listbox",
          "aria-controls": navigable ? listId : undefined,
          "aria-autocomplete": readOnly ? "none" : props.mode ?? "list",
          "aria-activedescendant": navigable && highlighted !== null
            ? itemId(highlighted)
            : undefined,
          "aria-readonly": readOnly ? "true" : undefined,
          "aria-required": required ? "true" : undefined,
          autocomplete: "off",
          spellcheck: "false",
          autocorrect: "off",
          autocapitalize: "none",
          readonly: flag(readOnly),
          "aria-disabled": undefined
        })
        .disabled(disabled)
        .on(
          "mousedown",
          ({ button, pointerType }) =>
            button === 0 && !inPopup && !open && !disabled &&
              props.openOnInputClick !== false
              ? Message.PressedInput({ pointerType })
              : undefined
        )
        .on(
          "input",
          ({ composing, inputType, value }) =>
            Message.ChangedInput({ value, inputType, composing })
        )
        .on(
          "compositionend",
          ({ value }) =>
            Message.ChangedInput({
              value,
              inputType: "insertCompositionText",
              composing: false
            })
        )
        .on(
          "keydown",
          ({ alt, composing, ctrl, key, meta, selectionStart, shift }) =>
            composing || alt || ctrl || meta || shift || disabled ||
              !keyHandled(key, selectionStart)
              ? undefined
              : Message.PressedInputKey({ key, chips: chipsDrawn }),
          { preventDefault: true }
        )
        // Enter with nothing highlighted closes on keyup, so its keydown can still submit the form, and an
        // inline list clears on Escape's keyup, so its keydown can still close a dialog around it.
        .on(
          "keyup",
          ({ key }) =>
            (key === "Enter" && open && !inline && highlighted === null) ||
              (key === "Escape" && inline && !readOnly &&
                (props.inputValue !== "" || filled))
              ? Message.ReleasedInputKey({ key })
              : undefined
        )
      const focusable = inline
        ? decorated.on("focusin", Message.FocusedInput()).on(
          "focusout",
          Message.BlurredInput()
        )
        : decorated
      const field = nativeField
        ? focusable.attrs({
          name: props.name,
          form: props.form,
          required: flag(required)
        })
        : focusable
      return field.forward((node) => {
        // The next key couldn't replace a completion it can't select.
        const kept = displayed !== props.inputValue &&
            !selectingTypes.has(node.elementAttrs.type ?? "text")
          ? node.attr("value", props.inputValue).value(props.inputValue)
          : node
        const named = defaults(labelledBy(kept), { id: inputId })
        return inPopup || inputs.length === 0
          ? named
          : inputsBox.children(named, ...inputs)
      })
    })

    const trigger = p.part("button", (b) => {
      const decorated = inside(control(b))
        .ref(Trigger)
        .attrs({
          type: "button",
          "data-combobox-trigger": owner,
          "data-required": flag(required),
          "data-placeholder": flag(placeholding),
          "aria-expanded": String(open),
          "aria-haspopup": inPopup ? "dialog" : grid ? "grid" : "listbox",
          "aria-controls": open ? (inPopup ? popupId : listId) : undefined,
          "aria-disabled": undefined
        })
        .disabled(disabled)
        .on(
          "mousedown",
          ({ button, pointerType }) =>
            button === 0 && pointerType !== "touch"
              ? Message.PressedTrigger({ pointerType })
              : undefined,
          { preventDefault: !inPopup }
        )
        .on("mouseup", Message.ReleasedTrigger())
        .on(
          "click",
          ({ pointerType }) =>
            pointerType === "" || pointerType === "touch"
              ? Message.ClickedTrigger({ pointerType })
              : undefined
        )
        .on(
          "keydown",
          (event) =>
            event.composing
              ? undefined
              : event.key === "ArrowDown" || event.key === "ArrowUp" ||
                  (inPopup && selectable && !multiple && !open && !readOnly &&
                    Typeahead.isPrintable(event) &&
                    (event.key !== " " || Typeahead.isTyping(model.typeahead)))
              ? Message.PressedTriggerKey({ key: event.key })
              : undefined,
          { preventDefault: true }
        )
      if (!inPopup) {
        return decorated.attr("tabindex", "-1").forward(
          fallbackLabel("Open popup")
        )
      }
      return (selectable ? decorated : decorated.attr("form", props.form))
        .attrs({
          role: "combobox",
          "aria-required": required ? "true" : undefined,
          "aria-readonly": readOnly ? "true" : undefined
        })
        .forward((node) => {
          const named = labelledBy(
            node.attr("id", node.elementAttrs.id ?? triggerId)
          )
          return inputs.length === 0
            ? named
            : inputsBox.children(named, ...inputs)
        })
    })

    const icon = p.part(
      "span",
      (b) => b.attrs({ "aria-hidden": "true", "data-popup-open": flag(open) })
    )

    const clearPart = p.part("button", (b) =>
      inside(b)
        .attrs({
          type: "button",
          tabindex: "-1",
          "data-popup-open": flag(open),
          "data-disabled": flag(disabled),
          "data-visible": flag(filled),
          "aria-disabled": undefined
        })
        .disabled(disabled)
        .on("mousedown", () => undefined, { preventDefault: "always" })
        .on("click", Message.PressedClear())
        .forward(fallbackLabel("Clear")))
    const clearButton = View.wrapPart(
      clearPart,
      <B extends View.PartTarget<"button">>(
        { element, keepMounted }: {
          readonly element: B
          readonly keepMounted?: boolean | undefined
        }
      ): ReturnType<B["attr"]> | undefined => {
        const applied = clearPart(element)
        return filled || keepMounted === true ? applied : undefined
      }
    )

    const chips = p.part("div", (b) => {
      chipsDrawn = true
      return inside(b)
        .attrs({
          role: values.length > 0 ? "toolbar" : undefined,
          "data-combobox-chips": owner
        })
        .on("mousedown", pressGroup, { preventDefault: true })
        .forward((node) =>
          node.children(
            removedStatus.children(
              // Announced once `value` drops it, not on the request.
              model.removing === null || chosen.has(model.removing.value)
                ? ""
                : model.removing.label + ", " +
                  (props.removedLabel ?? "removed")
            )
          )
        )
        .onMount(
          TrackComboboxChips({
            owner,
            rtl: css ? null : chipsRtl,
            css,
            locked: disabled || readOnly
          })
        )
    })

    const chipPart = p.part("div", (b, value: V) =>
      b.ref(Chip.at(value))
        .attrs({
          tabindex: "-1",
          "aria-keyshortcuts": disabled || readOnly
            ? undefined
            : "Backspace Delete",
          "data-combobox-chip": value,
          "data-disabled": flag(disabled)
        }))
    const chip = valued(chipPart)

    const chipRemovePart = p.part("button", (b, value: V) =>
      inside(b)
        .attrs({
          type: "button",
          tabindex: "-1",
          "data-disabled": flag(disabled),
          "aria-disabled": undefined
        })
        .disabled(disabled)
        .on("mousedown", () => undefined, { preventDefault: "always" })
        .on(
          "click",
          Message.RequestedChipRemoval({ value, reason: "chip-remove-press" })
        )
        .forward(fallbackLabel("Remove")))
    const chipRemove = View.wrapPart(
      chipRemovePart,
      <B extends View.PartTarget<"button">>(
        { element, value }: { readonly element: B; readonly value: V }
      ) => chipRemovePart(element, value)
    )

    const backdrop = p.part(
      "div",
      (b) =>
        layered(states(b).attr("role", "presentation"), topLayer, shown)
          .forward(ownStyle(backdropStyle(topLayer, open)))
    )

    const positionerStyle = Positioning.positionerStyle(tracked.positionMethod)
    const positioner = p.part("div", (b) => {
      const decorated = layered(
        placed(b).attrs({
          role: "presentation",
          "data-combobox-positioner": owner,
          "data-anchor-hidden": flag(shown && model.placement?.anchorHidden),
          "data-empty": flag(listEmpty)
        }),
        topLayer,
        shown
      )
        .forward((node) => {
          const styled = node.attr(
            "style",
            withStyle(node.elementAttrs.style, positionerStyle)
          )
          return dismissable
            ? styled.children(dismissPart(dismissSpan()))
            : styled
        })
      const blocked = modal
        ? decorated.children(open ? blocking.open : blocking.closed)
        : decorated
      if (!shown) return blocked
      return blocked.onMount(
        TrackCombobox({
          position: tracked,
          open,
          mounted: model.mounted,
          started: model.started,
          holdExit: props.holdExit === true,
          inputInPopup: inPopup,
          modal,
          hide: dismissable && topLayer,
          touch: model.openMethod === "touch",
          pressing: model.pressing,
          finalFocus: props.finalFocus !== false,
          focusLeft: model.focusLeft,
          closeMethod: model.closeMethod,
          owner,
          popupId,
          listId,
          list: listArgs,
          css
        })
      )
    })

    const popup = p.part("div", (b) =>
      placed(b)
        .attrs({
          id: popupId,
          role: inPopup ? "dialog" : "presentation",
          "aria-modal": inPopup ? String(modal) : undefined,
          tabindex: "-1",
          "data-anchor-hidden": flag(shown && model.placement?.anchorHidden),
          "data-empty": flag(listEmpty)
        })
        .on(
          "keydown",
          ({ composing, key }) =>
            key === "Escape" && open && !composing
              ? Message.PressedInputKey({ key, chips: chipsDrawn })
              : undefined,
          { preventDefault: true }
        )
        .forward((node) => inPopup ? labelledBy(node) : node))

    const arrowStyle = Positioning.arrowStyle(side)
    const arrow = p.part("div", (b) =>
      placed(b)
        .attrs({
          id: arrowId,
          "aria-hidden": "true",
          "data-uncentered": flag(model.placement?.arrowUncentered)
        })
        .forward((node) =>
          node.attr("style", withStyle(node.elementAttrs.style, arrowStyle))
        ))

    const list = p.part("div", (b) => {
      const decorated = b.attrs({
        id: listId,
        role: grid ? "grid" : "listbox",
        tabindex: "-1",
        "aria-multiselectable": multiple ? "true" : undefined,
        "aria-readonly": readOnly ? "true" : undefined,
        "data-empty": flag(listEmpty)
      }).forward(labelledBy)
      return inline
        ? decorated.onMount(TrackComboboxList({ list: listArgs, css }))
        : decorated
    })

    const row = p.part("div", (b) => b.attr("role", "row"))

    const itemPart = p.part("div", (b, value: V) => {
      const option = known.get(value)
      if (option === undefined) {
        throw new Error(
          name + ": no item in the items prop has the value \"" + value + "\""
        )
      }
      const selected = chosen.has(value)
      const active = highlighted === value
      const off = option.disabled === true
      return b
        .attrs({
          id: itemId(value),
          role: grid ? "gridcell" : "option",
          "aria-selected": selectable ? String(selected) : undefined,
          "aria-disabled": off ? "true" : undefined,
          "data-selected": flag(selected),
          "data-highlighted": flag(active),
          "data-disabled": flag(off)
        })
        .on(
          "mouseenter",
          () => hovers ? Message.EnteredItem({ value }) : undefined
        )
        .on("mouseleave", () => hovers ? Message.LeftItem() : undefined)
        .on("mousedown", Message.PressedItem({ value }), {
          preventDefault: "always"
        })
        .on(
          "mouseup",
          ({ button, pointerType }) =>
            pointerType === "touch"
              ? undefined
              : Message.ReleasedItem({ value, button })
        )
        .on(
          "click",
          ({ pointerType }) =>
            off ? undefined : Message.ClickedItem({ value, pointerType })
        )
    })
    const item = valued(itemPart)

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
        return chosen.has(value) || keepMounted === true ? applied : undefined
      }
    )

    const group = grouped(
      p.part(
        "div",
        (b, key: string) =>
          b.attrs({
            role: grid ? "rowgroup" : "group",
            "aria-labelledby": groupLabelId(key)
          })
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

    const live = <B extends Attributed<B>>(builder: B): B =>
      builder.attrs({
        role: "status",
        "aria-live": "polite",
        "aria-atomic": "true"
      })
    const empty = p.part(
      "div",
      (b) =>
        live(b).forward((node) =>
          listEmpty ? node : { ...View.build(node, []), children: [] }
        )
    )
    const status = p.part("div", (b) => live(b))

    const finalFocus = p.part((b) => b.attr("data-final-focus", popupId))

    return {
      open,
      mounted: shown,
      transitionStatus,
      inline,
      selected: props.value ?? null,
      selectedItems,
      placeholder: placeholding,
      disabled,
      readOnly,
      required,
      multiple,
      side,
      align,
      highlighted,
      openMethod: open ? model.openMethod : null,
      items,
      groups: groupsOf(items),
      listEmpty,
      label,
      value,
      inputGroup,
      input,
      trigger,
      icon,
      clear: clearButton,
      chips,
      chip,
      chipRemove,
      backdrop,
      positioner,
      popup,
      arrow,
      list,
      row,
      item,
      itemIndicator,
      group,
      groupLabel,
      separator,
      empty,
      status,
      finalFocus
    }
  }

  return { update, parts }
}
