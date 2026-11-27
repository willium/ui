/**
 * A component is a value: Schemas for its props, Model, messages and events,
 * plus pure `init`, `update` and `view` functions.
 *
 * `update` returns the next Model, or a step that also runs Commands and
 * emits to the parent. The runtime holds each instance's Model, runs its
 * Commands in the instance's own Scope, and re-renders its view. Children are
 * declared in the view by calling them, `Editor(h, { key, props })`, and
 * communicate up through `events` and down through props. A component's
 * requirements, `R`, name the Commands and feature services it uses, never
 * what their implementations use.
 *
 * A component is built in two steps: `define` takes its name and Schemas,
 * and `make` on the definition takes `init`, `update` and `view`. A large
 * component writes its update slices and view against the definition.
 *
 * **Example** (A todo row that saves through a Command and reports to its parent)
 *
 * ```ts import.meta.vitest
 * import { Command, Component, UiSchema } from "@effect/ui"
 * import { Schema } from "effect"
 *
 * const Todo = Schema.Struct({ id: Schema.String, title: Schema.String, done: Schema.Boolean })
 * const TodoItemMessage = UiSchema.TaggedEnum({ ClickedToggle: {}, ClickedSave: {} })
 * const TodoItemEvents = UiSchema.TaggedEnum({ Toggled: { done: Schema.Boolean } })
 *
 * class SaveTodo extends Command.Service<SaveTodo>()(
 *   "todos/SaveTodo",
 *   { args: Todo, success: Schema.Void }
 * ) {}
 *
 * const TodoItem = Component.define({
 *   name: "TodoItem",
 *   props: Schema.Struct({ todo: Todo }),
 *   model: Schema.Struct({}),
 *   message: TodoItemMessage,
 *   events: TodoItemEvents
 * }).make({
 *   init: ($) => $.set({}),
 *   update: ($, message) =>
 *     TodoItemMessage.match(message, {
 *       ClickedToggle: () => $.emit(TodoItemEvents.Toggled({ done: !$.props.todo.done })),
 *       // Nothing to report: the save ends in `Component.noop`.
 *       ClickedSave: () => $.run(SaveTodo.make($.props.todo).pipe(Command.asNoop))
 *     }),
 *   // `h.isRunning` is true from `ClickedSave` until the save ends.
 *   view: (h) =>
 *     h.el(
 *       "li",
 *       h.el("button").on("click", TodoItemMessage.ClickedToggle()).children(h.props.todo.done ? "[x]" : "[ ]"),
 *       h.el("span", h.props.todo.title),
 *       h.el("button").on("click", TodoItemMessage.ClickedSave()).children("save"),
 *       h.isRunning(SaveTodo) ? " saving" : ""
 *     )
 * })
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import type * as Duration from "effect/Duration"
import * as Layer from "effect/Layer"
import type * as Option from "effect/Option"
import * as Pipeable from "effect/Pipeable"
import * as Predicate from "effect/Predicate"
import type * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Schema from "effect/Schema"
import type * as Types from "effect/Types"
import * as Command from "./Command.ts"
import * as child from "./internal/child.ts"
import * as heads from "./internal/heads.ts"
import { keeper } from "./internal/keptRun.ts"
import * as layerRun from "./internal/layerRun.ts"
import * as internalLazy from "./internal/lazy.ts"
import * as internalNoop from "./internal/noop.ts"
import { failed, layer as owned } from "./internal/partsRun.ts"
import * as queryCore from "./internal/queryCore.ts"
import * as sharedReads from "./internal/shared.ts"
import * as sharedRun from "./internal/sharedRun.ts"
import * as subscriptionCore from "./internal/subscriptions.ts"
import type * as Query from "./Query.ts"
import type * as Subscription from "./Subscription.ts"
import * as UiStruct from "./UiStruct.ts"
import * as View from "./View.ts"

/**
 * Identifies a component.
 *
 * @stability experimental
 * @category type ids
 * @since 0.1.0
 */
export const TypeId = "~@effect/ui/Component" as const

/**
 * Identifies a component.
 *
 * @stability experimental
 * @category type ids
 * @since 0.1.0
 */
export type TypeId = typeof TypeId

/**
 * Identifies `Component.noop`.
 *
 * @stability experimental
 * @category type ids
 * @since 0.1.0
 */
export const NoopTypeId = "~@effect/ui/Component/Noop" as const

/**
 * Identifies `Component.noop`.
 *
 * @stability experimental
 * @category type ids
 * @since 0.1.0
 */
export type NoopTypeId = typeof NoopTypeId

/**
 * The type of `Component.noop`, the message value that sends nothing.
 *
 * **Details**
 *
 * An opaque interface rather than a `unique symbol`: TypeScript widens a
 * unique symbol to `symbol` when it's the inferred return type of a function,
 * so a Command body such as `Effect.map(effect, () => Component.noop)` would
 * be rejected. An interface doesn't widen.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Noop {
  readonly [NoopTypeId]: NoopTypeId
}

/**
 * Identifies the `Component.Noop` Schema.
 *
 * @stability experimental
 * @category type ids
 * @since 0.1.0
 */
export const NoopSchemaTypeId = "~@effect/ui/Component/NoopSchema" as const

/**
 * Identifies the `Component.Noop` Schema.
 *
 * @stability experimental
 * @category type ids
 * @since 0.1.0
 */
export type NoopSchemaTypeId = typeof NoopSchemaTypeId

/**
 * The type of the `Component.Noop` Schema.
 *
 * **Details**
 *
 * A `Command.Service` whose `success` is `Component.Noop`, or omitted, is
 * silent and its body may return anything. A Schema built from it, such as
 * `Schema.suspend(() => Component.Noop)`, isn't, so its body must return
 * `Component.noop` itself.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface NoopSchema extends Schema.declare<Noop> {
  readonly [NoopSchemaTypeId]: NoopSchemaTypeId
}

/**
 * Schema for `Component.noop`.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const Noop: NoopSchema = internalNoop.noopSchema

/**
 * The message value that sends nothing.
 *
 * **When to use**
 *
 * Use as the result of a Command body, a `Command.map` mapper, a
 * `Command.match` branch or an `onMount` Effect when there's nothing to tell
 * the component, instead of adding a no-op variant to its Message. `Command.asNoop` is
 * shorthand for `Command.as(Component.noop)`.
 *
 * **Details**
 *
 * A frozen object whose only property is its type id. The runtime recognises
 * it with `Component.isNoop`, by the type id and not by identity, so two
 * copies of `effect` in one bundle agree on it. When the final result of a
 * Command run, after every mapper, or of a mount is `Component.noop`, the
 * runtime sends nothing and logs no `Update`, and `CommandEnded` records the
 * run as `silent`. `$.run` takes a Command whose result is the Message,
 * `Component.Noop` or a union of the two, so a component whose Message is
 * `Schema.Never` can run one.
 *
 * **Gotchas**
 *
 * It's a message value, not a Command: `$.run(Component.noop)` doesn't
 * compile. Test for it with `Component.isNoop`, never `===`: the runtime
 * doesn't compare by identity, and `!==` doesn't narrow a union. View
 * handlers keep `undefined` for "no message".
 *
 * **Example** (Silent on success, a message on failure)
 *
 * ```ts import.meta.vitest
 * import { Command, Component, UiSchema } from "@effect/ui"
 * import { Effect, Schema } from "effect"
 *
 * const Message = UiSchema.TaggedEnum({ FailedDeleteKey: { reason: Schema.String } })
 *
 * const DeleteKey = Command.make("DeleteKey", { args: { key: Schema.String } }, ({ key }) =>
 *   (key === "" ? Effect.fail("empty key") : Effect.void).pipe(
 *     Effect.as(Component.noop),
 *     Effect.catch((reason) => Effect.succeed(Message.FailedDeleteKey({ reason })))
 *   ))
 * ```
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const noop: Noop = internalNoop.noop

/**
 * Tells whether a value is `Component.noop`, by its type id.
 *
 * **When to use**
 *
 * Use to narrow a result typed `A | Component.Noop`, such as in a mapper over
 * a Command that can be silent. `=== Component.noop` doesn't narrow the
 * other branch, and misses a copy of the value made by another copy of
 * `effect`.
 *
 * @stability experimental
 * @category guards
 * @since 0.1.0
 */
export const isNoop: (u: unknown) => u is Noop = internalNoop.isNoop

/**
 * Identifies a step.
 *
 * @stability experimental
 * @category type ids
 * @since 0.1.0
 */
export const StepTypeId = "~@effect/ui/Component/Step" as const

/**
 * Identifies a step.
 *
 * @stability experimental
 * @category type ids
 * @since 0.1.0
 */
export type StepTypeId = typeof StepTypeId

/**
 * What the runtime reads after `init` or `update`: the next Model, the
 * Commands to run and what to emit to the parent.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Next<out Model, out Msg, out Events, out R = never> {
  readonly model: Model
  readonly commands: ReadonlyArray<Command.Command<Msg | Noop, R>>
  readonly events: ReadonlyArray<Events>
  /** The load mores and resets of infinite queries `update` issued, in order. */
  readonly lists?: ReadonlyArray<ListIssue> | undefined
  /** The messages `update` sent to owners above it, in order. */
  readonly sends?: ReadonlyArray<Send> | undefined
  /** The types of the view transition `update` asked for, when it asked for one. */
  readonly viewTransition?: ReadonlyArray<string> | undefined
}

/**
 * A `$.send(Owner, message)` an `update` issued: the owner component, whose
 * nearest instance above the sender gets the message, and the message.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Send {
  readonly owner: Headless.Any
  readonly message: unknown
}

/**
 * What `$.send` takes for an owner that receives `Rcv`: one of those
 * messages. An owner whose `Rcv` is `unknown` or `any` takes nothing: a
 * message checked against it would be checked against nothing.
 */
type SendMessage<Rcv> = unknown extends Rcv ? never : Rcv

/**
 * Identifies the requirement a reader or sender of shared state carries.
 *
 * @stability experimental
 * @category type ids
 * @since 0.1.0
 */
export const SharedTypeId = "~@effect/ui/Component/Shared" as const

/**
 * Identifies the requirement a reader or sender of shared state carries.
 *
 * @stability experimental
 * @category type ids
 * @since 0.1.0
 */
export type SharedTypeId = typeof SharedTypeId

/**
 * The requirement that reading or sending to an owner of shared state puts
 * in a component's `R`: `Component.Shared<"Provider">`.
 *
 * **When to use**
 *
 * Use to name the requirement in an annotation, or to check that a
 * component needs an owner above it.
 *
 * **Details**
 *
 * An owner is a headless component with `shares`. A component that lists it
 * in `reads` to read its value, or that calls `$.send(Owner, message)`,
 * carries `Shared.Of<typeof Owner>`. Declaring the reader inside the owner's
 * `view` closure removes it, so a reader with no owner above it doesn't
 * compile. `provide` never removes it.
 *
 * Names are the type-level key. At runtime a reader still needs the exact
 * owner definition, not just a component with the same name.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export interface Shared<in out Name extends string> {
  readonly [SharedTypeId]: {
    readonly _Name: Types.Invariant<Name>
  }
}

/**
 * Types for shared state.
 *
 * @stability experimental
 * @since 0.1.0
 */
export declare namespace Shared {
  /**
   * The named requirement of an owner, or `never` for a component that isn't an owner.
   *
   * @stability experimental
   * @category utility types
   * @since 0.1.0
   */
  export type Of<C> = C extends
    Headless<infer _P, infer _E, infer _Parts, infer _R, infer _Rcv, infer Sh>
    ? Sh
    : never

  /**
   * Any shared-state requirement.
   *
   * @stability experimental
   * @category models
   * @since 0.1.0
   */
  export type Any = Shared<any>

  /**
   * The value an owner shares: what its `shares` returns.
   *
   * @stability experimental
   * @category utility types
   * @since 0.1.0
   */
  export type Value<C> = C extends Headless<
    infer _P,
    infer _E,
    infer _Parts,
    infer _R,
    infer _Rcv,
    infer _Sh,
    infer V,
    infer _Rp
  > ? V
    : never

  /**
   * The messages an owner receives, which `$.send(Owner, message)` takes.
   *
   * @stability experimental
   * @category utility types
   * @since 0.1.0
   */
  export type Receives<C> = C extends
    Headless<infer _P, infer _E, infer _Parts, infer _R, infer Rcv> ? Rcv
    : never

  /**
   * What each reader reports to an owner: the type of the `schema` its
   * `shares` has under `collects`. `never` for an owner that collects
   * nothing.
   *
   * @stability experimental
   * @category utility types
   * @since 0.1.0
   */
  export type Report<C> = C extends Headless<
    infer _P,
    infer _E,
    infer _Parts,
    infer _R,
    infer _Rcv,
    infer _Sh,
    infer _V,
    infer Rp
  > ? Rp
    : never
}

/**
 * One entry of a reader's `reads` option: the owner, or the owner with what
 * else the reader declares about it.
 *
 * **Details**
 *
 * `Owner` alone is short for `{ owner: Owner }`. With `optional: true` the
 * reader works with no owner above it: the read is `undefined` there, and the
 * reader carries no `Shared.Of<typeof Owner>`. `report` is what the reader
 * tells the owner, from its own Model and props, for an owner whose
 * `shares` has `collects`. Its third argument is the reader's `id`, the
 * same as `p.id` and `h.id`, so a report can name an element of the
 * reader, such as one the owner points at with `aria-controls`. `onChange`
 * is the reader's message for a new shared value. An owner may be listed
 * under more than one name, but only one of them may have an `onChange`:
 * `define` throws otherwise.
 *
 * `owner: "self"` names the component being defined, which can't name
 * itself yet: an instance reads the nearest instance of its own kind above
 * it, as a nested menu or dialog reads the one it's in. Such an entry is
 * `optional: true`, since the outermost instance has none above it, and the
 * component must share state itself. Its `update` sends to that instance
 * with `$.send("self", message)`.
 *
 * `report` and `onChange` are typed by `define`, which knows the reader's
 * Model and props and the owner's value. Here they're `unknown`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type SharedRead =
  | Headless.Any
  | {
    readonly owner: Headless.Any
    readonly optional?: boolean | undefined
    readonly report?: unknown
    readonly onChange?: unknown
  }
  | {
    readonly owner: "self"
    readonly optional: true
    readonly report?: unknown
    readonly onChange?: unknown
  }

/**
 * What a reader's `reads` option lists: owners, by the local name `h.reads`
 * and `p.reads` read them under.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type SharedReads = { readonly [name: string]: SharedRead }

/**
 * The owner an entry of `reads` names.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type SharedOwner<E> = E extends { readonly owner: infer O } ? O : E

// Whether an entry of `reads` is `optional: true`.
type IsOptional<E> = E extends { readonly optional: true } ? true : false

/**
 * Each owner's current value under the local name a reader's `reads`
 * lists it by, or `undefined` for an optional owner that isn't above.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type SharedValues<SR> = {
  readonly [K in keyof SR]: IsOptional<SR[K]> extends true ?
    Shared.Value<SharedOwner<SR[K]>> | undefined
    : Shared.Value<SharedOwner<SR[K]>>
}

/**
 * What `h` in `view` and `p` in `parts` gain for a component that reads
 * shared state: `reads`, each owner's current value under its local name,
 * or `undefined` for an optional owner that isn't above.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type SharedHelpers<SR> = [keyof SR] extends [never] ? {}
  : { readonly reads: SharedValues<SR> }

/**
 * The requirements a component's `reads` option adds: one
 * `Shared.Of<typeof Owner>` per owner it reads, optional ones aside.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type SharedRequirements<SR> = {
  readonly [K in keyof SR]: IsOptional<SR[K]> extends true ? never
    : Shared.Of<SharedOwner<SR[K]>>
}[keyof SR]

// A send keeps its target in the step's `R` until `make` has dropped the sends to optional owners.
type SendTarget<O> = {
  readonly "~@effect/ui/Component/SendTarget": Types.Invariant<O>
}

type OptionalTargets<SR> = {
  readonly [K in keyof SR]: IsOptional<SR[K]> extends true
    ? SendTarget<SharedOwner<SR[K]>>
    : never
}[keyof SR]

type NamedRequirement<R> = R extends SendTarget<infer O> ? Shared.Of<O> : R

// What a component's own steps require. A send to an optional owner needs none above, and only these steps
// drop it. A step annotated with just `Shared<Name>` has lost its target, so it stays required.
type OwnStepRequirements<U, SR> = NamedRequirement<
  Exclude<RawStepRequirements<U>, OptionalTargets<SR>>
>

/**
 * A `$.loadMore(name)` or `$.reset(name)` an `update` issued, by query
 * name.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface ListIssue {
  readonly name: string
  readonly op: "loadMore" | "reset"
}

/**
 * What `$.set` in `init` returns: a step without `loadMore` and `reset`,
 * which `init` can't issue.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface InitStep<
  in out Model,
  in out Msg,
  in out Events,
  out R = never
> extends Pipeable.Pipeable {
  readonly [StepTypeId]: StepTypeId
  readonly model: Model
  readonly commands: ReadonlyArray<Command.Command<Msg | Noop, R>>
  readonly emitted: ReadonlyArray<Events>
  /** Replaces the Model. */
  set(model: Model): InitStep<Model, Msg, Events, R>
  /** Changes some fields of the Model, as `Step.evolve` does. */
  evolve(fields: UiStruct.EvolveFields<Model>): InitStep<Model, Msg, Events, R>
  /** Runs Commands owned by this instance, as `Step.run` does. */
  run<
    Self extends InitStep<Model, Msg, Events, unknown>,
    const C extends ReadonlyArray<Command.Command<Msg | Noop, unknown>>
  >(
    this: Self,
    ...commands: C
  ): InitStep<
    Model,
    Msg,
    Events,
    RawStepRequirements<Self> | Command.Requirements<C[number]>
  >
  /** Reports to the parent. */
  emit(...emitted: ReadonlyArray<Events>): InitStep<Model, Msg, Events, R>
}

