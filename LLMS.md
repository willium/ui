# Effect UI documentation

This documentation covers `@effect/ui`, a frontend framework for Effect, and
its related packages.

When you need to find information about Effect UI, use this documentation and
the `@effect/ui` and `effect` source code available in your environment.
Avoid unrelated copies of these libraries or external documentation, as they
may be outdated or incorrect.

Effect UI requires `strict` and `exactOptionalPropertyTypes` in `tsconfig.json`.
Without `exactOptionalPropertyTypes`, some component types are inferred too
widely and mounting them fails to type-check.

**Note**: The examples in this documentation contain comments for illustration
purposes. In practice, you would not include these comments in your code.

## Building user interfaces with `@effect/ui`

`@effect/ui` is a frontend framework whose apps are composed with Layers. You
describe a component with Schemas for its props, Model, messages and events,
and with pure `init`, `update` and `view` functions. Side effects are Commands
and Subscriptions that the runtime runs for you, and data comes from queries,
built with `Query`, also in `@effect/ui`. `@effect/ui/html` adds the HTML elements, the
browser host and router, and server rendering.

`Query.Service`, `Query.InfiniteService`, and `Command.Service` declare only
their Schemas and options. `args` defaults to none and `error` to
`Schema.Never`. A `Command.Service` sets `success` to the Message Schema of
the component that consumes it; without `success` it's silent and its body
may return anything. Attach implementations with `toLayer` (e.g.
`static readonly layer = this.toLayer(...)`, or `GetNote.toLayer(fn)` in
tests). Provide a feature implementation with `NoteActivity.toLayer(ActivityLog)`.
Declare a child component by calling it with the parent's `h`:
`NoteEditor(h, { key, props, onEmit })`. Render a feature service with its
`render`, `NoteActivity.render(h, { key, fallback })`, and include a
`fallback` for loading or failure; a component child may omit it.

A child's key names it among its parent's children of one component, and
its path is `Name[key]`. Leave the key out when the parent renders one
child of that component: `Listbox(h, { props, onEmit, view })` mounts at
`Listbox[]`. Two children of one component, and every row in a list, each
need their own key. A second unkeyed child fails the parent with an error
that asks for a `key`, so a list of one unkeyed row works until a second
row arrives. Two children at one path are one instance: in
`cond ? Listbox(h, { props: a }) : Listbox(h, { props: b })` the Listbox
keeps its Model when `cond` changes, so key each branch when that state
shouldn't carry over. A `Scene` names a child by its component, then by its
key when it has one: `s.childEmit(Listbox, event)`,
`s.childFailure(NoteEditor, note.id, cause)`.

A parent passes a child state through props, and a child answers through
`events`. A parent can't send a child a message. To restart a child, such as
a wizard, stop rendering it or change its key, and it mounts fresh. A
control that the parent lays out but that starts the child's own work is a
part of a headless child. TagPicker's remove button is one: the consumer
draws `tagPicker.remove(h.button, tag)`, and the click goes through
TagPicker's `update` (see "Composing headless components"). NoteEditor
draws its own view and has no parts, so the note page hears its `Saved` but
can't start a save. See **Who owns the state** below.

### Keep-alive children

A child that the view stops declaring unmounts and loses its Model. When
the user should find it as they left it after it goes out of view (a tab
with a half-filled form, a wizard step, a list row that a filter hides),
write it inside `h.keepAlive` and call it with the `s` that passes instead
of `h`. Keeping is decided where the child is written, not where the
component is defined, so one component can be kept in a tab panel and
unmount as usual somewhere else.

Every component called with `s` is kept. Pass `h` to anything in the block
that should unmount when the view drops it. A headless component, or a
feature's `render`, takes `s` as it takes `h`, and isn't kept. A helper
whose parameter is typed `View.Helper` drops the mark that `s` carries, so
a component it calls with the `s` it's handed is kept, and its key isn't
checked.

A keep-alive child belongs to the component whose view called
`h.keepAlive`, its author, and its path is `Name[key]` under the author
wherever the view puts it. Moving it to another element, or into another
child's slot, keeps the instance. Placing one `Name[key]` twice in a render
fails the author. So does one component written with `h` and with `s` at
one key in one render, or any ordinary child and keep-alive child that
resolve to one path. A child whose call changes from `h` to `s` between
renders keeps its instance and is kept from then on. Changed back, it's an
ordinary child again.

```ts
const view = (h: H, model: SettingsModel) =>
  model.tab === "profile"
    ? h.keepAlive((s) => Profile(s, { key: "profile" }))
    : h.keepAlive((s) => Billing(s, { key: "billing" }))
```

A keep-alive child that no view writes is kept. Its nodes leave the
document, and its Model, Commands in flight, Subscriptions and typed input stay. Its
element mounts stop, and it adds nothing to the head or to an owner's
`collects`, until a view writes it again. It keeps the props and `onEmit`
of the last render that placed it, and its events reach the author's `update`, with
the current Model, through that `onEmit`. When a kept child needs fresh
props, write it inside a `hidden` element instead. Subscriptions keep
running while it's kept, so gate those on the Model.

Without a predicate, the children of an `h.keepAlive` live as long as the
author, and their keys must be literals. A list needs a predicate,
`h.keepAlive(alive, content)`, which the runtime asks about each live child on every render of
the author, whether that render wrote the child or not. It ends the child
once the predicate returns false. Destructure the Model from the argument
and look the key up:

```ts
h.keepAlive(
  ({ key, model }) => key in model.notes,
  (s) =>
    visible.map((id) =>
      NoteRow(s, { key: id, props: { note: model.notes[id] } })
    )
)
```

Read `model`, `props` or `queries` from the argument, never from the
view's closure, which is stale on the renders that don't write the child. A
predicate that reads none of them fails the author, so `() => model.open`
and `($) => model.notes[$.key] !== undefined` fail on their first call.
The predicate runs once per live child per render, so look the key up in a
record or a `Map`: scanning an array makes the render quadratic. All the
children of one `h.keepAlive` share its predicate, so children with different
lifetimes go in different `h.keepAlive` blocks.

There is no call that ends a child. To start one over, change its key and
have the predicate reject the old one: with
`({ key, model }) => key === model.draftId`, a new `draftId` ends the old
draft and the next render writes a fresh one.

A keep-alive child starts the first time it's placed in the tree while its
predicate holds. One written into a slot that nothing places, such as a
closed Collapsible's, or into the slot of a component still waiting for its
Layer, hasn't started: it runs nothing.

Saved state from the server or from a history entry holds the Model
of a child that hasn't started, with everything below it. The state belongs
to the author it arrived with, the child takes it when it starts, and it's
dropped when the author ends or the predicate is false as the child is
placed. On the client a child adopts the server's nodes only where the
server drew it. Placed anywhere else, it keeps the state and builds new
nodes.

Known limits:

- The guard also fails a predicate that returns from `key` alone, and it
  misses one that reads `$.model` and also the view's `model`.
- A kept child has stale props and `onEmit`.
- Written into another child's slot, a child whose call changes between `h`
  and `s` mounts again.
