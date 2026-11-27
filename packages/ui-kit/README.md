# @effect/ui-kit

Unstyled components for [`@effect/ui`](../ui). Each one owns the behaviour, ARIA, data attributes and any form field, and you draw the markup with your own `h` builders and style it.

```ts
import { Checkbox } from "@effect/ui-kit"

// In a view:
Checkbox(h, {
  props: { checked: model.terms, name: "terms" },
  onEmit: { Toggled: ({ checked }) => Message.ToggledTerms({ checked }) },
  view: (checkbox) =>
    h.label(
      checkbox.root(h.button.class("checkbox")).children(
        checkbox.indicator(h.span.class("tick"))
      ),
      "I accept the terms"
    )
})
```

Every popup renders in the browser's top layer by default. `Dialog`, `Drawer`, `Popover`, `Tooltip`, `PreviewCard`, `Menu` (and so `Menubar` and `ContextMenu`), `Select`, `Combobox`, `Autocomplete` and `ToastProvider` take `topLayer: false` to render in place instead, like Base UI's portal given a `container`: placed and clipped inside the element the view draws it in, and never modal.

A component that doesn't need an instance, such as `Switch`, is a plain view function instead: it takes no `key`, and an `on<Event>` option in place of `onEmit`. Keeping no state isn't enough on its own: `Progress` needs an instance for the id its bar points at, and `DirectionProvider` for sharing the direction with the components inside it.

## Components