/**
 * An immutable builder for what `init` and `update` return.
 *
 * **Details**
 *
 * Every method returns a new step, so `update` stays pure and a story test can
 * read the result. `set` replaces the Model and doesn't merge. `run` collects
 * the Commands' requirements into `R`, one Command at a time, so two Commands
 * with different requirements give the union. Returning a bare Model from
 * `update` is also fine.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Step<
  in out Model,
  in out Msg,
  in out Events,
  out R = never,
  L = {}
> extends InitStep<Model, Msg, Events, R> {
  /** The load mores and resets issued, in order. */
  readonly lists: ReadonlyArray<ListIssue>
  /** The messages sent to owners above, in order. */
  readonly sends: ReadonlyArray<Send>
  /**
   * The types of the view transition `viewTransition` asked for, `[]` for
   * one without types, and `undefined` when the step asked for none.
   */
  readonly viewTransitionTypes: ReadonlyArray<string> | undefined
  /** Replaces the Model. */
  set(model: Model): Step<Model, Msg, Events, R, L>
  /**
   * Changes some fields of the Model and keeps the rest. Each field takes
   * its new value, or a function from its old value to the new one, with the
   * rules of `UiStruct.evolve`: `$.evolve({ submitting: true, attempts: (n) => n + 1 })`.
   * On a union Model it's a compile error: match the union first.
   */
  evolve(fields: UiStruct.EvolveFields<Model>): Step<Model, Msg, Events, R, L>
  /**
   * Runs Commands owned by this instance: each ends when the instance does,
   * and gets a Scope of its own that closes with it. Their results come back as
   * messages, so a Command whose result isn't this component's message or
   * `Component.noop` is rejected. A result of `Component.noop` sends nothing.
   */
  run<
    Self extends InitStep<Model, Msg, Events, unknown>,
    const C extends ReadonlyArray<Command.Command<Msg | Noop, unknown>>
  >(
    this: Self,
    ...commands: C
  ): Step<
    Model,
    Msg,
    Events,
    RawStepRequirements<Self> | Command.Requirements<C[number]>,
    L
  >
  /** Reports to the parent. */
  emit(...emitted: ReadonlyArray<Events>): Step<Model, Msg, Events, R, L>
  /**
   * Loads the next page of an infinite query. The runtime takes the args from the
   * query, after this `update`'s Model. The page arrives in the query's
   * result, and nothing is issued for a disabled query.
   */
  loadMore(name: InfiniteNames<L>): Step<Model, Msg, Events, R, L>
  /**
   * Drops an infinite query's pages after the first, then refetches it. Every
   * held page is saved in `history.state` on navigation, so this is how a
   * long list keeps that small.
   */
  reset(name: InfiniteNames<L>): Step<Model, Msg, Events, R, L>
  /**
   * Sends `message` to the nearest instance of `owner` above this one, as
   * this `update` applies, before its emits are delivered. `owner` is a
   * headless component with `shares`, and `message` one of the messages it
   * `receives`.
   *
   * **Details**
   *
   * The sender needs no `reads` declaration: the step carries
   * `Shared.Of<typeof owner>` in `R`, as `run` carries a Command's
   * requirements, so the sender compiles only where an owner is above it.
   * A sender whose updates send in more than 100 rounds in one flush
   * fails: an owner and a reader whose updates answer each other would
   * loop.
   */
  send<O extends Headless.Any>(
    owner: O,
    message: NoInfer<SendMessage<Shared.Receives<O>>>
  ): Step<Model, Msg, Events, R | (Shared.Of<O> & SendTarget<O>), L>
  /**
   * Animates the DOM update this step causes with the browser's View
   * Transitions API. `types` tag the transition for CSS
   * `:active-view-transition-type(...)` selectors.
   *
   * **Details**
   *
   * A step asks for the transition and the host decides. `BrowserHost`
   * runs the flush that renders this update inside
   * `document.startViewTransition`. Where the browser lacks the API, or the
   * user prefers reduced motion, the flush commits once without animation. A
   * host with no document, such as `TestHost` or the server, ignores the
   * request. The step's `viewTransitionTypes` and the log's `Update` entry
   * hold it.
   *
   * The rest of the flush runs inside the transition, and every update it
   * renders is animated. Until the browser calls back, about a frame later,
   * the flush waits: its DOM patch, the head, a navigation's scroll and
   * focus, and `afterCommit` work land together inside the callback.
   * Messages and query results that arrive meanwhile render in that callback
   * too, and one for a component below a waiting update is delivered there,
   * with the props the new view gives it. Commands start as soon as
   * `update` returns, so a navigation's history entry is already pushed.
   *
   * The transition's types are merged from the steps that asked before the
   * flush was handed to the browser. A step that asks while the callback is
   * pending renders in that callback, and its types are dropped: the browser
   * already has the transition's types, and it starts no second one.
   *
   * The first mount and hydration never animate. A component can animate
   * its own updates and, from its handler for a child's event, the child's
   * changes that came with the event. The transition is the document's, so a
   * second root asking for one in the same frame skips the first's
   * animation, and both updates still commit. Give each animated element a
   * `viewTransitionName` that is unique among the elements on screen.
   *
   * **Example** (Animating a layout switch)
   *
   * ```ts
   * import { UiSchema } from "@effect/ui"
   * import { Html } from "@effect/ui/html"
   * import { Schema } from "effect"
   *
   * const Layout = Schema.Literals(["grid", "list"])
   * const Message = UiSchema.TaggedEnum({
   *   ClickedLayout: { layout: Layout },
   *   TypedFilter: { value: Schema.String }
   * })
   *
   * export const Gallery = Html.component({
   *   name: "Gallery",
   *   model: Schema.Struct({ layout: Layout, filter: Schema.String }),
   *   message: Message
   * }).make({
   *   init: () => ({ layout: "grid" as const, filter: "" }),
   *   update: {
   *     ClickedLayout: ($, { layout }) => $.evolve({ layout }).viewTransition(["layout-change"]),
   *     TypedFilter: ($, { value }) => $.evolve({ filter: value })
   *   },
   *   view: (h, model) =>
   *     h.ul.class(model.layout).children(
   *       ["a", "b"].map((id) => h.li.key(id).style({ viewTransitionName: `item-${id}` }).children(id))
   *     )
   * })
   * ```
   */
  viewTransition(types?: ReadonlyArray<string>): Step<Model, Msg, Events, R, L>
}

/**
 * `$` in `update`: a step holding the current Model, plus the current props,
 * what the queries hold and the shared state the component reads.
 *
 * **Details**
 *
 * `Cur` is the message being handled: the whole message type in an update
 * function, and one tag's member in a slice for that tag. `$.combine` takes
 * functions over it. `SR` is what the component's `reads` lists.
 *
 * `$.props` is what the Models above the instance give it now, whether or
 * not the flush that renders them has run: an ancestor waiting to render
 * renders before a message reaches the instance. One that no longer
 * renders the instance removes it then, and the message is dropped.
 *
 * `$.reads` follows the same rule: each owner's value from its Model as
 * this `update` runs, which the reader's view may not have rendered yet. A
 * reader that sends to its owner still reads the old value in that
 * `update`, since the send applies after it returns. An `onChange` message
 * says a value changed, and `$.reads` holds the current one: when another
 * reader answers the owner within the same round, `$.reads` is already
 * newer than the `onChange` message being handled.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Update<
  in out Model,
  in out Msg,
  in out Events,
  out Props,
  L = {},
  out Cur = Msg,
  out SR = {}
> extends Step<Model, Msg, Events, never, L> {
  readonly props: Props
  /** The queries' results, as `h.queries` shows them for the Model before this `update`. */
  readonly queries: QueryResults<L>
  /** Each owner's current value, by the name `reads` lists it under, as `h.reads` reads it. */
  readonly reads: SharedValues<SR>
  /** Sends `message` to the nearest instance of `owner` above this one, as `Step`'s `send` does. */
  send<O extends Headless.Any>(
    owner: O,
    message: NoInfer<SendMessage<Shared.Receives<O>>>
  ): Step<Model, Msg, Events, Shared.Of<O> & SendTarget<O>, L>
  /**
   * Sends `message` to the nearest instance of this component above this
   * one, the instance a `reads` entry with `owner: "self"` reads, as this
   * `update` applies, before its emits are delivered. `message` is one of
   * the messages this component `receives`.
   *
   * **Details**
   *
   * Only a component whose `reads` has an entry for `"self"` can send to
   * itself: in any other, `message` is `never`. The send adds nothing to
   * `R`. The outermost instance has none above it, so its send is dropped
   * and logged as `SendDropped`, as a send to any optional owner is. A step
   * records the send as one to this component, which `Story` and `Scene`
   * acknowledge with `sent(Component, message)`.
   *
   * Only `$` has it, and not the steps its other methods return, so send
   * first: `$.send("self", message).set(next)`.
   */
  send(
    owner: "self",
    message: SendMessage<SelfReceives<SR>>
  ): Step<Model, Msg, Events, never, L>
  /**
   * Runs update functions one after another, each with the message this
   * `update` received.
   *
   * **Details**
   *
   * It takes functions over the message being handled. In a slice for one tag
   * that is slices for the same tag, update functions over the whole message
   * type, and functions written inline. In an update over the whole message
   * type, a slice for one tag is rejected.
   *
   * It is a left fold. Each function gets a `$` holding the Model the
   * previous one returned, so a Command it runs sees the earlier
   * changes. The Commands, emitted events, `loadMore` and `reset` of every
   * function are kept, in call order. `$.props`, `$.queries` and `$.reads` are
   * the same for each, as they were when this `update` started. `R` is the union of
   * the functions' requirements.
   */
  combine<
    F extends ReadonlyArray<
      (
        $: Update<Model, Msg, Events, Props, L, Cur, SR>,
        msg: Cur
      ) => Model | Step<Model, Msg, Events, any, L>
    >
  >(
    ...updates: F
  ): Step<Model, Msg, Events, RawStepRequirements<ReturnType<F[number]>>, L>
}

/**
 * `$` in `init`: there's no Model yet, so `set` comes first.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Init<in out Model, in out Msg, in out Events, out Props> {
  readonly props: Props
  /** Sets the first Model. */
  set(model: Model): InitStep<Model, Msg, Events, never>
}

/**
 * The requirements of a step, or `never` for a bare Model.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type StepRequirements<U> = NamedRequirement<RawStepRequirements<U>>

type RawStepRequirements<U> = U extends
  InitStep<infer _Model, infer _Msg, infer _Events, infer R> ? R : never

const StepProto = {
  [StepTypeId]: StepTypeId,
  pipe() {
    return Pipeable.pipeArguments(this, arguments)
  },
  set(this: Step<any, any, any, any>, model: unknown) {
    return stepWith(this, { model })
  },
  evolve(this: Step<any, any, any, any>, fields: Record<PropertyKey, unknown>) {
    return stepWith(this, {
      model: UiStruct.evolve<any>(this.model, fields as never)
    })
  },
  run(
    this: Step<any, any, any, any>,
    ...commands: ReadonlyArray<Command.Command<any, any>>
  ) {
    return stepWith(this, { commands: [...this.commands, ...commands] })
  },
  emit(this: Step<any, any, any, any>, ...emitted: ReadonlyArray<unknown>) {
    return stepWith(this, { emitted: [...this.emitted, ...emitted] })
  },
  loadMore(this: Step<any, any, any, any>, name: string) {
    return stepWith(this, { lists: [...this.lists, { name, op: "loadMore" }] })
  },
  reset(this: Step<any, any, any, any>, name: string) {
    return stepWith(this, { lists: [...this.lists, { name, op: "reset" }] })
  },
  send(this: Step<any, any, any, any>, owner: Headless.Any, message: unknown) {
    return stepWith(this, { sends: [...this.sends, { owner, message }] })
  },
  viewTransition(
    this: Step<any, any, any, any>,
    types: ReadonlyArray<string> = []
  ) {
    return stepWith(this, {
      viewTransitionTypes: mergeTypes(this.viewTransitionTypes, types)
    })
  }
}

const mergeTypes = (
  a: ReadonlyArray<string> | undefined,
  b: ReadonlyArray<string> | undefined
): ReadonlyArray<string> | undefined =>
  a === undefined ? b : b === undefined ? a : [...new Set([...a, ...b])]

const makeStep = (
  model: unknown,
  commands: ReadonlyArray<Command.Command<any, any>>,
  emitted: ReadonlyArray<unknown>,
  lists: ReadonlyArray<ListIssue>,
  sends: ReadonlyArray<Send>,
  viewTransitionTypes: ReadonlyArray<string> | undefined
): Step<any, any, any, any> =>
  Object.assign(Object.create(StepProto), {
    model,
    commands,
    emitted,
    lists,
    sends,
    viewTransitionTypes
  })

const stepWith = (
  step: Step<any, any, any, any>,
  change: Partial<Step<any, any, any, any>>
): Step<any, any, any, any> =>
  Object.assign(
    makeStep(
      step.model,
      step.commands,
      step.emitted,
      step.lists,
      step.sends,
      step.viewTransitionTypes
    ),
    change
  )

type AnyUpdate = ($: Update<any, any, any, any>, msg: unknown) => unknown

type AnyUpdate$ = Update<any, any, any, any> & {
  readonly "~message": unknown
  readonly "~self": Any
}

const UpdateProto = {
  ...StepProto,
  send(this: AnyUpdate$, target: Headless.Any | "self", message: unknown) {
    return StepProto.send.call(
      this,
      target === "self" ? this["~self"] as unknown as Headless.Any : target,
      message
    )
  },
  combine(this: AnyUpdate$, ...updates: ReadonlyArray<AnyUpdate>) {
    const msg = this["~message"]
    let model = this.model
    const commands: Array<Command.Command<any, any>> = [...this.commands]
    const emitted = [...this.emitted]
    const lists = [...this.lists]
    const sends = [...this.sends]
    let viewTransitionTypes = this.viewTransitionTypes
    for (const update of updates) {
      const next = toNext(
        update(
          makeUpdate(
            model,
            this.props,
            this.queries,
            this.reads,
            msg,
            this["~self"]
          ),
          msg
        )
      )
      model = next.model
      commands.push(...next.commands)
      emitted.push(...next.events)
      if (next.lists !== undefined) lists.push(...next.lists)
      if (next.sends !== undefined) sends.push(...next.sends)
      viewTransitionTypes = mergeTypes(viewTransitionTypes, next.viewTransition)
    }
    return makeStep(model, commands, emitted, lists, sends, viewTransitionTypes)
  }
}

// `$` holds the message being handled, for `combine`.
const makeUpdate = (
  model: unknown,
  props: unknown,
  queries: unknown,
  reads: unknown,
  message: unknown,
  self: Any
): Update<any, any, any, any> =>
  Object.assign(Object.create(UpdateProto), {
    model,
    commands: noEffects,
    emitted: noEffects,
    lists: noEffects,
    sends: noEffects,
    viewTransitionTypes: undefined,
    props,
    queries,
    reads,
    "~message": message,
    "~self": self
  })

const toUpdateFn = (
  update: AnyUpdate | { readonly [tag: string]: AnyUpdate }
): AnyUpdate =>
  typeof update === "function"
    ? update
    : ($, msg) => update[(msg as { readonly _tag: string })._tag]($, msg)

const initSet = (model: unknown) =>
  makeStep(
    model,
    noEffects,
    noEffects,
    noEffects,
    noEffects,
    undefined
  ) as Step<
    any,
    any,
    any,
    never
  >
const makeInit = (props: unknown): Init<any, any, any, any> => ({
  props,
  set: initSet
})

// The effects of an `init` or `update` that returned a bare Model: shared, and frozen, since `init` hands
// them to its caller.
const noEffects: ReadonlyArray<never> = Object.freeze([])

/**
 * Returns `true` if `u` is a step.
 *
 * @stability experimental
 * @category guards
 * @since 0.1.0
 */
export const isStep = (
  u: unknown
): u is InitStep<unknown, unknown, unknown, unknown> =>
  Predicate.hasProperty(u, StepTypeId)

const toNext = (result: unknown): Next<any, any, any, any> =>
  isStep(result)
    ? {
      model: result.model,
      commands: result.commands,
      events: result.emitted,
      lists: (result as Step<any, any, any>).lists,
      sends: (result as Step<any, any, any>).sends,
      viewTransition: (result as Step<any, any, any>).viewTransitionTypes
    }
    : { model: result, commands: noEffects, events: noEffects }

/**
 * What a parent needs from a child: its props and events contract and its
 * requirements. Model and message are the child's business and are erased.
 *
 * **Details**
 *
 * A component with `message: Schema.Never` is a valid child, because
 * `update` takes `msg: never`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Mountable<
  in out Props,
  out Events,
  out R = never,
  in Sl extends string = never
> extends
  Mountable.Members<Props, Events, R, Sl>,
  Mountable.Call<Props, Events, R, Sl>
{}

/**
 * An instance's query results, by query name. Opaque: only the runtime and
 * `Story` build and read them.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Results = { readonly [name: string]: unknown }

/**
 * Helper types for `Mountable`.
 *
 * @stability experimental
 * @since 0.1.0
 */
export declare namespace Mountable {
  /**
   * What every component has: `Mountable` without its call signature.
   *
   * @category models
   * @since 0.1.0
   */
  export interface Members<
    in out Props,
    out Events,
    out R = never,
    in Sl extends string = never
  > extends Pipeable.Pipeable {
    readonly [TypeId]: Mountable.Variance<Props, Events, R, Sl>
    /** What `define` returned. `provide` keeps it, so `definition.name` is the name the component was defined with. */
    readonly definition: Definition.Any
    readonly props: Schema.Codec<Props, any>
    readonly model: Schema.Codec<any, any>
    readonly message: Schema.Codec<any, any>
    readonly events: Schema.Codec<Events, any>
    readonly init: (props: Props) => Next<any, any, Events, R>
    /**
     * `queries` is the instance's query results. Without it every result is empty. `shared` is what
     * `$.reads` holds, by local name. Without it, reading a required owner's value throws.
     */
    readonly update: (
      model: any,
      msg: never,
      props: Props,
      queries?: Results | undefined,
      shared?: SharedRecord | undefined
    ) => Next<any, any, Events, R>
    /** `running` answers `h.isRunning` for the instance being rendered. Without it nothing is running. */
    readonly view: (
      model: any,
      props: Props,
      running?:
        | ((name: string, groupKey: string | undefined) => boolean)
        | undefined,
      queries?: Results | undefined,
      /** The instance's path, which `h.id` derives ids from. Without it, the root path `/<name>`. */
      path?: string | undefined,
      /** Answers `h.reads`: an owner's current value. Without it, a component that reads shared state throws. */
      shared?: SharedLookup | undefined,
      /** Where `h.lazy` keeps its nodes between renders. Without it, `h.lazy` builds every time. */
      lazy?: View.LazyStore | undefined
    ) => View.Node<any, R>
    readonly subscriptions:
      | ((
        model: any,
        props: Props,
        queries?: Results | undefined
      ) => ReadonlyArray<Subscription.Subscription<any, R>>)
      | undefined
    /** The instance's head entries, a pure function of its Model, props and queries. */
    readonly head:
      | ((
        model: any,
        props: Props,
        queries?: Results | undefined
      ) => ReadonlyArray<unknown>)
      | undefined
    /** The component's vocabulary, if one was supplied. */
    readonly elements: View.Vocabulary<any> | undefined
    /**
     * Set by `provide`: the Layer built for each instance, in its Scope. Descendants inherit its services.
     * `keys` is what `layerKeys` read, one value per keyed provide, and empty without one.
     */
    readonly layer:
      | ((
        props: Props,
        keys: ReadonlyArray<unknown>
      ) => Layer.Layer<any, any, any>)
      | undefined
    /**
     * Set by a keyed `provide`: the key of each, innermost first. The instance's Layer is built again
     * when any of them changes by `Equal.equals`.
     */
    readonly layerKeys:
      | ReadonlyArray<(props: Props, model: any) => unknown>
      | undefined
    /** Set by `provide`: maps a provided Layer's failure to one of this component's messages. */
    readonly layerFailure:
      | ((failure: AsyncResult.Failure<never, any>) => any)
      | undefined
    /** Set by `provide` when every provided Layer is a value: shared by every instance resolving from one Env. */
    readonly sharedLayer: Layer.Layer<any, any, any> | undefined
    /** `false` when a `provide` opted out of the server: the server never builds the Layer and defers the instance. */
    readonly layerOnServer: boolean
    /** The bound `queries`, read by the runtime and `Story`. `undefined` without any. */
    readonly "~queries": unknown
  }