- Saved state for a child that hasn't started has no predicate to end it, so
  a later child at that key takes it. That includes a row deleted before its
  child ever started.
- A child the server rendered runs nothing on the client until it's placed.
  Its Subscriptions don't run and its predicate isn't asked.
- What the user typed into a server-rendered field before hydration is lost
  when the field's child is built again: moved out of a component that's
  still waiting for its Layer, or moved while it waits for its own.
- While a moved child's server-rendered copy sits in a waiting component, the
  form shows twice, with the same ids and field names.
- A child moved while it waits for its own Layer builds that Layer again.
- After Back, saved state for a part of the page the view doesn't draw again
  is gone once a push leaves the entry. Only a push made while a component
  still waits to start carries what the entry saved below it.

### Naming

Name messages, events, Commands and mounts as Foldkit does
(https://foldkit.dev/best-practices/messages). A message is a fact about what
happened, never an instruction, and `update` decides what the fact means for
the current Model. `Set*`, `Update*` and bare imperatives such as `Save` or
`GoHome` are out.

| Thing                                         | Name                                                      | Example                                                         |
| --------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------- |
| Message from a view handler                   | Verb first, past tense: the cause, then the control       | `ClickedDiscard`, `UpdatedBody`, `PressedKey`, `ToggledActions` |
| Message from a Command or mount result        | `Succeeded`, `Failed` or `Completed`, then the definition | `SucceededSaveNote`, `FailedSaveNote`, `CompletedMeasure`       |
| Message from a Subscription or a stream mount | The fact the source reported                              | `Ticked`, `ChangedRoute`, `MovedPointer`                        |
| Message from a child's event                  | The event's verb, then the parent's name for the child    | `ToggledNotify`, `SavedNote`, `PickedLink`                      |
| Message from a child's failure                | `Failed`, then the parent's name for the child            | `FailedEditor`                                                  |
| Message with more than one cause              | The fact the causes share                                 | `RequestedSave`                                                 |
| Two events a payload could tell apart         | One message each, named for its own cause                 | `FocusedSearchInput`, `BlurredSearchInput`                      |
| Event that reports                            | What is already so, past tense, with no cause             | `Settled`, `Highlighted`, `Submitted`                           |
| Event that requests                           | `Requested` plus the change, or the user's act            | `RequestedOpen`, `RequestedClose`, `Toggled`, `Picked`          |
| Command                                       | Imperative, for what its body does                        | `SaveNote`, `WaitBeforeDismissal`                               |
| Mount                                         | Imperative, for what it does to the element               | `DrawChart`, `Measure`, `TrackPointer`                          |
| Parts argument of a headless component        | The component's name in camel case, in full               | `listbox`, `tooltipProvider`                                    |

A Command result takes `Succeeded` and `Failed` when the Command can fail,
and `Completed` otherwise. Name a Command for what its body does, not for
what `update` does with its result: a timer that waits before a toast is
dismissed is `WaitBeforeDismissal`, not `DismissAfter`. `RequestedSave` in
`NoteEditor` comes from the form, Ctrl+S and the autosave Subscription, so
it names what all three report.

An event reports or requests. Suppose the parent maps it to `undefined`. If
what the name says is still so, because it describes the component's own
Model, the DOM or a gesture that ended, the event reports, and takes a
past-tense fact: `Settled`, `Highlighted`, `Submitted`. If it carries or
implies a new value for a prop, it requests, and its name is `Requested` plus
the change: `RequestedOpen`, `RequestedClose`, `RequestedQuery`.

A request may take the name of the user's act instead, as
`Toggled({ checked })` and `Picked({ value })` do, only when both hold. First,
every emit follows something the user did to the component: a gesture on one
of its parts, at once, after a delay or repeated while held, or one a member
component relays. An emit with another cause rules it out, as when `Menu`
clears its query after closing. Second, the payload carries the value asked
for, so the parent has to read it and nobody takes the tag for news. `Opened`
fails the second: with nothing in its payload the tag reads as the state. Keep
`Opened`, `Closed` and `Dismissed` for a component that owns that state, as
`ToastProvider` owns its toasts.

A parent's message for a child's event always names the child, a kit component
included. The event's name is short because the component it belongs to says
what it is about, and the parent's message has no such context: it sits in a
union with the parent's other messages. So `RequestedOpen` and
`RequestedClose` from a `Select` become `RequestedOpenSelect` and
`RequestedCloseSelect`, never a bare `RequestedOpen`, and its `Picked` becomes
`PickedSelectChoice`, which says which control picked what.

A message is one fact. The tag says which fact, and the payload holds what the
event reported. Two events get two messages, even when their handlers differ
only by a constant. Focus and blur are `FocusedSearchInput` and
`BlurredSearchInput`, not `ChangedSearchInputFocus({ focused })` sent with
`true` on `focus` and `false` on `blur`. A payload the view writes as
a literal is choosing between two facts, which is the tag's job. Keep one
message when one event reports a value, as in `UpdatedBody({ body })` or
`ToggledActions({ open })`, or when the payload says which of many, as in
`UpdatedField({ name, value })` and `PressedKey({ key })`. Events and `onEmit`
follow the same rule, so a child's `RequestedOpen` and `RequestedClose`
become `RequestedOpenSettings` and `RequestedCloseSettings`.

A definition's binding and its name string match:
`const DrawChart = Mount.make("DrawChart", ...)`. A `Command.Service` keeps
its feature prefix, as in `"notes/SaveNote"`, and the rule applies to the
last segment.

A component that exists to be an owner, for the components inside it to read
or send to, takes the `Provider` suffix, as in `TooltipProvider` and
`ToastProvider`. A reader names it `provider` in `reads`, so it reads
`h.reads.provider`. A control or an enclosing instance that also shares
state keeps its own name, and a reader names the entry for its role: `group`
for `CheckboxGroup`, `fieldset` for `Fieldset`, `parent` for an enclosing
`Dialog`, `Drawer` or `Menu`. A reader of several owners names each one
after its owner instead, such as `tooltip` and `theme`.

The Schemas a component defines are `<Component>Props`, `<Component>Model`,
`<Component>Message` and `<Component>Events`, exported or not, and the type
alias has the same name. Import them by name. Never import a component's
module as a namespace.

Never write a no-op message, such as `Noop` or a tag added only so a result
has something to send. A message that names something that happened isn't
one, even when `update` returns the Model unchanged for it: `Checkbox` and
`RadioGroup` send `PressedEnter` so that the key handler cancels Enter. A
Command with nothing to report ends in `Component.noop`: a `Command.Service`
omits `success`, and any other Command is piped through `Command.asNoop`.
It sends nothing, and the log still records
its `CommandEnded` with `silent: true`. A mount that returns `Component.noop`
likewise sends no message and logs `MountEnded` with `silent: true`. A
component with no messages takes `message: Schema.Never`.

Effect UI differs from Foldkit in five places:

- A child declares what it tells its parent in `events`. Foldkit calls these
  OutMessages.
- There is no `Got*`. A parent never wraps a child's messages: it maps the
  child's events in `onEmit`, so its message is the event's verb and its
  name for the child.
- A message listed in an owner's `receives` has no prefix of its own. It is
  named like any other message, for the fact it reports, or `Requested` plus
  the change when the sender asks the owner to act.
- A Command or mount with nothing to report needs no `Completed*` message. `Component.noop` is enough.
- A parent can't send a child a message. When porting, Foldkit's
  `informOf*` InMessages become props, and `request*` InMessages have no
  equivalent yet. See **Who owns the state**.

### Command results

A Command whose result one component consumes returns that component's
message from its body. This is the usual form for an app's own Commands,
which live in the file of the component that runs them. `Effect.match` turns
a typed failure into a message as well:

```ts
export class SaveNote extends Command.Service<SaveNote>()(
  "notes/SaveNote",
  {
    args: { note: Note },
    success: NoteEditorMessage,
    mode: "queue",
    invalidates: () => [NotesTag]
  }
) {
  static readonly layer = this.toLayer(
    Effect.gen(function*() {
      const notes = yield* Notes
      return ({ note }) =>
        notes.save(note).pipe(
          Effect.match({
            onSuccess: (note) => NoteEditorMessage.SucceededSaveNote({ note }),
            onFailure: (error) =>
              NoteEditorMessage.FailedSaveNote({ reason: error.reason })
          })
        )
    })
  )
}
```

A body that leaves a typed error gives an unmatched Command, which `$.run`
rejects.

`Command.map`, `Command.asNoop` and `Command.match` are for a Command that
can't know its caller's messages: one from a library, such as
`Router.replace`, or one that two components issue. Map or silence one that
can't fail with `Command.map` or `Command.asNoop`:

```ts
Router.replace(AppRoute, route).pipe(
  Command.map((outcome) => AppMessage.CompletedReplace({ outcome }))
)
Router.replace(AppRoute, route).pipe(Command.asNoop)
```

For one whose body can fail, `Command.match` maps both channels to messages.

In a `Story` or `Scene`, a Command that returns a message resolves with the
message: `s.resolve(SaveNote, NoteEditorMessage.SucceededSaveNote({ note }))`.
A mapped Command takes its own value in `s.resolve`, or its typed error in
`s.fail`, and the mapping runs in the test.

### Changing the Model

`$.evolve` changes some fields of the Model and keeps the rest, so a
handler doesn't spread `...model`. Each field takes its new value, or a
function from its old value to the new one. It returns a step, so `.run`,
`.emit` and another `.evolve` chain after it:

```ts
const submittedOrder = CheckoutDef.update(
  "SubmittedOrder",
  ($) =>
    $.model.submitting
      ? $.model
      : $.evolve({
        form: submit,
        submitting: true,
        attempts: (n) => n + 1,
        notice: null
      })
        .run(placeOrder($.model.form.values))
)
```

`UiStruct.evolve` takes the same fields for a struct inside the Model:
data-first for a row of a list, and data-last for a struct field, where it
takes the struct's type from the field. It also changes the Model in a
handler that returns a bare Model rather than a step:

```ts
const clickedIncrement = CheckoutDef.update(
  "ClickedIncrement",
  ($, { id }) =>
    $.evolve({
      lines: Arr.map((line) =>
        line.id === id
          ? UiStruct.evolve(line, { quantity: (n) => n + 1 })
          : line
      ),
      coupon: UiStruct.evolve({ status: "Idle" })
    })
)

const failedSaveNote = NoteEditorDef.update(
  "FailedSaveNote",
  ($, { reason }) => UiStruct.evolve($.model, { error: reason })
)
```

A misspelt key, a value of the wrong type and a function that returns the
wrong type are errors on that field. TypeScript checks the keys written in
the fields literal, not those of an object built elsewhere and passed in:
a misspelt key there is copied onto the Model. Check fields declared on
their own where they're declared, which also types the updaters:

```ts
const bump = {
  attempts: (n) => n + 1,
  notice: null
} satisfies UiStruct.EvolveFields<Checkout>
```

Unlike with `Struct.evolve` from
`effect`, a field can't change type. A field takes a whole value, so
`coupon: { status: "Idle" }` is an error: write
`coupon: UiStruct.evolve({ status: "Idle" })`. A function is always the
updater, so a field whose type is a function can't be set through
`evolve`. A Model shouldn't hold a function anyway, since it can't be
encoded for hydration or history.

A function sees only its own field. One that depends on another field
reads `$.model`, which is the Model before this step.

`evolve` doesn't take a union, and a nullable struct counts as one. Match
the union first and evolve the member:

```ts
const updatedName = AuthDef.update(
  "UpdatedName",
  ($, { value }) =>
    Auth.match($.model, {
      LoggedOut: (auth) => auth,
      LoggedIn: UiStruct.evolve({ name: value })
    })
)

// A union field in a struct Model, with `match` data-last.
$.evolve({
  auth: Auth.match({
    LoggedOut: (auth) => auth,
    LoggedIn: UiStruct.evolve({ name: value })
  })
})

// A nullable struct.
$.evolve({
  coupon: (coupon) =>
    coupon === null ? null : UiStruct.evolve(coupon, { status: "Idle" })
})
```

A union Model has no `$.evolve`, so a handler that also runs a Command
wraps the match in `$.set(...)`. Switching to another member is a `$.set`
too.

`evolve` is for plain structs, not `Schema.Class` or other class
instances: evolving a changed field returns a plain-object shallow copy,
dropping the prototype even though the static type still exposes class
methods. For a class Model, use `$.set` with a constructor or method that
returns a valid instance.

### Stateless view wrappers

Name view functions in CapitalCase, like components (for example, `Card` and `Field`).

Use `Html.H<M>` (or `OpenTui.H<M>` in a terminal app) for an application's
reusable view functions. A view function published in a library types `h` by
what it needs instead: `@effect/ui-kit`'s `Input` takes
`{ readonly input: ... }`. When the root is the hole, return its builder
and let the caller add children: `Card(h).children(...)`.
This needs no children generic. `children` returns the builder and a second
call adds after the first, so the function can add children of its own and
still return the builder. For a nested hole, use an options object
and keep its children inferred through `C`:

```ts
import type { View } from "@effect/ui"
import type { Html } from "@effect/ui/html"

const Card = <M>(h: Html.H<M>) => h.section.class("card")

const Field = <M, C extends View.Children<M>>(h: Html.H<M>, options: {
  readonly label: string
  readonly children: C
}) =>
  h.label.children(
    options.label,
    h.div.class("control").children(options.children)
  )
```

Pass `children: [child, otherChild]`. The unspread array retains the union
of its children's service requirements. `View.Children<M>` is a generic
constraint, not a parameter annotation: annotating children directly with it
erases requirements. `View.Input<M>` instead rejects service-requiring children.

A nested hole can also stay a builder. `forward` lets the caller's chain
and children land on an element below the root: the function returns the
inner builder, and `forward` says what goes around it when it is built.

```ts
const Framed = <M>(h: Html.H<M>) =>
  h.div.class("control").forward((control) =>
    h.div.class("frame").children(control)
  )

// The class and the children land on the control, inside the frame.
Framed(h).class("wide").children(h.input)
```

### Loading data

A component declares the queries it shows in `queries`, by name. Each entry
names a `Query` and returns its args from `$`, holding the Model, the props
and the other queries' results, or `undefined` to disable it:

```ts
queries: {
  note: { query: GetNote, args: ({ props }) => ({ id: props.id }) },
  // Waits for the args to hold still before it fetches.
  results: { query: SearchNotes, debounce: "300 millis", args: ({ model }) => ({ q: model.q }) },
  // One query at many args, one entry per args.
  authors: { queryMany: GetUser, args: ({ props }) => props.authorIds.map((id) => ({ id })) }
}
```

The runtime watches each query and keeps its last result beside the Model. A
result that changes re-renders the instance, without a message. The Model
holds what the user did, and never a copy of fetched data. The Model plus the
results form the instance's state, `{ model, queries }`. In server page state,
an unpatched Success references `~query` when its value and timestamp match
that entry. Other results stay inline. History entries keep self-contained
snapshots, so restoring them does not depend on `~query`.

Every function of the component can read the results, by query name:
`h.queries` in `view`, and `$.queries` in `update`, `head` and
`subscriptions`, whose `$` holds `model`, `props` and `queries`. Give an entry
an `onChange` only when `update` has to react to a new result, such as
moving focus once a query fails. It returns a message, which `update` gets
after the result is written.

When an enabled `query` entry's args change, it keeps the last Success
with `waiting: true` until the new args have a result, including during
`debounce`. `onSuccess` can keep the old results visible and mark them busy.
Without a stored Success, the result is `Initial`; a disabled query is
`Initial`, not waiting. A kept infinite list reports `more: Loading`.
Set `dropPrevious: true` on the entry to show `Initial` instead when old
results would mislead.

The fetch for the old args runs on and fills the cache, unless the entry has
a `debounce` or `interruptPrevious: true`. Then changed args interrupt it,
unless another watcher, a `get` or a prefetch still needs it, and a fetcher
built on `Effect.tryPromise` sees its `AbortSignal` abort. Set
`interruptPrevious: true` when args change faster than fetches finish, as
with a brush or a slider, so each change doesn't leave a fetch running for
args nobody shows.

The cache never retries a failed fetch: a fetcher that should retry does so
itself.

In tests, `Story` steps such as `loaded("note", note)` take the query's
name and write its result. To start from fetched data without sending
`onChange`'s message, pass the results to `given`:
`s.given(model, { note })`. The `MessageLog` records each result write as a
`QueryChanged` entry, and an `Update` entry only for an `onChange` message.
Each `Mounted` and `Update` entry records the results, restored or hydrated
ones included, so `Story.fromLog` replays `$.queries` as it was. New props from a parent are logged as a
`PropsChanged` entry, so the result's `props` and `queries()` hold what the
instance ended with.

### Slots

A component with a `view` can take markup from its parent in named slots.
List the names in `define` with `slots: ["summary", "body"]`, and place
each one in `view` with `h.slots.body`, once per render. The parent passes
the content when it declares the child, written with its own `h`:

```ts
// Local slotted Collapsible fixture (ai-docs/src/10_ui/fixtures/kit/Collapsible.ts),
// distinct from @effect/ui-kit's headless Collapsible.
Collapsible(h, {
  key: "note",
  slots: {
    summary: h.h2(note.title),
    body: NoteEditor(h, {
      key: note.id,
      props: { note },
      onEmit: { Saved: () => SavedNote }
    })
  }
})
```

The content is the parent's. Its handlers send the parent's messages, its
children's events and failures map to the parent's messages, and its
services come from where the parent declared the child, not from the child's Layers. A parent re-render
updates the content without running the child's view. The child decides
whether and where each slot shows. A slot it doesn't place isn't mounted,
and a slot it places again mounts fresh. A slot the parent leaves out shows
nothing. A child in a slot gets a path under the slot, such as
`/NotePage/Collapsible[note]/[body]/NoteEditor[n1]`.

Use slots when the child owns the frame and its state, and the parent owns
what goes inside. Use a headless component when the parent draws all the
markup. A component can't have both `slots` and `parts`. In a scene, a
parent's view shows the content it passes, and a scene of the slotted
component passes its own with `yield* Scene.make(Collapsible, props, { slots: (h) => ({ ... }) })`.

### Headless components

A component finished with `parts` instead of `view` is headless: it keeps
its own Model, `update` and Commands, and owns behaviour such as keyboard
handling, ids and ARIA, but no markup. A consumer calls it with `h`
and a `view` closure that applies each part to a builder of its own:
`listbox.trigger(h.button).children("Open")`. The closure is the consumer's code,
so children declared in it report to the consumer. Pass rows as Schema data in
props, and keep richer row content in the closure, looked up by id. The
closure runs whenever the consumer renders, so wrap a headless child in a
small normal component when the consumer renders often. Test one with
`Story.parts`, which needs no runtime, and render it in a `Scene`, which
runs it with a stand-in view for the consumer.

Name the closure's argument after the component, in camel case and in full:
`view: (listbox) => listbox.trigger(h.button)` for a `Listbox`, and
`tooltipProvider` for a `TooltipProvider`. A one-letter name reads like one
the library fixes, such as `h` for builders, `p` in `parts`, `$` in
`update` and `s` for a Scene. When the name is a reserved word, such as
`switch`, use `parts`. When the closure also reads a variable of that name,
add `Parts` (`listboxParts`) or rename the variable. Two of one component
nested get a role in front, `outerDialog` and `innerDialog`. Parts built
outside a closure follow the same rule:
`const listbox = Story.parts(Listbox, { model, props })`.

A headless component can build on another: `parts` returns
`p.child(Listbox, { props, onEmit, parts: (listbox) => ({ ...listbox, tags }) })`,
and the consumer's closure gets what that `parts` returns. The component owns
the child: the child's events and failures go through its `update`. A child
that fails shows nothing, the consumer's closure with it, and the failure
goes no further than its `onFailure`. A `Scene` of the
component stands in for the child with `childEmit`, and a `Scene` of a
consumer refuses to, because it doesn't run the component's `update`.

### Shared state

A headless component with `shares: ({ model, props, reads }) => value` owns shared
state: every component in its `view` closure, at any depth, can read the
value. An owner with no parts of its own can omit `parts` in `make`; its
`view` closure receives `{}`. A reader lists the owners it reads in
`reads: { provider: TooltipProvider }` and reads `h.reads.provider` or
`p.reads.provider` in `view` or `parts`, and `$.reads.provider` in
`update`. The long form of an entry, `{ owner: TooltipProvider, ... }`, adds
three options. `optional: true` lets the reader work with no owner above it,
where the value reads as `undefined`. `report` is what the reader tells an
owner whose `shares` has `collects`. `onChange` is the reader's message when
the shared value changes, for an `update` that must act on the change. To
read the value, `update` has `$.reads`, so a reader doesn't copy it into its
Model.

`$.reads` follows the rule of `$.props`: it is the owner's value as the
reader's `update` runs. A reader that sends to its owner still reads the old
value in that `update`. An `onChange` message can be older than `$.reads`,
when another reader changed the owner within the same round.

A descendant's `update` can call `$.send(TooltipProvider, message)` without a
`reads` entry. The owner lists the tags it takes in `shares.receives`, and
can't tell which descendant sent a message. A read or a send
puts `Component.Shared<"TooltipProvider">` in a component's requirements,
unless the owner's entry is optional, and the owner's closure removes it. The
component compiles on its own: with no owner of that name above it, the type
error appears where the tree's mount effect is run, as a missing service.
Use distinct owner names: a different definition with the same name
satisfies the type, but a required read still fails at mount. To name the
requirement from the component, use
`Component.Shared.Of<typeof TooltipProvider>`.

The state is the owner's Model, so the log records every change, and each
reader's `Update` records what `$.reads` held, so `Story.fromLog` replays
it. On the Wire the value is encoded through the `schema` of the owner's
`shares`, `{ value, schema }`, or best effort without one. An owner
restores from history like any other component, as **History restore**
describes. In a `Scene`,
`s.shared(TooltipProvider, value)` or
`s.given(model, {}, [[TooltipProvider, value]])` gives readers a value, and
each send to the owner is acknowledged with
`s.sent(TooltipProvider, message)`.

A component can read its own kind, as a submenu reads the menu it's in:
`reads: { parent: { owner: "self", optional: true } }` reads the nearest
instance of the same component above it. The outermost one has none, so the
entry is `optional: true`, and the component must have `shares` itself. Write
`shares` before `reads`, so `report` and `onChange` are typed by it. In a
`Scene`, the component itself is the owner: `s.shared(Menu, value)`.

`shares` takes `{ model, props, reads }`, so an owner can share what it derives
from the owners above it. A nested fieldset is disabled while the one around it
is, and its fields read only the nearest fieldset:
`value: ({ props, reads }) => ({ disabled: props.disabled || reads.parent?.disabled === true })`.
A value that reads its own kind would refer to its own type, so give `shares`
a `schema` or annotate what it returns.

Every owner update re-runs its closure, and headless children in it
re-render each time, so put normal components directly under an owner.
Every reader re-renders when the shared value changes, so keep readers few
and the shared value small.

### Who owns the state

As a convention, give each value one authoritative source:

- If the caller sets the value or can refuse a change, pass a controlled prop.
- If nobody outside decides the value, keep it in the component's Model.
- Observing a value doesn't move ownership. Part values, shared reads,
  reports and event payloads let other components observe it.
- A prop read only in `init` is a seed, not a mirror: later changes to it
  don't reach the Model. Name it `initial*`, unless an API fixes its name,
  as `Router.props` does for a root's `route`: the root copies it into its
  Model in `init`, and `Router.subscription` delivers each later route.

| Direction            | A current value                | A request or something that happened |
| -------------------- | ------------------------------ | ------------------------------------ |
| Parent to child      | props                          | props                                |
| Child to parent      | a headless child's part values | `events`                             |
| Owner to descendants | `shares`                       | `reads.onChange`                     |
| Descendant to owner  | `report` and `collects`        | `receives` and `$.send(Owner)`       |

The columns differ in how long they last. A send happens once. If an
optional owner is absent, the log records `SendDropped` and nothing is
queued, and `init` can't send. Unmounting the sender doesn't withdraw a
send, while a report goes away with the reader that made it. So if a fact
should stop being true when the sender unmounts, or would need sending
again when the receiver remounts, use the current-value column.

A parent has only props, so a request to a child is a prop too, or a
mount. "Open the import wizard" renders the wizard
(`model.importing && Wizard(h, ...)`): each mount starts it over, and it
emits `Finished` or `Cancelled` for the parent to stop rendering it. "The
dialog must stay open" is an `open` prop, even if it rarely changes.

A parent has no general way to ask a child to act on state only the child
holds, such as saving a private draft. Lifting that state into the parent
works for a draft, not for scroll position or selection inside a widget. A
counter prop that the child watches replays when the child remounts, so
don't use one. A prop that names a target for the child's mount to act on is
fine, as `VirtualList`'s `scrollTo` with its optional `id` is, when the
component says how to repeat a request and what a duplicate, a replacement
and a fresh mount each do. Otherwise the child's own controls, Subscriptions
or parts have to trigger the work.

A component with a controlled value reads it from props and emits what the
user asked for, instead of updating a second copy. Its Model holds only
interaction state the caller would never store, such as a typeahead buffer.
`@effect/ui-kit` goes further for its own components and takes no seed
props. `VirtualList`'s `initialCount` isn't one: the list reads it in layout
until it has measured, not only in `init`.

A disabled control suppresses interaction and value-changing requests: guard
its `update`, or omit the DOM event handler in a view function. A read-only
control suppresses only the value-changing requests: focus, navigation,
lifecycle, dismissal and read-only browsing, such as opening a `Combobox`
popup without picking, still work.

Choose a popup by who decides when it closes:

- With an `open` prop, use `.popover("manual", open)`. Report Escape and an
  outside press as dismissal requests, which the caller can refuse.
- Use `.popover("auto", open)` with a `toggle` handler only if the component owns
  `open` in its Model and nobody can refuse a browser dismissal.
- For a controlled modal where the browser should own modality, use a dialog
  with `.modal(open)`. `cancel` is a dismissal request. `close` reports a
  close, the caller's own included, so treat it as a dismissal only while
  `$.props.open` is still true: a browser can force a modal closed, and the
  host reopens it while the prop stays true. TestHost doesn't model the forced
  close.
- For a modal that must leave other top-layer surfaces interactive, such as
  toasts or nested popups, use `.popover("manual", open)` and have the
  component own focus, outside-interaction blocking, close requests and exit
  presence, as `@effect/ui-kit`'s `Dialog` does.

Nothing is dispatched when a prop changes: the log records `PropsChanged`,
and the next `update` reads the new value from `$.props`. To act on the
change itself, re-key the child if the new value should start a fresh
instance. If work should restart without resetting the Model, key a
Subscription on the prop with `Subscription.make(name, deps, build)`. If the
work needs a host node, pass the prop as a mount argument and observe
argument changes in the mount.

The **Who owns the state** example has a controlled modal, a workflow started
by a send, a provider that owns visibility, a seed, and three patterns that
compile but shouldn't be written.

### Mounts

Work that needs an element's host node, such as measuring it or hosting a
chart, map or editor, is a mount. Define it once at module level, like a
Command: `Mount.make(name, { args }, (node, args, changes) => effect)` for
work that ends with one result, or `Mount.makeStream` for work that sends a
result per stream emission, such as a DOM event, for as long as the element
lives. Annotate `node` with the node the body needs. A view issues it with
its args and maps the result to a message:
`h.canvas.onMount(DrawChart({ points }).pipe(Mount.map(toMessage)))`.
If the body has nothing to report, end it with `Effect.as(Component.noop)`. An element takes one mount. Args with no real Schema, such as a
callback, need `Schema.declare`. Mounts never run on the server or in
`TestHost`. A `Scene` tracks the mounts in its view:
`expectMount(DrawChart({ points }))` asserts on the rendered args and
acknowledges the mount running, and `mounted(DrawChart, result)` sends what
the body would have produced. A mount nothing acknowledged fails the next message step
and the end of the test.

### Document and window events

Keys and presses that no element hears, such as a game's arrow keys or an
Escape that closes a popup opened by hovering, are entries in
`subscriptions`: `HtmlSubscription.onDocument("keydown", handler, options)`,
`HtmlSubscription.shortcuts(table)` for a table of single-key shortcuts, and
`HtmlSubscription.onWindow("focus" | "blur", handler)` for the window's
focus. The handler and `preventDefault` mean what they mean on an element,
and the payload adds `defaultPrevented`, so a listener can skip a key an
element already took. `capture: true` hears a press before any element can stop it.
Gate an entry on the Model to listen only while it's needed. The listener
always runs the handler from the latest `subscriptions` result, so it may
read the Model. An instance has one listener per target, event and phase.
`BrowserHost.layer` provides the source; elsewhere nothing fires. A
`Story` delivers one with `s.subscription(key, message)`, an `HtmlScene`
fires one with `s.fireDocument("keydown", { key: "Escape" })`, and a
`Play` adds `TestGlobalEvents.layer` and calls
`TestGlobalEvents.fire("document", "keydown", { key: "Escape" })`, which
its next step settles.

### Drawing on a canvas

`Canvas.view(h, { width, height, shapes, pixelRatio, onPointerDown, onPointerMove, onPointerUp })`,
from `@effect/ui/html`, draws a scene of plain shapes: `Canvas.Rect`,
`Circle`, `Path`, `Text` and a nestable `Group`. Build the scene from the
Model in `view`. The canvas repaints only when the scene differs. It
returns the `h.canvas` builder, so classes, attributes and fallback
children chain on it, and it takes the element's mount. Pointer handlers
get `x` and `y` in scene units. `pixelRatio: "auto"` draws sharply on a
HiDPI screen; chain `.style({ width: "100%" })` for a canvas that fills
its container. For motion, add
`model.running && HtmlSubscription.onAnimationFrame((delta) => ...)` to
`subscriptions`, and cap the delta, which is long after a hidden tab
returns. A `Scene` asserts on the shapes with
`expectMount(Canvas.Paint({ ... }))`, and an `HtmlScene` fires a frame
with `s.frame(16)`; a `Play` adds `TestAnimationFrames.layer` and calls
`TestAnimationFrames.fire(16)`. `Canvas.paint(context, { width, height, shapes })`
draws a scene on any 2D context, such as an `OffscreenCanvas`'s.

### Forms

Validate a form with `Validation.make`. It takes each field's rules: a
`required` message, a list of rules, and a `value` Schema when the control
holds something other than a string. A rule is a predicate and a message, and
`Validation.Rule` has the common ones, such as `minLength`, `email` and
`fromSchema`. A predicate also gets every value of the form, so a rule like
"passwords must match" is a rule on the confirm field.

The Model holds the form's `State`: the values as typed, which fields were
edited or left, whether a submit was tried, and the server's errors.
`update` records what happened with `change`, `blur`, `submit` and
`reject`. Errors are never stored. `validate(state)` derives each field as
`NotValidated`, `Validating`, `Valid` or `Invalid`, and `value`, which
is `Some` of the values only when every field passes. `view` and `update`
both call it, so write one function that calls it and share it.

The `mode` decides when a field starts showing its result: once it was
edited, once it was left, or, by default, once a submit was tried. A tried
submit shows every field. An error from `reject` shows at once and stays
until its field changes. By default each invalid field stops at its first
failing rule (`errors: "first"`); pass `errors: "all"` to collect every
failing rule and list `field.errors` below the field.

For a list of requirements under a field, such as a password's, call
`checklist(state, "password")`. It gives every rule of the field as
`{ message, met }`, met or not. It ignores the mode, so the list can show
from the first render, and an empty value meets no rule. Write each message
as a requirement that reads right met or unmet. A message that is a function
of the value is called for every rule, with an empty value too.

An async check, such as "is this username taken", is a query whose args
are `undefined` until `passes(state, "username")`. Pass its result to
`validate`, mapped to a list of errors. The field is `Validating` while
the query loads, and `value` is `None`, so a submit waits for the answer.
A query keeps its result per args, so an answer about an earlier value is
never shown. Forms set `novalidate`, so the browser's own checks stay out of
the way.

A form's values live in the Model, so history restore writes them into
`history.state` and the server ships them in the page state. Declare a secret
field such as a password with `value: Schema.Redacted(Schema.String)`. A
component whose state holds a `Schema.Redacted` anywhere is left out of
both, so none of the form's fields restore or hydrate: keep the form a leaf
component. When only history is the concern, keep the field a plain string
and clear it with `restore`, as **History restore** shows. Carry the secret
as `Schema.Redacted(Schema.String)` in messages and Command args too, so the
message log redacts it. The default `isEmpty` unwraps a `Redacted`, and a
rule or the view reads it with `Redacted.value`.

### History restore

Before the Router leaves a history entry, it saves the state of every mounted
instance: its Model and query results. On Back and forward, and on a reload of
an entry a push left, an instance mounted for that entry starts from its saved
state, and `init` runs again only for its Commands. An owner of shared state
restores like any other component. One whose `shares` has `collects` also
saves the message its readers' reports last sent, and compares their reports
with it after Back.

The `restore` option of `Html.component` (or `Component.define`) changes what is saved:

```ts
const LoginPage = Html.component({
  name: "LoginPage",
  model: Schema.Struct({
    email: Schema.String,
    password: Schema.String,
    submitting: Schema.Boolean
  }),
  message: LoginPageMessage,
  restore: (model) => ({ ...model, password: "", submitting: false })
})
```

A function gets the Model and props and returns the Model to save. It runs
when the Router saves, not on Back, so a field it clears is never written:
here the password never reaches `history.state`, and no submit is left
running. `restore: false` saves nothing, so the instance starts from `init`.
The components below it are saved as usual. Hydration doesn't read
`restore`: the server still sends the whole Model, and an instance the server
rendered starts from it, not from the saved one.

Leave a field out when it depends on a Command an `update` started, such as
a timer or a request, or on something only the DOM knew, such as hover, focus
or a measurement. The one exception is a measurement that scroll restoration
needs, such as `VirtualList`'s anchor and measured item sizes, which may
stay when the component invalidates it against the new layout or dataset.
Restore runs `init`'s Commands and no others, so after Back
`submitting: true` would wait for a request that isn't running. A secret
goes too. Use `Schema.Redacted` when a value must never be serialised, the
server's page state included, and `restore` when only history is the
concern.

In `@effect/ui-kit`, `Tooltip`, `TooltipProvider`, `ToastProvider`,
`Dialog`, `Drawer`, `DrawerProvider` and `Tabs` set `restore: false`, and
`Field` saves `touched` without `focused`. Their props are the consumer's, so
a consumer's `open` field or active tab still restores. A page that wants its dialog closed
after Back clears that field in its own `restore`.

### Organizing an app

The examples below are one notes app. Each example is an entry module, for
the browser, the server or the tests. It mounts a component and provides the
platform Layers, and it defines no components. The app is in
`ai-docs/src/10_ui/fixtures`, laid out as it would be under `src/` in a real
app. Read an example, then the files it imports.

Put shared types in one top-level `domain` folder, queries in a top-level
`queries` folder, and app components shared across features or pages in a
top-level `components` folder. Group services and feature-only components by
feature, then by kind within each feature:

```text
fixtures/
  App.ts                      // root component, imports pages
  routes.ts                   // AppRoute
  domain/Note.ts              // Schema, errors, NotesTag
  queries/
    ListNotes.ts
    GetNote.ts
    SearchNotes.ts
  kit/Listbox.ts              // headless components no feature owns
  kit/Collapsible.ts          // a component with slots
  notes/
    services/Notes.ts         // service and its Layers
    components/NoteEditor.ts  // NoteEditor and its SaveNote command
    components/NoteActivity.ts
    components/ActivityLog.ts
    components/NoteLinkPicker.ts
  pages/
    NotesIndex.ts             // /
    notes/NotePage.ts         // /notes/:id
    search/SearchPage.ts      // /search
  server/NotesApi.ts          // the JSON API that Notes calls
```

`domain` holds Schemas with their types and errors, pure functions over them,
and `Query.Tag` invalidation tags. `domain` imports packages and other
`domain` files, and nothing else from the app, so domain files can build on
each other without one feature importing another.

`queries` starts flat (such as `queries/SearchPeople.ts`) and can grow into
feature subfolders (such as `queries/people/SearchPeople.ts`) as the folder
grows. Queries import `domain` and services; pages and components import them.

App components used by more than one feature or page go in a top-level
`components/` folder (unlike `kit/`, which holds unstyled headless primitives
no feature owns). Services and their Layers, and components only one feature
uses, stay in that feature. A second feature is a sibling of `notes/`, with
its types in `domain` next to `Note.ts`. Pages import features, shared
components and queries, and none of them imports pages. Keep `AppRoute` in
`routes.ts`, outside `pages/` and separate from `App.ts`; pages can then
build links without importing the root component that imports them.

From outside `domain` or `queries`, import them through subpath imports
declared once in the app's `package.json`. You can map `#components/*` the
same way for a top-level `components` folder:

```json
{
  "imports": {
    "#components/*": "./src/components/*.ts",
    "#domain/*": "./src/domain/*.ts",
    "#queries/*": "./src/queries/*.ts"
  }
}
```

```ts
import { Note } from "#domain/Note"
import { ListNotes } from "#queries/ListNotes"
```

Node, TypeScript, Vite and Vitest all read the `imports` field with no other
config, so a server entry that imports `domain` or `queries` still runs under
plain `node`. The mapping adds the `.ts`, so the specifier has none: with
`rewriteRelativeImportExtensions` set, TypeScript accepts `.ts` only on a
relative specifier. Within `domain`, and everywhere else, imports stay
relative, with their `.ts` extension.

Keep one file per route in `pages/`, in folders that mirror the URL. A page's
folder is the static segments of its route's path, and its file is named after
the component. `/` is `pages/NotesIndex.ts`, `/notes/:id` is
`pages/notes/NotePage.ts`, and `/notes/:id/history` would be
`pages/notes/history/NoteHistoryPage.ts`. A param segment gets no folder. The
folder follows the URL, not the feature the page uses.

A command belongs in the file of the component that runs it, not in a shared
`commands/` folder. When two components need the same write, share the service
method and give each component its own command. Queries have their own
top-level folder because pages, multiple components and server rendering all read them.

A component provides the domain Layers it needs in its own file, with
`Component.provide`: its commands, its queries and the services they capture.
The plain name, such as `NotePage`, is the component with those Layers
provided, and it is the one parents and entry modules use. The component
without them is exported as `NotePageNoDeps`, for a test that provides its
own. A component that needs no domain Layers has only the plain name.

A memoised Layer is built once per Env, the services a component resolves
from. Provides that resolve from the same Env share it, and so do the provides
below them. It is closed when its last user unmounts. Components under
different provided ancestors each build their own copy, so a service built for
one page never sees another page's dependencies. A service that holds state,
such as a session or a sync engine, is provided by the component that owns its
lifetime, usually the root component. The components below keep naming it in
their own provides and get that instance.

Entry modules sit beside these folders. Each one provides only
platform Layers such as the Router, the HTTP client and logging. Domain Layers
are never provided there. The server and a test of the whole app swap the HTTP
client, not the services.

### Code splitting

Load a page that most visits never show from a chunk of its own with
`Component.lazy`. Give it a name and a function that imports the component,
and call it in the view as the component would be called:

```ts
// The `import()` is the only reference to the page's module.
const SearchPage = Component.lazy(
  "SearchPage",
  () =>
    import("./pages/search/SearchPage.ts").then((module) => module.SearchPage)
)

// In the root's view. `fallback` shows while the module loads, and if the
// load fails.
SearchPage(h, {
  key: AppRoute.printPath(route),
  props: { route },
  fallback: (result) =>
    h.p(result._tag === "Failure" ? "Couldn't load this page." : "Loading…")
})
```

Vite, like any bundler that splits on `import()`, puts the page and the code
only it imports into a chunk of its own. The props, events, slots and
requirements come from the component's type, so the call is checked as a
direct one is. A static import of the page's module anywhere in the app pulls
it back into the entry chunk. A type-only import doesn't.

The first child rendered starts the load. The module stays loaded for the life
of the document, so a later visit mounts at once, without the fallback.
`SearchPage.preload()` starts the load early, such as when the pointer enters
a link. A failed load shows the `Failure` branch of `fallback`, and the next
mount loads again. The browser may keep the failed chunk and fail every later
load of it, so listen for Vite's `vite:preloadError` event and reload the
page.

The page provides its own Layers with `Component.provide`, as every page
does, and they go into its chunk with it. The name is the child's path
segment, since the path is needed before the module arrives. A `Scene` names
the child by the lazy value, as in `s.childEmit(SearchPage, event)`, and
`TestHost.settle` waits for a load in flight.

Don't put `@effect/ui` in one vendor chunk with Vite's `manualChunks` or
`advancedChunks`. Framework modules that only a lazy page uses, such as
`Query`, move back into the initial load, which can end up larger than with
no splitting at all.

A `Feature.Service` whose Layer is built from an `import()` splits too, but
it needs a contract module for the Schemas, a host component and a Layer for
each page. Use a feature to swap an implementation, and `Component.lazy` to
split one off.

Known limits:

- A headless component or a view function can't be loaded lazily. Make a
  page written as a view function a component first.
- The server waits for the module and renders the page. The client doesn't
  load the module before it hydrates, so it replaces the server's nodes with
  the fallback, then with the page once the module has loaded.
- Nothing preloads the chunk of a lazy page that a link opens directly: the
  entry chunk loads, then the page's.

- **[Building a component with @effect/ui](./ai-docs/src/10_ui/10_basics.ts)**:
  Build a note editor from Schemas and pure functions, with its update split
  into slices on an `Html.component` definition. It saves through a
  `Command.Service` and autosaves with a Subscription. This is the browser
  entry module, which mounts it with `BrowserHost`. The editor is in
  `fixtures/notes/components/NoteEditor.ts`.
- **[Composing components, data and Layers](./ai-docs/src/10_ui/20_composition.ts)**:
  Load a note with a `Query` and show it with child components. The
  page handles a child's events, provides Layers with `Component.provide`,
  makes one child swappable with `Feature.Service`, and passes its editor
  into another component's slot. This entry module
  mounts the page, which is in `fixtures/pages/notes/NotePage.ts`.
- **[Reusing view functions with children](./ai-docs/src/10_ui/21_view-functions.ts)**:
  Name view functions in CapitalCase, like components.
  Use a plain function for a stateless wrapper. Return the builder when
  its root is the hole, so callers add children without a children generic.
  For a nested hole, take an options object with a generic children field,
  or return the inner builder with `forward`.
- **[Headless components](./ai-docs/src/10_ui/22_headless-components.ts)**:
  Build a filterable listbox that owns its state, keyboard handling and ARIA
  but no markup, and draw it from a consumer that calls it with `h` and a
  `view` closure. This browser entry module mounts the consumer, which is in
  `fixtures/notes/components/NoteLinkPicker.ts`.
- **[Composing headless components](./ai-docs/src/10_ui/22_headless-composition.ts)**:
  Build a headless tag picker on top of the headless Listbox with `p.child`.
  The picker adds the picked tags, their remove buttons and a live
  announcement, the Listbox keeps its keyboard handling and ARIA, and a
  consumer draws both from one closure. Then a scene of the picker that runs
  the Listbox's events through the picker's `update`.
- **[Shared state](./ai-docs/src/10_ui/23_shared-state.ts)**:
  Share part of a headless component's state with every component below it:
  a tooltip provider that knows which tooltip is open, tooltips that read it
  and tell it when they're focused, and a scene of one tooltip with no
  provider mounted. Then an optional owner, the reports readers give it, a
  reader's `onChange`, a component that reads and sends to its own kind, and
  an owner that shares what it derives from the one above it.
- **[Custom elements](./ai-docs/src/10_ui/24_custom-elements.ts)**:
  Use web components from other libraries in an HTML view: bind each tag
  with its properties and events once, set them with typed methods, and fire
  an element's event in a scene.
- **[Mounts](./ai-docs/src/10_ui/24_mounts.ts)**:
  Start work with an element's host node: a mount that measures a box once,
  a mount that attaches a third-party editor and reports each change, and a
  scene that names both by their definitions.
- **[Document and window events](./ai-docs/src/10_ui/25_document-events.ts)**:
  Listen for keys on the document while a game runs, test it in a scene,
  and press a key in a whole-app test.
- **[Drawing on a canvas](./ai-docs/src/10_ui/25_drawing-on-canvas.ts)**:
  Draw a scene from the Model, move it every animation frame, turn presses
  into scene points, and test it in a scene and a whole-app test.
- **[Drawing icons and charts with SVG](./ai-docs/src/10_ui/25_drawing-with-svg.ts)**:
  SVG tags have builders on `h` like HTML tags: `h.svg`, `h.path`,
  `h.circle`, `h.g` and the rest. Attribute names are checked per tag,
  and SVG's `<text>` is `h.svgText` because `h.text` makes a text node.
- **[Validating forms](./ai-docs/src/10_ui/26_forms.ts)**:
  Validate a sign-up form with `Validation`: rules on each field, a rule
  that reads another field, a username check run by a debounced query, and
  an error from the server. A story and a scene read each field's state.
- **[Who owns the state](./ai-docs/src/10_ui/27_state-ownership.ts)**:
  Compare a controlled modal, a workflow started by mounting it, and a provider
  that owns visibility. Contrast an initial prop with a live prop and see
  how competing routes for the same value or request can still compile.
- **[Files](./ai-docs/src/10_ui/28_files.ts)**:
  Let the user choose a file and read it: a file input reports the `File`s
  the user chose, `HtmlFiles.pick` opens a picker from a keyboard shortcut,
  and a Command reads the file with `HtmlFiles.readAsText`. Cancelling the
  Command stops the browser reading the file. A story resolves the picker
  and the read, and a scene chooses a file in the input.
- **[Routing and the document head](./ai-docs/src/10_ui/30_routing.ts)**:
  Define typed routes with `Route` and keep the current route in the root's
  Model. Each page's `head` option sets its title with `Head` and its meta
  tags with `HtmlHead`. The root adds a title template and `lang`, and the
  mount folds them into one document head. This entry
  module mounts it with `BrowserRouter`. The routes are in
  `fixtures/routes.ts` and the root component is in `fixtures/App.ts`.
- **[View transitions](./ai-docs/src/10_ui/32_view-transitions.ts)**:
  Animate an update with the browser's View Transitions API: a board that
  morphs its cards between a grid and a list, and a root that slides pages in
  the direction of the navigation. `$.viewTransition` asks for the animation
  in `update`, and `BrowserHost` runs it.
- **[Search, filters and pagination in the URL](./ai-docs/src/10_ui/35_url-state.ts)**:
  Keep a search page's text, order and page number in the search, so a link
  or a reload shows the same results. The page reads them from its route,
  writes them with `Router.patchSearch`, and fetches with a debounced query.
  This entry module mounts the routed app. The page is in
  `fixtures/pages/search/SearchPage.ts`.
- **[Rendering on the server](./ai-docs/src/10_ui/40_server-rendering.ts)**:
  Serve the routed app's pages with `layerHttp` from
  `@effect/ui/html/HtmlServerHttp`, next to the JSON API. This is the
  server's entry module. It serves the same `fixtures/App.ts` the browser
  mounts, and the JSON API in `fixtures/server/NotesApi.ts`.
- **[Hydrating in the browser](./ai-docs/src/10_ui/45_hydration.ts)**:
  Hydrate what the server rendered with `HtmlHydrate`. This is the browser
  entry module of the server-rendered app, served as `/client.js`.
- **[Markdown content](./ai-docs/src/10_ui/47_markdown.ts)**:
  Write pages in Markdown, compile them at build time with the Vite plugin
  from `@effect/ui/html/MarkdownVite`, and render them with `Markdown.view`,
  with components in the prose as islands.
- **[Testing @effect/ui components](./ai-docs/src/10_ui/50_testing.ts)**:
  Test a component's logic as a `Story`, its view as a `Scene`, a Command
  against a fake Layer, and components working together as a `Play`. The
  last test renders on the server and hydrates with `ssr`.
- **[Terminal apps with OpenTUI](./ai-docs/src/10_ui/60_opentui.ts)**:
  Build Effect UI terminal applications with `@effect/ui-opentui`, using the
  OpenTUI vocabulary, global key shortcuts, controlled inputs, imperative
  commands, and both FFI-free and frame-rendered tests.