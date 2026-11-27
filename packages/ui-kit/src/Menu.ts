/**
 * A button that opens a list of actions, links, checkbox and radio items,
 * and submenus.
 *
 * `Menu` is headless: it owns the keyboard and pointer behaviour, focus,
 * placement and the data attributes, and the consumer draws the markup.
 * The consumer owns whether the popup is open, passes it as `open`, and
 * stores what `RequestedOpen` and `RequestedClose` ask for. `Picked` reports
 * the item the user chose. `items` lists every item with its label, in the
 * order they're drawn, for navigation, typeahead and filtering.
 *
 * **Anatomy**
 *
 * | Part                    | Element                                                 |
 * | :---------------------- | :------------------------------------------------------ |
 * | `trigger`               | `<button>` that opens the popup, one or several         |
 * | `contextTrigger`        | `<div>` that opens it at the pointer on a right click   |
 * | `submenuTrigger`        | `<div>` of the parent menu's item that opens a submenu  |
 * | `backdrop`              | `<div>`, a manual popover under the positioner          |
 * | `positioner`            | `<div>`, a manual popover placed by the menu            |
 * | `popup`                 | `<div>` inside the positioner                           |
 * | `viewport`              | `<div>` inside the popup, around content that changes   |
 * | `list`                  | `<div>` inside the popup, around the items of a filter  |
 * | `arrow`                 | `<div>` inside the popup                                |
 * | `item`                  | `<div>`, one per value                                  |
 * | `linkItem`              | `<a>`, one per value                                    |
 * | `checkboxItem`          | `<div>`, one per value                                  |
 * | `checkboxItemIndicator` | `<span>` inside a checkbox item, shown while checked    |
 * | `radioGroup`            | `<div>` around radio items, with the checked value      |
 * | `radioItem`             | `<div>` inside a radio group, one per value             |
 * | `radioItemIndicator`    | `<span>` inside a radio item, shown while checked       |
 * | `group`                 | `<div>` around items                                    |
 * | `groupLabel`            | `<div>` inside a group                                  |
 * | `separator`             | `<div>` between items                                   |
 * | `input`                 | `<input>` inside the popup that filters the items       |
 * | `clear`                 | `<button>` that empties the input                       |
 * | `empty`                 | `<div>` shown while the filter matches nothing          |
 * | `finalFocus`            | any focusable element, focused on close                 |
 *
 * Each part takes the consumer's builder and returns it with the part
 * applied, and the consumer adds the children. `trigger` takes an options
 * object, `{ element }`, with the optional fields of `MenuTriggerOptions`.
 * The items, the indicators and `radioGroup` take `{ element, value }`,
 * `checkboxItem` with `checked` as well, and `group` and `groupLabel`
 * take `{ element, group }`, where `group` is the `group` of the items
 * inside. `item` closes the menu when picked and the others don't; a
 * `closeOnClick` field changes that. The indicators, `clear` and `empty`
 * return `undefined` while they're hidden, and a `keepMounted` field keeps
 * an indicator drawn. Every item value has to be in `items`, and an item
 * keys its element with the value.
 *
 * A submenu is another `Menu` drawn inside the parent's popup, with the
 * parent's item value as `parentItem`. Apply both parts to the item that
 * opens it, `menu.item({ element: submenu.submenuTrigger(h.div), value })`,
 * and own its `open` like the root's. Picking an item in a submenu closes
 * every menu above it.
 *
 * The positioner is a manual popover, so it renders in the top layer and
 * needs no portal. The browser gives a popover a border, padding, a
 * background and `overflow: auto`, so reset those on the positioner and
 * the backdrop and style the popup instead.
 *
 * **In place**
 *
 * With `topLayer: false`, the backdrop and the positioner render in place
 * as ordinary elements, `hidden` while closed, and the popup is placed and
 * clipped inside its containing block, as `Positioning` describes. The
 * backdrop covers that block, and the menu is never modal, whatever `modal`
 * or a `Menubar` says. A submenu takes `topLayer` from its parent unless
 * it sets its own.
 *
 * **CSS variables**
 *
 * Set on the positioner, so the popup inherits them: `--anchor-width`,
 * `--anchor-height`, `--available-width`, `--available-height` and
 * `--transform-origin`. With a viewport, the positioner also gets
 * `--positioner-width` and `--positioner-height`, the popup's size.
 *
 * When the viewport moves to another trigger, the popup's `--popup-width`
 * and `--popup-height` go from its old size to its new one and back to
 * `auto` once its transitions finish. Size the popup with them and
 * transition `width` and `height` to animate it. The outgoing content
 * sits in a `data-previous` element with the old size as `--popup-width`
 * and `--popup-height`, next to the `data-current` one.
 *
 * **Data attributes**
 *
 * Each present with an empty value or absent, except `data-side`,
 * `data-align`, `data-instant`, `data-activation-direction` and
 * `data-orientation`, which hold a value:
 *
 * - `trigger`, `submenuTrigger`: `data-popup-open`, `data-pressed`,
 *   `data-disabled`
 * - `contextTrigger`: `data-popup-open`, `data-pressed`
 * - `backdrop`: `data-open` / `data-closed`, `data-starting-style`,
 *   `data-ending-style`
 * - `positioner`: as the backdrop, and `data-side`, `data-align`,
 *   `data-anchor-hidden`, `data-instant`
 * - `popup`: as the positioner, without `data-anchor-hidden`, and
 *   `data-nested`
 * - `arrow`: `data-side`, `data-align`, `data-uncentered`
 * - `viewport`: `data-activation-direction`, such as `"right down"`,
 *   `data-transitioning`, `data-instant`
 * - the items: `data-highlighted`, `data-disabled`; checkbox and radio
 *   items and their indicators add `data-checked` / `data-unchecked`
 * - `input`: `data-highlighted` while it has focus and no item does
 * - `separator`: `data-orientation`
 *
 * `data-instant` is `"click"` when the menu opened or closed from the
 * keyboard, `"dismiss"` after Escape, and `"trigger-change"` once the
 * popup has moved to another trigger: turn the transitions off then.
 *
 * **Keyboard**
 *
 * On the trigger, Enter and Space open the popup, and ArrowDown and
 * ArrowUp open it on the first or the last enabled item, except inside a
 * vertical `Toolbar`, which moves focus with them. In the popup the
 * arrow keys of its `orientation`, Home and End move between items,
 * disabled ones included, and typing moves to the next item whose label
 * starts with what's typed. Enter and Space pick the highlighted item.
 * On a submenu trigger, the arrow key towards the submenu in the parent's
 * direction, Enter and Space open it, and in the submenu the arrow key
 * back in the submenu's direction closes it. Escape
 * closes the popup, or with `closeParentOnEsc` the whole menu, and Tab
 * closes it and moves focus on from the trigger.
 *
 * With a filter, focus stays in the input and the highlighted item is its
 * `aria-activedescendant`. The arrow keys move the highlight, Enter picks
 * the item, and Space picks it while the input is empty. Home and End
 * move the caret once there's text.
 *
 * **Pointer**
 *
 * A mouse press opens the popup, and a release over an item more than
 * 200ms later picks it. With `openOnHover`, which a submenu has by
 * default, resting on the trigger for `delay` opens it, and the popup
 * closes `closeDelay` after the pointer leaves both, unless it's crossing
 * to the popup. On the way to a submenu, the parent's items don't react.
 * Hovering another trigger of an open menu moves the popup to it at once.
 * A trigger's own options override the menu's. A press within 500ms of a
 * hover open keeps it open. A `modal` menu, the default for a
 * root menu not opened by hovering, locks the page's scroll, blocks
 * presses outside, except on the trigger, and hides the rest of the page
 * from assistive technology with `aria-hidden`.
 *
 * A right click on a `contextTrigger` opens the popup at the pointer, and a
 * touch held still on it for 500ms opens it under the finger, as a
 * `ContextMenu` does. A menu opened that way is modal, blocks the whole
 * page, closes on Tab and gives focus back to the element that had it, and
 * a menu opened from its `trigger` behaves as above. The Menu key and
 * Shift+F10 open it against the `contextTrigger`, which defaults to
 * `tabindex="0"`.
 *
 * **Limits**
 *
 * The menu doesn't read its items from the rendered elements, so `items`
 * lists them. A trigger carries no payload: `RequestedOpen` reports its
 * `triggerId`, so draw the content for that trigger. `filter` picks a
 * built-in match; for another, pass `filter: null` and draw only the
 * items that match. `MenuTrigger` draws a trigger outside the view. The
 * menu follows the nearest `DirectionProvider` above it or, without one,
 * the trigger's CSS `direction`.
 *
 * **Example** (An edit menu with a checkbox item and a submenu, with the open states in the consumer's Model)
 *
 * ```ts import.meta.vitest
 * import { UiSchema } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { Menu } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const actions = [
 *   { value: "copy", label: "Copy" },
 *   { value: "wrap", label: "Wrap lines" },
 *   { value: "share", label: "Share" }
 * ]
 * const targets = [{ value: "email", label: "Email" }]
 *
 * const EditorMessage = UiSchema.TaggedEnum({
 *   RequestedOpenMenu: {},
 *   RequestedCloseMenu: {},
 *   RequestedOpenShare: {},
 *   RequestedCloseShare: {},
 *   PickedAction: { value: Schema.String, checked: Schema.optional(Schema.Boolean) }
 * })
 *
 * const Editor = Html.component({
 *   name: "Editor",
 *   model: Schema.Struct({ open: Schema.Boolean, share: Schema.Boolean, wrap: Schema.Boolean }),
 *   message: EditorMessage
 * }).make({
 *   init: () => ({ open: false, share: false, wrap: true }),
 *   update: {
 *     RequestedOpenMenu: ($) => $.evolve({ open: true }),
 *     RequestedCloseMenu: ($) => $.evolve({ open: false }),
 *     RequestedOpenShare: ($) => $.evolve({ share: true }),
 *     RequestedCloseShare: ($) => $.evolve({ share: false }),
 *     PickedAction: ($, { checked, value }) => value === "wrap" ? $.evolve({ wrap: checked === true }) : $.model
 *   },
 *   view: (h, model) => {
 *     const events = {
 *       Picked: ({ checked, value }: { readonly value: string; readonly checked?: boolean | undefined }) =>
 *         EditorMessage.PickedAction({ value, checked }),
 *       Highlighted: () => undefined,
 *       RequestedQuery: () => undefined,
 *       Settled: () => undefined
 *     }
 *     return Menu(h, {
 *       props: { open: model.open, items: actions },
 *       onEmit: {
 *         ...events,
 *         RequestedOpen: () => EditorMessage.RequestedOpenMenu(),
 *         RequestedClose: () => EditorMessage.RequestedCloseMenu()
 *       },
 *       view: (editMenu) =>
 *         h.div(
 *           editMenu.trigger({ element: h.button }).children("Edit"),
 *           editMenu.positioner(h.div).children(
 *             editMenu.popup(h.div).children(
 *               editMenu.item({ element: h.div, value: "copy" }).children("Copy"),
 *               editMenu.checkboxItem({ element: h.div, value: "wrap", checked: model.wrap }).children(
 *                 editMenu.checkboxItemIndicator({ element: h.span, value: "wrap" })?.children("✓"),
 *                 "Wrap lines"
 *               ),
 *               editMenu.separator(h.div),
 *               Menu(h, {
 *                 props: { open: model.share, items: targets, parentItem: "share" },
 *                 onEmit: {
 *                   ...events,
 *                   RequestedOpen: () => EditorMessage.RequestedOpenShare(),
 *                   RequestedClose: () => EditorMessage.RequestedCloseShare()
 *                 },
 *                 view: (shareMenu) =>
 *                   h.div(
 *                     editMenu.item({ element: shareMenu.submenuTrigger(h.div), value: "share" }).children("Share"),
 *                     shareMenu.positioner(h.div).children(
 *                       shareMenu.popup(h.div).children(
 *                         shareMenu.item({ element: h.div, value: "email" }).children("Email")
 *                       )
 *                     )
 *                   )
 *               })
 *             )
 *           )
 *         )
 *     })
 *   }
 * })
 *
 * // The trigger says it opens a menu, and the checked item is drawn closed.
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Editor, {}))
 * if (!/<button[^>]* aria-haspopup="menu"[^>]*>Edit</.test(html)) throw new Error("the trigger isn't a menu button")
 * if (!/role="menuitemcheckbox"[^>]* aria-checked="true"/.test(html)) throw new Error("the checkbox item isn't checked")
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Command from "@effect/ui/Command"
import type * as Component from "@effect/ui/Component"
import * as Html from "@effect/ui/html/Html"
import * as Mount from "@effect/ui/Mount"
import * as UiSchema from "@effect/ui/UiSchema"
import * as UiStruct from "@effect/ui/UiStruct"
import * as View from "@effect/ui/View"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { DirectionProvider } from "./DirectionProvider.ts"
import {
  type Attributed,
  attrSelector,
  defaults,
  flag,
  idOf,
  type Keyed,
  ownStyle,
  separatorAttrs,
  withStyle,
  withTokens
} from "./internal/attributes.ts"
import { backdropStyle, blockers, cutPath } from "./internal/blocker.ts"
import { isRtl, provided, rightToLeft } from "./internal/direction.ts"
import {
  focusFinal,
  isElement,
  isHTMLElement,
  override
} from "./internal/dom.ts"
import { type TextFilter, textFilter } from "./internal/filter.ts"
import { methodOf, onEscape } from "./internal/interaction.ts"
import { grouped, keyed } from "./internal/list.ts"
import {
  barTriggers,
  MenubarMessage,
  menubarOf,
  MenubarShared,
  triggerAttribute
} from "./internal/menubar.ts"
import { hideOthers, holdScroll, nextLayerOrder } from "./internal/modal.ts"
import { listenOutside, releasedOutside } from "./internal/outside.ts"
import { isMac } from "./internal/platform.ts"
import {
  activationDirection,
  inSafeArea,
  type Point
} from "./internal/safeArea.ts"
import { layered, raiseAbove } from "./internal/topLayer.ts"
import {
  frameOf,
  settling,
  statusOf,
  transitionAttrs
} from "./internal/transition.ts"
import * as ListNavigation from "./ListNavigation.ts"
import { Menubar } from "./Menubar.ts"
import * as Positioning from "./Positioning.ts"
import { Toolbar } from "./Toolbar.ts"
import * as Typeahead from "./Typeahead.ts"

/**
 * One item of a `Menu`: the value it reports, the text typeahead and
 * filtering match, and whether it can be picked.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const MenuItem = Schema.Struct({
  value: Schema.String,
  label: Schema.String,
  disabled: Schema.optional(Schema.Boolean)
})

/**
 * One item of a `Menu`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type MenuItem = typeof MenuItem.Type

/**
 * How the menu was opened or closed: `"keyboard"` for a key or a click
 * from no pointer.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const MenuInteraction = Schema.Literals([
  "mouse",
  "touch",
  "pen",
  "keyboard"
])

/**
 * How the menu was opened or closed.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type MenuInteraction = typeof MenuInteraction.Type

/**
 * Why a `Menu` asks to open or close.
 *
 * **Details**
 *
 * - `"trigger-press"`: a press, or Enter or Space, on the trigger, or a
 *   right click or a long press on a context trigger
 * - `"trigger-hover"`: the pointer rested on a trigger with `openOnHover`,
 *   or left a menu that hovering opened
 * - `"trigger-focus"`: focus moved to a trigger of a `Menubar` while
 *   another of its menus was open
 * - `"list-navigation"`: ArrowDown or ArrowUp on the trigger, the arrow
 *   key that opens a submenu, or the one that closes it
 * - `"item-press"`: an item was picked
 * - `"outside-press"`: a press outside the trigger and the popup, other
 *   than on a scrollbar
 * - `"escape-key"`: Escape in the popup, or on the page while it's open
 * - `"focus-out"`: focus left the trigger and the popup, or Tab in the
 *   popup
 * - `"sibling-open"`: another item of the parent menu was highlighted while
 *   this submenu was open
 * - `"cancel-open"`: the press that opened it was released away from the
 *   trigger and the popup, or, for a right click, away from the popup more
 *   than 500ms later
 * - `"none"`: anything else
 *
 * A submenu that closes because its parent closed reports the parent's
 * reason.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const MenuChangeReason = Schema.Literals([
  "trigger-press",
  "trigger-hover",
  "trigger-focus",
  "list-navigation",
  "item-press",
  "outside-press",
  "escape-key",
  "focus-out",
  "sibling-open",
  "cancel-open",
  "none"
])

/**
 * Why a `Menu` asks to open or close.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type MenuChangeReason = typeof MenuChangeReason.Type

/**
 * Why the highlighted item changed: `"keyboard"` for arrow keys, Home, End
 * and typeahead, `"pointer"` for hovering, and `"none"` for opening,
 * closing and filtering.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const MenuHighlightReason = Schema.Literals([
  "keyboard",
  "pointer",
  "none"
])

/**
 * Why the highlighted item changed.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type MenuHighlightReason = typeof MenuHighlightReason.Type

/**
 * Why the filter's query changes: `"input-change"` for typing,
 * `"input-clear"` for emptying the input, `"clear-press"` for the `clear`
 * part, and `"none"` for the menu having closed.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const MenuQueryReason = Schema.Literals([
  "input-change",
  "input-clear",
  "clear-press",
  "none"
])

/**
 * Why the filter's query changes.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type MenuQueryReason = typeof MenuQueryReason.Type

/**
 * How a filtering menu matches an item's label against the query:
 * anywhere in it, at its start, or at its end. Each ignores case, accents
 * and punctuation.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const MenuFilterMode = Schema.Literals([
  "contains",
  "startsWith",
  "endsWith"
])

/**
 * How a filtering menu matches an item's label against the query.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type MenuFilterMode = typeof MenuFilterMode.Type

/**
 * The props of a `Menu`.
 *
 * **Details**
 *
 * - `open`: whether the popup shows. The menu only asks, with `RequestedOpen`
 *   and `RequestedClose`.
 * - `items`: every item, link, checkbox, radio and submenu trigger, in the
 *   order they're drawn. Navigation, typeahead and filtering read them. A
 *   disabled submenu trigger doesn't open its submenu.
 * - `disabled`: the trigger and the items ignore the user.
 * - `modal`: while open, the page doesn't scroll, a press outside only
 *   closes the menu, and content outside the popup and trigger is hidden
 *   from assistive technology. True when left out. A submenu and a
 *   menu opened by hovering are never modal.
 * - `loopFocus`: the arrow keys wrap from the last item to the first. True
 *   when left out.
 * - `orientation`: `"vertical"`, the default, moves with ArrowDown and
 *   ArrowUp, and `"horizontal"` with ArrowRight and ArrowLeft.
 * - `highlightItemOnHover`: the pointer highlights the item it's over. True
 *   when left out.
 * - `closeParentOnEsc`: in a submenu, Escape closes the whole menu and not
 *   only the submenu. False when left out.
 * - `openOnHover`: the pointer resting on the trigger for `delay`
 *   milliseconds opens the menu, and leaving the trigger and the popup
 *   closes it after `closeDelay`. False when left out, true in a submenu.
 * - `delay`, `closeDelay`: 100 and 0 when left out. A trigger's
 *   `MenuTriggerOptions` override these three for that trigger.
 * - `parentItem`: in a submenu, the value of the parent's item that opens
 *   it. A `Menu` with one, drawn inside another one's popup, is its
 *   submenu. Without one, a `Menu` drawn inside another is a menu of its
 *   own.
 * - `triggerId`: the `id` of the trigger the menu is open for, when it has
 *   several, or one drawn with `MenuTrigger`.
 * - `openMethod`, `openReason`: how a `MenuTrigger` opened it, which the
 *   menu can't see. A menu opened with `"trigger-hover"` closes when the
 *   pointer leaves.
 * - `id`: the popup's `id`, which a `MenuTrigger` points at. Generated
 *   when left out.
 * - `finalFocus`: on close, focus goes back to the trigger, or to a
 *   `finalFocus` part. False leaves it where it is. True when left out.
 * - `holdExit`: keeps the closing popup shown, for an exit animation the
 *   consumer ends by clearing it.
 * - `query`: the filter's text. Given, the menu filters its items by it,
 *   and focus stays in the `input` part. The menu only asks, with
 *   `RequestedQuery`.
 * - `filter`: how items match, `"contains"` when left out. `null` hides
 *   none: list and draw only the items that match.
 * - `locale`: the locale the filter compares text in.
 * - `autoHighlight`: filtering highlights the first matching item. True
 *   highlights it while the query isn't empty, `"always"` also when it is.
 *   False when left out.
 * - the `Positioning.PositionerFields`. `side` is `"bottom"` when left out,
 *   and `"inline-end"` with `align` `"start"` in a submenu. `topLayer:
 *   false` draws the menu in place, as the module describes.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const MenuProps = Schema.Struct({
  open: Schema.Boolean,
  items: Schema.Array(MenuItem),
  disabled: Schema.optional(Schema.Boolean),
  modal: Schema.optional(Schema.Boolean),
  loopFocus: Schema.optional(Schema.Boolean),
  orientation: Schema.optional(ListNavigation.Orientation),
  highlightItemOnHover: Schema.optional(Schema.Boolean),
  closeParentOnEsc: Schema.optional(Schema.Boolean),
  openOnHover: Schema.optional(Schema.Boolean),
  delay: Schema.optional(Schema.Number),
  closeDelay: Schema.optional(Schema.Number),
  parentItem: Schema.optional(Schema.String),
  triggerId: Schema.optional(Schema.NullOr(Schema.String)),
  openMethod: Schema.optional(MenuInteraction),
  openReason: Schema.optional(MenuChangeReason),
  id: Schema.optional(Schema.String),
  finalFocus: Schema.optional(Schema.Boolean),
  holdExit: Schema.optional(Schema.Boolean),
  query: Schema.optional(Schema.String),
  filter: Schema.optional(Schema.NullOr(MenuFilterMode)),
  locale: Schema.optional(Schema.String),
  autoHighlight: Schema.optional(
    Schema.Union([Schema.Boolean, Schema.Literal("always")])
  ),
  ...Positioning.PositionerFields
})

/**
 * The props of a `Menu`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type MenuProps = typeof MenuProps.Type

/**
 * What a `Menu` emits.
 *
 * **Details**
 *
 * - `RequestedOpen`: asks for `open` to be true. `triggerId` is the `id` of the
 *   trigger pressed, for `triggerId`. A right click on a context trigger of an
 *   open menu sends it again, for the new point.
 * - `RequestedClose`: asks for `open` to be false.
 * - `Picked`: reports that an item was picked. `checked` is the new state of a
 *   checkbox item, and true for a radio item. It stands for the item's
 *   click, for every kind of item.
 * - `Highlighted`: reports that the highlighted item changed, to `value` or to
 *   none.
 * - `RequestedQuery`: asks for `query` to be `query`. The menu also
 *   emits it, with `reason: "none"`, to clear the query after the popup
 *   closes.
 * - `Settled`: reports that the popup's transitions ended, after it
 *   opened or closed.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const MenuEvents = UiSchema.TaggedEnum({
  RequestedOpen: {
    reason: MenuChangeReason,
    triggerId: Schema.NullOr(Schema.String)
  },
  RequestedClose: { reason: MenuChangeReason },
  Picked: { value: Schema.String, checked: Schema.optional(Schema.Boolean) },
  Highlighted: {
    value: Schema.NullOr(Schema.String),
    reason: MenuHighlightReason
  },
  RequestedQuery: { query: Schema.String, reason: MenuQueryReason },
  Settled: { open: Schema.Boolean }
})

/**
 * What a `Menu` emits.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type MenuEvents = typeof MenuEvents.Type

/**
 * Where a menu's popup is in its transitions: `"starting"` for the first
 * frame after it opens, `"ending"` while it closes, `null` otherwise.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type MenuTransitionStatus = "starting" | "ending" | null

const Instant = Schema.Literals(["click", "dismiss", "trigger-change", "group"])

/**
 * Why the popup's animations are instant: `"click"` for a menu opened or
 * closed from the keyboard, `"dismiss"` for Escape, `"trigger-change"`
 * once the popup has moved to another trigger, and `"group"` for a menu of
 * a `Menubar` that opened from another one, or closed for it.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type MenuInstant = typeof Instant.Type

const ItemKind = Schema.Literals(["item", "link", "checkbox", "radio"])

const ItemAction = Schema.Struct({
  value: Schema.String,
  kind: ItemKind,
  closeOnClick: Schema.Boolean,
  checked: Schema.Boolean
})

type ItemAction = typeof ItemAction.Type

const ParentState = Schema.Struct({
  open: Schema.Boolean,
  active: Schema.NullOr(Schema.String),
  reason: Schema.NullOr(MenuChangeReason),
  // The menu's direction: its `DirectionProvider`'s, or else its CSS one.
  // A submenu applies the provider it reads on top.
  rtl: Schema.Boolean,
  orientation: ListNavigation.Orientation,
  disabled: Schema.Boolean,
  topLayer: Schema.Boolean,
  disabledItems: Schema.Array(Schema.String)
})

type ParentState = typeof ParentState.Type

const Submenu = Schema.Struct({ item: Schema.String, open: Schema.Boolean })

type Submenu = typeof Submenu.Type

const MenuMessage = UiSchema.TaggedEnum({
  PressedTrigger: {
    key: Schema.String,
    triggerId: Schema.NullOr(Schema.String),
    pointerType: Schema.String
  },
  ReleasedTrigger: {},
  PressedContextTrigger: {
    key: Schema.String,
    triggerId: Schema.NullOr(Schema.String),
    x: Schema.Number,
    y: Schema.Number,
    pointerType: Schema.String
  },
  PressedContextKey: {
    key: Schema.String,
    triggerId: Schema.NullOr(Schema.String)
  },
  TouchedContextTrigger: {
    key: Schema.String,
    triggerId: Schema.NullOr(Schema.String),
    x: Schema.Number,
    y: Schema.Number
  },
  CancelledLongPress: {},
  CompletedWaitBeforeLongPress: {},
  CompletedWaitBeforeContextGrace: {},
  ReleasedContextPointer: { outside: Schema.Boolean },
  PressedTriggerKey: {
    key: Schema.String,
    trigger: Schema.String,
    triggerId: Schema.NullOr(Schema.String)
  },
  EnteredTrigger: {
    key: Schema.String,
    triggerId: Schema.NullOr(Schema.String),
    delay: Schema.Number,
    closeDelay: Schema.Number
  },
  LeftTrigger: {},
  CompletedWaitBeforeHoverOpen: {},
  LeftHoverArea: {},
  ReturnedToHoverArea: {},
  CompletedWaitBeforeHoverClose: {},
  CompletedWaitBeforeStickExpires: {},
  PressedSubmenuTrigger: { pointerType: Schema.String },
  ClickedSubmenuTrigger: { pointerType: Schema.String },
  PressedSubmenuTriggerKey: { key: Schema.String },
  PressedKey: { key: Schema.String, action: Schema.NullOr(ItemAction) },
  ReleasedSpace: { action: Schema.NullOr(ItemAction) },
  EnteredItem: { value: Schema.String },
  LeftItem: {},
  PressedItem: {},
  ReleasedItem: { action: ItemAction, pointerType: Schema.String },
  ClickedItem: { action: ItemAction, pointerType: Schema.String },
  CompletedWaitBeforeResetTyping: {},
  ShowedPopup: {},
  RenderedFirstFrame: {},
  FinishedTransition: { open: Schema.Boolean },
  ChangedPlacement: { placement: Positioning.Placement },
  ChangedDirection: { rtl: Schema.Boolean },
  FoundTrigger: { id: Schema.NullOr(Schema.String) },
  PressedOutside: { pointerType: Schema.String },
  FocusedOutside: {},
  TabbedOut: {},
  ReleasedPointer: { outside: Schema.Boolean },
  AllowedRelease: {},
  ChangedSubmenus: { submenus: Schema.Array(Submenu) },
  ChangedParent: { parent: ParentState },
  RequestedCloseByChild: { reason: MenuChangeReason },
  MovedViewport: { direction: Schema.String },
  SettledViewport: {},
  SettledTriggerChange: {},
  ChangedInput: { value: Schema.String },
  PressedInputKey: { key: Schema.String, modified: Schema.Boolean },
  FocusedInput: {},
  BlurredInput: {},
  PressedInput: {},
  ClickedClear: {},
  PressedBarKey: { key: Schema.String, trigger: Schema.String },
  FocusedBarTrigger: {
    key: Schema.String,
    triggerId: Schema.NullOr(Schema.String)
  },
  ChangedMenubar: { menubar: MenubarShared },
  ChangedProvider: { rtl: Schema.NullOr(Schema.Boolean) }
})

type MenuMessage = typeof MenuMessage.Type

const MenuModel = Schema.Struct({
  mounted: Schema.Boolean,
  started: Schema.Boolean,
  openMethod: Schema.NullOr(MenuInteraction),
  closeMethod: Schema.NullOr(MenuInteraction),
  reason: Schema.NullOr(MenuChangeReason),
  closeReason: Schema.NullOr(MenuChangeReason),
  focusLeft: Schema.Boolean,
  trigger: Schema.NullOr(Schema.String),
  hoverTrigger: Schema.NullOr(Schema.String),
  hoverTriggerId: Schema.NullOr(Schema.String),
  hoverCloseDelay: Schema.Number,
  closeDelay: Schema.Number,
  hovering: Schema.Boolean,
  stick: Schema.Boolean,
  active: Schema.NullOr(Schema.String),
  activeByKey: Schema.Boolean,
  typeahead: Typeahead.State,
  spaceDown: Schema.Boolean,
  placement: Schema.NullOr(Positioning.Placement),
  pressing: Schema.Boolean,
  releaseAllowed: Schema.Boolean,
  pressedItem: Schema.Boolean,
  // The trigger's CSS `direction` is right-to-left.
  rtl: Schema.Boolean,
  parentTopLayer: Schema.Boolean,
  submenus: Schema.Array(Submenu),
  instant: Schema.NullOr(Instant),
  transitioning: Schema.Boolean,
  direction: Schema.NullOr(Schema.String),
  inputFocused: Schema.Boolean,
  keyboard: Schema.Boolean,
  triggerElement: Schema.NullOr(Schema.String),
  context: Schema.Boolean,
  point: Schema.NullOr(Positioning.Rect),
  longPress: Schema.NullOr(
    Schema.Struct({
      key: Schema.String,
      triggerId: Schema.NullOr(Schema.String),
      x: Schema.Number,
      y: Schema.Number
    })
  ),
  justOpened: Schema.Boolean,
  releaseArmed: Schema.Boolean,
  barCurrent: Schema.NullOr(Schema.String),
  // The nearest `DirectionProvider`'s direction, for the submenus to share.
  provided: Schema.NullOr(Schema.Boolean)
})

type MenuModel = typeof MenuModel.Type

type Base = Component.Step<MenuModel, MenuMessage, MenuEvents, never>
interface Shared {
  readonly parent?: ParentState | undefined
  readonly menubar?: MenubarShared | undefined
  readonly provider?: { readonly direction: string } | undefined
}

type MenuUpdate =
  & Component.Update<MenuModel, MenuMessage, MenuEvents, MenuProps>
  & {
    readonly reads: Shared
    send(
      owner: "self",
      message: Extract<MenuMessage, { readonly _tag: "RequestedCloseByChild" }>
    ): Base
  }

const wait = (name: string, completed: () => MenuMessage) =>
  Command.make(
    name,
    { args: { delay: Schema.Number }, mode: "switch" },
    ({ delay }) => Effect.as(Effect.sleep(Duration.millis(delay)), completed())
  )

const WaitBeforeHoverOpen = wait(
  "WaitBeforeHoverOpen",
  MenuMessage.CompletedWaitBeforeHoverOpen
)
const WaitBeforeHoverClose = wait(
  "WaitBeforeHoverClose",
  MenuMessage.CompletedWaitBeforeHoverClose
)
const WaitBeforeStickExpires = wait(
  "WaitBeforeStickExpires",
  MenuMessage.CompletedWaitBeforeStickExpires
)
const WaitBeforeLongPress = wait(
  "WaitBeforeLongPress",
  MenuMessage.CompletedWaitBeforeLongPress
)
const WaitBeforeContextGrace = wait(
  "WaitBeforeContextGrace",
  MenuMessage.CompletedWaitBeforeContextGrace
)

interface Reads {
  readonly props: MenuProps
  readonly reads: Shared
}

const parentOf = ({ props, reads }: Reads): ParentState | undefined =>
  props.parentItem === undefined ? undefined : reads.parent

const barOf = ({ props, reads }: Reads): MenubarShared | undefined =>
  props.parentItem === undefined ? reads.menubar : undefined

// The CSS `direction` a menu, its parent or its menubar found, unless a
// `DirectionProvider` decides.
const rtlOf = ({ reads }: { readonly reads: Shared }, css: boolean) =>
  rightToLeft(reads.provider, css)

const disabledOf = (input: Reads): boolean => {
  const parent = parentOf(input)
  return input.props.disabled === true || parent?.disabled === true ||
    parent?.disabledItems.includes(input.props.parentItem!) === true ||
    barOf(input)?.disabled === true
}

const hoverOf = (props: MenuProps, nested: boolean): boolean =>
  props.openOnHover ?? nested

const hoverOpened = (reason: MenuChangeReason | null, input: Reads): boolean =>
  reason === "trigger-hover" && barOf(input) === undefined

const filteringOf = (props: MenuProps): boolean => props.query !== undefined

const matcherOf = (props: MenuProps): ((label: string) => boolean) | null => {
  const query = (props.query ?? "").trim()
  if (query === "" || props.filter === null) return null
  const filter: TextFilter = textFilter(props.locale)
  const match = filter[props.filter ?? "contains"]
  return (label) => match(label, query)
}

const visibleOf = (
  props: MenuProps,
  matches = matcherOf(props)
): ReadonlyArray<MenuItem> =>
  matches === null
    ? props.items
    : props.items.filter((item) => matches(item.label))

const firstEnabled = (
  items: ReadonlyArray<MenuItem>,
  last = false
): MenuItem | undefined => {
  const ordered = last ? [...items].reverse() : items
  return ordered.find(ListNavigation.available) ?? ordered[0]
}

const autoHighlighted = (props: MenuProps, query: string): string | null => {
  const auto = props.autoHighlight
  if (
    auto === undefined || auto === false ||
    (auto === true && query.trim() === "")
  ) return null
  const matches = matcherOf({ ...props, query })
  return (matches === null
    ? props.items[0]
    : props.items.find((item) => matches(item.label)))?.value ?? null
}

const commit = (
  base: Base,
  before: MenuModel,
  after: MenuModel,
  reason: MenuHighlightReason
) =>
  before.active === after.active
    ? base.set(after)
    : base.set(after).emit(
      MenuEvents.Highlighted({ value: after.active, reason })
    )

const open = (
  model: MenuModel,
  $: MenuUpdate,
  reason: MenuChangeReason,
  method: MenuInteraction,
  trigger: string | null,
  triggerId: string | null,
  { context = null, group = false, last = false }: {
    readonly last?: boolean
    readonly context?: {
      readonly point: Positioning.Rect | null
      readonly release: boolean
    } | null
    readonly group?: boolean
  } = {}
) => {
  const props = $.props
  const sticks = hoverOpened(reason, $) || reason === "trigger-focus"
  const keyboard = method === "keyboard" && reason !== "trigger-hover" &&
    reason !== "trigger-focus"
  const active = filteringOf(props) && props.autoHighlight === "always"
    ? visibleOf(props)[0]?.value ?? null
    : keyboard
    ? firstEnabled(visibleOf(props), last)?.value ?? null
    : null
  const next = UiStruct.evolve(model, {
    openMethod: method,
    closeMethod: null,
    reason,
    focusLeft: false,
    trigger,
    hovering: reason === "trigger-hover",
    stick: sticks,
    active,
    activeByKey: keyboard,
    typeahead: Typeahead.reset(model.typeahead),
    spaceDown: false,
    pressing: context === null && reason === "trigger-press" &&
      (method === "mouse" || method === "pen"),
    releaseAllowed: false,
    pressedItem: false,
    instant: group
      ? "group"
      : reason === "trigger-press" && method === "keyboard"
      ? "click"
      : null,
    keyboard: method === "keyboard",
    context: context !== null,
    point: context?.point ?? null,
    justOpened: context !== null,
    releaseArmed: context?.release ?? false,
    longPress: null
  })
  const opened = commit($, model, next, "none").emit(
    MenuEvents.RequestedOpen({ reason, triggerId })
  )
  return sticks
    ? opened.run(WaitBeforeStickExpires.make({ delay: 500 }))
    : opened
}

const dismiss = (
  model: MenuModel,
  $: MenuUpdate,
  reason: MenuChangeReason,
  method: MenuInteraction | null,
  focusLeft = false,
  base: Base = $
) => {
  if (!$.props.open) return base.set(model)
  const instant: MenuModel["instant"] =
    reason === "escape-key" || reason === "none"
      ? "dismiss"
      : reason === "sibling-open" && barOf($) !== undefined
      ? "group"
      : method === "keyboard" && reason === "trigger-press"
      ? "click"
      : null
  return base.set(model).evolve({
    closeMethod: method,
    closeReason: reason,
    focusLeft,
    pressing: false,
    spaceDown: false,
    hovering: false,
    stick: false,
    instant
  }).emit(MenuEvents.RequestedClose({ reason }))
}

const closeTree = (
  model: MenuModel,
  $: MenuUpdate,
  reason: MenuChangeReason,
  method: MenuInteraction | null,
  first?: MenuEvents
) => {
  const base: Base = parentOf($) === undefined
    ? $
    : $.send("self", MenuMessage.RequestedCloseByChild({ reason }))
  return dismiss(
    model,
    $,
    reason,
    method,
    false,
    first === undefined ? base : base.emit(first)
  )
}

const isSubmenu = (model: MenuModel, value: string): boolean =>
  model.submenus.some((submenu) => submenu.item === value)

const activate = (
  model: MenuModel,
  $: MenuUpdate,
  action: ItemAction,
  method: MenuInteraction
) => {
  const props = $.props
  const item = props.items.find((candidate) => candidate.value === action.value)
  if (
    !props.open || !ListNavigation.available(item) || disabledOf($) ||
    isSubmenu(model, action.value)
  ) {
    return $.set(model)
  }
  const next = UiStruct.evolve(model, { pressedItem: false, spaceDown: false })
  const picked = MenuEvents.Picked(
    action.kind === "checkbox"
      ? { value: action.value, checked: !action.checked }
      : action.kind === "radio"
      ? { value: action.value, checked: true }
      : { value: action.value }
  )
  if (!action.closeOnClick) {
    return commit(
      $,
      model,
      UiStruct.evolve(next, { active: action.value }),
      "none"
    ).emit(picked)
  }
  return closeTree(
    UiStruct.evolve(next, { pressing: false }),
    $,
    "item-press",
    method,
    picked
  )
}

const navigate = (model: MenuModel, $: MenuUpdate, key: string) => {
  const props = $.props
  const items = visibleOf(props)
  const index = ListNavigation.target(key, {
    at: model.active === null
      ? -1
      : items.findIndex((item) => item.value === model.active),
    last: items.length - 1,
    orientation: props.orientation ?? "vertical",
    rtl: rtlOf($, model.rtl),
    loop: props.loopFocus !== false ? "wrap" : "none"
  })
  const item = items[index ?? -1]
  return item === undefined
    ? $.set(model)
    : commit(
      $,
      model,
      UiStruct.evolve(model, { active: item.value, activeByKey: true }),
      "keyboard"
    )
}

const typeKey = (model: MenuModel, $: MenuUpdate, key: string) => {
  const items = visibleOf($.props)
  const from = model.active === null
    ? -1
    : items.findIndex((item) => item.value === model.active)
  const { index, state } = Typeahead.step(model.typeahead, key, items, from)
  const item = items[index]
  const moved = item === undefined
    ? {}
    : { active: item.value, activeByKey: true }
  return commit(
    $,
    model,
    UiStruct.evolve(model, { typeahead: state, ...moved }),
    "keyboard"
  ).run(
    Typeahead.waitReset(MenuMessage.CompletedWaitBeforeResetTyping, 500)
  )
}

const keys = (orientation: ListNavigation.Orientation, rtl: boolean) => {
  const cross = ListNavigation.arrowKeys(
    orientation === "vertical" ? "horizontal" : "vertical",
    rtl
  )
  return {
    ...ListNavigation.arrowKeys(orientation, rtl),
    open: cross.next,
    close: cross.previous
  }
}

const toSibling = (
  model: MenuModel,
  $: MenuUpdate,
  key: string,
  opens: string
) => {
  const bar = $.reads.menubar
  if (bar === undefined) return undefined
  const nested = $.props.parentItem !== undefined
  const rtl = rtlOf($, bar.rtl)
  if (bar.orientation === "vertical") {
    return !nested && key === keys("vertical", rtl).close
      ? dismiss(model, $, "list-navigation", "keyboard")
      : undefined
  }
  const along = ListNavigation.arrowKeys("horizontal", rtl)
  if (key !== along.next && key !== along.previous) return undefined
  if (
    key === opens && model.active !== null && isSubmenu(model, model.active)
  ) return undefined
  const from = nested ? null : ownTrigger(model, $.props)
  return $.send(Menubar, MenubarMessage.Navigated({ from, key, open: true }))
    .set(model)
}

const pressKey = (
  model: MenuModel,
  $: MenuUpdate,
  key: string,
  action: ItemAction | null
) => {
  const props = $.props
  if (!props.open) return $.set(model)
  const parent = parentOf($)
  const nav = keys(props.orientation ?? "vertical", rtlOf($, model.rtl))
  if (
    key === nav.next || key === nav.previous || key === "Home" || key === "End"
  ) return navigate(model, $, key)
  if (key === "Escape") {
    return props.closeParentOnEsc === true && parent !== undefined
      ? closeTree(model, $, "escape-key", "keyboard")
      : dismiss(model, $, "escape-key", "keyboard")
  }
  if (
    parent !== undefined &&
    key === keys(parent.orientation, rtlOf($, parent.rtl)).close
  ) {
    return dismiss(model, $, "list-navigation", "keyboard")
  }
  const switched = toSibling(model, $, key, nav.open)
  if (switched !== undefined) return switched
  if (key === "Enter") {
    return action === null
      ? $.set(model)
      : activate(model, $, action, "keyboard")
  }
  if (key === " " && !Typeahead.isTyping(model.typeahead)) {
    return $.set(model).evolve({ spaceDown: true })
  }
  if (key.length === 1 && !filteringOf(props)) return typeKey(model, $, key)
  return $.set(model)
}

const ownTrigger = (model: MenuModel, props: MenuProps): string | null =>
  props.triggerId ?? model.trigger ?? model.triggerElement

const opensFor = (
  model: MenuModel,
  props: MenuProps,
  key: string | null,
  triggerId: string | null
): boolean => {
  const active = ownTrigger(model, props)
  return active === null || active === key ||
    (triggerId !== null && active === triggerId)
}

const enterTrigger = (
  $: MenuUpdate,
  message: Extract<MenuMessage, { readonly _tag: "EnteredTrigger" }>
) => {
  const props = $.props
  const bar = barOf($)
  if (bar !== undefined) {
    return (props.open &&
        opensFor($.model, props, message.key, message.triggerId)) ||
        disabledOf($) ||
        !bar.hasSubmenuOpen
      ? $
      : open(
        $.model,
        $,
        "trigger-hover",
        "mouse",
        message.key,
        message.triggerId,
        { group: true }
      )
  }
  const next = UiStruct.evolve($.model, {
    hovering: true,
    hoverTrigger: message.key,
    hoverTriggerId: message.triggerId,
    hoverCloseDelay: message.closeDelay
  })
  if (disabledOf($)) return $.set(next)
  if (!props.open) {
    return $.set(next).run(WaitBeforeHoverOpen.make({ delay: message.delay }))
  }
  const stay = Command.interrupt(WaitBeforeHoverClose)
  return opensFor($.model, props, message.key, message.triggerId)
    ? $.set(next).run(stay)
    : hoverOpen(next, $).run(stay)
}

const hoverOpen = (model: MenuModel, $: MenuUpdate) =>
  open(
    UiStruct.evolve(model, { closeDelay: model.hoverCloseDelay }),
    $,
    "trigger-hover",
    "mouse",
    model.hoverTrigger,
    model.hoverTriggerId
  )

const pressTrigger = (
  $: MenuUpdate,
  method: MenuInteraction,
  key: string,
  triggerId: string | null
) => {
  const props = $.props
  if (disabledOf($)) return $
  if (props.open && opensFor($.model, props, key, triggerId)) {
    if ($.model.stick) {
      return $.evolve({
        reason: "trigger-press",
        stick: false,
        hovering: false
      })
        .run(Command.interrupt(WaitBeforeHoverClose))
    }
    return dismiss($.model, $, "trigger-press", method)
  }
  return open($.model, $, "trigger-press", method, key, triggerId)
}

const LongPressDelay = 500

const openAt = (
  $: MenuUpdate,
  key: string,
  triggerId: string | null,
  point: Positioning.Rect | null,
  method: MenuInteraction,
  release: boolean
) => {
  if (disabledOf($)) return $
  return open($.model, $, "trigger-press", method, key, triggerId, {
    context: { point, release }
  })
    .run(WaitBeforeContextGrace.make({ delay: LongPressDelay }))
}

const contextPoint = (
  x: number,
  y: number,
  pointerType: string
): Positioning.Rect | null =>
  pointerType === "" || (x === 0 && y === 0)
    ? null
    : { x, y, width: 0, height: 0 }

const contextPlacement = (
  props: MenuProps,
  point: Positioning.Rect | null
): MenuProps => {
  const align = props.align ?? "start"
  const offset = point !== null && props.side === undefined &&
    align !== "center"
  return {
    ...props,
    align,
    sideOffset: props.sideOffset ?? (offset ? -5 : undefined),
    alignOffset: props.alignOffset ?? (offset ? 2 : undefined),
    arrowPadding: props.arrowPadding ?? 0,
    // In place, an absolute positioner is clipped by the ancestors it opens in.
    positionMethod: props.positionMethod ??
      (props.topLayer === false ? "absolute" : "fixed")
  }
}

const shares = (
  { model, props }: { readonly model: MenuModel; readonly props: MenuProps }
): ParentState => ({
  open: props.open,
  active: model.active,
  reason: model.closeReason,
  rtl: model.provided ?? model.rtl,
  orientation: props.orientation ?? "vertical",
  disabled: props.disabled === true,
  topLayer: props.topLayer ?? model.parentTopLayer,
  disabledItems: props.items.filter((item) => item.disabled === true).map((
    item
  ) => item.value)
})

const TrackMenuArgs = {
  position: Positioning.TrackPositionArgs,
  open: Schema.Boolean,
  mounted: Schema.Boolean,
  started: Schema.Boolean,
  holdExit: Schema.Boolean,
  lock: Schema.Boolean,
  touch: Schema.Boolean,
  nested: Schema.Boolean,
  initialFocus: Schema.Boolean,
  active: Schema.NullOr(Schema.String),
  scroll: Schema.Boolean,
  pressing: Schema.Boolean,
  finalFocus: Schema.Boolean,
  focusLeft: Schema.Boolean,
  closeMethod: Schema.NullOr(MenuInteraction),
  hoverClose: Schema.Boolean,
  rtl: Schema.Boolean,
  // The nearest `DirectionProvider`'s direction, which wins over `rtl`.
  provider: Schema.NullOr(Schema.Boolean),
  trigger: Schema.NullOr(Schema.String),
  popupId: Schema.String,
  inputId: Schema.NullOr(Schema.String),
  orientation: ListNavigation.Orientation,
  parentOrientation: ListNavigation.Orientation,
  side: Schema.String,
  context: Schema.Boolean,
  release: Schema.Boolean,
  menubar: Schema.Boolean
}

type TrackMenuArgs = Schema.Struct<typeof TrackMenuArgs>["Type"]

const anyTrigger = (popupId: string) =>
  attrSelector("data-menu-trigger", popupId)

const triggerSelector = (popupId: string) =>
  anyTrigger(popupId) + "[data-menu-active]"

const contextSelector = (popupId: string) =>
  attrSelector("data-menu-context", popupId) + "[data-menu-active]"

const selectorsOf = (popupId: string) => ({
  any: anyTrigger(popupId),
  active: triggerSelector(popupId) + "," + contextSelector(popupId),
  enabled: anyTrigger(popupId) + ":not([disabled])"
})

const boxOf = (element: Element) => element.getBoundingClientRect()

interface Size {
  readonly width: number
  readonly height: number
}

const setSize = (
  element: HTMLElement,
  prefix: string,
  size: Size | "auto" | "max-content"
) => {
  element.style.setProperty(
    prefix + "-width",
    typeof size === "string" ? size : size.width + "px"
  )
  element.style.setProperty(
    prefix + "-height",
    typeof size === "string" ? size : size.height + "px"
  )
}

const watch = (
  node: HTMLElement,
  args: TrackMenuArgs,
  changes: Stream.Stream<TrackMenuArgs>
) =>
  Stream.callback<MenuMessage>((queue) => {
    const document = node.ownerDocument
    const view = document.defaultView
    const frame = frameOf(view)
    let current = args
    let selectors = selectorsOf(args.popupId)
    const send = (message: MenuMessage) => Queue.offerUnsafe(queue, message)
    const trigger = (): HTMLElement | null =>
      document.querySelector<HTMLElement>(selectors.active)
    const popup = (): HTMLElement =>
      document.getElementById(current.popupId) ?? node
    const input = (): HTMLInputElement | null =>
      current.inputId === null
        ? null
        : document.getElementById(current.inputId) as HTMLInputElement | null
    const inside = (target: Node): boolean =>
      (node.contains(target) && !blocker.is(target)) ||
      (isElement(target) && target.closest(selectors.any) !== null)

    const areaOf = (anchor: HTMLElement | null): Element | null =>
      anchor === null || current.context
        ? null
        : current.menubar
        ? menubarOf(anchor) ?? anchor
        : anchor

    let cutUndo: (() => void) | undefined
    let shown: (() => void) | undefined
    const layerOf = () =>
      Array.from(node.children).find(blocker.is) as HTMLElement | undefined
    const uncut = () => {
      cutUndo?.()
      cutUndo = undefined
      shown?.()
      shown = undefined
      const layer = layerOf()
      if (layer !== undefined) layer.inert = true
    }
    const cut = (anchor: HTMLElement | null) => {
      uncut()
      const layer = layerOf()
      if (layer === undefined) return
      const area = areaOf(anchor)
      if (area !== null) {
        cutUndo = override(layer, { "clip-path": cutPath([boxOf(area)]) })
      }
      shown = hideOthers(node, nextLayerOrder(), area === null ? [] : [area])
      layer.inert = false
    }

    const focusActive = (scroll: boolean) => {
      if (!current.open) return
      const item = current.active === null
        ? null
        : document.getElementById(current.active)
      const field = input()
      if (field !== null) {
        if (document.activeElement !== field) {
          field.focus({ preventScroll: true })
        }
        if (item !== null) item.scrollIntoView?.({ block: "nearest" })
        return
      }
      if (item === null) {
        if (
          current.initialFocus && document.activeElement !== popup() &&
          node.contains(document.activeElement)
        ) {
          popup().focus({ preventScroll: true })
        }
        return
      }
      if (document.activeElement !== item) item.focus({ preventScroll: true })
      if (scroll) item.scrollIntoView?.({ block: "nearest" })
    }

    let release: (() => void) | undefined
    const hold = () => {
      release?.()
      release = current.open && current.lock
        ? holdScroll(node, current.touch)
        : undefined
    }

    let rtl = args.rtl
    const direction = (anchor: HTMLElement | null) => {
      const next = isRtl(anchor ?? node)
      if (next !== rtl) {
        rtl = next
        send(MenuMessage.ChangedDirection({ rtl }))
      }
    }

    let triggerElement: string | null = null
    const found = (anchor: HTMLElement | null) => {
      const id = anchor?.id || null
      if (id !== triggerElement) {
        triggerElement = id
        send(MenuMessage.FoundTrigger({ id }))
      }
    }

    let before: HTMLElement | null = null
    const returnTo = () => current.context ? before : trigger()
    const siblingOpened = (own: HTMLElement | null) => {
      const bar = own === null ? null : menubarOf(own)
      return bar !== null &&
        barTriggers(bar).some((other) =>
          other !== own && other.getAttribute("aria-expanded") === "true"
        )
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    let tabbing: ReturnType<typeof setTimeout> | undefined
    const opening = () => {
      const focused = document.activeElement
      before = current.context && isHTMLElement(focused) &&
          !node.contains(focused)
        ? focused
        : null
      send(MenuMessage.ShowedPopup())
      node.inert = false
      clearTimeout(timer)
      if (current.pressing) {
        timer = setTimeout(() => send(MenuMessage.AllowedRelease()), 200)
      }
      const anchor = trigger()
      direction(anchor)
      found(anchor)
      cut(anchor)
      fit()
      const focusIn = () => {
        const field = input()
        if (field !== null) field.focus({ preventScroll: true })
        else if (current.active !== null) focusActive(false)
        else if (current.initialFocus) popup().focus({ preventScroll: true })
      }
      focusIn()
      // The default action of the press that opened it focuses the trigger.
      frame(() => {
        if (current.open && document.activeElement === anchor) focusIn()
      })
      if (!current.started) {
        frame(() => frame(() => send(MenuMessage.RenderedFirstFrame())))
      }
    }

    const closing = () => {
      clearTimeout(timer)
      leftAt = null
      unblockParent()
      const focused = document.activeElement
      const lost = focused === null || focused === document.body ||
        node.contains(focused)
      if (current.finalFocus && (lost || !current.focusLeft)) {
        const target = returnTo()
        const visible = current.closeMethod === "keyboard"
        const restore = () =>
          focusFinal(document, current.popupId, target, lost, visible)
        // A sibling menu of the menubar that opens in the same render is patched after this one closes.
        if (current.menubar && !current.nested) {
          queueMicrotask(() => siblingOpened(target) || restore())
        } else restore()
      } else if (isHTMLElement(focused) && node.contains(focused)) {
        focused.blur()
      }
      node.inert = true
      uncut()
    }

    const mac = isMac(view)
    const onMouseUp = (event: MouseEvent) => {
      if (current.pressing) {
        send(
          MenuMessage.ReleasedPointer({
            outside: releasedOutside(event, inside, trigger())
          })
        )
      }
      if (!current.open || !current.release) return
      const target = event.target as Node | null
      const point = current.position.anchorRect
      const moved = point == null || Math.abs(event.clientX - point.x) > 1 ||
        Math.abs(event.clientY - point.y) > 1
      const item = mac && moved && event.button === 2 && isElement(target)
        ? target.closest<HTMLElement>("[data-menu-item]")
        : null
      if (
        item !== null && node.contains(item) && item.localName !== "a" &&
        !item.hasAttribute("aria-haspopup")
      ) {
        item.focus({ preventScroll: true })
        item.dispatchEvent(
          new (view ?? globalThis).MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            detail: 1
          })
        )
      }
      send(
        MenuMessage.ReleasedContextPointer({
          outside: target === null || !inside(target)
        })
      )
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!current.open || event.defaultPrevented) return
      if (
        event.key === "Tab" && !current.nested && !event.altKey &&
        !event.ctrlKey && !event.metaKey
      ) {
        const anchor = returnTo()
        // Inert only until the browser has moved focus on from the anchor, so a refused close leaves it usable.
        node.inert = true
        clearTimeout(tabbing)
        tabbing = setTimeout(() => {
          tabbing = undefined
          if (current.open) node.inert = false
        })
        if (anchor !== null) anchor.focus({ preventScroll: true })
        if (current.context || event.shiftKey || anchor === null) {
          event.preventDefault()
        }
        send(MenuMessage.TabbedOut())
        return
      }
      const field = input()
      if (field === null || event.target !== field || event.isComposing) return
      // The input's handler takes every key, so its Escape is cancelled here for the document listener to skip.
      if (event.key === "Escape") return event.preventDefault()
      const item = current.active === null
        ? null
        : document.getElementById(current.active)
      const hasValue = field.value !== ""
      const plain = !event.shiftKey && !event.ctrlKey && !event.altKey &&
        !event.metaKey
      if (
        item !== null &&
        (event.key === "Enter" || (event.key === " " && !hasValue && plain))
      ) {
        event.preventDefault()
        event.stopPropagation()
        item.click()
        return
      }
      const nav = keys(current.orientation, current.provider ?? rtl)
      if (
        current.orientation === "vertical" &&
        (event.key === nav.next || event.key === nav.previous)
      ) {
        event.preventDefault()
      }
      const caret = field.selectionStart === field.selectionEnd
      const atEnd = caret && field.selectionEnd === field.value.length
      const atStart = caret && field.selectionStart === 0
      if (
        plain && item !== null && item.hasAttribute("aria-haspopup") &&
        ((event.key === nav.open && (!hasValue || atEnd)) ||
          (event.key === nav.close && current.orientation === "horizontal"))
      ) {
        event.preventDefault()
        event.stopPropagation()
        item.dispatchEvent(
          new (view ?? globalThis).KeyboardEvent("keydown", {
            key: event.key,
            bubbles: true,
            cancelable: true
          })
        )
        return
      }
      if (
        plain && current.nested &&
        event.key ===
          keys(current.parentOrientation, current.provider ?? rtl).close &&
        (!hasValue || atStart)
      ) {
        event.preventDefault()
        event.stopPropagation()
        field.dispatchEvent(
          new (view ?? globalThis).KeyboardEvent("keydown", {
            key: "Escape",
            bubbles: true,
            cancelable: true
          })
        )
      }
    }

    let leftAt: Point | null = null
    let away = false
    let unblock: (() => void) | undefined
    const unblockParent = () => {
      unblock?.()
      unblock = undefined
    }
    const blockParent = () => {
      if (!current.nested || unblock !== undefined) return
      const element = node.parentElement?.closest<HTMLElement>(
        "[data-menu-popup]"
      )
      if (element === null || element === undefined) return
      const restoreParent = override(element, { "pointer-events": "none" })
      const restoreNode = override(node, { "pointer-events": "auto" })
      unblock = () => {
        restoreParent()
        restoreNode()
      }
    }
    const onMouseEnter = (event: MouseEvent) => {
      if (
        !current.open || !current.hoverClose || !current.nested ||
        leftAt === null
      ) return
      const target = event.target
      if (
        !isElement(target) || node.contains(target) ||
        trigger()?.contains(target) === true
      ) return
      if (
        !inSafeArea({ x: event.clientX, y: event.clientY }, leftAt, boxOf(node))
      ) return
      blockParent()
      event.stopPropagation()
    }
    const onMouseMove = (event: MouseEvent) => {
      if (!current.open || !current.hoverClose) return
      const target = event.target as Node | null
      const anchor = trigger()
      const point = { x: event.clientX, y: event.clientY }
      const onTrigger = isElement(target) &&
        target.closest(selectors.enabled) !== null
      if (
        target !== null &&
        (node.contains(target) || anchor?.contains(target) === true ||
          onTrigger)
      ) {
        if (node.contains(target)) unblockParent()
        if (anchor?.contains(target) === true) leftAt = point
        if (away) {
          away = false
          send(MenuMessage.ReturnedToHoverArea())
        }
        return
      }
      if (leftAt !== null && inSafeArea(point, leftAt, boxOf(node))) {
        blockParent()
        return
      }
      unblockParent()
      leftAt = null
      if (!away) {
        away = true
        send(MenuMessage.LeftHoverArea())
      }
    }

    let viewportKey = args.trigger
    let previousTrigger: DOMRect | null = null
    let lastCurrent: Element | null = null
    let lastSize: Size | null = null
    const viewport = (): HTMLElement | null =>
      node.querySelector<HTMLElement>("[data-menu-viewport]")
    const sizeOf = (element: HTMLElement): Size => {
      const style = view?.getComputedStyle(element)
      const width = Number.parseFloat(style?.width ?? "") || 0
      const height = Number.parseFloat(style?.height ?? "") || 0
      return Math.round(width) !== element.offsetWidth ||
          Math.round(height) !== element.offsetHeight
        ? { width: element.offsetWidth, height: element.offsetHeight }
        : { width, height }
    }
    const remember = (measured: boolean) => {
      const anchor = trigger()
      if (anchor !== null) previousTrigger = boxOf(anchor)
      const element = viewport()
      lastCurrent = element?.querySelector(":scope > [data-current]") ?? null
      if (element !== null && !measured) lastSize = sizeOf(popup())
    }

    let unanchor: (() => void) | undefined
    const anchorPopup = () => {
      unanchor?.()
      unanchor = undefined
      if (!current.open || viewport() === null) return
      const side = current.side
      const top = side === "top"
      const left = side === "left" ||
        side ===
          ((current.provider ?? current.rtl) ? "inline-end" : "inline-start")
      if (!top && !left) return
      unanchor = override(popup(), {
        position: "absolute",
        [top ? "bottom" : "top"]: "0",
        [left ? "right" : "left"]: "0"
      })
    }
    const measure = (fresh: HTMLElement | null): Size => {
      const element = popup()
      setSize(element, "--popup", "auto")
      const undo = [
        override(element, {
          position: "static",
          transform: "none",
          scale: "1"
        }),
        override(node, {
          "--available-width": "max-content",
          "--available-height": "max-content",
          "--positioner-width": "max-content",
          "--positioner-height": "max-content"
        }),
        ...(fresh === null
          ? []
          : [override(fresh, { animation: "none", transition: "none" })])
      ]
      const size = sizeOf(element)
      undo.forEach((restore) => restore())
      return size
    }
    const fit = () => {
      if (viewport() === null) return
      anchorPopup()
      setSize(node, "--positioner", measure(null))
    }
    let resizing: AbortController | undefined
    const resize = (fresh: HTMLElement | null, previous: Size | null) => {
      resizing?.abort()
      if (previous === null) return fit()
      const element = popup()
      const next = measure(fresh)
      lastSize = next
      setSize(element, "--popup", previous)
      setSize(node, "--positioner", next)
      // Reading the width flushes styles, so the transition starts from the pinned size instead of auto.
      void element.offsetWidth
      const controller = new AbortController()
      resizing = controller
      frame(() => {
        if (controller.signal.aborted) return
        setSize(element, "--popup", next)
        Promise.allSettled(
          element.getAnimations().map((animation) => animation.finished)
        ).then(() => {
          if (!controller.signal.aborted) setSize(element, "--popup", "auto")
        })
      })
    }

    const morph = (anchor: HTMLElement | null) => {
      const element = viewport()
      const from = previousTrigger
      const old = lastCurrent
      const size = lastSize
      const fresh =
        element?.querySelector<HTMLElement>(":scope > [data-current]") ?? null
      if (element !== null) resize(fresh, size)
      if (anchor !== null && from !== null) {
        frame(() =>
          Promise.allSettled(
            node.getAnimations({ subtree: true }).map((animation) =>
              animation.finished
            )
          ).then(() => {
            if (current.open) send(MenuMessage.SettledTriggerChange())
          })
        )
      }
      if (element === null) return
      if (
        old === null || old.isConnected || from === null || anchor === null
      ) return
      const wrapper = document.createElement("div")
      wrapper.setAttribute("data-previous", "")
      wrapper.inert = true
      wrapper.style.position = "absolute"
      if (size !== null) setSize(wrapper, "--popup", size)
      wrapper.append(...Array.from(old.childNodes))
      element.insertBefore(wrapper, element.firstChild)
      fresh?.setAttribute("data-starting-style", "")
      send(
        MenuMessage.MovedViewport({
          direction: activationDirection(from, boxOf(anchor))
        })
      )
      frame(() => {
        fresh?.removeAttribute("data-starting-style")
        wrapper.setAttribute("data-ending-style", "")
        const running = [
          ...wrapper.getAnimations({ subtree: true }),
          ...(fresh?.getAnimations() ?? [])
        ]
          .map((animation) => animation.finished)
        Promise.allSettled(running).then(() => {
          wrapper.remove()
          send(MenuMessage.SettledViewport())
        })
      })
    }

    const transition = settling(node, popup, frame, (open) =>
      send(MenuMessage.FinishedTransition({ open })))

    const onChange = (next: TrackMenuArgs) => {
      const previous = current
      current = next
      if (next.popupId !== previous.popupId) {
        selectors = selectorsOf(next.popupId)
      }
      if (next.provider !== previous.provider) {
        send(MenuMessage.ChangedProvider({ rtl: next.provider }))
      }
      if (
        next.open !== previous.open || next.lock !== previous.lock ||
        next.touch !== previous.touch
      ) {
        hold()
      }
      if (!next.hoverClose) {
        leftAt = null
        away = false
        unblockParent()
      }
      if (previous.open && next.open && next.lock !== previous.lock) {
        cut(trigger())
      }
      if (previous.open && !next.open) {
        closing()
      } else if (!previous.open && next.open) {
        opening()
      } else if (
        next.open &&
        (next.active !== previous.active ||
          (next.scroll && next.trigger !== previous.trigger))
      ) {
        focusActive(next.scroll)
      }
      const switched = next.open && next.trigger !== viewportKey &&
        viewportKey !== null && next.trigger !== null
      if (switched) {
        viewportKey = next.trigger
        const anchor = trigger()
        morph(anchor)
        found(anchor)
        cut(anchor)
      } else if (next.trigger !== null) {
        viewportKey = next.trigger
      }
      if (
        next.open &&
        (next.side !== previous.side || next.rtl !== previous.rtl ||
          next.provider !== previous.provider)
      ) {
        anchorPopup()
      }
      if (next.open) {
        remember(switched)
      }
      transition.follow(previous, next)
    }

    const onTriggerLeave = (event: MouseEvent) => {
      if (
        isElement(event.target) &&
        event.target.matches(selectors.active)
      ) {
        leftAt = { x: event.clientX, y: event.clientY }
      }
    }

    const controller = new AbortController()
    const { signal } = controller

    return Effect.acquireRelease(
      Effect.sync(() => {
        listenOutside(node, signal, {
          open: () =>
            current.open,
          anyButton: () =>
            current.context,
          inside,
          pressed: (pointerType) =>
            send(MenuMessage.PressedOutside({ pointerType })),
          focused: () => {
            if (tabbing === undefined) {
              send(MenuMessage.FocusedOutside())
            }
          }
        })
        document.addEventListener("mouseup", onMouseUp, {
          capture: true,
          signal
        })
        document.addEventListener("mousemove", onMouseMove, {
          capture: true,
          passive: true,
          signal
        })
        // The window sees the capture phase before the document, where the host delegates item handlers.
        if (current.nested) {
          view?.addEventListener("mouseenter", onMouseEnter, {
            capture: true,
            signal
          })
        }
        document.addEventListener("mouseout", onTriggerLeave, {
          capture: true,
          passive: true,
          signal
        })
        node.addEventListener("keydown", onKeyDown, { capture: true, signal })
        node.addEventListener("mousedown", (event) => {
          if (blocker.is(event.target)) {
            event.preventDefault()
          }
        }, { signal })
        node.addEventListener("contextmenu", (event) => {
          if (current.context) {
            event.preventDefault()
          }
        }, { signal })
        // For the submenus, which share the menu's direction.
        if (current.provider !== null) {
          send(MenuMessage.ChangedProvider({ rtl: current.provider }))
        }
        hold()
        raiseAbove(node)
        if (current.open) {
          opening()
          remember(false)
        } else node.inert = true
      }).pipe(
        Effect.tap(() =>
          Effect.forkScoped(
            Stream.runForEach(changes, (next) =>
              Effect.sync(() =>
                onChange(next)
              ))
          )
        )
      ),
      () =>
        Effect.sync(() => {
          controller.abort()
          clearTimeout(timer)
          clearTimeout(tabbing)
          release?.()
          release = undefined
          uncut()
          unanchor?.()
          resizing?.abort()
          unblockParent()
          transition.cancel()
          node.inert = false
        })
    )
  })

const TrackMenu = Mount.makeStream(
  "TrackMenu",
  { args: TrackMenuArgs },
  (node: HTMLElement, args, changes) =>
    Stream.merge(
      watch(node, args, changes),
      Positioning.trackPosition(
        node,
        args.position,
        Stream.map(changes, (next) => next.position)
      ).pipe(
        Stream.map((placement) => MenuMessage.ChangedPlacement({ placement }))
      )
    )
)

const MenuTriggerHover = Mount.makeStream(
  "MenuTriggerHover",
  { args: { delay: Schema.Number } },
  (node: HTMLElement, args, changes) =>
    Stream.callback<void>((queue) => {
      let delay = args.delay
      let timer: ReturnType<typeof setTimeout> | undefined
      const rest = () => {
        clearTimeout(timer)
        timer = setTimeout(() => Queue.offerUnsafe(queue, undefined), delay)
      }
      const leave = () => clearTimeout(timer)
      const controller = new AbortController()
      return Effect.acquireRelease(
        Effect.sync(() => {
          node.addEventListener("mouseenter", rest, {
            signal: controller.signal
          })
          node.addEventListener("mousemove", rest, {
            signal: controller.signal
          })
          node.addEventListener("mouseleave", leave, {
            signal: controller.signal
          })
        }).pipe(
          Effect.tap(() =>
            Effect.forkScoped(
              Stream.runForEach(
                changes,
                (next) => Effect.sync(() => (delay = next.delay))
              )
            )
          )
        ),
        () =>
          Effect.sync(() => {
            controller.abort()
            clearTimeout(timer)
          })
      )
    })
)

type Touch = {
  readonly _tag: "Started"
  readonly x: number
  readonly y: number
} | { readonly _tag: "Cancelled" }

const LongPressSlop = 10

const MenuLongPress = Mount.makeStream(
  "MenuLongPress",
  { args: {} },
  (node: HTMLElement) =>
    Stream.callback<Touch>((queue) => {
      let start: { readonly x: number; readonly y: number } | null = null
      const cancel = () => {
        if (start === null) return
        start = null
        Queue.offerUnsafe(queue, { _tag: "Cancelled" })
      }
      const onStart = (event: TouchEvent) => {
        const touch = event.touches[0]
        if (event.touches.length !== 1 || touch === undefined) return cancel()
        event.stopPropagation()
        start = { x: touch.clientX, y: touch.clientY }
        Queue.offerUnsafe(queue, { _tag: "Started", ...start })
      }
      const onMove = (event: TouchEvent) => {
        const touch = event.touches[0]
        if (event.touches.length !== 1 || touch === undefined) return cancel()
        if (
          start !== null &&
          (Math.abs(touch.clientX - start.x) > LongPressSlop ||
            Math.abs(touch.clientY - start.y) > LongPressSlop)
        ) cancel()
      }
      const controller = new AbortController()
      return Effect.acquireRelease(
        Effect.sync(() => {
          const options = { passive: true, signal: controller.signal }
          node.addEventListener("touchstart", onStart, options)
          node.addEventListener("touchmove", onMove, options)
          node.addEventListener("touchend", cancel, options)
          node.addEventListener("touchcancel", cancel, options)
        }),
        () => Effect.sync(() => controller.abort())
      )
    })
)

const blocker = blockers("data-menu-blocker")

const escapes = [
  onEscape(MenuMessage.PressedKey({ key: "Escape", action: null }))
]

const hiddenBox = "display:none"

const MenuTriggerHoverDefault = 100

const listIdOf = (popupId: string) => popupId + "-list"

const contextKey = ({ composing, key, shift }: Html.KeyPayload) =>
  !composing && (key === "ContextMenu" || (key === "F10" && shift))

// Run in `forward` to preserve the caller's `aria-controls` tokens.
const controlling = <
  B extends Attributed<B> & {
    readonly elementAttrs: Readonly<Record<string, string>>
  }
>(node: B, id: string | undefined): B =>
  node.attr("aria-controls", withTokens(node.elementAttrs["aria-controls"], id))

const triggerAttrs = <B extends Attributed<B>>(
  builder: B,
  popupId: string,
  open: boolean,
  active: boolean
): B =>
  builder
    .attrs({
      "aria-haspopup": "menu",
      "aria-expanded": String(open),
      "data-popup-open": flag(open),
      "data-menu-trigger": popupId,
      "data-menu-active": flag(active)
    })

type Handles<Msg> = Html.Element<Msg, any, Html.Events, any, any>

type MsgOf<B> = B extends Handles<infer Msg> ? Msg : never

const pressable = <B extends Handles<any>>(
  builder: B,
  press: (pointerType: string) => MsgOf<B>,
  click: (pointerType: string) => MsgOf<B> = press
): B =>
  builder
    .on(
      "mousedown",
      ({ button, pointerType }: Html.PointerPayload) =>
        button === 0 && pointerType !== "touch" ? press(pointerType) : undefined
    )
    .on("click", ({ pointerType }: Html.PointerPayload) =>
      pointerType === "" || pointerType === "touch"
        ? click(pointerType)
        : undefined)

/**
 * The options of one `trigger` part besides its `element`, over the
 * menu's props of the same name: `disabled` turns this trigger off, and
 * `openOnHover`, `delay` and `closeDelay` set how the pointer opens and
 * closes the menu from it.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface MenuTriggerOptions {
  readonly disabled?: boolean | undefined
  readonly openOnHover?: boolean | undefined
  readonly delay?: number | undefined
  readonly closeDelay?: number | undefined
}

/**
 * A press or a hover on a `MenuTrigger`: the trigger's `id`, if it has one,
 * how the user pressed it, and the reason to pass to the menu as
 * `openReason`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface MenuTriggerPress {
  readonly triggerId: string | null
  readonly method: MenuInteraction
  readonly reason: "trigger-press" | "trigger-hover"
}

/**
 * A `<button>` builder: what `MenuTrigger` accepts as `element`, from the
 * caller's `h.button`, and what it returns.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type MenuTriggerElement<Msg, R = never> = Html.Element<
  Msg,
  R,
  Html.EventsOf<"button">,
  HTMLButtonElement,
  "button"
>

/**
 * The props of a `MenuTrigger`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface MenuTriggerProps {
  /** Whether the menu is open for this trigger. */
  readonly open: boolean
  /** The menu's `id`, which `aria-controls` points at while it is open. */
  readonly popupId: string
  /** The trigger takes no press and no hover. */
  readonly disabled?: boolean | undefined
  /** Point `aria-controls` at the `list` part when the menu uses a filter. */
  readonly filtered?: boolean | undefined
  /** How long the pointer rests on the trigger before `onHover`, in milliseconds. */
  readonly delay?: number | undefined
}