  /**
   * The call signature of a component. It takes the parent's `h`, or the `s`
   * of an `h.keepAlive` block to keep the child alive. In a block without a
   * predicate, the key must be a literal, or left out. `Result` is what
   * `fallback` is passed: a lazy component's is also passed `Initial`.
   *
   * @category models
   * @since 0.1.0
   */
  export interface Call<
    in out Props,
    out Events,
    out R = never,
    in Sl extends string = never,
    out Result = AsyncResult.Failure<never, unknown>
  > {
    /**
     * Declares a child of this component in a parent's view, from the parent's
     * `h`, which types `onEmit`, `onFailure` and `fallback` against the
     * parent's message type. The component's requirements, and the fallback's,
     * surface in the parent's. A component whose props are erased, such as a
     * `Component.Any`, takes `props` even when it needs none.
     *
     * Called with the `s` of the parent's `h.keepAlive`, the child is kept
     * alive: it lives until the block's predicate is false for its key, or the
     * parent ends, whether or not the view writes it.
     */
    // The type parameters don't depend on the component, so a union of
    // components without slots is callable. `SC` is the slots map as passed:
    // `SlotOptions` checks its names and content, since a constraint that
    // failed would stand in for it and accept the map. With `Msg` given and
    // `SC` not, `SC` isn't inferred, and nothing could check the map's names
    // or requirements, so the call takes no slots.
    <
      Msg,
      RF = never,
      const SC extends object = never,
      Ends extends boolean = never,
      const K extends string = string
    >(
      h: View.HelperBase<Msg, unknown> & { readonly "~keepAlive"?: Ends },
      options:
        & View.Child.KeepAliveOptions<Props, Events, NoInfer<Msg>, K, Ends>
        & {
          /**
           * Shown if the child fails, until its key changes, and while a lazy
           * component's module loads. Without it, the child is blank.
           */
          readonly fallback?:
            | ((result: Result) => View.Content<NoInfer<Msg>, RF>)
            | undefined
        }
        & SlotOptions<Sl, SC, NoInfer<Msg>>
        // Erased props are required, so every component is a `Component.Any`:
        // its options must fit every component's, including one whose props
        // are required.
        & (0 extends 1 & Props ? { readonly props: Props } : {})
    ): View.Child<Msg, R | NoInfer<RF> | SlotRequirements<SC>>
  }

  /**
   * Phantom variance for a component's props, events, requirements and
   * slots.
   *
   * @category models
   * @since 0.1.0
   */
  export interface Variance<
    in out Props,
    out Events,
    out R,
    in Sl extends string = never
  > {
    readonly _Props: Types.Invariant<Props>
    readonly _Events: Types.Covariant<Events>
    readonly _R: Types.Covariant<R>
    readonly _Sl: Types.Contravariant<Sl>
  }
}

/**
 * A component definition.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Component<
  out Name extends string,
  in out Props,
  in out Model,
  in out Msg,
  out Events,
  out R = never,
  out V extends View.Elements = never,
  out L = {},
  in Sl extends string = never
> extends
  Members<Name, Props, Model, Msg, Events, R, V, L, Sl>,
  Mountable.Call<Props, Events, R, Sl>
{}

/**
 * What a component has: a `Component` without its call signature.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Members<
  out Name extends string,
  in out Props,
  in out Model,
  in out Msg,
  out Events,
  out R = never,
  out V extends View.Elements = never,
  out L = {},
  in Sl extends string = never
> extends Mountable.Members<Props, Events, R, Sl> {
  /** What `define` returned. `provide` keeps it, so `definition.name` is the name the component was defined with. */
  readonly definition: Definition.Of<Name>
  readonly model: Schema.Codec<Model, any>
  readonly message: Schema.Codec<Msg, any>
  readonly init: (props: Props) => Next<Model, Msg, Events, R>
  readonly update: (
    model: Model,
    msg: Msg,
    props: Props,
    queries?: Results | undefined,
    shared?: SharedRecord | undefined
  ) => Next<Model, Msg, Events, R>
  readonly view: (
    model: Model,
    props: Props,
    running?:
      | ((name: string, groupKey: string | undefined) => boolean)
      | undefined,
    queries?: Results | undefined,
    path?: string | undefined,
    shared?: SharedLookup | undefined,
    lazy?: View.LazyStore | undefined
  ) => View.Node<Msg, R>
  readonly subscriptions:
    | ((
      model: Model,
      props: Props,
      queries?: Results | undefined
    ) => ReadonlyArray<Subscription.Subscription<Msg, R>>)
    | undefined
  readonly head:
    | ((
      model: Model,
      props: Props,
      queries?: Results | undefined
    ) => ReadonlyArray<View.HeadEntry<V>>)
    | undefined
  readonly layerFailure:
    | ((failure: AsyncResult.Failure<never, any>) => Msg)
    | undefined
  readonly "~V"?: V
  readonly "~L"?: L
}

/**
 * The type id of a headless component.
 *
 * @stability experimental
 * @category type ids
 * @since 0.1.0
 */
export const HeadlessTypeId = "~@effect/ui/Component/Headless" as const

/**
 * The type id of a headless component.
 *
 * @stability experimental
 * @category type ids
 * @since 0.1.0
 */
export type HeadlessTypeId = typeof HeadlessTypeId

/**
 * A component with `parts` and no `view`. Whoever declares it, with
 * `Listbox(h, { key, props, view })`, writes its whole view from the parts.
 *
 * **Details**
 *
 * It keeps its own Model, `update`, Commands and Scope. It isn't a
 * `Mountable`, so it can't be a root, a page or a feature.
 *
 * The `view` closure given to the call is the consumer's code. A child
 * declared in it, its `onEmit` and `onFailure` messages, and a fallback in
 * it all belong to the consumer. A closure that throws fails the headless
 * child, logged with the source `content`, and the child shows its fallback.
 *
 * A part applied to an element adds a layer that the headless instance
 * owns. When the element's event fires, each layer's handler runs and its
 * message goes to its owner: the deepest headless owner first, and the
 * consumer last. A layer's `preventDefault: true` cancels the default only
 * when that layer's handler returned a message. `preventDefault: "always"`
 * from any layer wins, and two layers setting any other option of one event
 * fail the render that applies them. Handle keys on the part the user focuses, such as an
 * input or a trigger, rather than on a container around it.
 *
 * A part's ref and mount belong to its owner: `HtmlCommand.focus` in the
 * headless `update` reaches its own ref, and the mount runs in a Scope of the
 * headless instance while the part stays applied to the element.
 *
 * A headless component has no children of its own, except the ones its
 * `parts` declares with `p.child` to build on other headless components.
 * Those report to it and hold the consumer's closure
 * inside them: a Drawer built on a Dialog runs its consumer's closure at
 * `Consumer/Drawer[]/Dialog[]`.
 *
 * Parts need no runtime: `Story.parts` builds them from a Model and props
 * alone. `p.id` is derived from the instance's path, so ids match on the
 * server and the client and differ between instances, and outside a mount
 * they're under the component's own name.
 *
 * Lists are data: a part reads its items from props, and takes an item as an
 * argument where the consumer applies it. Richer row content stays in the
 * consumer's closure, looked up by id.
 *
 * A headless child renders again whenever its consumer does, since the
 * closure is part of the consumer's view, and its own `update` renders only
 * the closure. When the consumer renders often, wrap the headless child in a
 * small normal component of its own. `Router.prefetch` doesn't walk into
 * closures, so it never prefetches the queries of children declared there.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Headless<
  in out Props,
  out Events,
  out Parts,
  out R = never,
  in out Rcv = never,
  in Sh = never,
  in SV = never,
  in Rp = never
> extends Pipeable.Pipeable {
  /**
   * Declares a child of this component in a parent's view, from the parent's
   * `h`. `view` is the child's whole view, built from its parts. Its
   * requirements, the view's and the fallback's surface in the parent's.
   * For an owner of shared state, the view's `Shared.Of<typeof Owner>` is
   * removed: the readers and senders in it have this owner above them.
   */
  <Msg, RV = never, RF = never>(
    h: View.HelperBase<Msg, unknown>,
    options:
      & View.Child.Options<Props, Events, NoInfer<Msg>>
      & {
        /** Shown if the child fails, until its key changes. Without it, the child is blank. */
        readonly fallback?:
          | ((
            result: AsyncResult.Failure<never, unknown>
          ) => View.Content<NoInfer<Msg>, RF>)
          | undefined
        /**
         * The child's whole view, from its parts. It's the parent view's code:
         * the children it declares report to the parent, and it runs again
         * whenever the parent or the child renders.
         */
        readonly view: (parts: Parts) => View.Content<NoInfer<Msg>, RV>
        /** A headless child has no slots: its `view` is the parent's, and shows what the parent would pass. */
        readonly slots?: never
      }
  ): View.Child<Msg, R | Exclude<RV, Sh> | NoInfer<RF>>
  readonly [HeadlessTypeId]: {
    readonly _Props: Types.Invariant<Props>
    readonly _Events: Types.Covariant<Events>
    readonly _Parts: Types.Covariant<Parts>
    readonly _R: Types.Covariant<R>
    readonly _Rcv: Types.Invariant<Rcv>
    readonly _Sh: Types.Contravariant<Sh>
    readonly _SV: Types.Contravariant<SV>
    readonly _Rp: Types.Contravariant<Rp>
  }
  /** What `define` returned. `provide` keeps it, so `definition.name` is the name the component was defined with. */
  readonly definition: Definition.Any
  readonly props: Schema.Codec<Props, any>
  readonly model: Schema.Codec<any, any>
  readonly message: Schema.Codec<any, any>
  readonly events: Schema.Codec<Events, any>
  /**
   * The Schema of the messages an owner takes from the components below it,
   * the cases of `message` listed in `receives`. `Schema.Never` for a
   * component that isn't an owner.
   */
  readonly receives: Schema.Codec<Rcv, any>
  readonly init: (props: Props) => Next<any, any, Events, R>
  readonly update: (
    model: any,
    msg: never,
    props: Props,
    queries?: Results | undefined
  ) => Next<any, any, Events, R>
  /**
   * The parts for one render: plain values and decorators stamped with
   * `owner`, or, for a component that builds on another with `p.child`, the
   * child it declares, which a host expands into the parts.
   */
  readonly parts: (
    model: any,
    props: Props,
    context: PartsContext
  ) => Parts | Composed<Parts, any, any>
  readonly subscriptions:
    | ((
      model: any,
      props: Props,
      queries?: Results | undefined
    ) => ReadonlyArray<Subscription.Subscription<any, R>>)
    | undefined
  readonly head:
    | ((
      model: any,
      props: Props,
      queries?: Results | undefined
    ) => ReadonlyArray<unknown>)
    | undefined
  readonly elements: View.Vocabulary<any> | undefined
  readonly "~queries": unknown
}

/**
 * What a host of headless instances gives `parts` for one render: who owns
 * the layers, and the instance's path. Plain data, so a story builds it with
 * no runtime.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface PartsContext {
  readonly owner: View.Owner
  readonly running?:
    | ((name: string, groupKey: string | undefined) => boolean)
    | undefined
  readonly queries?: Results | undefined
  /** Answers `p.reads`: an owner's current value. Without it, a component that reads shared state throws. */
  readonly shared?: SharedLookup | undefined
}

/**
 * How a host answers `h.reads` and `p.reads`: the current value of the
 * owner the reader lists, from the nearest instance above it in a running
 * tree, or from what a story was given.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type SharedLookup = (owner: Headless.Any, optional?: boolean) => unknown

/**
 * What a reader's `$.reads` holds: each owner's value by the local name its
 * `reads` lists it under. The runtime records it on each `Update`, so a
 * replay hands it back.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type SharedRecord = { readonly [name: string]: unknown }

/**
 * Helper types for `Headless`.
 *
 * @stability experimental
 * @since 0.1.0
 */
export declare namespace Headless {
  /**
   * Any headless component.
   *
   * @category models
   * @since 0.1.0
   */
  // `any` doesn't stand in for `never` in an invariant parameter, so one that receives nothing is listed apart.
  // What an owner shares is contravariant: `never` takes every owner, and every component that isn't one.
  export type Any =
    | Headless<any, any, any, any, any, never>
    | Headless<any, any, any, any, never, never>
  /**
   * The requirements of a headless component.
   *
   * @category utility types
   * @since 0.1.0
   */
  export type Requirements<C> = C extends
    Headless<infer _P, infer _E, infer _Parts, infer R, infer _Rcv> ? R
    : never
  /**
   * The parts of a headless component.
   *
   * @category utility types
   * @since 0.1.0
   */
  export type Parts<C> = C extends
    Headless<infer _P, infer _E, infer Parts, infer _R, infer _Rcv> ? Parts
    : never
}

/**
 * `p` in a headless component's `parts`: the props, the instance's ids, and
 * `part`, which declares a decorator for one tag.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface PartsHelper<Msg, Props, V extends View.Elements> {
  readonly props: Props
  isRunning<Args, G extends string>(
    command: Command.Definition<Args, any, boolean, any, G>,
    ...group: Command.GroupArg<Args, G>
  ): boolean
  /** An id for an element of this instance, the same on the server and the client. */
  id(name: string, key?: string | number | undefined): string
  /**
   * A part for one tag, or for any of a list of tags. `decorate` gets an
   * empty builder of the tag the consumer used, bound to this component's
   * message type, and any other arguments the consumer passes after its own
   * builder.
   *
   * **Details**
   *
   * The part takes only builders of the tags it lists, checked by tag name
   * in the types and again when it's applied.
   *
   * The part returns the consumer's builder, so the consumer chains on it
   * and gives it children. Children `decorate` adds with `children` come
   * before the ones the consumer adds after the part. A function it sets
   * with `forward` runs when the element is built, on the builder as the
   * consumer finished it.
   */
  part<
    K extends keyof View.Tags<V, Msg> & string,
    Args extends ReadonlyArray<any>,
    R2 = never
  >(
    tag: K | readonly [K, ...ReadonlyArray<K>],
    decorate: (
      builder: PartBuilder<View.Tags<V, Msg>[K]>,
      ...args: Args
    ) => View.ElementBuilder<Msg, R2, any, any, any>
  ): View.Part<PartTag<View.Tags<V, Msg>[K]>, Args, R2>
  /** A part for any element, over the host-neutral builder. */
  part<Args extends ReadonlyArray<any>, R2 = never>(
    decorate: (
      builder: View.ContainerBuilder<Msg>,
      ...args: Args
    ) => View.ElementBuilder<Msg, R2, any, any, any>
  ): View.Part<string, Args, R2>
  /**
   * Declares a headless child that this component owns, and turns the
   * child's parts into the ones the consumer gets. `parts` returns it in
   * place of a record.
   *
   * **Details**
   *
   * The consumer's `view` runs inside the child's: `options.parts` gets the
   * child's parts and returns what the consumer's `view` gets. It may return
   * another `p.child(...)`, so a component can build on two others. A throw
   * in it fails this component with the source `view`.
   *
   * The child belongs to this component, not to the consumer. Its `onEmit`
   * and `onFailure` return this component's messages, which go to its
   * `update`. A failed child stays failed and blank, and this component
   * hears of it through `onFailure`.
   *
   * The child takes no `view`, `slots` or `fallback`.
   *
   * **Example** (A drawer built on a dialog)
   *
   * ```ts
   * import { UiSchema } from "@effect/ui"
   * import { Html } from "@effect/ui/html"
   * import { Schema } from "effect"
   *
   * const DialogMessage = UiSchema.TaggedEnum({ Opened: {}, Closed: {} })
   * const DialogEvents = UiSchema.TaggedEnum({ Dismissed: {} })
   *
   * const Dialog = Html.component({
   *   name: "Dialog",
   *   model: Schema.Boolean,
   *   message: DialogMessage,
   *   events: DialogEvents
   * }).make({
   *   init: () => false,
   *   update: ($, message) =>
   *     DialogMessage.match(message, {
   *       Opened: () => true,
   *       Closed: () => $.set(false).emit(DialogEvents.Dismissed())
   *     }),
   *   parts: (p, open) => ({
   *     open,
   *     trigger: p.part("button", (b) => b.on("click", DialogMessage.Opened())),
   *     close: p.part("button", (b) => b.on("click", DialogMessage.Closed()))
   *   })
   * })
   *
   * const DrawerMessage = UiSchema.TaggedEnum({ DismissedDialog: {} })
   *
   * const Drawer = Html.component({
   *   name: "Drawer",
   *   model: Schema.Number,
   *   message: DrawerMessage
   * }).make({
   *   init: () => 0,
   *   update: ($) => $.model + 1,
   *   parts: (p, dismissals) =>
   *     p.child(Dialog, {
   *       onEmit: () => DrawerMessage.DismissedDialog(),
   *       parts: (dialog) => ({ ...dialog, dismissals })
   *     })
   * })
   * ```
   */
  child<P, E, Pt, R2, Rcv, Sh2, Out>(
    component: Headless<P, E, Pt, R2, Rcv, Sh2, never, never>,
    options:
      & View.Child.Options<P, E, Msg>
      & {
        /** The parts the consumer's `view` gets, from the child's. */
        readonly parts: (parts: Pt) => Out
        readonly view?: never
        readonly slots?: never
        readonly fallback?: never
      }
  ): Composed<
    Composed.Parts<Out>,
    R2 | Composed.Requirements<Out>,
    Sh2 | Composed.Shares<Out>
  >
}

/**
 * The type id of what `p.child` returns.
 *
 * @stability experimental
 * @category type ids
 * @since 0.1.0
 */
export const ComposedTypeId: "~@effect/ui/Component/Composed" =
  child.ComposedTypeId

/**
 * The type id of what `p.child` returns.
 *
 * @stability experimental
 * @category type ids
 * @since 0.1.0
 */
export type ComposedTypeId = typeof ComposedTypeId

/**
 * What `p.child` returns: a headless child the component owns, with the
 * parts the consumer gets inside it. `make` unwraps it, so the component's
 * parts are `Parts`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Composed<out Parts, out R = never, out Sh = never> {
  readonly [ComposedTypeId]: {
    readonly _Parts: Types.Covariant<Parts>
    readonly _R: Types.Covariant<R>
    readonly _Sh: Types.Covariant<Sh>
  }
}

/**
 * Helper types for `Composed`.
 *
 * @stability experimental
 * @since 0.1.0
 */