- [Accordion](src/Accordion.ts): a set of panels under headings, each opened and closed by its own button, whose open items live in your Model. One item opens at a time, or several with `multiple`. Each item is a `Collapsible`, with its size transitions and find-in-page.
- [AlertDialog](src/AlertDialog.ts): a modal dialog that asks the user to answer before going on, which a press outside doesn't close.
- [Autocomplete](src/Autocomplete.ts): an input that suggests completions from a list as the user types, whose open state and text live in your Model, with inline completion, grids, inline lists, and an input that submits with its form.
- [Avatar](src/Avatar.ts): an image with a fallback.
- [Button](src/Button.ts): a native button that can stay focusable while disabled.
- [Calendar](src/Calendar.ts): a controlled calendar of one or more consecutive months using `DateTime`, with keyboard navigation, roving focus, min/max bounds, unavailable days and right-to-left support.
- [Checkbox](src/Checkbox.ts): a controlled checkbox with an indicator.
- [CheckboxGroup](src/CheckboxGroup.ts): one list of ticked values shared by the checkboxes inside it, with a parent checkbox that ticks or unticks them all.
- [Collapsible](src/Collapsible.ts): a panel (any element) that a button shows and hides, whose open state lives in your Model. It publishes the panel's size as CSS variables for height and width transitions, supports `keepMounted: "css"` for CSS-controlled visibility below a breakpoint, and with `hiddenUntilFound` the browser's find-in-page can open it.
- [Combobox](src/Combobox.ts): an input that filters a list of options as the user types, whose open state, value and text live in your Model, with single or multiple selection, chips, an input inside the popup, grids, inline lists and inputs for a form.
- [ContextMenu](src/ContextMenu.ts): a `Menu` that opens at the pointer on a right click, or after a long press on a touch screen, over an area of the page, with submenus and the browser's own menu kept away.
- [DateField](src/DateField.ts): a text input for a calendar date as a `DateTime`, formatted and parsed for a locale or as ISO `YYYY-MM-DD`, with a hidden ISO input for a form.
- [DatePicker](src/DatePicker.ts): a `DateField` input with a popup `Calendar`, with controlled value, open state and displayed month.
- [Dialog](src/Dialog.ts): a popup in the top layer whose open state lives in your Model, as a modal, a focus trap or a non-modal panel, with `DialogTrigger` to open it from another component. With `topLayer: false` it renders in place instead, as a non-modal panel inside the element the view puts it in.
- [DirectionProvider](src/DirectionProvider.ts): tells the components inside it whether text runs left to right or right to left, so their arrow keys follow it.
- [Drawer](src/Drawer.ts): a `Dialog` that slides in from an edge of the screen. A swipe toward that edge dismisses it once it travels far enough or is released fast enough. It has snap points, drawers nested in one another, and swipe areas that open it.
- [DrawerProvider](src/Drawer.ts): scales the page behind the drawers inside it while one is open, as a native sheet does.
- [Field](src/Field.ts): a label, a description and an error for a form control or a group of them, such as a range slider, with its validity, touched and focused state.
- [Fieldset](src/Fieldset.ts): a native fieldset named by a legend, around several fields, which disables every control and every `Field` inside it at once.
- [FileDrop](src/FileDrop.ts): a file drop zone and picker trigger with shared `accept` and `multiple` filtering, drag-over state, and `Picked` / `Rejected` events.
- [Form](src/Form.ts): a native form that focuses its first invalid control after a submit.
- [Input](src/Input.ts): a native text input whose value lives in your Model.
- [Menu](src/Menu.ts): a button that opens a list of actions, checkbox and radio items and submenus, whose open state lives in your Model, with typeahead, a filter input, several triggers and a viewport that resizes the popup as it moves between them.
- [Menubar](src/Menubar.ts): a row of menus, as in a desktop application, with one Tab stop, arrow keys that move between the triggers and switch between open menus, and hover that switches while a menu is open.
- [Meter](src/Meter.ts): a measurement within a known range, such as disk usage, whose value lives in your Model, with a label, a value text and an indicator sized to the value.
- [NavigationMenu](src/NavigationMenu.ts): a navigation landmark with a list of links, where you say which link is the current page and the arrow keys move focus between the links.
- [NumberField](src/NumberField.ts): a controlled input for a number, formatted and parsed for a locale, with stepper buttons that repeat while held, an area to drag across, and a hidden input for a form.
- [OTPField](src/OTPField.ts): a one-time code field, a row of one-character inputs whose code lives in your Model as a `Redacted<string>`. It moves focus as the user types, takes a pasted or autofilled code whole, and submits it as one form value.
- [Popover](src/Popover.ts): a `Dialog` anchored to its trigger, opened by a press or by hover. It has several triggers, with `PopoverTrigger` for one drawn elsewhere, and a `viewport` part that animates the content and the popup's size as it moves between them.
- [PreviewCard](src/PreviewCard.ts): a card that previews what a link leads to while the link is hovered or focused, placed against the line of a wrapped link the pointer rested on. The pointer can cross diagonally from the link to the card, and `PreviewCardTrigger` opens it from a link drawn elsewhere.
- [Progress](src/Progress.ts): a progress bar whose value lives in your Model, with a label, a value text and an indicator sized to the value.
- [RadioGroup](src/RadioGroup.ts): a controlled group of radio buttons with roving focus, arrow-key navigation, animated indicators and a hidden form input.
- [RangeCalendar](src/RangeCalendar.ts): a `Calendar` that picks a range of dates in two presses, with a preview of the range in progress.
- [ScrollArea](src/ScrollArea.ts): a native scroll container with custom scrollbars, overflow state, and edge-fade CSS variables.
- [Select](src/Select.ts): a button that opens a list of options, whose open state and value live in your Model, with typeahead, the popup laid over the trigger with the selected option on its text, and inputs for a form.
- [Separator](src/Separator.ts): a horizontal or vertical divider between sections of content.
- [Slider](src/Slider.ts): a controlled slider with one thumb or a range, each thumb a native range input you supply.
- [Switch](src/Switch.ts): a controlled on/off setting.
- [Tabs](src/Tabs.ts): a list of tabs that each show a panel, whose active tab lives in your Model, with roving focus, link tabs, panel enter and exit transitions, and an indicator placed under the active tab with CSS variables.
- [Toast](src/Toast.ts): `ToastProvider`, a stack of notifications that components inside it post to, which close after a timeout.
- [Toggle](src/Toggle.ts): a controlled two-state button, pressed or not.
- [ToggleGroup](src/ToggleGroup.ts): a row of toggle buttons whose pressed values live in your Model, one at a time or several, with the arrow keys moving focus between them.
- [Toolbar](src/Toolbar.ts): a row or column of buttons, links, inputs, toggle groups and menu or select triggers with one tab stop, the arrow keys moving focus between them.
- [Tooltip](src/Tooltip.ts): a popup shown when its trigger is hovered or focused, with `TooltipProvider` to open neighbouring tooltips without the delay.
- [VirtualList](src/VirtualList.ts): a list or table body that renders only the items near the visible part of its scroll container or the page, with measured item sizes, grids whose lanes follow the CSS, scrolling to an item or the end, following the end of a chat or log, loading earlier items, positions in a paged set, and the focused item kept rendered.

## Other modules

- [ListNavigation](src/ListNavigation.ts): resolves arrow keys, `Home` and `End` to list indexes, respecting orientation, text direction and looping. The caller moves focus or updates a highlight.
- [Positioning](src/Positioning.ts): places a popup of your own against an anchor, as `Tooltip` places its popup. `Positioning.place` computes a position from rectangles, and the `Positioning.TrackPosition` mount keeps a positioner next to its anchor.
- [Typeahead](src/Typeahead.ts): matches typed prefixes against enabled items and cycles on repeated letters. Store `Typeahead.State` in your Model, advance it with `Typeahead.step`, and use `Typeahead.waitReset` to schedule a reset message.
- [VirtualKeyboard](src/VirtualKeyboard.ts): tells which band of the screen the software keyboard leaves visible, read from `visualViewport`, so content fixed to the bottom can sit above it. `VirtualKeyboard.step` works out the band from the viewport's sizes, without reading the DOM. `VirtualKeyboard.watch` is a Stream of the band, and the `VirtualKeyboard.TrackKeyboard` mount writes the covered height on its node as `--keyboard-inset`.