/**
 * A button that opens a menu drawn somewhere else, such as in another
 * component. Call it with the caller's `h`, whether the menu is open for
 * this trigger, the menu's `id` as `popupId`, and what a press sends as
 * `onPress`, then chain the label.
 *
 * **Details**
 *
 * It sets `aria-haspopup="menu"`, `aria-expanded`, `data-popup-open` and
 * `data-pressed` in `forward`, so they win over the caller's, and adds the
 * menu's `id` to the caller's `aria-controls` while the menu is open. With
 * `filtered: true`, it adds the `list` part's `id` instead. Give the menu
 * the same `id`, and the trigger's `id` as the menu's `triggerId`: it places
 * its popup against the trigger, a press on it isn't a press outside, and
 * focus goes back to it when the menu closes.
 *
 * A mouse press sends `onPress` on `mousedown`, as the menu's own trigger
 * does, a touch, Enter or Space on `click`, and ArrowDown or ArrowUp on
 * `keydown` while the menu is closed. Opened with `openMethod`
 * `"keyboard"`, the menu highlights its first enabled item. `onHover` is
 * sent once the pointer has rested on the trigger for `delay` milliseconds,
 * 100 when left out. Each is a message or a function of the press, which carries the
 * trigger's `id`, how the user pressed it and why. Pass the method and the
 * reason to the menu as `openMethod` and `openReason`: a menu opened with
 * `"trigger-hover"` closes when the pointer leaves it and the trigger.
 *
 * Given `onPress`, a `mousedown`, `click` or `keydown` handler of the
 * caller's own throws at render: pass the message as `onPress`. Given
 * `onHover`, it reserves the element's mount slot, so the caller can't set
 * another mount on it.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const MenuTrigger = <Msg, R = never>(
  h: { readonly button: MenuTriggerElement<Msg> },
  options: {
    /** The caller's `h.button`, to stack a part on it. `h.button` when left out. */
    readonly element?: MenuTriggerElement<Msg, R> | undefined
    readonly props: MenuTriggerProps
    /** What a press sends. */
    readonly onPress?:
      | NoInfer<Msg>
      | ((press: MenuTriggerPress) => NoInfer<Msg>)
      | undefined
    /** What resting the pointer on the trigger sends. */
    readonly onHover?:
      | NoInfer<Msg>
      | ((press: MenuTriggerPress) => NoInfer<Msg>)
      | undefined
  }
): MenuTriggerElement<Msg, R> => {
  const element: MenuTriggerElement<Msg, R> = options.element ?? h.button
  const { onHover, onPress } = options
  const { disabled, open, popupId } = options.props
  return element.forward((node) => {
    if (
      onPress !== undefined &&
      (node.handlers.click !== undefined ||
        node.handlers.mousedown !== undefined ||
        node.handlers.keydown !== undefined)
    ) {
      throw new Error(
        "MenuTrigger: the element already handles mousedown, click or keydown, which MenuTrigger would replace. Send the message from onPress"
      )
    }
    const triggerId = idOf(node)
    const message = (
      handler: NoInfer<Msg> | ((press: MenuTriggerPress) => NoInfer<Msg>),
      method: MenuInteraction,
      reason: MenuTriggerPress["reason"]
    ): Msg =>
      typeof handler === "function"
        ? (handler as (press: MenuTriggerPress) => Msg)({
          triggerId,
          method,
          reason
        })
        : handler
    const button = controlling(
      triggerAttrs(node.attr("type", "button"), popupId, open, open),
      open
        ? options.props.filtered === true ? listIdOf(popupId) : popupId
        : undefined
    )
      .attrs({
        "data-pressed": flag(open),
        "data-disabled": flag(disabled),
        "aria-disabled": undefined
      })
      .disabled(disabled === true)
    const pressed = onPress === undefined || disabled === true
      ? button
      : pressable(
        button,
        (pointerType) =>
          message(onPress, methodOf(pointerType), "trigger-press")
      ).on(
        "keydown",
        ({ composing, key }) =>
          !open && !composing && (key === "ArrowDown" || key === "ArrowUp")
            ? message(onPress, "keyboard", "trigger-press")
            : undefined,
        { preventDefault: true }
      )
    return onHover === undefined || disabled === true || open
      ? pressed
      : pressed.onMount(
        MenuTriggerHover({
          delay: options.props.delay ?? MenuTriggerHoverDefault
        }).pipe(
          Mount.map(() => message(onHover, "mouse", "trigger-hover"))
        )
      )
  })
}