export declare namespace Composed {
  /**
   * The parts a consumer's `view` gets from what `parts` returned.
   *
   * @category utility types
   * @since 0.1.0
   */
  export type Parts<P> = P extends Composed<infer Parts, infer _R, infer _Sh>
    ? Parts
    : P
  /**
   * The requirements of the children declared with `p.child`.
   *
   * @category utility types
   * @since 0.1.0
   */
  export type Requirements<P> = P extends
    Composed<infer _Parts, infer R, infer _Sh> ? R : never
  /**
   * The shared state of the owners declared with `p.child`, which every
   * reader in the consumer's `view` has above it.
   *
   * @category utility types
   * @since 0.1.0
   */
  export type Shares<P> = P extends Composed<infer _Parts, infer _R, infer Sh>
    ? Sh
    : never
}

/**
 * The chain type of a tag's root builder: what a part's `decorate` gets.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type PartBuilder<T> = T extends
  { readonly attr: (...args: any) => infer B } ? B : never

/**
 * The tag a tag's builder declares, which a part checks: `string` for a
 * vocabulary that doesn't declare its tags.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type PartTag<T> = T extends
  { readonly "~Tag"?: infer Tag extends string | undefined } ?
  Exclude<Tag, undefined>
  : never

/**
 * What `h` gains in `view` for a component with queries.
 *
 * **Details**
 *
 * `queries` holds each query's result, as `$.queries` does in `update`.
 *
 * `patched` tells, per single or infinite query, whether the value includes an
 * optimistic patch the server hasn't confirmed. It is per entry, not per
 * instance. `queryMany` entries have no `patched` flag.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type QueryHelpers<L> = [keyof L] extends [never] ? {} : {
  readonly queries: QueryResults<L>
  readonly patched: { readonly [K in SingleNames<L>]: boolean }
}

/**
 * What `h` gains in `view` for a component with slots: `h.slots.<name>`,
 * the outlet that places what the parent passed for that slot.
 *
 * **Details**
 *
 * An outlet is opaque. It renders nothing when the parent passed nothing,
 * and the view can't tell whether it did.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type SlotHelpers<Sl extends string> = [Sl] extends [never] ? {}
  : { readonly slots: { readonly [K in Sl]: View.Outlet } }

// The `slots` a call takes: none for a component without slots, and otherwise only the declared names,
// each with content for the parent's messages.
type SlotOptions<Sl extends string, SC, Msg> = [Sl] extends [never] ?
  { readonly slots?: never }
  : { readonly slots?: SC & CheckedSlots<Sl, SC, Msg> }

// One shape over the names of every branch of a conditional map, whose `keyof` holds only the names
// every branch has: `SC` must fit it, so each branch is checked whole, and one can't pass by fitting
// another's shape. Optional, as a name may be in one branch only. Mapped over the map's own keys, so an
// interface needs no index signature.
type CheckedSlots<Sl extends string, SC, Msg> = {
  readonly [K in SlotNames<SC>]?: K extends Sl ? View.Input<Msg, any> : never
}
type SlotNames<SC> = SC extends unknown ? keyof SC : never
type SlotRequirements<SC> = SC extends unknown ? View.Requirements<SC[keyof SC]>
  : never

/**
 * Any component.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Any = Mountable<any, any, any>

/**
 * The props of a component.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type Props<C> = C extends
  Mountable.Members<infer P, infer _Events, infer _R> ? P : never

/**
 * The events of a component.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type Events<C> = C extends
  Mountable.Members<infer _Props, infer E, infer _R> ? E : never

/**
 * The requirements of a component: the Commands and feature services it uses.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type Requirements<C> = C extends
  Mountable.Members<infer _Props, infer _Events, infer R> ? R : never

/**
 * The Model of a component.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type Model<C> = C extends Members<
  infer _N,
  infer _P,
  infer M,
  infer _Msg,
  infer _E,
  infer _R,
  infer _V,
  infer _L
> ? M
  : never

/**
 * The message type of a component.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type Message<C> = C extends Members<
  infer _N,
  infer _P,
  infer _M,
  infer Msg,
  infer _E,
  infer _R,
  infer _V,
  infer _L
> ? Msg
  : never

/**
 * The names of the slots a component declares, `never` for one without slots.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type Slots<C> = C extends
  Mountable.Members<infer _Props, infer _Events, infer _R, infer Sl> ? Sl
  : never

/**
 * A `query` entry of `queries`, as the types see it: one query, or a list
 * of pages when the query is a `Query.InfiniteService`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface QueryOne<out R extends Query.Query.Any> {
  readonly _tag: "QueryOne"
  readonly query: R
}

/**
 * A `queryMany` entry of `queries`, as the types see it: one query at many
 * args.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface QueryMany<out R extends Query.Query.Any> {
  readonly _tag: "QueryMany"
  readonly query: R
}

/**
 * A component's queries, as the types see them: per name in `queries`, a
 * `QueryOne` or a `QueryMany`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type QuerySpec = {
  readonly [name: string]: QueryOne<any> | QueryMany<any>
}

type OneQuery<M> = [M] extends [Query.Query.Any] ?
  { readonly "~error": "an entry takes one of query and queryMany" }
  : unknown
type ManyQuery<R> = [R] extends [Query.InfiniteQuery.Any] ?
  { readonly "~error": "an infinite query takes query, not queryMany" }
  : unknown
type DropPrevious<M> = [M] extends [Query.Query.Any] ?
  { readonly "~error": "dropPrevious is for a query entry, not queryMany" }
  : boolean

/**
 * The queries of a component.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type Queries<C> = C extends { readonly "~L"?: infer L }
  ? [L] extends [QuerySpec] ? L : {}
  : {}

/**
 * The names of single and infinite query entries, used as keys in `h.patched`.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type SingleNames<L> =
  & { readonly [K in keyof L]: L[K] extends QueryOne<any> ? K : never }[keyof L]
  & string

/**
 * The names of the infinite queries: `$.loadMore` and `$.reset` take one.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type InfiniteNames<L> =
  & {
    readonly [K in keyof L]: L[K] extends QueryOne<infer R>
      ? R extends Query.InfiniteQuery.Any ? K : never
      : never
  }[keyof L]
  & string

/**
 * The names of the `queryMany` queries.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type KeyedNames<L> =
  & {
    readonly [K in keyof L]: L[K] extends QueryMany<any> ? K : never
  }[keyof L]
  & string

/**
 * The services a component's queries add to its requirements: the queries
 * themselves, never what their fetchers use.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type QueryServices<L> = ServiceOf<L[keyof L]>

type ServiceOf<D> = D extends
  { readonly query: { readonly Identifier: infer Self } } ? Self : never

/**
 * One query as `h.queries`, `$.queries`, and `queries` in `head`,
 * `subscriptions` and a query's `args` open it.
 *
 * **Details**
 *
 * A single query opens to an `AsyncResult` of its `Query`'s success and error,
 * an infinite query to an `AsyncResult` of its `InfiniteData`, and a `queryMany`
 * query to its entries in the order of its args. An enabled single or infinite
 * query exposes the result for its current args. Until one is stored, it keeps
 * the last Success with `waiting: true`, unless `dropPrevious` is set.
 * Otherwise it returns `Initial`, waiting only while enabled.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type QueryResultOf<D> = D extends QueryMany<infer R> ? KeyedResults<R>
  : D extends QueryOne<infer R> ?
    R extends Query.InfiniteQuery.Any ?
      AsyncResult.AsyncResult<InfiniteData<R>, Query.Query.Error<R>>
    : AsyncResult.AsyncResult<Query.Query.Success<R>, Query.Query.Error<R>>
  : never

/**
 * An infinite query as `h.queries` opens it, inside its `AsyncResult`.
 *
 * **Details**
 *
 * `items` flattens the patched pages, keeping the first item for each
 * definition `key`. `pages` is the page array. `more` is `Loading` while a
 * load more runs or is queued, and `Failed` with the last load-more error.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface InfiniteData<R extends Query.InfiniteQuery.Any> {
  readonly items: ReadonlyArray<Query.InfiniteQuery.Item<R>>
  readonly pages: ReadonlyArray<Query.InfiniteQuery.Page<R>>
  readonly more: Query.More<Query.Query.Error<R>>
}

/**
 * One entry of a `queryMany` query as `h.queries` opens it: the args from
 * the query, the opened result and whether the value includes an
 * unconfirmed patch.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface KeyedEntry<R extends Query.Query.Any> {
  readonly args: Query.Query.Args<R>
  readonly result: AsyncResult.AsyncResult<
    Query.Query.Success<R>,
    Query.Query.Error<R>
  >
  readonly patched: boolean
}

/**
 * A `queryMany` query as `h.queries` opens it: an entry per unique args the
 * query returns, in its order, and `get` to find one entry by its args.
 *
 * **Details**
 *
 * A key with no settled result opens as `Initial`, waiting. `get` is `None`
 * for args the query doesn't currently return. Entries carry no key: write
 * each row's `.key(...)` by hand.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface KeyedResults<R extends Query.Query.Any>
  extends ReadonlyArray<KeyedEntry<R>>
{
  readonly get: (args: Query.Query.Args<R>) => Option.Option<KeyedEntry<R>>
}

/**
 * One key of a `queryMany` query whose result changed, as its `onChange`
 * gets it.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface KeyedChange<R extends Query.Query.Any> {
  readonly args: Query.Query.Args<R>
  readonly result: AsyncResult.AsyncResult<
    Query.Query.Success<R>,
    Query.Query.Error<R>
  >
}

/**
 * What a query's `args` returns: the args of a `query` entry's Query, or
 * `undefined` to disable it, and an array of args for a `queryMany`, empty
 * to watch nothing.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type ArgsFor<S, M> = M extends Query.Query.Any ?
  ReadonlyArray<Query.Query.Args<M>>
  : Query.Query.Args<S> | undefined

/**
 * A query's `onChange`: a `query` entry's gets its result as `h.queries` opens it,
 * and a `queryMany`'s gets its entries and the keys whose result changed.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type OnChange<S, M, Msg> = M extends Query.Query.Any
  ? (results: KeyedResults<M>, changes: ReadonlyArray<KeyedChange<M>>) => Msg
  : S extends Query.Query.Any ? (result: QueryResultOf<QueryOne<S>>) => Msg
  : never

/**
 * Returns `true` if `u` is a component.
 *
 * @stability experimental
 * @category guards
 * @since 0.1.0
 */
export const isComponent = (u: unknown): u is Any =>
  Predicate.hasProperty(u, TypeId)

// A component is a function, so the prototypes keep `call`, `apply` and `bind`.
const Proto = Object.assign(Object.create(Function.prototype), {
  [TypeId]: {
    _Props: (_: never) => _,
    _Events: (_: never) => _,
    _R: (_: never) => _,
    _Sl: (_: never) => _
  },
  pipe() {
    return Pipeable.pipeArguments(this, arguments)
  },
  "~sync"(this: Any, inst: unknown, next: unknown, seq: unknown) {
    if (this["~queries"] !== undefined) {
      queryCore.loaded!.run.sync(inst as never, next as never)
    } else if (this.subscriptions !== undefined) {
      subscriptionCore.loaded?.(inst as never)
    }
    if (sharing(this) || (next as Next<any, any, any, any>)?.sends?.length) {
      sharedRun.sync(inst as never, next as never, seq as never)
    }
  },
  "~first"(this: Any, inst: unknown) {
    if (sharing(this)) sharedRun.first(inst as never)
    if (this["~queries"] !== undefined) {
      queryCore.loaded!.run.first(inst as never)
    }
    if (this.head !== undefined) heads.loaded?.(inst as never)
    if (this.elements?.head !== undefined) heads.trackFold(inst as never)
  },
  "~kept": keeper
})

const sharing = ({ definition }: Any): boolean =>
  definition.shares !== undefined || definition.reads !== undefined

const HeadlessProto = Object.assign(Object.create(Function.prototype), {
  [HeadlessTypeId]: {
    _Props: (_: never) => _,
    _Events: (_: never) => _,
    _Parts: (_: never) => _,
    _R: (_: never) => _,
    _Rcv: (_: never) => _,
    _Sh: (_: never) => _,
    _SV: (_: never) => _,
    _Rp: (_: never) => _
  },
  pipe: Proto.pipe,
  "~sync": Proto["~sync"],
  // Only a headless component shares state.
  "~render": sharedRun.rendered,
  "~first": Proto["~first"],
  "~kept": keeper,
  "~owned": owned,
  "~content"(
    this: Headless.Any,
    model: unknown,
    props: unknown,
    running: View.Running | undefined,
    queries: unknown,
    _: unknown,
    shared: SharedLookup | undefined,
    inst: { readonly at: { readonly v: View.Child<any, any> } } & View.Owner
  ) {
    return View.toNode(
      child.expand(
        (this as any).parts(model, props, {
          owner: inst,
          running,
          queries,
          shared
        }),
        inst.at.v.view!,
        failed
      )
    )
  }
})

// A callable component: calling it declares a child of it. The function's own
// `name` is left alone. Its fields are defined, not assigned: a function given
// more than 15 properties by assignment, or a new `name`, switches to slow,
// dictionary-mode properties, and the runtime reads them on every instance.
const makeComponent = (
  proto: object,
  fields: { readonly [key: string]: unknown }
): any => {
  const keeps = proto === Proto
  const component = (h: any, options: child.Options) =>
    child.make(component as any, options, keeps ? h["~alive"] : undefined)
  Object.setPrototypeOf(component, proto)
  for (const key of Object.keys(fields)) {
    Object.defineProperty(component, key, {
      value: fields[key],
      enumerable: true,
      writable: true,
      configurable: true
    })
  }
  return component
}

/**
 * Whether a value is a headless component.
 *
 * @stability experimental
 * @category guards
 * @since 0.1.0
 */
export const isHeadless = (u: unknown): u is Headless.Any =>
  Predicate.hasProperty(u, HeadlessTypeId)

// Only a headless component can own shared state: it wraps its readers with its `view` closure.
type OwnersAreHeadless<SV> = [SV] extends [never] ? unknown : {
  readonly "Only a headless component can share state: finish it without view":
    never
}

type OnlyOwnersOmitParts<Sl, SV> = [Sl] extends [never]
  ? [SV] extends [never] ? { readonly parts: never } : unknown
  : { readonly parts: never }

// The owners `reads` lists: none when it's left out, and `SR` is still exactly its constraint. A map with
// a string index of its own is kept.
type Listed<SR> = (<T>() => T extends SR ? 1 : 2) extends
  (<T>() => T extends SharedReads ? 1 : 2) ? {} : SR

type ReportId = PartsHelper<never, unknown, any>["id"]

// One entry of `reads`, for the owner inferred for it: `report` and `onChange` take their parameter types from
// here. `E` is the owner when the entry is written as one, and this checks it against the owner. An entry for
// `"self"` reads the component's own `shares`, `SV` and `Rp`, and is optional.
type SharedEntry<E, O, Model, Props, Msg, SV, Rp> = [E] extends [Headless.Any] ?
  O
  : [O] extends ["self"] ? {
      readonly owner: O
      readonly optional: true
      readonly report?:
        | ([Rp] extends [never] ?
          "This component collects no reports: its shares has no collects"
          : (model: Model, props: Props, id: ReportId) => Rp)
        | undefined
      readonly onChange?: ((value: SV) => Msg) | undefined
    }
  : {
    readonly owner: O
    readonly optional?: boolean | undefined
    readonly report?:
      | ([Shared.Report<O>] extends [never] ?
        "This owner collects no reports: its shares has no collects"
        : (model: Model, props: Props, id: ReportId) => Shared.Report<O>)
      | undefined
    readonly onChange?: ((value: Shared.Value<O>) => Msg) | undefined
  }

// What `shares` reads of its own kind: `SV` once a `schema` or an annotated return fixes it. Inferred from
// `value` alone it would be circular, so the read is an error naming the fix.
type SelfAbove<SV> = [SV] extends [never] ?
  "Give shares a schema, or annotate what value returns, to read its own kind in it"
  : SV

type SharesReads<SO, SOpt, SA> = {
  readonly [K in keyof SO]: [SO[K]] extends ["self"] ? SA | undefined
    : [SOpt[K & keyof SOpt]] extends [true] ? Shared.Value<SO[K]> | undefined
    : Shared.Value<SO[K]>
}

type SharesValue<Model, Props, SO, SOpt, SA, SV> = (
  $: {
    readonly model: Model
    readonly props: Props
    readonly reads: SharesReads<SO, SOpt, SA>
  }
) => SV

// An owner listed in `reads` is a headless component with `shares`, or the component itself. `make` checks
// that one which reads itself shares: `SV` here would be fixed before `shares` is inferred.
type OwnersOnly<SO> = {
  readonly [K in keyof SO]: [SO[K]] extends ["self"] ? unknown
    : [Shared.Of<SO[K]>] extends [never] ? {
        readonly owner:
          "A component in reads must be a headless component with shares"
      }
    : unknown
}

// Whether `reads`, as `define` keeps it, has an entry for `"self"`.
type ReadsSelf<SR> = {
  readonly [K in keyof SR]: SR[K] extends { readonly owner: infer O }
    ? "self" extends O ? true : never
    : never
}[keyof SR]

type SelfReceives<SR> = {
  readonly [K in keyof SR]: SR[K] extends { readonly owner: infer O } ?
    "self" extends O ? Shared.Receives<Exclude<O, "self">> : never
    : never
}[keyof SR]

// A component that reads its own kind must be an owner itself.
type SelfShares<SR, SV> = [ReadsSelf<SR>] extends [never] ? unknown
  : [SV] extends [never] ? {
      readonly "A component that reads its own kind must share state: add shares":
        never
    }
  : unknown

// The component being defined, as a `"self"` entry of `reads` names it: an owner with its own props, events,
// receives, shared value and reports, so the read is typed by its `shares`.
type SelfOwner<Name extends string, Props, Events, Rcv, SV, Rp> =
  | Headless<Props, Events, unknown, never, Rcv, Shared<Name>, SV, Rp>
  | "self"

// `reads` as `define` keeps it, each `"self"` entry naming the component.
type ResolveSelf<SR, S> = {
  readonly [K in keyof SR]: SR[K] extends { readonly owner: "self" } ?
    Omit<SR[K], "owner"> & { readonly owner: S }
    : SR[K]
}

/**
 * What an owner collects from the readers that report to it, the `collects`
 * of its `shares`: the Schema of one report, and the message for all of
 * them.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface SharesCollects<out Msg, in out Rp> {
  readonly schema: Schema.Codec<Rp, any>
  readonly onChange: (collected: ReadonlyArray<Rp>) => Msg
}

// The tags of a message union, and the member with one tag.
type TagOf<Msg> = Msg extends { readonly _tag: infer T extends string } ? T
  : never
type Tagged<Msg, T> = Extract<Msg, { readonly _tag: T }>
type UnknownTag<T> =
  & `'${T & string}' is not a tag of this component's message`
  & {
    readonly _UnknownTag: unique symbol
  }

// A record `update`: a function for each tag, returning what `UR` holds for it. `UR` is inferred from the
// record, so a key that is no tag is in it too, and its value is the error.
type UpdateRecord<Model, Msg, Events, Props, L, SR, UR> = {
  readonly [T in keyof UR]: T extends TagOf<Msg> ? (
      $: Update<Model, Msg, Events, Props, L, Tagged<Msg, T>, SR>,
      msg: Tagged<Msg, T>
    ) => UR[T]
    : UnknownTag<T>
}

// `{}` extends `Record<T, unknown>` only for open tags (`string`, template literals) that map to an index signature.
type OpenTag<T extends string> = T extends unknown
  ? {} extends Record<T, unknown> ? T : never
  : never

// `{ readonly [Symbol.hasInstance]?: never }` excludes callables with handler properties, which dispatch as functions.
type DispatchedByTag<Msg> = [Msg] extends [{ readonly _tag: string }]
  ? [OpenTag<TagOf<Msg>>] extends [never]
    ? { readonly [Symbol.hasInstance]?: never }
  : never
  : never

/**
 * What `define` returns: a component's name, Schemas, queries and
 * vocabulary. `init`, `update`, `subscriptions`, `view` and `fragment`
 * written in pieces are typed against it, and `make` finishes the component.
 *
 * **Details**
 *
 * `update` with a tag returns a slice for that tag. Without one, it takes a
 * function over the whole message type, or a record with a handler for every
 * `_tag` of a tagged message, and returns an update function over that type.
 * A slice or an update function fits the matching key of a record `update`,
 * and `$.combine` takes either where the message fits. A record key that
 * isn't a message tag is a type error. `init`, `subscriptions`, `view` and
 * `fragment` return the function they're given.
 *
 * `make` takes `init`, `update`, `view`, `subscriptions` and `head`,
 * and reads `R` off what they return.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Definition<
  Name extends string,
  Props,
  Model,
  Msg,
  Events,
  V extends View.Elements,
  L,
  Rcv = never,
  Sl extends string = never,
  SR = {},
  SV = never,
  Rp = never
> {
  readonly name: Name
  readonly props: Schema.Codec<Props, any>
  readonly model: Schema.Codec<Model, any>
  readonly message: Schema.Codec<Msg, any>
  readonly events: Schema.Codec<Events, any>
  /** The Schema of the cases of `message` listed in `receives`. */
  readonly receives: Schema.Codec<Rcv, any>
  readonly queries: unknown
  readonly elements: View.Vocabulary<V> | undefined
  /** The names of the slots a parent may fill. */
  readonly slots: ReadonlyArray<Sl>
  /** The owners whose shared state the component reads, by local name. */
  readonly reads: SR | undefined
  /** What an owner shares with the components below it, from its Model, props and reads: the `value` of `shares`. */
  readonly shares:
    | (($: {
      readonly model: Model
      readonly props: Props
      readonly reads: SharedValues<SR>
    }) => SV)
    | undefined
  /** The Schema of what an owner shares: the `schema` of `shares`. */
  readonly sharesSchema: Schema.Codec<SV, any> | undefined
  /** What an owner collects from the readers below it: the `collects` of `shares`. */
  readonly collects: SharesCollects<Msg, Rp> | undefined
  /** What history restore saves of an instance: `false` for nothing, or the Model to save. */
  readonly restore: false | ((model: Model, props: Props) => Model) | undefined
  /** An init function, with the definition's Model, message, events and props. */
  init<UI extends Model | InitStep<Model, Msg, Events, any>>(
    init: ($: Init<Model, Msg, Events, Props>) => UI
  ): ($: Init<Model, Msg, Events, Props>) => UI
  /**
   * A slice for one tag: `msg` is that tag's member, and so is the message
   * `$.combine` takes functions over. The slice returned takes any `$`, so
   * an update function can call it by hand, and `$` is bound to the
   * message it's given.
   */
  update<
    const Tag extends TagOf<Msg>,
    U extends Model | Step<Model, Msg, Events, any, L>
  >(
    tag: Tag,
    update: (
      $: Update<Model, Msg, Events, Props, L, Tagged<Msg, Tag>, SR>,
      msg: Tagged<Msg, Tag>
    ) => U
  ): (
    $: Update<Model, Msg, Events, Props, L, Msg, SR>,
    msg: Tagged<Msg, Tag>
  ) => U
  /** An update function over the whole message type. */
  update<U extends Model | Step<Model, Msg, Events, any, L>>(
    update: ($: Update<Model, Msg, Events, Props, L, Msg, SR>, msg: Msg) => U
  ): ($: Update<Model, Msg, Events, Props, L, Msg, SR>, msg: Msg) => U
  /**
   * An update function over the whole message type, built from a record with a
   * handler for every `_tag` of the message.
   */
  update<
    UR extends {
      readonly [T in TagOf<Msg>]: Model | Step<Model, Msg, Events, any, L>
    }
  >(
    update:
      & UpdateRecord<Model, Msg, Events, Props, L, SR, UR>
      & DispatchedByTag<Msg>
  ): (
    $: Update<Model, Msg, Events, Props, L, Msg, SR>,
    msg: Msg
  ) => UR[keyof UR]
  /** A subscriptions function, with the definition's Model, props and query results. */
  subscriptions<Sub extends Subscription.Subscription<Msg, any>>(
    subscriptions: (
      $: Current<Model, Props, QueryResults<L>>
    ) => ReadonlyArray<Sub | false | null | undefined>
  ): (
    $: Current<Model, Props, QueryResults<L>>
  ) => ReadonlyArray<Sub | false | null | undefined>
  /** A view, to pass as `view` or call from another view. */
  view<UV extends View.Content<Msg, any>>(
    view: (
      h: ViewHelper<Model, Props, Msg, V, L, Sl, SR>,
      model: Model
    ) => UV
  ): (
    h: ViewHelper<Model, Props, Msg, V, L, Sl, SR>,
    model: Model
  ) => UV
  /**
   * A view fragment: a function that takes `h` first and any other
   * arguments after it, called from a view as `fragment(h, ...args)`.
   */
  fragment<Args extends ReadonlyArray<unknown>, Out>(
    fragment: (
      h: ViewHelper<Model, Props, Msg, V, L, Sl, SR>,
      ...args: Args
    ) => Out
  ): (
    h: ViewHelper<Model, Props, Msg, V, L, Sl, SR>,
    ...args: Args
  ) => Out
  /**
   * Finishes a headless component: `parts` in place of `view`. Whoever
   * declares it, by calling it with `view`, writes the view from what
   * `parts` returns.
   */
  make<
    Parts,
    UI extends Model | InitStep<Model, Msg, Events, any> = Model,
    U extends Model | Step<Model, Msg, Events, any, L> = Model,
    UR extends {
      readonly [T in TagOf<Msg>]: Model | Step<Model, Msg, Events, any, L>
    } = {
      readonly [T in TagOf<Msg>]: Model
    },
    Sub extends Subscription.Subscription<Msg, any> = never
  >(
    options:
      & {
        readonly init: ($: Init<Model, Msg, Events, Props>) => UI
        readonly update:
          | (($: Update<Model, Msg, Events, Props, L, Msg, SR>, msg: Msg) => U)
          | UpdateRecord<Model, Msg, Events, Props, L, SR, UR>
        /**
         * A headless component has no view to place slots in, so a definition with slots can't take `parts`.
         */
        readonly parts: [Sl] extends [never] ? (
            p:
              & PartsHelper<Msg, Props, V>
              & QueryHelpers<L>
              & SharedHelpers<SR>,
            model: Model
          ) => Parts
          : never
        readonly subscriptions?:
          | ((
            $: Current<Model, Props, QueryResults<L>>
          ) => ReadonlyArray<Sub | false | null | undefined>)
          | undefined
        readonly head?:
          | ((
            $: Current<Model, Props, QueryResults<L>>
          ) => ReadonlyArray<View.HeadEntry<V>>)
          | undefined
      }
      & SelfShares<SR, SV>
  ): Headless<
    Props,
    Events,
    Composed.Parts<Parts>,
    Exclude<
      | OwnStepRequirements<UI | U | UR[keyof UR], SR>
      | View.PartRequirements<
        Composed.Parts<Parts>[keyof Composed.Parts<Parts>]
      >
      | Composed.Requirements<Parts>
      | Subscription.Requirements<Sub>
      | QueryServices<L>
      | SharedRequirements<SR>,
      Command.FrameworkService
    >,
    Rcv,
    ([SV] extends [never] ? never : Shared<Name>) | Composed.Shares<Parts>,
    SV,
    Rp
  >
  /**
   * Finishes a headless owner with no parts of its own. The caller's `view`
   * closure receives `{}`.
   */
  make<
    UI extends Model | InitStep<Model, Msg, Events, any> = Model,
    U extends Model | Step<Model, Msg, Events, any, L> = Model,
    UR extends {
      readonly [T in TagOf<Msg>]: Model | Step<Model, Msg, Events, any, L>
    } = {
      readonly [T in TagOf<Msg>]: Model
    },
    Sub extends Subscription.Subscription<Msg, any> = never
  >(
    options:
      & {
        readonly init: ($: Init<Model, Msg, Events, Props>) => UI
        readonly update:
          | (($: Update<Model, Msg, Events, Props, L, Msg, SR>, msg: Msg) => U)
          | UpdateRecord<Model, Msg, Events, Props, L, SR, UR>
        readonly parts?: never
        readonly view?: never
        readonly subscriptions?:
          | ((
            $: Current<Model, Props, QueryResults<L>>
          ) => ReadonlyArray<Sub | false | null | undefined>)
          | undefined
        readonly head?:
          | ((
            $: Current<Model, Props, QueryResults<L>>
          ) => ReadonlyArray<View.HeadEntry<V>>)
          | undefined
      }
      & OnlyOwnersOmitParts<Sl, SV>
      & SelfShares<SR, SV>
  ): Headless<
    Props,
    Events,
    {},
    Exclude<
      | OwnStepRequirements<UI | U | UR[keyof UR], SR>
      | Subscription.Requirements<Sub>
      | QueryServices<L>
      | SharedRequirements<SR>,
      Command.FrameworkService
    >,
    Rcv,
    Shared<Name>,
    SV,
    Rp
  >
  /** Finishes the component. */
  make<
    UI extends Model | InitStep<Model, Msg, Events, any> = Model,
    U extends Model | Step<Model, Msg, Events, any, L> = Model,
    // What each function of a record `update` returns, by tag.
    UR extends {
      readonly [T in TagOf<Msg>]: Model | Step<Model, Msg, Events, any, L>
    } = {
      readonly [T in TagOf<Msg>]: Model
    },
    UV extends View.Content<Msg, any> = View.Node<Msg>,
    Sub extends Subscription.Subscription<Msg, any> = never
  >(
    options:
      & {
        readonly init: ($: Init<Model, Msg, Events, Props>) => UI
        readonly update:
          | (($: Update<Model, Msg, Events, Props, L, Msg, SR>, msg: Msg) => U)
          | UpdateRecord<Model, Msg, Events, Props, L, SR, UR>
        readonly view: (
          h: ViewHelper<Model, Props, Msg, V, L, Sl, SR>,
          model: Model
        ) => UV
        readonly subscriptions?:
          | ((
            $: Current<Model, Props, QueryResults<L>>
          ) => ReadonlyArray<Sub | false | null | undefined>)
          | undefined
        readonly head?:
          | ((
            $: Current<Model, Props, QueryResults<L>>
          ) => ReadonlyArray<View.HeadEntry<V>>)
          | undefined
      }
      & OwnersAreHeadless<SV>
      & SelfShares<SR, SV>
  ): Component<
    Name,
    Props,
    Model,
    Msg,
    Events,
    Exclude<
      | OwnStepRequirements<UI | U | UR[keyof UR], SR>
      | View.Requirements<UV>
      | Subscription.Requirements<Sub>
      | QueryServices<L>
      | SharedRequirements<SR>,
      Command.FrameworkService
    >,
    V,
    L,
    Sl
  >
}

/**
 * Types for definitions: what a component keeps of the one it was made from.
 *
 * @stability experimental
 * @since 0.1.0
 */
export declare namespace Definition {
  /**
   * A component's `definition` as the types see it: the name and Schemas of
   * what `define` returned. It's that same object, so every `Definition` fits.
   *
   * **Details**
   *
   * The Schemas are erased. The component itself carries them typed, and a
   * `Definition` can't be typed exactly here, since a component is covariant
   * in its events and queries and a definition isn't.
   *
   * @stability experimental
   * @category models
   * @since 0.1.0
   */
  export interface Any {
    readonly name: string
    readonly props: Schema.Codec<any, any>
    readonly model: Schema.Codec<any, any>
    readonly message: Schema.Codec<any, any>
    readonly events: Schema.Codec<any, any>
    readonly receives: Schema.Codec<any, any>
    readonly queries: unknown
    readonly elements: View.Vocabulary<any> | undefined
    readonly slots: ReadonlyArray<string>
    /** The owners whose shared state the component reads, by local name. */
    readonly reads: SharedReads | undefined
    /** What the component shares as an owner, or `undefined` when it isn't one. */
    readonly shares:
      | (($: {
        readonly model: any
        readonly props: any
        readonly reads: any
      }) => unknown)
      | undefined
    /** The Schema of what the component shares, or `undefined` when its `shares` gives none. */
    readonly sharesSchema: Schema.Codec<any, any> | undefined
    /** What the component collects from the readers that report to it, or `undefined` when it collects nothing. */
    readonly collects:
      | {
        readonly schema: Schema.Codec<any, any>
        readonly onChange: (collected: ReadonlyArray<never>) => unknown
      }
      | undefined
    /** What history restore saves of an instance: `false` for nothing, or the Model to save. */
    readonly restore: false | ((model: any, props: any) => unknown) | undefined
  }

  /**
   * A `Definition.Any` that keeps the name's literal type.
   *
   * @stability experimental
   * @category models
   * @since 0.1.0
   */
  export interface Of<Name extends string> extends Any {
    readonly name: Name
  }
}

/**
 * `h` in the view of a definition, for a function that takes it without
 * `Def.fragment`.
 *
 * **Example** (A row fragment)
 *
 * ```ts import.meta.vitest
 * import { Component } from "@effect/ui"
 * import { Schema } from "effect"
 *
 * const Note = Schema.Struct({ id: Schema.String, title: Schema.String })
 *
 * const NoteListDef = Component.define({
 *   name: "NoteList",
 *   model: Schema.Struct({ notes: Schema.Array(Note) }),
 *   message: Schema.Never
 * })
 *
 * const noteRow = (h: Component.Helper<typeof NoteListDef>, note: typeof Note.Type) =>
 *   h.el("li", note.title).key(note.id)
 *
 * export const NoteList = NoteListDef.make({
 *   init: () => ({ notes: [] }),
 *   update: ($) => $.model,
 *   view: (h, model) => h.el("ul", model.notes.map((note) => noteRow(h, note)))
 * })
 * ```
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type Helper<D> = D extends Definition<
  infer _N,
  infer P,
  infer M,
  infer Msg,
  infer _E,
  infer V,
  infer L,
  infer _Rcv,
  infer Sl,
  infer SR,
  infer _SV,
  infer _Rp
> ? ViewHelper<M, P, Msg, V, L, Sl, SR>
  : never

/**
 * `h` in a component's view: the helpers of `View.Helper`, the tags of its
 * vocabulary, its queries, slots and shared state, and `h.keepAlive`.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type ViewHelper<
  Model,
  Props,
  Msg,
  V extends View.Elements,
  L,
  Sl extends string,
  SR
> = WithKeepAlive<
  Model,
  Props,
  Msg,
  L,
  & View.WithTags<Msg, Props, V>
  & QueryHelpers<L>
  & SlotHelpers<Sl>
  & SharedHelpers<SR>
>

type WithKeepAlive<Model, Props, Msg, L, H> =
  & H
  & KeepAliveHelpers<Model, Props, Msg, L, H>

/**
 * `h.keepAlive`, which writes keep-alive children. `H` is the rest of `h`,
 * which `s` is too.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface KeepAliveHelpers<Model, Props, Msg, L, H> {
  /**
   * A block whose children live as long as the component whose view wrote
   * it. Each component called with `s` is kept alive, and its key must be a
   * literal, or left out. Returns what `content` returns, and adds no node.
   */
  keepAlive<C>(content: (s: H & View.KeepAlive<Msg, false>) => C): C
  /**
   * A block whose children, each a component called with `s`, live while
   * `alive` holds for their key.
   * `alive` is asked on every render of this component, for each child it
   * keeps, so it reads the Model from `$`, not from the view's `model`:
   * `({ model, key }) => key in model.notes`. Returns what `content`
   * returns, and adds no node.
   */
  keepAlive<C>(
    alive: ($: Alive<Model, Props, QueryResults<L>>) => boolean,
    content: (s: H & View.KeepAlive<Msg, true>) => C
  ): C
}