/**
 * Text matching as a filtering menu does it, for a `filter: null` menu that
 * filters its own items: `contains`, `startsWith` and `endsWith` of a text
 * and a query, ignoring case, accents and punctuation by default.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface MenuFilter {
  readonly contains: (text: string, query: string) => boolean
  readonly startsWith: (text: string, query: string) => boolean
  readonly endsWith: (text: string, query: string) => boolean
}

/**
 * Makes a `MenuFilter` for `locale`, the runtime's when left out, and
 * `Intl.Collator` options over the defaults: search usage, base
 * sensitivity, punctuation ignored.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const menuFilter = (
  options: Intl.CollatorOptions & { readonly locale?: string | undefined } = {}
): MenuFilter => {
  const { locale, ...collator } = options
  return textFilter(locale, collator)
}

/**
 * A menu: a button that opens a list of actions, links, checkbox and radio
 * items, and submenus.
 *
 * **Details**
 *
 * The parts also return plain values for markup that depends on them:
 * `open`, `mounted` (the popup shows, through its exit transition),
 * `transitionStatus`, `nested` (it's a submenu), `side` and `align`
 * (where the popup ended up), `highlighted` (the value of the highlighted
 * item), `openMethod`, which is `null` once the popup closes,
 * `transitioning` and `activationDirection` for the viewport, and
 * `nothingMatches`, whether a filter matches no item.
 *
 * A trigger reports the `id` the consumer gave it in `RequestedOpen`: set it
 * on the builder before the part. One without gets a generated `id`. The
 * menu remembers the trigger that opened it, or follows `triggerId`: only
 * that one reports it open and anchors the popup. Pressing another one while
 * the menu is open asks it to open for that one.
 *
 * Each part's attributes win over the ones the consumer set on the builder
 * before the part, including the ones a state leaves absent. Besides the
 * ones under **Data attributes** in the module docs, they are:
 *
 * - `trigger`: `id`, the one on the builder or a generated one,
 *   `type="button"`, `aria-haspopup="menu"`, `aria-expanded`,
 *   `aria-controls` while open, pointing at the element with the menu
 *   role, and `disabled`
 * - `contextTrigger`: `tabindex="0"` unless the builder has one, so the
 *   keyboard can reach it
 * - `submenuTrigger`: `aria-haspopup="menu"`, `aria-expanded`, and
 *   `aria-controls` while open
 * - `backdrop`, `positioner`: `role="presentation"` and
 *   `popover="manual"`. A submenu's backdrop has it too, but never opens.
 * - `popup`: `id`, which the `id` prop sets, `tabindex="-1"`, and
 *   `role="menu"`, `aria-orientation` for a horizontal menu and
 *   `aria-labelledby` pointing at the trigger unless the builder has one,
 *   or `role="presentation"` when a `list` or an `input` is drawn
 *   inside it
 * - `list`: `id`, `tabindex="-1"`, and the popup's `role="menu"`,
 *   `aria-orientation` and `aria-labelledby`
 * - `item`, `linkItem`: `id`, `role="menuitem"`, `aria-disabled`,
 *   `tabindex`, `"0"` while it's highlighted or its submenu is open in a
 *   menu without a filter and `"-1"` otherwise, and `hidden` while the
 *   filter leaves it out
 * - `checkboxItem`, `radioItem`: as `item`, with
 *   `role="menuitemcheckbox"` or `"menuitemradio"` and `aria-checked`
 * - `radioGroup`: `role="group"`
 * - `group`: `role="group"`, `aria-labelledby` pointing at its
 *   `groupLabel`, and `hidden` while the filter leaves none of its items
 * - `groupLabel`: `id`
 * - `arrow`, the indicators: `aria-hidden="true"`, and `id` on the
 *   arrow
 * - `separator`: `role="separator"`, with `aria-orientation="vertical"`
 *   in a horizontal menu and `"horizontal"` otherwise
 * - `input`: `id`, `type="text"`, `role="searchbox"`,
 *   `inputmode="search"`, `aria-activedescendant`, `aria-controls`
 *   pointing at the list, `value`, `disabled`, and `autocomplete="off"`,
 *   `spellcheck`, `autocorrect` and `autocapitalize`
 * - `clear`: `type="button"`, `tabindex="-1"`, `aria-hidden="true"`,
 *   `disabled`
 * - `empty`: `role="status"`, `aria-live="polite"`, `aria-atomic="true"`
 *
 * The parts handle these events on a layer of their own, so the
 * consumer's handlers for them still run:
 *
 * - `trigger`: `mousedown`, `mouseup`, `click` and `keydown`, and
 *   `mouseenter` and `mouseleave` when hovering opens it. A trigger with
 *   the `disabled` option handles none.
 * - `contextTrigger`: `contextmenu`, `keydown`, and touches through its
 *   mount
 * - `submenuTrigger`: `mousedown`, `click` and `keydown`, and
 *   `mouseenter` and `mouseleave` when hovering opens it
 * - `backdrop`: `contextmenu`, in a menu opened from a `contextTrigger`
 * - `popup`: `keydown` and `keyup`
 * - the items: `mouseenter`, `mouseleave`, `mousedown`, `mouseup`,
 *   `click`, `keydown` and `keyup`
 * - `input`: `input`, `keydown`, `mousedown`, `focus` and `blur`
 * - `clear`: `mousedown` and `click`
 *
 * The triggers, the popup and the items cancel the keys they handle, but
 * Enter on a `linkItem` follows its `href`. `contextTrigger` and the
 * backdrop cancel `contextmenu`, so the browser's menu doesn't show, and
 * `clear` cancels `mousedown`, so focus stays in the input. The
 * positioner's mount places the popup, moves focus, and listens for presses
 * and focus outside it.
 *
 * It emits `RequestedOpen`, `RequestedClose`, `Picked`, `Highlighted`,
 * `RequestedQuery` and `Settled`.
 *
 * History restore saves nothing of it: after Back, forward or a reload it
 * starts from `init`.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const Menu = Html.component({
  name: "Menu",
  props: MenuProps,
  model: MenuModel,
  message: MenuMessage,
  events: MenuEvents,
  shares: {
    value: shares,
    receives: ["RequestedCloseByChild"],
    collects: {
      schema: Submenu,
      onChange: (submenus) =>
        MenuMessage.ChangedSubmenus({
          submenus: submenus.filter((submenu) => submenu.item !== "")
        })
    }
  },
  reads: {
    parent: {
      owner: "self",
      optional: true,
      report: (_model, props) => ({
        item: props.parentItem ?? "",
        open: props.open
      }),
      onChange: (parent) => MenuMessage.ChangedParent({ parent })
    },
    menubar: {
      owner: Menubar,
      optional: true,
      report: (model, props) => ({
        open: props.open,
        trigger: props.parentItem !== undefined
          ? null
          : ownTrigger(model, props)
      }),
      onChange: (menubar) => MenuMessage.ChangedMenubar({ menubar })
    },
    toolbar: { owner: Toolbar, optional: true },
    provider: { owner: DirectionProvider, optional: true }
  },
  restore: false
}).make({
  init: () => ({
    mounted: false,
    started: false,
    openMethod: null,
    closeMethod: null,
    reason: null,
    closeReason: null,
    focusLeft: false,
    trigger: null,
    hoverTrigger: null,
    hoverTriggerId: null,
    hoverCloseDelay: 0,
    closeDelay: 0,
    hovering: false,
    stick: false,
    active: null,
    activeByKey: false,
    typeahead: Typeahead.initial,
    spaceDown: false,
    placement: null,
    pressing: false,
    releaseAllowed: false,
    pressedItem: false,
    rtl: false,
    parentTopLayer: true,
    submenus: [],
    instant: null,
    transitioning: false,
    direction: null,
    inputFocused: false,
    keyboard: false,
    triggerElement: null,
    context: false,
    point: null,
    longPress: null,
    justOpened: false,
    releaseArmed: false,
    barCurrent: null,
    provided: null
  }),
  update: {
    PressedTrigger: ($, { key, pointerType, triggerId }) =>
      pressTrigger($, methodOf(pointerType), key, triggerId),
    ReleasedTrigger: ($) => $.evolve({ pressing: false }),
    PressedContextTrigger: ($, { key, pointerType, triggerId, x, y }) => {
      const point = contextPoint(x, y, pointerType)
      const { justOpened, openMethod, trigger } = $.model
      // Ignore a browser-generated `contextmenu` after the keydown already opened the menu.
      return point === null && justOpened && openMethod === "keyboard" &&
          trigger === key
        ? $.model
        : openAt($, key, triggerId, point, methodOf(pointerType), true)
    },
    PressedContextKey: ($, { key, triggerId }) =>
      openAt($, key, triggerId, null, "keyboard", false),
    TouchedContextTrigger: ($, { key, triggerId, x, y }) =>
      disabledOf($)
        ? $.model
        : $.evolve({ longPress: { key, triggerId, x, y } }).run(
          WaitBeforeLongPress.make({ delay: LongPressDelay })
        ),
    CancelledLongPress: ($) =>
      $.model.longPress === null
        ? $.model
        : $.evolve({ longPress: null }).run(
          Command.interrupt(WaitBeforeLongPress)
        ),
    CompletedWaitBeforeLongPress: ($) => {
      const press = $.model.longPress
      if (press === null) return $.model
      const point = { x: press.x, y: press.y, width: 10, height: 10 }
      return openAt($, press.key, press.triggerId, point, "touch", false)
    },
    CompletedWaitBeforeContextGrace: ($) => $.evolve({ justOpened: false }),
    ReleasedContextPointer: ($, { outside }) => {
      if (!$.model.releaseArmed) return $.model
      const next = UiStruct.evolve($.model, { releaseArmed: false })
      return outside && !$.model.justOpened
        ? dismiss(next, $, "cancel-open", "mouse")
        : $.set(next)
    },
    PressedTriggerKey: ($, { key, trigger, triggerId }) =>
      $.props.open || disabledOf($)
        ? $.model
        : open($.model, $, "list-navigation", "keyboard", trigger, triggerId, {
          last: key === "ArrowUp"
        }),
    EnteredTrigger: ($, message) => enterTrigger($, message),
    LeftTrigger: ($) =>
      $.evolve($.props.open ? {} : { hovering: false }).run(
        Command.interrupt(WaitBeforeHoverOpen)
      ),
    CompletedWaitBeforeHoverOpen: ($) =>
      $.props.open || !$.model.hovering || disabledOf($)
        ? $.model
        : hoverOpen($.model, $),
    LeftHoverArea: ($) =>
      $.props.open && hoverOpened($.model.reason, $)
        ? $.evolve({ hovering: false }).run(
          WaitBeforeHoverClose.make({ delay: $.model.closeDelay })
        )
        : $.model,
    ReturnedToHoverArea: ($) =>
      $.evolve({ hovering: true }).run(Command.interrupt(WaitBeforeHoverClose)),
    CompletedWaitBeforeHoverClose: ($) =>
      $.props.open && hoverOpened($.model.reason, $) && !$.model.hovering &&
        !$.model.submenus.some((submenu) => submenu.open)
        ? dismiss($.model, $, "trigger-hover", "mouse")
        : $.model,
    CompletedWaitBeforeStickExpires: ($) => $.evolve({ stick: false }),
    PressedSubmenuTrigger: ($, { pointerType }) =>
      hoverOf($.props, true)
        ? $.model
        : pressTrigger($, methodOf(pointerType), "submenu", null),
    ClickedSubmenuTrigger: ($, { pointerType }) =>
      pressTrigger($, methodOf(pointerType), "submenu", null),
    PressedSubmenuTriggerKey: ($, { key }) => {
      const parent = parentOf($)
      if ($.props.open || parent === undefined || disabledOf($)) return $.model
      const reason = key === keys(parent.orientation, parent.rtl).open
        ? "list-navigation"
        : "trigger-press"
      return open($.model, $, reason, "keyboard", "submenu", null)
    },
    PressedKey: ($, { action, key }) => pressKey($.model, $, key, action),
    ReleasedSpace: ($, { action }) => {
      if (!$.model.spaceDown) return $.model
      const next = UiStruct.evolve($.model, { spaceDown: false })
      return action !== null && $.props.open
        ? activate(next, $, action, "keyboard")
        : next
    },
    EnteredItem: ($, { value }) =>
      $.props.open && $.props.highlightItemOnHover !== false &&
        $.model.active !== value
        ? commit(
          $,
          $.model,
          UiStruct.evolve($.model, { active: value, activeByKey: false }),
          "pointer"
        )
        : $.model,
    LeftItem: ($) =>
      $.model.active === null || $.model.submenus.some((submenu) =>
          submenu.open && submenu.item === $.model.active
        ) ||
        filteringOf($.props)
        ? $.model
        : commit(
          $,
          $.model,
          UiStruct.evolve($.model, { active: null, activeByKey: false }),
          "pointer"
        ),
    PressedItem: ($) => $.evolve({ pressedItem: true }),
    ReleasedItem: ($, { action, pointerType }) =>
      $.model.pressing && $.model.releaseAllowed && !$.model.pressedItem &&
        action.kind !== "link"
        ? activate(
          UiStruct.evolve($.model, { pressing: false }),
          $,
          action,
          methodOf(pointerType)
        )
        : $.model,
    ClickedItem: ($, { action, pointerType }) =>
      activate($.model, $, action, methodOf(pointerType)),
    CompletedWaitBeforeResetTyping: ($) =>
      $.evolve({ typeahead: Typeahead.reset }),
    ShowedPopup: ($) => {
      const props = $.props
      if (!props.open) return $.evolve({ mounted: true })
      const next = UiStruct.evolve($.model, {
        mounted: true,
        closeMethod: null,
        focusLeft: false
      })
      // A detached `MenuTrigger` bypasses the menu's own opening logic.
      if (props.openMethod !== "keyboard" || $.model.active !== null) {
        return $.set(next)
      }
      const active = firstEnabled(visibleOf(props))?.value ?? null
      return commit(
        $,
        $.model,
        UiStruct.evolve(next, { active, activeByKey: true }),
        "none"
      )
    },
    RenderedFirstFrame: ($) =>
      $.props.open ? $.evolve({ started: true }) : $.model,
    FinishedTransition: ($, { open }) => {
      if (open !== $.props.open) return $.model
      if (open) return $.emit(MenuEvents.Settled({ open }))
      if (!$.model.mounted || $.props.holdExit === true) return $.model
      const closed = $.evolve({
        mounted: false,
        started: false,
        pressedItem: false,
        active: null,
        transitioning: false,
        direction: null,
        instant: $.model.instant === "trigger-change" ? null : $.model.instant
      }).emit(MenuEvents.Settled({ open }))
      const highlighted = $.model.active === null
        ? closed
        : closed.emit(MenuEvents.Highlighted({ value: null, reason: "none" }))
      return $.props.query !== undefined && $.props.query !== ""
        ? highlighted.emit(
          MenuEvents.RequestedQuery({ query: "", reason: "none" })
        )
        : highlighted
    },
    ChangedPlacement: ($, { placement }) => $.evolve({ placement }),
    ChangedDirection: ($, { rtl }) => $.evolve({ rtl }),
    FoundTrigger: ($, { id }) => $.evolve({ triggerElement: id }),
    PressedOutside: ($, { pointerType }) =>
      $.model.context && $.model.justOpened && $.model.openMethod === "touch"
        ? $.model
        : dismiss($.model, $, "outside-press", methodOf(pointerType)),
    FocusedOutside: ($) => dismiss($.model, $, "focus-out", null, true),
    TabbedOut: ($) => dismiss($.model, $, "focus-out", "keyboard", true),
    ReleasedPointer: ($, { outside }) => {
      if (!$.model.pressing) return $.model
      const next = UiStruct.evolve($.model, { pressing: false })
      return outside ? dismiss(next, $, "cancel-open", "mouse") : next
    },
    AllowedRelease: ($) =>
      $.model.pressing ? $.evolve({ releaseAllowed: true }) : $.model,
    ChangedSubmenus: ($, { submenus }) => $.evolve({ submenus }),
    ChangedProvider: ($, { rtl }) => $.evolve({ provided: rtl }),
    ChangedParent: ($, { parent }) => {
      if ($.props.parentItem === undefined) return $.model
      const next = UiStruct.evolve($.model, {
        rtl: parent.rtl,
        parentTopLayer: parent.topLayer
      })
      if (!$.props.open) return next
      if (!parent.open) return dismiss(next, $, parent.reason ?? "none", null)
      if (parent.active !== null && parent.active !== $.props.parentItem) {
        return dismiss(next, $, "sibling-open", null)
      }
      return next
    },
    RequestedCloseByChild: ($, { reason }) =>
      $.props.open
        ? closeTree(
          $.model,
          $,
          reason,
          reason === "escape-key" ? "keyboard" : null
        )
        : $.model,
    MovedViewport: ($, { direction }) =>
      $.evolve({ transitioning: true, direction, instant: null }),
    SettledViewport: ($) => $.evolve({ transitioning: false }),
    SettledTriggerChange: ($) =>
      $.props.open ? $.evolve({ instant: "trigger-change" }) : $.model,
    ChangedInput: ($, { value }) => {
      const props = $.props
      if (!props.open || disabledOf($)) return $.model
      const reason = value === "" ? "input-clear" : "input-change"
      const next = UiStruct.evolve($.model, {
        active: autoHighlighted(props, value),
        activeByKey: false
      })
      return commit($, $.model, next, "none").emit(
        MenuEvents.RequestedQuery({ query: value, reason })
      )
    },
    PressedInputKey: ($, { key, modified }) => {
      const props = $.props
      const next = UiStruct.evolve($.model, { keyboard: true })
      if (!props.open || modified) return next
      const hasValue = (props.query ?? "") !== ""
      const nav = keys(props.orientation ?? "vertical", rtlOf($, $.model.rtl))
      if (key === nav.next || key === nav.previous) {
        if (
          props.orientation === "horizontal" && hasValue &&
          $.model.active === null
        ) return next
        return navigate(next, $, key)
      }
      if (key === "Home" || key === "End") {
        return $.model.active !== null && !hasValue
          ? navigate(next, $, key)
          : next
      }
      if (key === "Escape") return pressKey(next, $, key, null)
      return hasValue ? next : toSibling(next, $, key, nav.open) ?? next
    },
    FocusedInput: ($) => $.evolve({ inputFocused: true }),
    BlurredInput: ($) => $.evolve({ inputFocused: false }),
    PressedInput: ($) =>
      $.model.keyboard ? $.evolve({ keyboard: false }) : $.model,
    ClickedClear: ($) => {
      const props = $.props
      if (!props.open || disabledOf($) || (props.query ?? "") === "") {
        return $.model
      }
      const next = UiStruct.evolve($.model, {
        active: autoHighlighted(props, ""),
        activeByKey: false
      })
      return commit($, $.model, next, "none").emit(
        MenuEvents.RequestedQuery({ query: "", reason: "clear-press" })
      )
    },
    PressedBarKey: ($, { key, trigger }) =>
      disabledOf($)
        ? $.model
        : $.send(
          Menubar,
          MenubarMessage.Navigated({ from: trigger, key, open: $.props.open })
        ),
    FocusedBarTrigger: ($, { key, triggerId }) => {
      const bar = barOf($)
      if (bar === undefined) return $.model
      const reason = bar.opening === key
        ? "list-navigation"
        : bar.hasSubmenuOpen && bar.current !== key
        ? "trigger-focus"
        : null
      const stays = reason === null ||
        ($.props.open && opensFor($.model, $.props, key, triggerId)) ||
        disabledOf($)
      return (stays
        ? $
        : open($.model, $, reason, "keyboard", key, triggerId, { group: true }))
        .send(Menubar, MenubarMessage.FocusedTrigger({ trigger: key }))
    },
    ChangedMenubar: ($, { menubar }) => {
      const current = menubar.current
      if (current === $.model.barCurrent) return $.model
      const next = UiStruct.evolve($.model, { barCurrent: current })
      const own = ownTrigger($.model, $.props)
      return $.props.parentItem === undefined && $.props.open &&
          current !== null && own !== null && current !== own
        ? dismiss(next, $, "sibling-open", null)
        : next
    }
  },
  subscriptions: ({ props }) =>
    props.open && props.parentItem === undefined ? escapes : [],
  parts: (p, model) => {
    const props = p.props
    const parent = parentOf(p)
    const nested = parent !== undefined
    const bar = barOf(p)
    const open = props.open
    const shown = open || model.mounted
    const transitionStatus: MenuTransitionStatus = statusOf(model, props)
    const disabled = disabledOf(p)
    const arrowsOpen = p.reads.toolbar?.orientation !== "vertical"
    const orientation = props.orientation ?? "vertical"
    const cssRtl = nested ? parent.rtl : model.rtl
    const rtl = rtlOf(p, cssRtl)
    const hover = hoverOf(props, nested)
    const openReason = props.openReason ?? model.reason
    const openMethod = props.openMethod ?? model.openMethod
    const hovered = hoverOpened(openReason, p)
    const context = !nested && model.context
    const topLayer = props.topLayer ?? (nested ? parent.topLayer : true)
    const modal = !nested && topLayer &&
      (context ||
        (bar === undefined ? props.modal !== false && !hovered : bar.modal))
    const popupId = props.id ?? p.id("popup")
    const listId = listIdOf(popupId)
    const inputId = p.id("input")
    const arrowId = p.id("arrow")
    const itemId = (value: string) => p.id("item", value)
    const groupLabelId = (group: string) => p.id("group-label", group)
    const activeTrigger = props.triggerId ?? model.trigger
    const filtering = filteringOf(props)
    const matches = matcherOf(props)
    const visible = new Set(visibleOf(props, matches))
    const empty = filtering && (props.query ?? "").trim() !== "" &&
      visible.size === 0
    const tracked = Positioning.trackArgs(
      {
        ...(nested || bar !== undefined
          ? { ...props, align: props.align ?? "start" }
          : context
          ? contextPlacement(props, model.point)
          : props),
        topLayer
      },
      {
        side: nested || bar?.orientation === "vertical"
          ? "inline-end"
          : "bottom",
        collisionAvoidance: nested
          ? Positioning.popupCollisionAvoidance
          : Positioning.dropdownCollisionAvoidance,
        anchorSelector: context
          ? contextSelector(popupId)
          : triggerSelector(popupId),
        anchorRect: context ? model.point : null,
        shiftCrossAxis: context,
        arrowId
      }
    )
    const side = model.placement?.side ?? tracked.options.side
    const align = model.placement?.align ?? tracked.options.align
    const items = new Map(
      props.items.map((item) => [item.value, item] as const)
    )
    const itemOf = (value: string): MenuItem => {
      const item = items.get(value)
      if (item === undefined) {
        throw new Error(
          "Menu: no item in the items prop has the value \"" + value + "\""
        )
      }
      return item
    }
    const highlighted = open ? model.active : null
    const hovers = open && props.highlightItemOnHover !== false
    const instant = shown ? model.instant ?? undefined : undefined
    const checks = new Map<string, boolean>()
    let radio: string | null = null
    let triggers = 0
    let labelledBy: string | undefined = context
      ? undefined
      : props.triggerId ?? model.triggerElement ?? undefined
    let listed = false
    let inputDrawn = false
    // Resolve in `forward`: the view must finish drawing before we know whether it includes a `list`.
    const menuId = (expanded: boolean) =>
      expanded ? listed ? listId : popupId : undefined

    const states = <B extends Attributed<B>>(builder: B): B =>
      transitionAttrs(builder, open, transitionStatus)
    const placed = <B extends Attributed<B>>(builder: B): B =>
      states(builder).attrs({ "data-side": side, "data-align": align })

    const hoverOpens = <B extends Handles<MenuMessage>>(
      builder: B,
      key: string,
      triggerId: string | null,
      options: MenuTriggerOptions
    ): B =>
      builder.on(
        "mouseenter",
        MenuMessage.EnteredTrigger({
          key,
          triggerId,
          delay: options.delay ?? props.delay ?? MenuTriggerHoverDefault,
          closeDelay: options.closeDelay ?? props.closeDelay ?? 0
        })
      ).on("mouseleave", MenuMessage.LeftTrigger())

    const triggerKey = (
      pressed: string,
      key: string,
      triggerId: string | null
    ): MenuMessage | undefined => {
      const opens = MenuMessage.PressedTriggerKey({
        key: pressed,
        trigger: key,
        triggerId
      })
      const vertical = pressed === "ArrowDown" || pressed === "ArrowUp"
      if (bar === undefined) return vertical && arrowsOpen ? opens : undefined
      const barRtl = rtlOf(p, bar.rtl)
      const along = ListNavigation.arrowKeys(bar.orientation, barRtl)
      if (
        pressed === along.next || pressed === along.previous ||
        pressed === "Home" || pressed === "End"
      ) {
        return MenuMessage.PressedBarKey({ key: pressed, trigger: key })
      }
      const across = bar.orientation === "vertical"
        ? pressed === keys("vertical", barRtl).open
        : vertical
      return across ? opens : undefined
    }

    const triggerPart = p.part(
      "button",
      (
        b,
        key: string,
        triggerId: string | null,
        options: MenuTriggerOptions
      ) => {
        const active = activeTrigger === null ?
          key === p.id("trigger", 0) || triggers === 1 :
          activeTrigger === key ||
          activeTrigger === triggerId
        if (active) labelledBy = key
        const off = disabled || options.disabled === true
        const attributed = triggerAttrs(
          b.attrs({ id: key, type: "button" }),
          popupId,
          open && active,
          shown && active
        )
          .forward((node) => controlling(node, menuId(open && active)))
          .attrs({
            "data-pressed": flag(open && active),
            "data-disabled": flag(off),
            "aria-disabled": undefined
          })
          .disabled(off)
        const item = bar === undefined
          ? attributed
          : attributed.attrs({
            role: "menuitem",
            tabindex: !off && bar.tabStop === key ? "0" : "-1",
            [triggerAttribute]: ""
          })
        if (options.disabled === true) return item
        const own = pressable(
          item,
          (pointerType) =>
            MenuMessage.PressedTrigger({ key, triggerId, pointerType })
        )
          .on("mouseup", MenuMessage.ReleasedTrigger())
          .on(
            "keydown",
            ({ composing, key: pressed }) =>
              composing ? undefined : triggerKey(pressed, key, triggerId),
            {
              preventDefault: true
            }
          )
        if (bar === undefined) {
          return options.openOnHover ?? hover
            ? hoverOpens(own, key, triggerId, options)
            : own
        }
        return hoverOpens(
          own.on("focus", MenuMessage.FocusedBarTrigger({ key, triggerId })),
          key,
          triggerId,
          options
        )
      }
    )
    const trigger = View.wrapPart(
      triggerPart,
      <B extends View.PartTarget<"button">>(
        options: MenuTriggerOptions & { readonly element: B }
      ): ReturnType<B["attr"]> => {
        const id = idOf(options.element)
        triggers++
        return triggerPart(
          options.element,
          id ?? p.id("trigger", triggers - 1),
          id,
          options
        )
      }
    )

    let contextTriggers = 0
    const contextTriggerPart = p.part(
      "div",
      (b, key: string, triggerId: string | null) => {
        const active = context &&
          (activeTrigger === key ||
            (triggerId !== null && activeTrigger === triggerId))
        const marked = b
          .attrs({
            "data-menu-context": popupId,
            "data-menu-active": flag(shown && active),
            "data-popup-open": flag(open && active),
            "data-pressed": flag(open && active)
          })
          .forward(ownStyle("-webkit-touch-callout:none"))
        if (disabled) return marked
        return marked
          .forward((node) => defaults(node, { tabindex: "0" }))
          .on(
            "keydown",
            (payload) =>
              contextKey(payload)
                ? MenuMessage.PressedContextKey({ key, triggerId })
                : undefined,
            { preventDefault: true }
          )
          .on(
            "contextmenu",
            ({ pointerType, x, y }) =>
              MenuMessage.PressedContextTrigger({
                key,
                triggerId,
                x,
                y,
                pointerType
              }),
            { preventDefault: true }
          )
          .onMount(
            MenuLongPress({}).pipe(
              Mount.map((touch) =>
                touch._tag === "Started"
                  ? MenuMessage.TouchedContextTrigger({
                    key,
                    triggerId,
                    x: touch.x,
                    y: touch.y
                  })
                  : MenuMessage.CancelledLongPress()
              )
            )
          )
      }
    )
    const contextTrigger = View.wrapPart(
      contextTriggerPart,
      <B extends View.PartTarget<"div">>(element: B): ReturnType<B["attr"]> => {
        const id = idOf(element)
        contextTriggers++
        return contextTriggerPart(
          element,
          id ?? p.id("context", contextTriggers - 1),
          id
        )
      }
    )

    const submenuTriggerPart = p.part("div", (b) => {
      // The trigger is an item of the parent, so the parent's direction.
      const parentKeys = keys(
        parent?.orientation ?? "vertical",
        parent?.rtl ?? rtl
      )
      const own = pressable(
        triggerAttrs(b, popupId, open, shown).attr(
          "data-disabled",
          flag(disabled)
        ).forward((node) => controlling(node, menuId(open))),
        (pointerType) => MenuMessage.PressedSubmenuTrigger({ pointerType }),
        (pointerType) => MenuMessage.ClickedSubmenuTrigger({ pointerType })
      )
        .on(
          "keydown",
          ({ composing, key }) =>
            !composing &&
              (key === parentKeys.open || key === "Enter" || key === " ")
              ? MenuMessage.PressedSubmenuTriggerKey({ key })
              : undefined,
          { preventDefault: true }
        )
      return hover ? hoverOpens(own, "submenu", null, {}) : own
    })
    const submenuTrigger = View.wrapPart(
      submenuTriggerPart,
      <B extends View.PartTarget<"div">>(element: B): ReturnType<B["attr"]> => {
        if (!nested) {
          throw new Error(
            "Menu: submenuTrigger is for a Menu drawn inside another Menu's popup"
          )
        }
        return submenuTriggerPart(element)
      }
    )

    const withoutNativeMenu = <B extends Handles<MenuMessage>>(builder: B): B =>
      context && !disabled
        ? builder.on("contextmenu", () => undefined, {
          preventDefault: "always"
        })
        : builder

    const backdrop = p.part("div", (b) =>
      layered(
        withoutNativeMenu(states(b)).attr("role", "presentation"),
        topLayer,
        shown && !nested
      )
        .forward(ownStyle(backdropStyle(topLayer, open && !hovered))))

    const positionerStyle = Positioning.positionerStyle(tracked.positionMethod)
    const positioner = p.part("div", (b) => {
      const decorated = layered(
        placed(b).attrs({
          role: "presentation",
          "data-anchor-hidden": flag(shown && model.placement?.anchorHidden),
          "data-instant": instant
        }),
        topLayer,
        shown
      )
        // Until its first frames, the positioner can be painted before the mount has placed it, and under a
        // still pointer it would take the hover from the trigger it covers.
        .forward((node) =>
          node.attr(
            "style",
            withStyle(
              node.elementAttrs.style,
              model.started
                ? positionerStyle
                : positionerStyle + ";pointer-events:none"
            )
          )
        )
      // The layer stays inert until the mount has cut the trigger out of it, as a frame can be painted in between.
      const blocked = modal ? decorated.children(blocker.closed) : decorated
      if (!shown) return blocked
      return blocked.onMount(
        TrackMenu({
          position: tracked,
          open,
          mounted: model.mounted,
          started: model.started,
          holdExit: props.holdExit === true,
          lock: open && modal,
          touch: openMethod === "touch",
          nested,
          initialFocus: !hovered && !(nested && openMethod !== "keyboard"),
          active: highlighted !== null && items.has(highlighted)
            ? itemId(highlighted)
            : null,
          scroll: model.activeByKey,
          pressing: model.pressing,
          finalFocus: props.finalFocus !== false,
          focusLeft: model.focusLeft,
          closeMethod: model.closeMethod,
          hoverClose: open && hovered,
          rtl: cssRtl,
          provider: provided(p.reads.provider),
          trigger: activeTrigger,
          popupId,
          inputId: filtering ? inputId : null,
          orientation,
          parentOrientation: parent?.orientation ?? "vertical",
          side,
          context,
          release: context && model.releaseArmed,
          menubar: bar !== undefined
        })
      )
    })

    const menuRole = <B extends Attributed<B>>(builder: B): B =>
      builder.attrs({
        role: "menu",
        "aria-orientation": orientation === "horizontal"
          ? "horizontal"
          : undefined
      })

    const keyMessage =
      (action: ItemAction | null) => (event: Html.KeyPayload) =>
        event.composing || (event.key === "Enter" && action?.kind === "link")
          ? undefined
          : event.key.startsWith("Arrow") || event.key === "Home" ||
              event.key === "End" || event.key === "Enter" ||
              event.key === "Escape" || Typeahead.isPrintable(event)
          ? MenuMessage.PressedKey({ key: event.key, action })
          : undefined

    const popup = p.part("div", (b) =>
      placed(b)
        .attrs({
          id: popupId,
          tabindex: "-1",
          "data-menu-popup": "",
          "data-nested": flag(nested),
          "data-instant": instant
        })
        .on("keydown", keyMessage(null), { preventDefault: true })
        .on("keyup", ({ key }) =>
          key === " " ? MenuMessage.ReleasedSpace({ action: null }) : undefined)
        .forward((node) =>
          listed || inputDrawn
            ? node.attr("role", "presentation")
            : menuRole(node).attr(
              "aria-labelledby",
              node.elementAttrs["aria-labelledby"] ?? labelledBy
            )
        ))

    const list = p.part("div", (b) => {
      listed = true
      return menuRole(b)
        .attrs({ id: listId, tabindex: "-1" })
        .forward((node) =>
          node.attr(
            "aria-labelledby",
            node.elementAttrs["aria-labelledby"] ?? labelledBy
          )
        )
    })

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

    const viewport = p.part("div", (b) =>
      b.attrs({
        "data-menu-viewport": "",
        "data-activation-direction": model.direction ?? undefined,
        "data-transitioning": flag(model.transitioning),
        "data-instant": instant
      })
        .forward((node) => {
          const built = View.build(node, [])
          const current = new Html.Element<never>("div").key(
            "current-" + (activeTrigger ?? "")
          ).attr(
            "data-current",
            ""
          )
          return {
            ...built,
            children: [
              View.build(
                current,
                built.children as ReadonlyArray<View.Node<never>>
              )
            ]
          }
        }))

    const itemAttrs = <H extends HTMLElement, T extends "div" | "a">(
      b: Html.Element<MenuMessage, never, Html.Events, H, T>,
      value: string,
      role: string,
      action: ItemAction
    ) => {
      const item = itemOf(value)
      const shownItem = matches === null || visible.has(item)
      const active = highlighted === value
      const off = item.disabled === true || disabled
      const submenuOpen = model.submenus.some((submenu) =>
        submenu.open && submenu.item === value
      )
      const own = b
        .attrs({
          id: itemId(value),
          role,
          "aria-disabled": off ? "true" : undefined,
          tabindex: open && !filtering && (active || submenuOpen) ? "0" : "-1",
          "data-highlighted": flag(active),
          "data-disabled": flag(off),
          hidden: flag(!shownItem),
          "data-menu-item": value
        })
        .on(
          "mouseenter",
          () =>
            hovers && !active ? MenuMessage.EnteredItem({ value }) : undefined
        )
        .on("mouseleave", () => hovers ? MenuMessage.LeftItem() : undefined)
        .on("mousedown", MenuMessage.PressedItem())
        .on(
          "mouseup",
          ({ pointerType }) =>
            pointerType === "touch"
              ? undefined
              : MenuMessage.ReleasedItem({ action, pointerType })
        )
        .on(
          "click",
          ({ pointerType }) => MenuMessage.ClickedItem({ action, pointerType }),
          { preventDefault: off && action.kind === "link" }
        )
        .on("keydown", keyMessage(action), { preventDefault: true })
        .on(
          "keyup",
          ({ key }) =>
            key === " " ? MenuMessage.ReleasedSpace({ action }) : undefined
        )
      return shownItem
        ? own
        : own.forward((node) =>
          node.attr("style", withStyle(node.elementAttrs.style, hiddenBox))
        )
    }

    const checkedAttrs = <B extends Attributed<B>>(
      builder: B,
      checked: boolean
    ): B =>
      builder
        .attrs({
          "aria-checked": String(checked),
          "data-checked": flag(checked),
          "data-unchecked": flag(!checked)
        })

    const closable = <Tag extends string, R>(
      part: View.Part<Tag, [value: string, closeOnClick?: boolean], R>
    ) => {
      const keyedPart = keyed(part)
      return View.wrapPart(
        keyedPart,
        <B extends Keyed<Tag>>(
          { closeOnClick, element, value }: {
            readonly element: B
            readonly value: string
            readonly closeOnClick?: boolean | undefined
          }
        ) => keyedPart(element, value, closeOnClick)
      )
    }

    const item = closable(
      p.part(
        "div",
        (b, value: string, closeOnClick?: boolean) =>
          itemAttrs(b, value, "menuitem", {
            value,
            kind: "item",
            closeOnClick: closeOnClick ?? true,
            checked: false
          })
      )
    )

    const linkItem = closable(
      p.part(
        "a",
        (b, value: string, closeOnClick?: boolean) =>
          itemAttrs(b, value, "menuitem", {
            value,
            kind: "link",
            closeOnClick: closeOnClick ?? false,
            checked: false
          })
      )
    )

    const checkboxItemPart = keyed(
      p.part(
        "div",
        (b, value: string, checked: boolean, closeOnClick?: boolean) => {
          checks.set(value, checked)
          return checkedAttrs(
            itemAttrs(b, value, "menuitemcheckbox", {
              value,
              kind: "checkbox",
              closeOnClick: closeOnClick ?? false,
              checked
            }),
            checked
          )
        }
      )
    )
    const checkboxItem = View.wrapPart(
      checkboxItemPart,
      <B extends Keyed<"div">>(
        { checked, closeOnClick, element, value }: {
          readonly element: B
          readonly value: string
          readonly checked: boolean
          readonly closeOnClick?: boolean | undefined
        }
      ) => checkboxItemPart(element, value, checked, closeOnClick)
    )

    const radioGroupPart = p.part("div", (b, value: string | null) => {
      radio = value
      return b.attrs({ role: "group", "data-disabled": flag(disabled) })
    })
    const radioGroup = View.wrapPart(
      radioGroupPart,
      <B extends View.PartTarget<"div">>(
        { element, value }: {
          readonly element: B
          readonly value: string | null
        }
      ) => radioGroupPart(element, value)
    )

    const radioItem = closable(
      p.part("div", (b, value: string, closeOnClick?: boolean) => {
        const checked = radio === value
        checks.set(value, checked)
        return checkedAttrs(
          itemAttrs(b, value, "menuitemradio", {
            value,
            kind: "radio",
            closeOnClick: closeOnClick ?? false,
            checked
          }),
          checked
        )
      })
    )

    const indicator = () => {
      const part = p.part(
        "span",
        (b, value: string) =>
          checkedAttrs(
            b.attr("aria-hidden", "true"),
            checks.get(value) === true
          )
            .attr(
              "data-disabled",
              flag(itemOf(value).disabled === true || disabled)
            )
      )
      return View.wrapPart(
        part,
        <B extends View.PartTarget<"span">>(
          { element, keepMounted, value }: {
            readonly element: B
            readonly value: string
            readonly keepMounted?: boolean | undefined
          }
        ): ReturnType<B["attr"]> | undefined => {
          const applied = part(element, value)
          return checks.get(itemOf(value).value) === true ||
              keepMounted === true
            ? applied
            : undefined
        }
      )
    }

    const group = grouped(
      p.part(
        "div",
        (b, key: string) =>
          b.attrs({ role: "group", "aria-labelledby": groupLabelId(key) })
            .forward((node) =>
              node.attr(
                "hidden",
                flag(matches !== null && !hasShownItem(View.build(node, [])))
              )
            )
      )
    )
    const groupLabel = grouped(
      p.part("div", (b, key: string) => b.attr("id", groupLabelId(key)))
    )
    const separator = p.part(
      "div",
      (b) =>
        separatorAttrs(
          b,
          orientation === "horizontal" ? "vertical" : "horizontal"
        )
    )

    const input = p.part("input", (b) => {
      inputDrawn = true
      const query = props.query ?? ""
      return b
        .attrs({
          id: inputId,
          type: "text",
          role: "searchbox",
          inputmode: "search",
          autocomplete: "off",
          spellcheck: "false",
          autocorrect: "off",
          autocapitalize: "none",
          "aria-activedescendant":
            highlighted !== null && items.has(highlighted)
              ? itemId(highlighted)
              : undefined,
          "aria-controls": listId,
          "data-highlighted": flag(
            model.inputFocused && (!model.keyboard || highlighted === null)
          ),
          "aria-disabled": undefined,
          value: query
        })
        .value(query)
        .disabled(disabled)
        .on("input", ({ value }) => MenuMessage.ChangedInput({ value }))
        .on("keydown", ({ alt, composing, ctrl, key, meta, shift }) =>
          composing
            ? undefined
            : MenuMessage.PressedInputKey({
              key,
              modified: alt || ctrl || meta || shift
            }))
        .on("mousedown", MenuMessage.PressedInput())
        .on("focus", MenuMessage.FocusedInput())
        .on("blur", MenuMessage.BlurredInput())
    })

    const clearPart = p.part("button", (b) =>
      b.attrs({
        type: "button",
        tabindex: "-1",
        "aria-hidden": "true",
        "data-disabled": flag(disabled),
        "aria-disabled": undefined
      })
        .disabled(disabled)
        .on("mousedown", MenuMessage.PressedInput(), {
          preventDefault: "always"
        })
        .on("click", MenuMessage.ClickedClear()))
    const clear = View.wrapPart(
      clearPart,
      <B extends View.PartTarget<"button">>(
        element: B
      ): ReturnType<B["attr"]> | undefined => {
        const applied = clearPart(element)
        return (props.query ?? "") === "" ? undefined : applied
      }
    )

    const emptyPart = p.part(
      "div",
      (b) =>
        b.attrs({
          role: "status",
          "aria-live": "polite",
          "aria-atomic": "true"
        })
    )
    const emptyState = View.wrapPart(
      emptyPart,
      <B extends View.PartTarget<"div">>(
        element: B
      ): ReturnType<B["attr"]> | undefined => {
        const applied = emptyPart(element)
        return empty ? applied : undefined
      }
    )

    const finalFocus = p.part((b) => b.attr("data-final-focus", popupId))

    return {
      open,
      mounted: shown,
      transitionStatus,
      nested,
      side,
      align,
      highlighted,
      openMethod: open ? openMethod : null,
      transitioning: model.transitioning,
      activationDirection: model.direction,
      nothingMatches: empty,
      trigger,
      contextTrigger,
      submenuTrigger,
      backdrop,
      positioner,
      popup,
      list,
      arrow,
      viewport,
      item,
      linkItem,
      checkboxItem,
      checkboxItemIndicator: indicator(),
      radioGroup,
      radioItem,
      radioItemIndicator: indicator(),
      group,
      groupLabel,
      separator,
      input,
      clear,
      empty: emptyState,
      finalFocus
    }
  }
})

const hasShownItem = (node: View.Element<any, any>): boolean =>
  node.children.some((child) =>
    child._tag === "Element" &&
    ((child.attrs.role?.startsWith("menuitem") === true &&
      child.attrs.hidden === undefined) || hasShownItem(child))
  )