/**
 * What `subscriptions`, `head` and a query's `args` are asked with: the
 * current Model, props and query results of the instance. A query's `args`
 * gets the results of the other queries.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Current<out Model, out Props, out Queries> {
  readonly model: Model
  readonly props: Props
  readonly queries: Queries
}

/**
 * What an `h.keepAlive` predicate is asked with: the current Model, props
 * and query results of the component whose view wrote the block, and the key
 * of the child it is asked about.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Alive<out Model, out Props, out Queries>
  extends Current<Model, Props, Queries>
{
  readonly key: string
}

type QueryResults<L> = { readonly [K in keyof L]: QueryResultOf<L[K]> }

/**
 * Options accepted by `Component.define` (minus `elements`) and by
 * vocabulary-bound component constructors typed with {@link Define}.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface DefineOptions<
  Name extends string,
  Model,
  Msg,
  Props,
  Events,
  S,
  M,
  L,
  Tags extends TagOf<Msg>,
  Sl extends string,
  SR extends SharedReads,
  SO extends { readonly [name: string]: Headless.Any | Any | "self" },
  SOpt,
  SV,
  Rp,
  SA = SelfAbove<SV>
> {
  readonly name: Name
  readonly props?: Schema.Codec<Props, any> | undefined
  readonly model: Schema.Codec<Model, any>
  readonly message: Schema.Codec<Msg, any>
  readonly events?: Schema.Codec<Events, any> | undefined
  /** The queries the component shows, by name. */
  readonly queries?:
    | (
      & {
        readonly [K in keyof S]: {
          readonly query?: S[K] & OneQuery<M[K & keyof M]>
          readonly args: (
            $: Current<
              Model,
              Props,
              {
                readonly [P in Exclude<keyof NoInfer<L>, K>]: QueryResultOf<
                  NoInfer<L>[P]
                >
              }
            >
          ) => ArgsFor<S[K], M[K & keyof M]>
          readonly debounce?: Duration.Input | undefined
          /** `true` interrupts the old args' fetch when the args change, without waiting. */
          readonly interruptPrevious?: boolean | undefined
          /** `false` keeps the result out of history. */
          readonly restore?: false | undefined
          /** `true` opens changed args as `Initial`, not the last Success. */
          readonly dropPrevious?: DropPrevious<M[K & keyof M]> | undefined
          readonly onChange?:
            | OnChange<S[K], M[K & keyof M], NoInfer<Msg>>
            | undefined
        }
      }
      & {
        readonly [K in keyof M]: {
          readonly queryMany?: M[K] & ManyQuery<M[K]>
        }
      }
    )
    | undefined
  /** The names of the slots a parent may fill, each placed in `view` with `h.slots.<name>`. None by default. */
  readonly slots?: ReadonlyArray<Sl> | undefined
  /**
   * The owners whose shared state the component reads, by the name `h.reads`, `p.reads` and `$.reads` use:
   * each an owner, or `{ owner, optional, report, onChange }`. With `optional`, the read is
   * `undefined` when no owner is above, and a send to it is dropped. `report` is what this
   * component tells an owner whose `shares` has `collects`, from its Model, props and `id`.
   * `onChange` is its message when the value changes, delivered once per owner round before the next render, with the latest value.
   * One `onChange` per owner: `define` throws for an owner listed twice with one each.
   * `owner: "self"` reads the nearest instance of this component above, and is `optional: true`;
   * write `shares` before `reads`, so `report` and `onChange` are typed by it.
   */
  readonly reads?:
    | (
      & SR
      & {
        readonly [K in keyof SOpt]:
          | (SOpt[K] & Headless.Any)
          | {
            readonly owner: unknown
            readonly optional?: SOpt[K] | undefined
          }
      }
      & {
        readonly [K in keyof SO]: SharedEntry<
          SOpt[K & keyof SOpt],
          SO[K],
          Model,
          Props,
          NoInfer<Msg>,
          NoInfer<SV>,
          NoInfer<Rp>
        >
      }
      & NoInfer<OwnersOnly<SO>>
    )
    | undefined
  /**
   * Makes a headless component an owner: what it shares with the components below it, and what
   * it collects from them. A function is short for `{ value }`. Every owner update re-runs the owner's
   * closure, so put normal components directly under it, and every reader re-renders when the
   * value changes, so keep it small. `schema` encodes the value in a reader's `Update` on the
   * Wire. Without it the value is sent best effort, as `MessageLog.structural` encodes it.
   *
   * `value` takes `{ model, props, reads }`, with `reads` as `p.reads` holds them, so an owner can
   * share what it derives from the owners above it. To read its own kind there, give `schema` or
   * annotate what `value` returns.
   */
  readonly shares?:
    | SharesValue<Model, Props, SO, SOpt, SA, SV>
    | {
      /** What the readers below read, from the owner's Model, props and reads. */
      readonly value: SharesValue<Model, Props, SO, SOpt, SA, SV>
      /** The Schema of the value. */
      readonly schema?: Schema.Codec<SV, any> | undefined
      /**
       * The tags of `message` the components below may send the owner with `$.send(Owner, message)`.
       * None by default.
       */
      readonly receives?: ReadonlyArray<Tags> | undefined
    }
    | {
      readonly value: SharesValue<Model, Props, SO, SOpt, SA, SV>
      readonly schema?: Schema.Codec<SV, any> | undefined
      readonly receives?: ReadonlyArray<Tags> | undefined
      /** What the owner collects from the readers below it. */
      readonly collects: {
        /** The Schema of what each reader below reports with `report`. */
        readonly schema: Schema.Codec<Rp, any>
        /**
         * The message for the current reports, one per reader, in no promised order. It's
         * dispatched once a render pass has nothing left to render, when it differs from the last
         * one, which starts as `onChange([])`.
         */
        readonly onChange: (
          collected: ReadonlyArray<NoInfer<Rp>>
        ) => NoInfer<Msg>
      }
    }
    | undefined
  /**
   * What Back, forward and a reload bring back of the component. Left out, the Router saves the
   * instance's Model and query results when it leaves a history entry, and an instance mounted for
   * that entry again starts from them. `false` saves nothing, so the instance starts from `init`,
   * even from an entry an older build saved it in; the components below it are saved and restored
   * as usual. A function returns the Model to save from the current Model and props. It runs
   * when the Router saves, not on Back, so a field it clears is never written to `history.state`.
   * One that throws leaves the instance out, with a warning logged once per component.
   *
   * Leave out what depends on a Command an `update` started, such as a timer or a request, and
   * what only the DOM knew, such as hover, focus or a measurement: restore replays `init`'s
   * Commands only. Hydration doesn't read it: the server sends the whole Model. To leave out
   * one query's result, give its `queries` entry `restore: false`.
   */
  readonly restore?:
    | false
    | ((model: Model, props: Props) => NoInfer<Model>)
    | undefined
}

type QueryEntries<S, M> = {
  readonly [K in keyof S]: M[K & keyof M] extends Query.Query.Any ?
    QueryMany<M[K & keyof M]>
    : S[K] extends Query.Query.Any ? QueryOne<S[K]>
    : never
}

type Defined<
  Name extends string,
  Props,
  Model,
  Msg,
  Events,
  V extends View.Elements,
  L,
  Tags,
  Sl extends string,
  SR,
  SV,
  Rp
> = Definition<
  Name,
  Props,
  Model,
  Msg,
  Events,
  V,
  L,
  Tagged<Msg, Tags>,
  Sl,
  ResolveSelf<
    Listed<SR>,
    SelfOwner<Name, Props, Events, Tagged<Msg, Tags>, SV, Rp>
  >,
  SV,
  Rp
>

/**
 * The call signature of a vocabulary-bound component constructor such as
 * `Html.component` or `OpenTui.component`, supplying vocabulary `V`
 * automatically to `Component.define`. `Component.withElements` makes one.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Define<V extends View.Elements> {
  <
    const Name extends string,
    Model,
    Msg,
    Props = {},
    Events = never,
    S = {},
    M = {},
    L = QueryEntries<S, M>,
    const Tags extends TagOf<Msg> = never,
    const Sl extends string = never,
    SR extends SharedReads = SharedReads,
    SO extends { readonly [name: string]: Headless.Any | Any | "self" } = {},
    SOpt = {},
    SV = never,
    Rp = never,
    SA = SelfAbove<SV>
  >(
    options: DefineOptions<
      Name,
      Model,
      Msg,
      Props,
      Events,
      S,
      M,
      L,
      Tags,
      Sl,
      SR,
      SO,
      SOpt,
      SV,
      Rp,
      SA
    >
  ): Defined<Name, Props, Model, Msg, Events, V, L, Tags, Sl, SR, SV, Rp>
}

/**
 * Defines a component, in two steps. `define` takes the name, the Schemas,
 * `queries` and `elements`, and `make` on the definition it returns takes
 * `init`, `update`, `view`, `subscriptions` and `head`.
 *
 * **Details**
 *
 * The first step holds what nothing is inferred from, so update functions
 * and views written outside the component are typed against the definition.
 * Typing them against `typeof` the component would be circular, because the
 * component's requirements are read off what `update` returns. `queries`
 * types `$.queries` and `h.queries`, and `elements` the tags on `h`, so both
 * belong to the first step. A definition is named with a `Def` suffix and
 * usually stays unexported. A component written in one piece chains the two
 * steps.
 *
 * `init` and `update` get `$` first, a step holding the current Model and
 * props, and `update` the message after it. `view` gets `h` first, bound to
 * the component's message type and carrying the props, with the component's
 * element vocabulary mixed in, and the Model after it. A view that
 * reads only props takes `h` alone. The whole return type of `init`, `update`
 * and `view` is inferred and `R` is read off it, so `R` covers every branch,
 * including conditional views. Framework services such as `Scope` are never
 * part of `R`.
 *
 * The component keeps what `define` returned as its `definition`, so the
 * `name` option is read back as `Component.definition.name`. Paths, messages
 * and the message log use it. A component is a function, so its own `name`
 * is the function's and doesn't carry it.
 *
 * `props` and `events` are optional. `subscriptions`, `head` and a query's
 * `args` each get one object: `{ model, props, queries }`. `subscriptions`
 * returns keyed Streams run while their key is listed, and falsy entries are
 * skipped. Two entries with one key fail the instance. `elements` supplies
 * an element vocabulary for this component; without it, `h` is host-neutral
 * (`el` and `text`). For HTML or OpenTUI components, prefer `Html.component`
 * or `OpenTui.component`.
 *
 * `queries` declares the queries the component shows, by name. Each entry is
 * `{ query: Q, args }` for one query, a list of pages when `Q` is a
 * `Query.InfiniteService`, or `{ queryMany: Q, args }` for one query at many
 * args. `args` gets the Model, the props and the other queries' results,
 * and returns the query's args, `undefined` to disable it, or for
 * `queryMany` an array of args. The runtime watches each query at those args
 * and keeps what it last returned as the query's result, beside the Model:
 * the Model plus the results is an instance's state. A result that changes
 * re-renders the instance. `h.queries`, `$.queries` in `update`, and
 * `queries` in `head` and `subscriptions` open the results, by
 * query name. Each query is added to `R`.
 *
 * An entry's `debounce` delays a fetch for changed args by a
 * `Duration.Input` on the Clock. Only a fetch waits: the first args at
 * mount, the server render, args whose cache entry is fresh or already being
 * fetched, and a change to `undefined` go through at once. Args that change
 * again restart the wait. A `queryMany` query's new keys wait each on their
 * own. A `debounce` also makes changed args interrupt the old args' fetch.
 *
 * An entry's `interruptPrevious: true` does that without the wait: when the
 * args change, the old args' fetch is interrupted unless another watcher, a
 * `get` or a prefetch still needs it, and a fetcher built on
 * `Effect.tryPromise` sees its `AbortSignal` abort. Use it when args change
 * faster than fetches finish, as with a brush or a slider. Without it or a
 * `debounce`, the old fetch runs on and stores its result, which returning to
 * those args reads from the cache.
 *
 * When an enabled `query` entry's args change, it keeps the last Success
 * with `waiting: true` until the new args have a result, including during
 * `debounce`. `$.queries`, `head` and `subscriptions` see the same result.
 * A kept infinite list reports `more: Loading`. Without a stored Success,
 * the result is `Initial`, waiting. A disabled query is `Initial`, not
 * waiting. Set `dropPrevious: true` on the entry to show `Initial` instead
 * when old results would mislead.
 *
 * An entry's `onChange` returns a message to send when its result changes, for
 * a component that has to react in `update`. It runs when a result is
 * written, not when the args alone change. A `query` entry's gets its
 * result as `h.queries` opens it, and a `queryMany` query's gets its entries
 * and the keys whose result changed. The result is written first, and the
 * message's `update` sees it in `$.queries`.
 *
 * An entry's `restore: false` keeps its result out of history, for a large
 * result such as a table. On Back the query reads the cache or fetches, as on
 * a fresh mount, so its `onChange` runs again. Server page state still holds
 * the result, and so can history if the user leaves before hydration decodes it.
 *
 * `head` returns the instance's head entries, typed by the component's
 * vocabulary: `Head.title`, `Head.titleTemplate` and `Head.reduce` on any
 * vocabulary, and `HtmlHead`'s on `Html`. It's a pure function of the
 * Model, the props and the queries' results, like a view. On every flush that
 * changed a view, the runtime folds the head of the placed tree, a child's
 * `fallback` content included, with the root vocabulary's merge (see
 * `Head`). A `Head.reduce` or `HtmlHead.reduce` entry maps the folded
 * head of the instance and everything its view placed: a layout derives an
 * `og:title` from the title that won, say. The root's result is final.
 *
 * `update` is a function over the whole message type, or a record with a
 * function for every `_tag` of the message, which gets a `$` for that tag's
 * member and the member. The record has no default key, so a component that wants a
 * catch-all uses the function form. `Def.update(tag, f)` is a slice for one
 * tag, and `Def.update(f)` or `Def.update(record)` an update function over the
 * whole message type.
 * `$.combine` runs update functions one after another. `Def.view(f)` is a
 * view, and `Def.fragment(f)` a view fragment that takes `h` and any other
 * arguments, such as a row.
 *
 * `slots` names the places a parent can fill with markup. The parent passes
 * `slots: { name: content }` when it declares the child, written with its own
 * `h`, and the view places each one with `h.slots.<name>`, once per render.
 * The content belongs to the parent: its handlers send the parent's
 * messages, its children's events and failures map to them, and it
 * resolves services where the parent declared the child. A parent's re-render patches only the content,
 * without running the child's view. Content the view doesn't place is not
 * mounted, and a slot placed again starts over. A definition with slots
 * finishes with `view`, not `parts`.
 *
 * **Gotchas**
 *
 * An instance whose `model` Schema, or a query's success, error or args
 * Schema, holds a `Schema.Redacted` anywhere never has its state written as
 * JSON. The server defers it and its subtree to the client, and logs a
 * warning once per component, and the Router keeps no history entry for it.
 * Keep a secret in a leaf component, or in a service, so the rest of the
 * page still hydrates and restores. When only history is the concern, clear
 * the field with `restore` instead: the server still sends it.
 *
 * **Example** (A counter)
 *
 * ```ts import.meta.vitest
 * import { Component, UiSchema } from "@effect/ui"
 * import { Schema } from "effect"
 *
 * const CounterMessage = UiSchema.TaggedEnum({ ClickedIncrement: {}, ClickedDecrement: {} })
 *
 * const Counter = Component.define({
 *   name: "Counter",
 *   props: Schema.Struct({ initial: Schema.Number }),
 *   model: Schema.Struct({ count: Schema.Number }),
 *   message: CounterMessage
 * }).make({
 *   init: ($) => ({ count: $.props.initial }),
 *   update: ($, message) =>
 *     CounterMessage.match(message, {
 *       ClickedIncrement: () => ({ count: $.model.count + 1 }),
 *       ClickedDecrement: () => ({ count: $.model.count - 1 })
 *     }),
 *   view: (h, model) =>
 *     h.el(
 *       "div",
 *       h.el("button").on("click", CounterMessage.ClickedDecrement()).children("-"),
 *       h.el("span", String(model.count)),
 *       h.el("button").on("click", CounterMessage.ClickedIncrement()).children("+")
 *     )
 * })
 * ```
 *
 * **Example** (A page that loads its user, and the user's team)
 *
 * ```ts import.meta.vitest
 * import { Component, Query } from "@effect/ui"
 * import { Schema } from "effect"
 * import { AsyncResult } from "effect/reactivity"
 *
 * class GetUser extends Query.Service<GetUser>()("GetUser", {
 *   args: { id: Schema.String },
 *   success: Schema.Struct({ name: Schema.String, teamId: Schema.String }),
 *   error: Schema.Never,
 *   staleTime: "1 minute"
 * }) {}
 *
 * class GetTeam extends Query.Service<GetTeam>()("GetTeam", {
 *   args: { id: Schema.String },
 *   success: Schema.Struct({ title: Schema.String }),
 *   error: Schema.Never,
 *   staleTime: "1 minute"
 * }) {}
 *
 * const UserPage = Component.define({
 *   name: "UserPage",
 *   props: Schema.Struct({ id: Schema.String }),
 *   model: Schema.Struct({}),
 *   message: Schema.Never,
 *   queries: {
 *     user: { query: GetUser, args: ({ props }) => ({ id: props.id }) },
 *     // Disabled until the user has loaded.
 *     team: {
 *       query: GetTeam,
 *       args: ({ queries }) =>
 *         AsyncResult.isSuccess(queries.user) ? { id: queries.user.value.teamId } : undefined
 *     }
 *   }
 * }).make({
 *   init: () => ({}),
 *   update: ($) => $.model,
 *   view: (h) =>
 *     AsyncResult.match(h.queries.user, {
 *       onInitial: () => h.el("p", "Loading…"),
 *       onFailure: () => h.el("p", "No such user"),
 *       onSuccess: ({ value }) =>
 *         h.el("p", value.name, AsyncResult.isSuccess(h.queries.team) ? ` of ${h.queries.team.value.title}` : "")
 *     })
 * })
 * ```
 *
 * **Example** (A note page whose update is split into slices)
 *
 * ```ts import.meta.vitest
 * import { Component, UiSchema } from "@effect/ui"
 * import { Schema } from "effect"
 *
 * const NotePageMessage = UiSchema.TaggedEnum({ UpdatedBody: { body: Schema.String }, ClickedSave: {} })
 *
 * const NotePageDef = Component.define({
 *   name: "NotePage",
 *   model: Schema.Struct({ body: Schema.String, edits: Schema.Number, error: Schema.NullOr(Schema.String) }),
 *   message: NotePageMessage
 * })
 *
 * // Over the whole message type, so `$.combine` takes them.
 * const touch = NotePageDef.update(($) => $.evolve({ edits: (edits) => edits + 1 }))
 * const validate = NotePageDef.update(($) => $.evolve({ error: $.model.body === "" ? "Empty" : null }))
 *
 * // `msg` is the UpdatedBody message.
 * const handleUpdatedBody = NotePageDef.update("UpdatedBody", ($, msg) =>
 *   $.combine(($) => $.evolve({ body: msg.body }), touch))
 *
 * // `h` first, then any other arguments.
 * const counter = NotePageDef.fragment((h, edits: number) => h.el("small", `${edits} edits`))
 *
 * const noteView = NotePageDef.view((h, model) => h.el("div", h.el("p", model.body), counter(h, model.edits)))
 *
 * export const NotePage = NotePageDef.make({
 *   init: () => ({ body: "", edits: 0, error: null }),
 *   update: {
 *     UpdatedBody: handleUpdatedBody,
 *     ClickedSave: ($) => $.combine(validate)
 *   },
 *   view: noteView
 * })
 * ```
 *
 * **Example** (A card whose title and body its parent fills)
 *
 * ```ts import.meta.vitest
 * import { Component } from "@effect/ui"
 * import { Schema } from "effect"
 *
 * const Card = Component.define({
 *   name: "Card",
 *   model: Schema.Boolean,
 *   message: Schema.Literal("ClickedToggle"),
 *   slots: ["title", "body"]
 * }).make({
 *   init: () => true,
 *   update: ($) => !$.model,
 *   view: (h, open) =>
 *     h.el("section", h.el("h2", h.slots.title), h.el("button").on("click", "ClickedToggle"), open && h.slots.body)
 * })
 *
 * export const Page = Component.define({
 *   name: "Page",
 *   model: Schema.Number,
 *   message: Schema.Literal("ClickedLike")
 * }).make({
 *   init: () => 0,
 *   update: ($) => $.model + 1,
 *   // The button is the page's, so a click sends the page's `ClickedLike`.
 *   view: (h, likes) =>
 *     Card(h, {
 *       key: "card",
 *       slots: { title: "Likes", body: h.el("button").on("click", "ClickedLike").children(`${likes} likes`) }
 *     })
 * })
 * ```
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const define = <
  const Name extends string,
  Model,
  Msg,
  Props = {},
  Events = never,
  S = {},
  M = {},
  // The queries as `QueryOne` and `QueryMany` entries, by name. Nothing infers it, so it's always this default.
  L = QueryEntries<S, M>,
  V extends View.Elements = never,
  const Tags extends TagOf<Msg> = never,
  const Sl extends string = never,
  // What `reads` lists, as written; defaults to its constraint so `Listed<SR>` detects omission.
  SR extends SharedReads = SharedReads,
  // Each `reads` entry's owner, inferred before `shares`, `report` and `onChange`.
  SO extends { readonly [name: string]: Headless.Any | Any | "self" } = {},
  // Each entry's `optional`, or its owner when written as shorthand.
  SOpt = {},
  SV = never,
  Rp = never,
  // Only inferred: typing `shares`'s self read by `SV` directly would fix `SV` to `never`.
  SA = SelfAbove<SV>
>(
  options:
    & DefineOptions<
      Name,
      Model,
      Msg,
      Props,
      Events,
      S,
      M,
      L,
      Tags,
      Sl,
      SR,
      SO,
      SOpt,
      SV,
      Rp,
      SA
    >
    & {
      readonly elements?: View.Vocabulary<V> | undefined
    }
): Defined<Name, Props, Model, Msg, Events, V, L, Tags, Sl, SR, SV, Rp> => {
  const shares = options.shares
  const definition: Defined<
    Name,
    Props,
    Model,
    Msg,
    Events,
    V,
    L,
    Tags,
    Sl,
    SR,
    SV,
    Rp
  > = {
    name: options.name,
    props: options.props ?? (Schema.Struct({}) as any),
    model: options.model,
    message: options.message,
    events: options.events ?? (Schema.Never as any),
    receives: receivesOf(
      options.message,
      typeof shares === "object" ? shares.receives ?? [] : []
    ),
    queries: options.queries,
    elements: options.elements,
    slots: options.slots ?? [],
    reads: options.reads as any,
    shares: (typeof shares === "function" ? shares : shares?.value) as any,
    sharesSchema: typeof shares === "function" ? undefined : shares?.schema,
    collects: shares !== undefined && typeof shares !== "function" &&
        "collects" in shares
      ? shares.collects
      : undefined,
    restore: options.restore,
    init: (init) => init,
    // A slice is the function given, with `$` bound to the message it's called with.
    update: ((...args: ReadonlyArray<any>) => {
      const update = toUpdateFn(args[args.length - 1])
      return ($: Update<any, any, any, any>, msg: unknown) =>
        update(
          makeUpdate(
            $.model,
            $.props,
            $.queries,
            $.reads,
            msg,
            ($ as AnyUpdate$)["~self"]
          ),
          msg
        )
    }) as any,
    subscriptions: (subscriptions) => subscriptions,
    view: (view) => view,
    fragment: (fragment) => fragment,
    // The type of `reads` names the component in each `"self"` entry. The value keeps `"self"`, which `finish`
    // resolves once the component exists.
    make: (rest: any) => finish(definition as any, rest) as any
  }
  sharedReads.check(definition as any)
  return definition
}

/**
 * Binds an element vocabulary into a component constructor, as
 * `Html.component` and `OpenTui.component` do. Each call is
 * `Component.define({ ...options, elements })`.
 *
 * **Example** (A host's component constructor)
 *
 * ```ts import.meta.vitest
 * import { Component } from "@effect/ui"
 * import { Html } from "@effect/ui/html"
 *
 * export const component: Component.Define<Html.Elements> = Component.withElements(Html.vocabulary)
 * ```
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const withElements = <V extends View.Elements>(
  elements: View.Vocabulary<V>
): Define<V> =>
(options) =>
  // Forwarded `options` infer `SR` as the whole `reads` intersection, hence the cast.
  define({ ...options, elements }) as any

// The cases of `message` with one of `tags`, or `Schema.Never` without any.
const receivesOf = (
  message: Schema.Codec<any, any>,
  tags: ReadonlyArray<string>
): Schema.Codec<any, any> =>
  tags.length === 0 ? Schema.Never : message.check(
    Schema.makeFilter((msg: unknown) =>
      Predicate.hasProperty(msg, "_tag") && tags.includes(msg._tag as string), {
      expected: `a message with one of the tags ${tags.join(", ")}`
    })
  )

/**
 * Binds `queries` through `Query`, which an app with a query has loaded. Without it nothing in the
 * record can be a query: an empty record binds nothing, and any other fails `Query`'s first check.
 */
const bindQueries = (
  component: string,
  queries: unknown
): ReturnType<queryCore.Loaded["bind"]> => {
  if (queries === undefined) return undefined
  if (queryCore.loaded !== undefined) {
    return queryCore.loaded.bind(component, queries)
  }
  if (
    typeof queries === "object" && queries !== null &&
    Object.keys(queries).length === 0
  ) return undefined
  throw new Error(
    `${component}: queries must be a record of { query, args } or { queryMany, args } entries.`
  )
}

const finish = (
  definition: Definition.Any,
  options: {
    readonly init: ($: Init<any, any, any, any>) => unknown
    readonly update: AnyUpdate | { readonly [tag: string]: AnyUpdate }
    readonly view?: ((h: any, model: any) => View.Content<any, any>) | undefined
    readonly parts?: ((p: any, model: any) => unknown) | undefined
    readonly subscriptions?:
      | ((
        $: Current<any, any, any>
      ) => ReadonlyArray<
        Subscription.Subscription<any, any> | false | null | undefined
      >)
      | undefined
    readonly head?:
      | (($: Current<any, any, any>) => ReadonlyArray<unknown>)
      | undefined
  }
): Any => {
  const bound = bindQueries(definition.name, definition.queries)
  const open = (
    model: unknown,
    props: unknown,
    results: Results | undefined
  ): any =>
    bound === undefined ? {} : bound.context(model, props, results).queries
  const updateFn = toUpdateFn(options.update)
  const subscriptions = options.subscriptions
  const head = options.head
  const elements = definition.elements
  const view = options.view
  const parts = options.parts ?? (view === undefined ? () => ({}) : undefined)
  if (parts !== undefined && definition.slots.length > 0) {
    throw new Error(
      `${definition.name} declares slots, so it needs a view to place them and can't take parts`
    )
  }
  // Made once, so a slot forwarded as another's content is the same value on every render.
  const outlets: Record<string, View.Outlet> = {}
  for (const name of definition.slots) outlets[name] = { _tag: "Outlet", name }
  if (definition.shares !== undefined && view !== undefined) {
    throw new Error(
      `${definition.name}: only a headless component can share state, so finish it without view`
    )
  }
  // Read once the component exists, since an entry for `"self"` names it.
  let reads: ReadonlyArray<sharedReads.Read> = []
  let unsupplied: SharedRecord = {}
  const component: Any = makeComponent(
    view === undefined ? HeadlessProto : Proto,
    {
      definition,
      props: definition.props,
      model: definition.model,
      message: definition.message,
      events: definition.events,
      receives: definition.receives,
      init: (props: unknown) => toNext(options.init(makeInit(props))),
      update: (
        model: unknown,
        msg: unknown,
        props: unknown,
        results?: Results,
        shared?: SharedRecord | SharedLookup
      ) =>
        toNext(
          updateFn(
            makeUpdate(
              model,
              props,
              open(model, props, results),
              shared === undefined
                ? unsupplied
                : typeof shared === "function"
                ? sharedReads.values(definition.name, reads, shared)
                : shared,
              msg,
              component
            ),
            msg
          )
        ),
      view: view === undefined
        ? undefined
        : View.readsPathLazily((
          model: unknown,
          props: unknown,
          running?: View.Running,
          results?: Results,
          path?: string | View.PathSource,
          shared?: SharedLookup,
          lazy?: View.LazyStore
        ) => {
          const h: any = View.makeHelper(
            props,
            elements,
            running,
            path ?? ("/" + definition.name),
            lazy
          )
          if (definition.slots.length > 0) h.slots = outlets
          if (bound !== undefined) {
            const context = bound.context(model, props, results)
            h.queries = context.queries
            h.patched = context.patched
          }
          if (reads.length > 0) {
            h.reads = sharedReads.values(definition.name, reads, shared)
          }
          const lazies = lazy?.lazy as View.Lazies | undefined
          lazies?.begin()
          try {
            const node = View.toNode(view(h, model))
            lazies?.end()
            return node
          } catch (error) {
            // What a render that threw built isn't given again.
            if (lazy !== undefined) {
              lazy.lazy = undefined
            }
            throw error
          }
        }),
      parts: parts === undefined
        ? undefined
        : (model: unknown, props: unknown, context: PartsContext) => {
          const owner = context.owner
          const p: any = {
            props,
            isRunning: (
              command: Command.Definition.Any,
              group?: unknown
            ): boolean =>
              context.running === undefined
                ? false
                : context.running(
                  Command.nameOf(command),
                  Command.groupKeyOf(command, group)
                ),
            id: (name: string, key?: string | number) =>
              View.idOf(owner.path, name, key),
            part: (...args: ReadonlyArray<any>) =>
              typeof args[0] === "function"
                ? View.makePart(owner, undefined, args[0])
                : View.makePart(
                  owner,
                  typeof args[0] === "string" ? [args[0]] : args[0],
                  args[1]
                ),
            child: (component: Headless.Any, options: child.ComposeOptions) =>
              child.compose(owner, component, options)
          }
          if (bound !== undefined) {
            const opened = bound.context(model, props, context.queries)
            p.queries = opened.queries
            p.patched = opened.patched
          }
          if (reads.length > 0) {
            p.reads = sharedReads.values(
              definition.name,
              reads,
              context.shared
            )
          }
          return parts(p, model)
        },
      subscriptions: subscriptions === undefined
        ? undefined
        : (model: unknown, props: unknown, results?: Results) =>
          subscriptions({ model, props, queries: open(model, props, results) })
            .filter((entry) => !!entry),
      head: head === undefined
        ? undefined
        : (model: unknown, props: unknown, results?: Results) =>
          head({ model, props, queries: open(model, props, results) }),
      elements,
      layer: undefined,
      layerKeys: undefined,
      layerFailure: undefined,
      sharedLayer: undefined,
      layerOnServer: true,
      "~queries": bound
    }
  )
  reads = sharedReads.readsOf(definition, component)
  unsupplied = sharedReads.unsupplied(definition.name, reads)
  return component
}

/**
 * The options of `provide`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface ProvideOptions<in E, out Msg> {
  /**
   * Maps the Layer's failure to one of the component's own messages. The
   * component stays mounted, feature children below show `fallback`, and
   * Commands that were waiting for the Layer are interrupted. Retrying means
   * re-keying the component. Required when the Layer can fail.
   */
  readonly onFailure: (failure: AsyncResult.Failure<never, E>) => Msg
  /**
   * Builds a Layer value per instance, for state each instance must own. By
   * default a Layer value is shared by every instance that resolves its
   * services from the same place.
   */
  readonly local?: boolean | undefined
  /**
   * `false` keeps the Layer off the server, for Layers that are always
   * asynchronous there, such as a live connection. The server renders the
   * component like one whose Layer missed the budget, without spending the
   * budget on it, and the client builds the instance fresh.
   */
  readonly server?: false | undefined
}

/**
 * The `local` and `server` options of `provide`, for Layers that can't fail.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface LocalOption {
  readonly local?: boolean | undefined
  readonly server?: false | undefined
}

/**
 * `C` with `ROut` provided and `RIn` required instead. Name, Model and message
 * are kept, so paths and story tests don't change.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type Provided<C, ROut, RIn> = C extends Component<
  infer N,
  infer P,
  infer M,
  infer Msg,
  infer E,
  infer _R,
  infer V,
  infer L,
  infer Sl
> ? Component<
    N,
    P,
    M,
    Msg,
    E,
    Exclude<Requirements<C>, Exclude<ROut, RuntimeService>> | RIn,
    V,
    L,
    Sl
  >
  : Mountable<
    Props<C>,
    Events<C>,
    Exclude<Requirements<C>, Exclude<ROut, RuntimeService>> | RIn,
    Slots<C>
  >

/**
 * Services the runtime owns or reads once at mount: the framework services,
 * among them the query cache, and the cache's three references. A `provide`
 * Layer can't supply them, so it never removes them from a component's
 * requirements.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type RuntimeService =
  | Command.FrameworkService
  | typeof Query.Visibility
  | typeof Query.Connectivity
  | typeof Query.Problems
  | Shared.Any

/**
 * What `provide` accepts: a Layer, an array of them, or a function of props
 * returning a Layer.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ProvideInput =
  | Layer.Any
  | ReadonlyArray<Layer.Any>
  | ((props: any) => Layer.Any)
  | ProvideKeyed<any, any, any, Layer.Any>

/**
 * The keyed form of `provide`: `key` picks a selection from props and the
 * Model, and `layer` turns it into the Layer to build. The Layer is built
 * again, in place, when the key changes by `Equal.equals`.
 *
 * **Details**
 *
 * While the new selection builds, the old view isn't kept. Each feature slot
 * below shows its `fallback`, passed `AsyncResult.initial(true)`, as at
 * mount, and the log's `LayerPending` entry says `Rebuilding`. Once the
 * Layer is ready the feature mounts again. If the Layer fails, the slot shows
 * the failure branch of its `fallback`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface ProvideKeyed<in Props, in Model, K, out L> {
  readonly key: (props: Props, model: Model) => K
  readonly layer: (key: K) => L
}

/**
 * The options of the keyed form of `provide`: `onFailure` and `server`. A
 * keyed provide always builds per instance, so `local` is rejected.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface ProvideKeyedOptions<in E, out Msg> {
  /** As in `ProvideOptions`: required when the Layer can fail. */
  readonly onFailure: (failure: AsyncResult.Failure<never, E>) => Msg
  /** As in `ProvideOptions`. */
  readonly server?: false | undefined
  /** A keyed provide builds per instance already. */
  readonly local?: never
}

/**
 * Helper types for `provide`.
 *
 * @stability experimental
 * @since 0.1.0
 */
export declare namespace ProvideInput {
  /**
   * The Layer type of an input.
   *
   * @category utility types
   * @since 0.1.0
   */
  export type LayerOf<L> = L extends (props: any) => infer R ? R
    : L extends ReadonlyArray<infer E> ? E
    : L extends ProvideKeyed<any, any, any, infer R> ? R
    : L

  /**
   * The services an input provides.
   *
   * @category utility types
   * @since 0.1.0
   */
  export type Success<L> = LayerOf<L> extends infer X
    ? X extends Layer.Layer<infer A, any, any> ? A : never
    : never

  /**
   * The error an input can fail with.
   *
   * @category utility types
   * @since 0.1.0
   */
  export type Error<L> = LayerOf<L> extends infer X
    ? X extends Layer.Layer<any, infer E, any> ? E : never
    : never

  /**
   * The services an input requires.
   *
   * @category utility types
   * @since 0.1.0
   */
  export type Services<L> = LayerOf<L> extends infer X
    ? X extends Layer.Layer<any, any, infer R> ? R : never
    : never
}

/**
 * The options argument of `provide`. Optional when the Layer can't fail with a
 * typed error, and otherwise a required argument with `onFailure`.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type ProvideRest<L, Msg> = [ProvideInput.Error<L>] extends [never] ? [
    options?: LocalOption & {
      readonly onFailure?: ProvideOptions<never, Msg>["onFailure"] | undefined
    }
  ]
  : [options_with_onFailure: ProvideOptions<ProvideInput.Error<L>, Msg>]

/**
 * Passes unless the Layer can fail and no `onFailure` was given; then names
 * the error type in the compiler error.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type RequiresOnFailure<L, O> = [ProvideInput.Error<L>] extends [never] ?
  unknown
  : [O] extends [never] ? {
      readonly "This Layer can fail. Pass { onFailure } to handle":
        ProvideInput.Error<L>
    }
  : unknown

/**
 * Passes unless the Layer can fail, because the curried form has no
 * `onFailure`.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type CurriedCantFail<L> = [ProvideInput.Error<L>] extends [never] ?
  unknown
  : {
    readonly "This Layer can fail, and the curried form has no onFailure. Use Component.provide(component, layer, { onFailure }) to handle":
      ProvideInput.Error<L>
  }

// What a factory's Layer provides: the services every branch provides, so a branch that provides
// less never has a service removed for it. The check is non-distributive, so a union of Layers
// matches only with an `ROut` all of them provide; with none in common it removes nothing.
type CommonSuccess<L> = [L] extends [Layer.Layer<infer ROut, any, any>] ? ROut
  : never
// What any branch needs, and what any can fail with: distributive, so the union of them.
type AnyServices<L> = L extends Layer.Layer<any, any, infer RIn> ? RIn : never
type AnyError<L> = L extends Layer.Layer<any, infer E, any> ? E : never

// The keyed form's options when its Layer can't fail: `onFailure` still hears about a defect.
interface KeyedOptionsInfallible<Msg> {
  readonly onFailure?:
    | ((failure: AsyncResult.Failure<never, never>) => Msg)
    | undefined
  readonly server?: false | undefined
  readonly local?: never
}

// The keyed form's options: `onFailure` is required when the Layer can fail.
type KeyedRest<E, Msg> = [E] extends [never] ?
  [options?: KeyedOptionsInfallible<Msg>]
  : [options: ProvideKeyedOptions<E, Msg>]

// The curried keyed form: `key`'s Model parameter, annotated by hand, must take the component's Model.
type KeyTakes<C, M> = [Model<C>] extends [M] ? unknown
  : {
    readonly "The key's model parameter doesn't take this component's Model":
      Model<C>
  }

const isKeyed = (
  u: unknown
): u is ProvideKeyed<unknown, unknown, unknown, Layer.Layer<any, any, any>> =>
  typeof u === "object" && u !== null && !Array.isArray(u) &&
  !Layer.isLayer(u) && "key" in u

const mergeAll = Layer.mergeAll as (
  ...layers: ReadonlyArray<Layer.Any>
) => Layer.Layer<any, any, any>

const toLayer = (
  layers: Layer.Any | ReadonlyArray<Layer.Any>
): Layer.Layer<any, any, any> =>
  Array.isArray(layers)
    ? mergeAll(...layers)
    : (layers as Layer.Layer<any, any, any>)

// What `onFailure` returns: the component's message. A generic call that
// returns a component, such as an inline `define(...).make(...)`, is skipped in
// the first inference pass, so `C` is still `Any` there, and `Message<Any>`,
// `never`, would reject the handler before `C` is inferred. While `C` is
// `Any` the handler is taken as is, and `ErasedMessage` or `ErasedHandler`
// checks it on the component argument, which that pass skips too: a
// component that is still `Any` once inferred takes no message, as
// `Message<Any>` says.
type Erased<C> = [Any] extends [C] ? true : false

type ProvideMessage<C, M> = Erased<C> extends true ? M : Message<C>

type ErasedHint =
  "An erased component takes no message, so onFailure can't return one"

// `M` is what the handler returns, inferred from the call.
type ErasedMessage<C, M> = Erased<C> extends true ?
  [M] extends [never] ? unknown : { readonly [K in ErasedHint]: M }
  : unknown

// The handler in `O`, if any, checked against the call it gets: one that
// returns no message. An overloaded handler passes only if the overload for
// that call does. A Layer that can't fail still calls it on a defect.
type ErasedHandler<C, O, E> = Erased<C> extends true ?
  [HandlerOf<O>] extends
    [((failure: AsyncResult.Failure<never, E>) => never) | undefined] ? unknown
  : { readonly [K in ErasedHint]: HandlerOf<O> }
  : unknown

// The `onFailure` of each member of `O` that has the key, required or
// optional, and `never` for options without it.
type HandlerOf<O> = O extends { readonly onFailure?: infer F }
  ? "onFailure" extends keyof O ? F : never
  : never

/**
 * Provides services to a component and everything below it, like
 * `Effect.provide`.
 *
 * **When to use**
 *
 * Use to give a component its Command Layers and feature implementations where
 * the context they need lives: the page, the feature or the app. A test
 * provides fakes the same way.
 *
 * **Details**
 *
 * It returns the same component, with `R` changed to `Exclude<R, ROut> | RIn`.
 * A Layer passed as a value is built once per Env plus Layer identity,
 * reference-counted, and shared between the instances that resolve from it;
 * `{ local: true }` or a function of props builds once per instance, at mount.
 * A memoised Layer inside a shared one is built once per Env too: every
 * provide that resolves from that Env, or from an Env below it, gets the same
 * instance, and the last of them to unmount closes it. Provides in sibling
 * Envs build their own, so a service built for one never sees the other's
 * dependencies. As with nested `Effect.provide`, a provide reuses what an Env
 * above it built even where an Env between them provides a different
 * dependency; `Layer.fresh` builds it again. A stateful service belongs to
 * the component that owns its lifetime, usually the root: provide it there,
 * and the provides below that name it get that instance.
 * An array of Layers is merged once with `Layer.mergeAll`, so the elements
 * don't see each other. Nothing is rebuilt when props change: re-key instead.
 * Nested provides let the inner one win, and the inner one can use the outer
 * one's services.
 *
 * A keyed provide, `{ key, layer }`, selects the Layer again whenever the key
 * changes, and a key change remounts everything below the component. `key`
 * reads props and the Model, and `layer` gets only the key: anything the Layer
 * needs goes in the key. The key is read once per flush, before the view of an
 * instance whose Model or props changed, and compared with `Equal.equals`, so
 * an update that leaves it equal calls nothing and builds nothing. On a change
 * the component keeps its Model. Its in-flight Commands are interrupted, its
 * Subscriptions and queries restart, and its query results go back to their
 * initial value. The Commands issued in the flush that changed the key run
 * against the new services. The previous selection is released once the new
 * one has built, and a selection still building is interrupted.
 *
 * A key change doesn't clear the query cache. A cache entry is a query and its
 * args, whichever selection fetched it, so a query whose args are unchanged gets
 * the entry fetched under the old selection until its `staleTime` passes. A
 * query whose data depends on the selection takes the selection in its args.
 *
 * A failed build goes to `onFailure` or fails the instance, as at mount, with
 * no fallback to the previous selection. The Commands waiting for that build
 * are interrupted. A later key change builds again; an unchanged key doesn't
 * retry. Until then, a newly issued Command runs against the parent's
 * services, as after a failure at mount, so one that needs a selected service
 * fails the instance. Every Subscription and query on the instance waits for
 * the next selection, those that use only the parent's services included: work
 * that must keep running goes on a component above the provide.
 *
 * A keyed provide builds per instance and turns off sharing for every provide
 * on the component: share between instances with a `LayerMap`. On the server
 * the key is read from `init`'s Model; the client reads it from the Model it
 * hydrates or restores.
 *
 * Builds run in the background: the component renders from `init` at once and
 * its Commands and Subscriptions wait for the Layer. `onFailure` is required
 * when a provided Layer can fail, and the curried form can't take it.
 *
 * On the server, provided Layers are built under the render's budget. A Layer
 * that is always asynchronous there, such as a live connection, takes
 * `{ server: false }`: the server never builds it and renders the component
 * like one whose Layer missed the budget, and the client builds the instance
 * fresh.
 *
 * **Example** (Sharing Command Layers across rows, and a per-instance store)
 *
 * ```ts import.meta.vitest
 * import { Command, Component, UiSchema } from "@effect/ui"
 * import { Context, Effect, Layer, Schema } from "effect"
 *
 * const RowMessage = UiSchema.TaggedEnum({ ClickedSave: {} })
 *
 * class SaveTodo extends Command.Service<SaveTodo>()(
 *   "todos/SaveTodo",
 *   { args: { id: Schema.String }, success: Schema.Void }
 * ) {
 *   static readonly layer = this.toLayer(() => Effect.void)
 * }
 *
 * class EditorStore extends Context.Service<EditorStore, { readonly draft: string }>()("EditorStore") {
 *   static readonly layer = Layer.succeed(EditorStore, { draft: "" })
 * }
 *
 * const Row = Component.define({
 *   name: "Row",
 *   props: Schema.Struct({ id: Schema.String }),
 *   model: Schema.Struct({}),
 *   message: RowMessage
 * }).make({
 *   init: () => ({}),
 *   update: ($, message) =>
 *     RowMessage.match(message, {
 *       ClickedSave: () => $.run(SaveTodo.make({ id: $.props.id }).pipe(Command.asNoop))
 *     }),
 *   view: (h) => h.el("li", h.props.id)
 * })
 *
 * const RowLive = Component.provide(Row, [SaveTodo.layer])            // shared per Env
 * const Editor = Component.provide(Row, EditorStore.layer, { local: true }) // per instance
 * ```
 *
 * **Example** (A room switcher selecting its services by a Model field)
 *
 * ```ts import.meta.vitest
 * import { Command, Component, UiSchema } from "@effect/ui"
 * import { Context, Effect, Layer, LayerMap, Schema } from "effect"
 *
 * class Chat extends Context.Service<Chat, { readonly room: string }>()("Chat") {}
 *
 * class Rooms extends LayerMap.Service<Rooms>()("Rooms", {
 *   lookup: (room: string) => Layer.succeed(Chat, { room })
 * }) {}
 *
 * const RoomMessage = UiSchema.TaggedEnum({
 *   SelectedRoom: { room: Schema.String },
 *   CompletedJoinRoom: { room: Schema.String }
 * })
 *
 * class JoinRoom extends Command.Service<JoinRoom>()(
 *   "rooms/JoinRoom",
 *   { args: {}, success: RoomMessage }
 * ) {
 *   static readonly layer = this.toLayer(
 *     Chat.useSync((chat) => () => Effect.succeed(RoomMessage.CompletedJoinRoom({ room: chat.room })))
 *   )
 * }
 *
 * const RoomView = Component.define({
 *   name: "RoomView",
 *   model: Schema.Struct({ room: Schema.String, joined: Schema.String }),
 *   message: RoomMessage
 * }).make({
 *   init: ($) => $.set({ room: "lobby", joined: "" }).run(JoinRoom.make()),
 *   update: ($, message) =>
 *     RoomMessage.match(message, {
 *       // Selects the new room's Layer: JoinRoom runs against it.
 *       SelectedRoom: ({ room }) => $.evolve({ room }).run(JoinRoom.make()),
 *       CompletedJoinRoom: ({ room }) => $.evolve({ joined: room })
 *     }),
 *   view: (h, model) => h.el("p", model.joined)
 * })
 *
 * // Requires `Rooms`, provided above, so the rooms outlive a switch.
 * const Room = Component.provide(RoomView, {
 *   key: (_, model) => model.room,
 *   layer: (room) => JoinRoom.layer.pipe(Layer.provideMerge(Rooms.get(room)))
 * })
 * ```
 *
 * @stability experimental
 * @category composition
 * @since 0.1.0
 */
export const provide: {
  <Props, L extends Layer.Layer<never, never, any>>(
    layer: (props: Props) => L
  ): <C extends Mountable.Members<Props, any, any, never>>(
    component: C
  ) => Provided<C, CommonSuccess<L>, AnyServices<L>>
  <Props, Model, K, L extends Layer.Layer<never, never, any>>(
    keyed: ProvideKeyed<Props, Model, K, L>,
    options?: { readonly server?: false | undefined; readonly local?: never }
  ): <C extends Mountable.Members<Props, any, any, never>>(
    component: C & KeyTakes<C, Model>
  ) => Provided<C, CommonSuccess<L>, AnyServices<L>>
  <const L extends Layer.Any | ReadonlyArray<Layer.Any>>(
    layer: L & CurriedCantFail<L>,
    options?: LocalOption
  ): <C extends Any>(
    component: C
  ) => Provided<C, ProvideInput.Success<L>, ProvideInput.Services<L>>
  <C extends Any, L extends Layer.Layer<never, never, any>>(
    component: C,
    layer: (props: Props<C>) => L
  ): Provided<C, CommonSuccess<L>, AnyServices<L>>
  <C extends Any, L extends Layer.Layer<never, any, any>, M = never>(
    component: C & ErasedMessage<C, M>,
    layer: (props: Props<C>) => L,
    options: ProvideOptions<AnyError<L>, ProvideMessage<C, M>>
  ): Provided<C, CommonSuccess<L>, AnyServices<L>>
  // One overload whether or not the Layer can fail: a failed candidate would fix `onFailure`'s
  // parameter type before the next one is tried.
  <C extends Any, K, L extends Layer.Layer<never, any, any>, M = never>(
    component: C & ErasedMessage<C, M>,
    keyed: ProvideKeyed<Props<C>, Model<C>, K, L>,
    ...options: KeyedRest<AnyError<L>, ProvideMessage<C, M>>
  ): Provided<C, CommonSuccess<L>, AnyServices<L>>
  // Options checked against the component's message as given. A component
  // defined inline isn't inferred yet when they are, so it takes the next
  // overload.
  <
    C extends Any,
    const L extends Layer.Any | ReadonlyArray<Layer.Any>,
    const O extends ProvideRest<L, Message<C>>[0] = never
  >(
    component: C,
    layer: L & RequiresOnFailure<L, O>,
    options?: O & ProvideRest<L, Message<C>>[0]
  ): Provided<C, ProvideInput.Success<L>, ProvideInput.Services<L>>
  <
    C extends Any,
    const L extends Layer.Any | ReadonlyArray<Layer.Any>,
    const O extends ProvideRest<L, ProvideMessage<C, any>>[0] = never
  >(
    component: C & ErasedHandler<C, O, ProvideInput.Error<L>>,
    layer: L & RequiresOnFailure<L, O>,
    options?: O & ProvideRest<L, ProvideMessage<C, any>>[0]
  ): Provided<C, ProvideInput.Success<L>, ProvideInput.Services<L>>
} = ((...args: Array<any>) => {
  const go = (
    component: Any,
    given: ProvideInput,
    options?: Partial<ProvideOptions<any, any>>
  ): Any => {
    type Built = Layer.Layer<any, any, any>
    const innerKeys = component.layerKeys
    let layer: Built | undefined
    let outer: (props: unknown, keys: ReadonlyArray<unknown>) => Built
    let layerKeys = innerKeys
    if (isKeyed(given)) {
      // The provides are built as one Layer, so their keys are read together: this one's goes after the inner ones'.
      const at = innerKeys?.length ?? 0
      const select = given.layer
      outer = (_, keys) => select(keys[at])
      layerKeys = [...(innerKeys ?? []), given.key]
    } else if (typeof given === "function") {
      const factory = given as (props: unknown) => Built
      outer = (props) => factory(props)
    } else {
      // Arrays are merged once, here, so a shared Layer keeps one identity.
      const value = toLayer(given as Layer.Any | ReadonlyArray<Layer.Any>)
      layer = value
      outer = () => value
    }
    const inner = component.layer
    // Nested: the handler closest to the component is kept.
    const layerFailure = component.layerFailure ?? options?.onFailure
    // A Layer value is shared by every instance resolving from one Env, if everything inside is too.
    const sharedLayer = layer !== undefined && options?.local !== true &&
        (inner === undefined || component.sharedLayer !== undefined)
      ? (component.sharedLayer === undefined
        ? layer
        : Layer.provideMerge(component.sharedLayer, layer))
      : undefined
    return makeComponent(Proto, {
      ...component,
      layer: inner === undefined
        ? outer
        : (props: unknown, keys: ReadonlyArray<unknown>) =>
          Layer.provideMerge(inner(props, keys), outer(props, keys)),
      layerKeys,
      layerFailure,
      sharedLayer,
      // Nested provides are built as one Layer, so one opt-out keeps all of them off the server.
      layerOnServer: component.layerOnServer && options?.server !== false,
      boot: layerRun.boot,
      "~render": layerKeys === undefined ? undefined : layerRun.reselect
    })
  }
  // A component is an object with the type id; a Layer, an array, a function or a keyed selection means the curried form.
  const curried = !isComponent(args[0])
  return curried
    ? (component: Any) => go(component, args[0], args[1])
    : go(args[0], args[1], args[2])
}) as any

/**
 * Identifies a lazy component.
 *
 * @stability experimental
 * @category type ids
 * @since 0.1.0
 */
export const LazyTypeId = "~@effect/ui/Component/Lazy" as const

/**
 * Identifies a lazy component.
 *
 * @stability experimental
 * @category type ids
 * @since 0.1.0
 */
export type LazyTypeId = typeof LazyTypeId

/**
 * A component whose module is loaded with a dynamic `import()`, as returned
 * by `lazy`. A parent declares it as it would the component: its props,
 * events, slots and requirements are the loaded component's. The first child
 * rendered starts loading the module. Its `fallback` is passed `Initial`
 * while the module loads, and `Failure` if the load or the child fails.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Lazy<
  in out Props,
  out Events,
  out R = never,
  in Sl extends string = never
> extends
  Lazy.Members<Props, Events, R, Sl>,
  Mountable.Call<Props, Events, R, Sl, Lazy.Result>
{}

/**
 * Helper types for `Lazy`.
 *
 * @stability experimental
 * @since 0.1.0
 */
export declare namespace Lazy {
  /**
   * What every lazy component has: `Lazy` without its call signature.
   *
   * @category models
   * @since 0.1.0
   */
  export interface Members<
    in out Props,
    out Events,
    out R = never,
    in Sl extends string = never
  > {
    readonly [LazyTypeId]: Info<Props, Events, R, Sl>
    /**
     * Starts loading the module without rendering anything, such as when the
     * pointer enters a link. Settles once the module has loaded or failed to,
     * and never rejects.
     */
    readonly preload: () => Promise<void>
  }

  /**
   * What a lazy component's `fallback` is passed: `Initial` while the
   * module loads, and `Failure` if the load or the child fails.
   *
   * @category models
   * @since 0.1.0
   */
  export type Result =
    | AsyncResult.Initial<never, unknown>
    | AsyncResult.Failure<never, unknown>

  /**
   * The name a lazy component's children take in their paths, and phantom
   * variance for its props, events, requirements and slots.
   *
   * @category models
   * @since 0.1.0
   */
  export interface Info<
    in out Props,
    out Events,
    out R,
    in Sl extends string = never
  > extends Mountable.Variance<Props, Events, R, Sl> {
    readonly name: string
  }

  /**
   * Any lazy component.
   *
   * @category models
   * @since 0.1.0
   */
  export type Any = Members<any, any, any>
}

/**
 * Returns `true` if `u` is a lazy component.
 *
 * @stability experimental
 * @category guards
 * @since 0.1.0
 */
export const isLazy: (u: unknown) => u is Lazy.Any = internalLazy.isLazy

/**
 * Declares a component whose module is loaded the first time one of its
 * children is rendered, so a bundler such as Vite puts it in a chunk of its
 * own.
 *
 * **When to use**
 *
 * Use when most visits never show a page or a panel, so its code, and the
 * code only it imports, stays out of the initial load.
 *
 * **Details**
 *
 * `load` returns the component, usually from `import()`. The props,
 * events, slots and requirements are read from its type, which TypeScript
 * erases, so the module is imported only when `load` runs. Nothing else in
 * the app may import the module statically, or the bundler keeps it in the
 * importing chunk.
 *
 * `name` stands in for the component's name in its children's paths, since
 * the paths are needed before the module arrives. It's the name a `Scene`
 * error or a log entry shows for the child.
 *
 * The first child rendered starts the load, which happens once per app. Until
 * it ends, the child shows its `fallback`, passed `Initial`, and the
 * parent's other content renders as usual. A child rendered after the module
 * loaded mounts at once, with no fallback. A load that fails shows the
 * fallback's `Failure` branch, and the next child that mounts loads again.
 * `onFailure` hears a failure of the child, not of the load. `preload`
 * starts the load without rendering, and `TestHost.settle` waits for a load
 * in flight.
 *
 * A lazy component called with the `s` of `h.keepAlive` is kept alive from
 * its first placement. While its module loads, its fallback is kept with it.
 *
 * Provide the services that only the loaded component uses with
 * `Component.provide` inside its module, so their Layers go into its chunk.
 * Its requirements that the module doesn't provide surface in the parent's.
 *
 * **Gotchas**
 *
 * - `load` must resolve to a component that isn't headless. Any other
 *   value fails the load, as does a `load` that throws.
 * - The server waits for the load and renders the component. The client
 *   doesn't load the module before it hydrates, so it replaces the server's
 *   nodes with the fallback, then with the component once it has loaded.
 * - A browser may keep a failed chunk request in its module map and fail
 *   every later load of it without a request. Reloading the page recovers:
 *   Vite reports such a failure with the `vite:preloadError` event.
 *
 * **Example** (A page loaded on its first visit)
 *
 * ```ts
 * import { Component } from "@effect/ui"
 *
 * const SettingsPage = Component.lazy(
 *   "SettingsPage",
 *   () => import("./pages/SettingsPage.ts").then((module) => module.SettingsPage)
 * )
 *
 * // In the parent's view, called as the component would be:
 * // SettingsPage(h, {
 * //   props: { user },
 * //   onEmit: { Saved: () => AppMessage.SavedSettings() },
 * //   fallback: (result) => h.p.children(result._tag === "Failure" ? "Couldn't load settings." : "Loading…")
 * // })
 * ```
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const lazy: <C extends Any>(
  name: string,
  load: () => Promise<C>
) => Lazy<Props<C>, Events<C>, Requirements<C>, Slots<C>> = (name, load) =>
  internalLazy.make(name, load, keeper) as any
