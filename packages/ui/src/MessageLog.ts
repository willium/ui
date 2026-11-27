/**
 * The message log: a development and test hook the runtime calls once per
 * `update` and at every lifecycle step of every instance.
 *
 * It's off by default. The `MessageLog` service defaults to a no-op whose
 * `enabled` flag is `false`, and the runtime checks the flag before it builds
 * an entry, so an app that doesn't provide a log pays nothing for it. Provide
 * `memory` for a ring buffer, `socket` to stream entries to a devtools
 * process, or `fanout` for several sinks. Production observability goes
 * through Effect's tracer, logger and metrics instead.
 *
 * Entries hold decoded values and references, never copies. They're encoded
 * through the component's Schemas only when they're sent somewhere, as the
 * versioned `Wire`.
 *
 * **Example** (Keeping the last 1,000 entries)
 *
 * ```ts
 * import { MessageLog } from "@effect/ui"
 *
 * const DevLog = MessageLog.memory({ size: 1_000 })
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import { memoize } from "effect/Function"
import * as Layer from "effect/Layer"
import * as Queue from "effect/Queue"
import * as Redacted from "effect/Redacted"
import * as Schedule from "effect/Schedule"
import * as Schema from "effect/Schema"
import type * as SchemaAST from "effect/SchemaAST"
import type * as Scope from "effect/Scope"
import * as Socket from "effect/socket/Socket"
import type * as Command from "./Command.ts"
import type * as Component from "./Component.ts"
import * as messageLog from "./internal/messageLog.ts"
import type * as componentQueries from "./internal/queries.ts"
import { canonical } from "./internal/queryCore.ts"
import * as Recorder from "./internal/recorder.ts"
import { getIndexSignatureKeys } from "./internal/schemaAST.ts"
import { holdsRedacted, redactAST } from "./internal/schemaRedact.ts"
import * as sharedReads from "./internal/shared.ts"
import type * as Query from "./Query.ts"
import type * as Subscription from "./Subscription.ts"

/**
 * The service the runtime records entries to.
 *
 * **Details**
 *
 * `record` is called synchronously from the runtime and must not throw. The
 * runtime checks `enabled` before it builds an entry, and assigns `seq`
 * itself, so every sink numbers entries the same way. It's runtime input
 * only: it's never part of a component's requirements, and app code can't
 * write entries.
 *
 * @stability experimental
 * @category services
 * @since 0.1.0
 */
export interface MessageLog {
  readonly enabled: boolean
  readonly record: (entry: Entry) => void
}

/**
 * The no-op log: `enabled` is `false` and nothing is recorded.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const noop: MessageLog = messageLog.noop

/**
 * The `MessageLog` service. It defaults to `noop`, so it never has to be
 * provided.
 *
 * @stability experimental
 * @category services
 * @since 0.1.0
 */
export const MessageLog: Context.Reference<MessageLog> = messageLog.MessageLog

messageLog.load(Recorder.make)

/**
 * Where a failure happened: the code that threw or failed.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type FailedIn =
  | "init"
  | "update"
  | "view"
  | "content"
  | "domEvent"
  | "mount"
  | "command"
  | "subscription"
  | "layer"
  | "fallback"
  | "onEmit"
  | "onFailure"
  | "head"
  | "send"
  | "shares"
  | "shared"

/**
 * Which Command run an entry is about: the `seq` of the entry that issued it
 * (an `Update` or a `Mounted`) and its index in that entry's `commands`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Issued {
  readonly seq: number
  readonly index: number
}

/**
 * What sent the message an `update` handled.
 *
 * **Details**
 *
 * `DomEvent` is a view handler, such as a click. `Command` is a Command's
 * result, pointing at the entry that issued it and at its span.
 * `Subscription` is a keyed Subscription, with the name and deps its key
 * was built from (see `SubscriptionStarted`). `Query` is a query's
 * `onChange`, pointing at the `QueryChanged` entry it saw. `Emit` is a
 * child's emit, pointing at the child's entry. `Failure` is a parent's
 * `onFailure` for a child that failed, pointing at the child's `Failed`
 * entry. `Send` is a descendant's `$.send` to an owner of shared state,
 * pointing at the sender's entry. `Shared` is a
 * reader's `onChange` for its owner's shared value: the name the reader's
 * `reads` lists the owner under, the owner's path, and the owner's entry
 * that last changed the value. `Collected` is an owner's `collects.onChange` for
 * a change in its readers' reports. `Mount` is an
 * `onMount` result, pointing at its `MountStarted` entry and carrying the
 * mount's name and the args its element last rendered with. `Dispatch` is
 * a message sent from outside the tree, such as `TestHost`'s `root.send`.
 *
 * `Emit`, `Failure`, `Send` and `Shared` name the other instance's path as well as
 * its entry, so a ring buffer that has dropped that entry still says where
 * the message came from.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Source =
  | { readonly _tag: "DomEvent"; readonly name: string }
  | {
    readonly _tag: "Command"
    readonly name: string
    readonly issued: Issued
    readonly spanId: string | undefined
    readonly traceId: string | undefined
  }
  | {
    readonly _tag: "Subscription"
    readonly key: string
    readonly name: string
    readonly deps: ReadonlyArray<Subscription.Dep> | undefined
  }
  | { readonly _tag: "Query"; readonly name: string; readonly seq: number }
  | { readonly _tag: "Emit"; readonly path: string; readonly seq: number }
  | { readonly _tag: "Failure"; readonly path: string; readonly seq: number }
  | { readonly _tag: "Send"; readonly path: string; readonly seq: number }
  | {
    readonly _tag: "Shared"
    readonly name: string
    readonly path: string
    readonly seq: number
  }
  | { readonly _tag: "Collected" }
  | {
    readonly _tag: "Mount"
    /** The `seq` of this mount's `MountStarted` entry. */
    readonly seq: number
    readonly name: string
    readonly args: unknown
    /** The mount's args Schema, which the Wire encodes `args` through. */
    readonly argsSchema: Schema.Top
  }
  | { readonly _tag: "Dispatch" }

/**
 * Fields every entry has: its number, its time from `Clock`, the session it
 * belongs to, and the entry it follows from.
 *
 * **Details**
 *
 * An entry without `causedBy` is a fact: something that reached the tree
 * from outside it. The session starting is one. So is an `Update` whose
 * message came from a DOM event, a Command's result, a Subscription, a mount
 * or `root.send`, a `QueryChanged`, a Layer build, Command run or mount body ending,
 * and a `FetchStarted` a timer, a host signal or a Command's own work
 * started.
 *
 * An entry with `causedBy` is a consequence. The field is the `seq` of the
 * fact it follows from, however many steps lie between them: a child's
 * `Update` for a parent's `$.send` names the fact the parent's `update`
 * handled, not the parent's entry. The entries of a render name the fact
 * that last made the rendered instance dirty, so when one flush renders
 * what two messages changed, an instance both changed names the later one.
 * `CommandInterrupted` names the fact whose handling stopped the run, where
 * `issued` names the entry that started it. When a render stops a mount,
 * `MountEnded.causedBy` names the fact whose render stopped it, and
 * `started` names its `MountStarted` entry. A `FetchStarted` with trigger
 * `"watch"` names the fact whose render declared the query's args. A
 * reader's shared `onChange` `Update` names the fact that changed the
 * owner's value, and an owner's `collects.onChange` `Update` the fact that
 * last changed a report.
 *
 * The `seq` it holds may be of an entry a ring buffer has dropped.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Base {
  readonly seq: number
  readonly at: number
  readonly session: string
  readonly causedBy?: number
}

/**
 * Fields every entry about an instance has: its path, its number and its
 * component.
 *
 * **Details**
 *
 * `instance` tells two instances at one path apart. A path names a place in
 * the tree, and a child can mount there again before the instance that was
 * there has logged `Unmounted`. The number is unique in the session, and
 * later instances have higher ones.
 *
 * `component` is on every entry, so an entry still names its component
 * when the instance's first entry has left a ring buffer. Its Schemas encode
 * the entry's values for the Wire.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface InstanceBase extends Base {
  readonly path: string
  readonly instance: number
  readonly component: Component.Any
}

/**
 * One `update` call: the message, what sent it, the props and query results
 * it saw, the Model after it, and the Commands, events, load mores, resets
 * and sends it returned.
 *
 * **Details**
 *
 * It holds the instance's whole state, so a replay can start from any
 * `Update` a ring buffer still has.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Update extends InstanceBase {
  readonly _tag: "Update"
  readonly source: Source
  readonly message: unknown
  readonly props: unknown
  readonly model: unknown
  readonly commands: ReadonlyArray<Command.Command<any, any>>
  readonly events: ReadonlyArray<unknown>
  /** The `$.loadMore` and `$.reset` calls, in order. */
  readonly lists: ReadonlyArray<Component.ListIssue>
  /** The `$.send` calls, in order. */
  readonly sends: ReadonlyArray<Component.Send>
  /** The types of the `$.viewTransition` request, when `update` made one. */
  readonly viewTransition?: ReadonlyArray<string> | undefined
  /**
   * The query results `update` read as `$.queries`, by query name: what
   * `Story.fromLog` gives it back, as it gives back `props`. Only a
   * component with queries has them.
   */
  readonly queries?: Component.Results | undefined
  /**
   * The shared values `update` read as `$.reads`, by the local name its
   * `reads` lists each owner under: what `Story.fromLog` gives it back.
   * Only a component that reads shared state has them.
   */
  readonly shared?: Component.SharedRecord | undefined
  /**
   * The `instance` of the provider whose Layer entries this instance's
   * feature slots read: itself for a component with a provided Layer, or the
   * one above whose services it renders with. Absent when the services it
   * renders with are always ready.
   */
  readonly boundary?: number | undefined
  /**
   * Marks an update for coalescing, such as a message `_tag` that DevTools
   * has stopped recording. DevTools hides its row and replaces it with the
   * instance's next excluded update unless a shown entry intervenes.
   */
  readonly excluded?: boolean | undefined
}

/**
 * An instance mounted: its props, the Model from `init` (or adopted from the
 * server or from history), its query results, and the Commands `init`
 * returned.
 *
 * **Details**
 *
 * `queries` is what the instance starts with: the server's or history's
 * results when it adopted them, and every query empty otherwise. Only a
 * component with queries has it. The first values of its watches come after,
 * as `QueryChanged` entries.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Mounted extends InstanceBase {
  readonly _tag: "Mounted"
  readonly props: unknown
  readonly model: unknown
  readonly queries?: Component.Results | undefined
  readonly commands: ReadonlyArray<Command.Command<any, any>>
  readonly events: ReadonlyArray<unknown>
  readonly adopted: boolean
  /**
   * The `instance` of the provider whose Layer entries this instance's
   * feature slots read: itself for a component with a provided Layer, or the
   * one above whose services it renders with. Absent when the services it
   * renders with are always ready.
   */
  readonly boundary?: number | undefined
}

/**
 * A mounted instance got new props from its parent, without a re-key. Its
 * queries' args can read them, so `Story.fromLog` applies it to reach the
 * state the instance ended with.
 *
 * **Details**
 *
 * It's logged before the result writes the new props cause. Props equal to the
 * current ones log nothing.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface PropsChanged extends InstanceBase {
  readonly _tag: "PropsChanged"
  readonly props: unknown
}

/**
 * A query's result changed: the runtime wrote what the query last
 * returned at its args. `result` is opaque. `Story.fromLog` applies it to
 * reach the results the instance ended with.
 *
 * **Details**
 *
 * A query with `onChange` logs this entry before the `Update` of the
 * message it returns, whose source points at it.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface QueryChanged extends InstanceBase {
  readonly _tag: "QueryChanged"
  /** The query's name in `queries`. */
  readonly name: string
  readonly result: unknown
}

/**
 * A hydrating instance is waiting for its provided Layer: it shows the nodes
 * the server rendered, inert, and has no Model of its own yet.
 *
 * **Details**
 *
 * It's the instance's first entry, logged when the instance is created, with
 * the props it was given and the Model and query results the server rendered
 * the path with. Its Layer entries follow. When the Layer is ready the
 * instance logs `Mounted`, adopting that state. When the Layer fails and the
 * component handles the failure, it logs `Mounted` with a Model from `init`.
 * An instance removed while it waits logs `Unmounted` and never `Mounted`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Waiting extends InstanceBase {
  readonly _tag: "Waiting"
  readonly props: unknown
  /** The Model the server rendered the path with, which the nodes on screen show. */
  readonly model: unknown
  /** The query results the server rendered the path with. Only a component with queries has them. */
  readonly queries?: Component.Results | undefined
  /**
   * The `instance` of the provider whose Layer entries this instance's
   * feature slots read: itself for a component with a provided Layer, or the
   * one above whose services it renders with. Absent when the services it
   * renders with are always ready.
   */
  readonly boundary?: number | undefined
}

/**
 * An instance left the tree: from then on it takes no message, props or
 * query results, and its path is free.
 *
 * **Details**
 *
 * An instance removed with its parent logs its own entry before its
 * parent's. Its Scope closes after, and its Commands log their ends as they
 * exit, which can be later than this entry.
 *
 * It also ends the instance's Subscriptions and any Layer still pending:
 * neither logs an end entry when its instance goes, so a reader closes them
 * at this entry. Mounts log their own `MountEnded`, and Command runs their
 * own `CommandEnded` or `CommandInterrupted`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Unmounted extends InstanceBase {
  readonly _tag: "Unmounted"
}

/**
 * A keep-alive child that no view writes now, and that its predicate keeps, took
 * its nodes out of the document. It stays mounted: it takes messages and
 * query results, and its Commands and Subscriptions go on.
 *
 * **Details**
 *
 * A kept child shows nothing, contributes no head entries and no reports,
 * and its element mounts are stopped. A ref lookup inside it finds no node.
 * A child moved from one place to another in one render logs nothing.
 * `Drawn` ends the interval.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Kept extends InstanceBase {
  readonly _tag: "Kept"
}

/**
 * A kept child was written again, put its nodes back in the document, and
 * started its element mounts again.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Drawn extends InstanceBase {
  readonly _tag: "Drawn"
}

/**
 * An instance's provided Layer is still building once the instance is
 * created, or once a keyed provide selected again. Its Commands,
 * Subscriptions and mounts, and its descendants', wait for it.
 *
 * **Details**
 *
 * `status` is what the instance's feature slots record until the Layer
 * settles: `Pending` at mount, `Rebuilding` after a keyed provide selected
 * again, and `Awaiting` for an instance the server rendered with its services
 * that waits for the client's build. A Wire frame without it, from an older
 * log, is `Pending`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface LayerPending extends InstanceBase {
  readonly _tag: "LayerPending"
  readonly status: "Pending" | "Rebuilding" | "Awaiting"
}

/**
 * The Layer an earlier `LayerPending` waited for is built.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface LayerReady extends InstanceBase {
  readonly _tag: "LayerReady"
}

/**
 * A provided Layer failed to build.
 *
 * **Details**
 *
 * `redacted` is `true` when the feature slots below got a cause that says
 * a provided Layer failed on the server: for a handled failure on the
 * server, whose `cause` is the one its handler got, and on a client that
 * adopted that failure. A replay passes the slots that substitute, not
 * `cause`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface LayerFailed extends InstanceBase {
  readonly _tag: "LayerFailed"
  readonly cause: Cause.Cause<unknown>
  readonly redacted?: boolean | undefined
}

/**
 * A Subscription's key started. A query's watch isn't a Subscription here:
 * its fetches are `FetchStarted` entries and its values `QueryChanged`.
 *
 * **Details**
 *
 * `key` is the Subscription's identity, and what its `SubscriptionStopped`
 * and the `Update` entries it sends carry too. `name` and `deps` are what
 * `Subscription.make` built the key from: `Subscription.make("room", "42",
 * ...)` logs `name: "room"`, `deps: ["42"]` and `key: 'room:"42"'`. Group
 * and label by `name`, and never by parsing `key`. `deps` is `undefined`
 * for a Subscription with no deps.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface SubscriptionStarted extends InstanceBase {
  readonly _tag: "SubscriptionStarted"
  readonly key: string
  readonly name: string
  readonly deps: ReadonlyArray<Subscription.Dep> | undefined
}

/**
 * A Subscription's key stopped. `name` and `deps` are those of the
 * `SubscriptionStarted` entry with the same `key`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface SubscriptionStopped extends InstanceBase {
  readonly _tag: "SubscriptionStopped"
  readonly key: string
  readonly name: string
  readonly deps: ReadonlyArray<Subscription.Dep> | undefined
}

/**
 * An element's mount body started, with these args: after the commit, or
 * just before it for a mount made with `beforeCommit`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface MountStarted extends InstanceBase {
  readonly _tag: "MountStarted"
  readonly name: string
  readonly args: unknown
  /** The mount's args Schema, which the Wire encodes `args` through. */
  readonly argsSchema: Schema.Top
}

/**
 * The mount body returned, its Scope closed first, or the body failed.
 *
 * **Details**
 *
 * A completed body's Scope outlives it. Releasing that Scope when the
 * element goes writes no further entry. New args published to a running
 * mount write no entry either: each mount-sourced `Update` carries the
 * args its element last rendered with. Hosts that don't run mounts (the
 * server and `TestHost`) log neither mount starts nor ends.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface MountEnded extends InstanceBase {
  readonly _tag: "MountEnded"
  readonly name: string
  /** The `seq` of this mount's `MountStarted` entry. */
  readonly started: number
  readonly reason: "completed" | "closed" | "failed"
  /** True when the body gave at least one result and every result mapped to `Component.noop`. */
  readonly silent: boolean
}

/**
 * A Command run's fiber started its work, in the run's span.
 *
 * **Details**
 *
 * From here until its end entry the run is running: `CommandEnded`,
 * `CommandInterrupted`, or a `Failed` with its `issued`. A run with an end
 * entry and no `CommandStarted` never began: it was stopped while queued in
 * its group or while it waited for its instance's Layer. `causedBy` names the fact of the step that started it:
 * the one that issued it, the one that freed its group for a queued run, or
 * the Layer build that ended for a run that waited for it.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface CommandStarted extends InstanceBase {
  readonly _tag: "CommandStarted"
  readonly name: string
  readonly issued: Issued
  readonly spanId: string
  readonly traceId: string
}

/**
 * A Command run ended with a result.
 *
 * **Details**
 *
 * `spanId` and `traceId` are the run's span, `undefined` when its span never
 * began. They're here because a run that sends no message has no `Update`
 * entry whose source would carry them.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface CommandEnded extends InstanceBase {
  readonly _tag: "CommandEnded"
  readonly name: string
  readonly issued: Issued
  /** The run's span id, or `undefined` when its span never began. */
  readonly spanId: string | undefined
  /** The run's trace id, or `undefined` when its span never began. */
  readonly traceId: string | undefined
  /**
   * `true` when the run had at least one result (its Effect's result, each
   * Stream element, a typed failure `onFailure` mapped) and every one was
   * `Component.noop`, so it ended without a message by design. `false` when
   * it sent any message, when a Stream ended with no elements, and when it
   * ended while its instance was closing, since its result wasn't mapped.
   */
  readonly silent: boolean
  /**
   * For a run issued with `Command.afterRefetch` that succeeded, how its wait
   * ended: `"settled"` when every awaited entry refetched, `"nothing"` when
   * the awaited set was empty, `"budget"` when the budget ran out,
   * `"switch"` or `"interrupt"` when the run was cut, which delivered its
   * message at once, and `"closed"` when the instance closed and the message
   * was dropped. Absent for any other run.
   */
  readonly waitEnded?: WaitEnded | undefined
  /** With `waitEnded`: the awaited entries still refetching when the wait was cut. */
  readonly outstanding?: ReadonlyArray<AwaitedEntry> | undefined
}

/**
 * A Command run was interrupted and dispatched nothing. `reason` says what
 * stopped it (see `InterruptReason`).
 *
 * **Details**
 *
 * It's logged when the run's fiber has exited, which is when `h.isRunning`
 * stops counting it and a run queued behind it in its group starts: a run
 * whose cleanup is still going has no entry yet. A run that never got a
 * fiber logs it when it's stopped.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface CommandInterrupted extends InstanceBase {
  readonly _tag: "CommandInterrupted"
  readonly name: string
  readonly issued: Issued
  /** The run's span id, or `undefined` when its span never began. */
  readonly spanId: string | undefined
  /** The run's trace id, or `undefined` when its span never began. */
  readonly traceId: string | undefined
  readonly reason: InterruptReason
}

/**
 * What stopped a Command run, as `CommandInterrupted` reports it.
 *
 * **Details**
 *
 * - `"interrupt"`: an `update` issued `Command.interrupt` for its group.
 * - `"switch"`: an `update` issued a later run of its `switch` group.
 * - `"unmount"`: its instance was removed, or the app was disposed.
 * - `"layer"`: its instance's provided Layer failed before the run could
 *   start, or a keyed provide selected again and dropped the runs issued
 *   before it.
 * - `"self"`: its own work was interrupted, and nothing in the tree asked it
 *   to stop.
 *
 * `causedBy` names the fact whose handling stopped it, for every reason but
 * `"self"`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type InterruptReason =
  | "interrupt"
  | "switch"
  | "unmount"
  | "layer"
  | "self"

/**
 * How a `Command.afterRefetch` wait ended.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type WaitEnded =
  | "settled"
  | "nothing"
  | "budget"
  | "switch"
  | "interrupt"
  | "closed"

/**
 * An entry a `Command.afterRefetch` run waits for: the query's name and the
 * entry's log key.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface AwaitedEntry {
  readonly query: string
  readonly logKey: string
}

/**
 * A run issued with `Command.afterRefetch` succeeded and waits for the
 * refetches its invalidation started, written at its fiber's exit after
 * the batch's fetch entries. `entries` is the awaited set, which isn't empty:
 * an empty one logs no entry, and `CommandEnded` has `waitEnded: "nothing"`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface CommandAwaiting extends InstanceBase {
  readonly _tag: "CommandAwaiting"
  readonly name: string
  readonly issued: Issued
  readonly entries: ReadonlyArray<AwaitedEntry>
}

/**
 * A Command that never ran: dropped by the server, where no Command runs.
 * Only a Command from `update` is logged; `init`'s are dropped silently,
 * since the client runs them when it adopts.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface CommandDropped extends InstanceBase {
  readonly _tag: "CommandDropped"
  readonly name: string
  readonly issued: Issued
  readonly reason: "server"
}

/**
 * A `$.send` that reached no owner: the sender's `reads` lists the owner
 * as `optional`, and no instance of it is above the sender. `path` is the
 * sender's, `owner` the name of the owner, and `issued` the sender's
 * `Update` entry and the send's index in its `sends`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface SendDropped extends InstanceBase {
  readonly _tag: "SendDropped"
  readonly owner: string
  readonly issued: Issued
}

/**
 * An instance failed, with the real Cause and where it happened.
 *
 * **Details**
 *
 * `props` are the instance's, as of the failure. An instance that fails in
 * `init`, or whose Layer fails before it mounts, has no `Mounted` entry, so
 * this is the only entry that says what was there.
 *
 * A failed root is the instance with no parent: its `Failed` entry is
 * followed by its `Unmounted`. When the root `fallback` given to `mount`
 * throws, the root logs a second `Failed` after that, `in` `"fallback"`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Failed extends InstanceBase {
  readonly _tag: "Failed"
  readonly props: unknown
  readonly in: FailedIn
  readonly name: string | undefined
  readonly cause: Cause.Cause<unknown>
  /**
   * When `update` threw: the message it was given and what sent it. A
   * message whose `update` throws has no `Update` entry, so this is its
   * only record.
   */
  readonly update?:
    | { readonly message: unknown; readonly source: Source }
    | undefined
  /**
   * The run that failed the instance, when `in` is `"command"`. This entry
   * is that run's end: it has no `CommandEnded` or `CommandInterrupted`.
   */
  readonly issued?: Issued | undefined
}

/**
 * A `mount` or a server render started.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface SessionStarted extends Base {
  readonly _tag: "SessionStarted"
  readonly app: string
}

/**
 * The query cache started a fetch.
 *
 * **Details**
 *
 * `logKey` is the entry's args key with every `Schema.Redacted` argument
 * redacted, so two entries that differ only in a secret share it.
 * `restart` marks a fetch that replaced an interrupted one, under the same
 * trigger. `inWindow` marks a fetch of a hydrated entry while the
 * fetch-free window is open. `stored: false` marks a fetcher call whose
 * result goes to `get` callers only. A caller that joins a fetch in flight
 * logs nothing.
 *
 * An infinite query logs each page it requests as its own entry: `page` is the
 * page's index, from 0, and `cursor` the cursor encoded by the list's
 * `cursor` Schema, absent for the first page. A query that isn't a list has
 * neither.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface FetchStarted extends Base {
  readonly _tag: "FetchStarted"
  readonly query: string
  readonly logKey: string
  readonly trigger: Query.Trigger
  readonly restart: boolean
  readonly inWindow: boolean
  readonly stored: boolean
  readonly page?: number
  readonly cursor?: Schema.Json
}

/**
 * Any entry about one instance.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type InstanceEntry =
  | Waiting
  | Mounted
  | Update
  | PropsChanged
  | QueryChanged
  | LayerPending
  | LayerReady
  | LayerFailed
  | Failed
  | Unmounted
  | Kept
  | Drawn
  | MountStarted
  | MountEnded
  | CommandStarted
  | CommandAwaiting
  | CommandEnded
  | CommandInterrupted
  | CommandDropped
  | SendDropped
  | SubscriptionStarted
  | SubscriptionStopped

/**
 * Any log entry: one about the tree, or one about an instance.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Entry = SessionStarted | FetchStarted | InstanceEntry

/**
 * A ring buffer log whose entries can be read back.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Memory extends MessageLog {
  /** The surviving entries, oldest first. */
  readonly entries: () => ReadonlyArray<Entry>
}

/**
 * Makes a ring buffer log holding the last `size` entries (1,000 by default).
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const makeMemory = (
  options?: { readonly size?: number | undefined }
): Memory => {
  const size = Math.max(1, options?.size ?? 1_000)
  const buffer: Array<Entry> = []
  let start = 0
  return {
    enabled: true,
    record(entry) {
      if (buffer.length < size) {
        buffer.push(entry)
      } else {
        buffer[start] = entry
        start = (start + 1) % size
      }
    },
    entries: () =>
      buffer.length < size
        ? buffer.slice()
        : [...buffer.slice(start), ...buffer.slice(0, start)]
  }
}

/**
 * One ring buffer shared by every instance, 1,000 entries by default.
 *
 * @stability experimental
 * @category layers
 * @since 0.1.0
 */
export const memory = (
  options?: { readonly size?: number | undefined }
): Layer.Layer<never> => Layer.succeed(MessageLog, makeMemory(options))

/**
 * Sends every entry to several logs. Enabled when any of them is.
 *
 * **Details**
 *
 * Two Layers of one service can't compose, so this is how a memory buffer and
 * a socket run together.
 *
 * @stability experimental
 * @category combinators
 * @since 0.1.0
 */
export const fanoutAll = (logs: ReadonlyArray<MessageLog>): MessageLog => {
  const enabled = logs.filter((log) => log.enabled)
  return enabled.length === 0 ? noop : {
    enabled: true,
    record: (entry) => {
      for (const log of enabled) log.record(entry)
    }
  }
}

/**
 * A Layer that sends entries to every log the given Layers provide.
 *
 * **Details**
 *
 * The other services the Layers provide are kept, such as the
 * `BrowserHost.Controllables` that `DevTools.layer` provides. When two Layers
 * provide the same one, the later Layer's wins.
 *
 * @stability experimental
 * @category layers
 * @since 0.1.0
 */
export const fanout = <
  const Layers extends ReadonlyArray<Layer.Layer<never, any, any>>
>(
  layers: Layers
): Layer.Layer<
  never,
  Layer.Error<Layers[number]>,
  Layer.Services<Layers[number]>
> =>
  Layer.effectContext(
    Effect.forEach(layers, (layer) => Layer.build(layer)).pipe(
      Effect.map((built) =>
        Context.add(
          Context.mergeAll(...built),
          MessageLog,
          fanoutAll(built.map(Context.get(MessageLog)))
        )
      )
    )
  ) as any

// ---------------------------------------------------------------------------
// Wire
// ---------------------------------------------------------------------------

/**
 * The Wire format's version, sent in every `Hello` frame.
 *
 * @stability experimental
 * @category Wire
 * @since 0.1.0
 */
export const wireVersion = 1

/**
 * Where a log comes from, as `Hello` reports it.
 *
 * @stability experimental
 * @category Wire
 * @since 0.1.0
 */
export type WireHost = "browser" | "server" | "terminal" | "test"

const BaseWire = {
  seq: Schema.Number,
  at: Schema.Number,
  session: Schema.String,
  causedBy: Schema.optionalKey(Schema.Number)
}
const InstanceWire = {
  ...BaseWire,
  path: Schema.String,
  instance: Schema.Number,
  component: Schema.String
}
const IssuedWire = Schema.Struct({ seq: Schema.Number, index: Schema.Number })
const CommandWire = Schema.Struct({
  _tag: Schema.Literals(["Effect", "Stream", "Interrupt"]),
  name: Schema.String,
  group: Schema.NullOr(Schema.String),
  args: Schema.Json
})
const AwaitedEntryWire = Schema.Struct({
  query: Schema.String,
  logKey: Schema.String
})
const CauseWire = Schema.Struct({
  pretty: Schema.String,
  reasons: Schema.Array(Schema.Json)
})
// Deps are JSON values, not primitives, so a dep that is a struct wouldn't be a new Wire version.
const SubscriptionWire = {
  key: Schema.String,
  name: Schema.String,
  deps: Schema.NullOr(Schema.Array(Schema.Json))
}
const SourceWire = Schema.Union([
  Schema.TaggedStruct("DomEvent", { name: Schema.String }),
  Schema.TaggedStruct("Command", {
    name: Schema.String,
    issued: IssuedWire,
    spanId: Schema.NullOr(Schema.String),
    traceId: Schema.NullOr(Schema.String)
  }),
  Schema.TaggedStruct("Subscription", SubscriptionWire),
  Schema.TaggedStruct("Query", { name: Schema.String, seq: Schema.Number }),
  Schema.TaggedStruct("Emit", { path: Schema.String, seq: Schema.Number }),
  Schema.TaggedStruct("Failure", { path: Schema.String, seq: Schema.Number }),
  Schema.TaggedStruct("Send", { path: Schema.String, seq: Schema.Number }),
  Schema.TaggedStruct("Shared", {
    name: Schema.String,
    path: Schema.String,
    seq: Schema.Number
  }),
  Schema.TaggedStruct("Collected", {}),
  Schema.TaggedStruct("Mount", {
    name: Schema.String,
    seq: Schema.Number,
    args: Schema.Json
  }),
  Schema.TaggedStruct("Dispatch", {})
])
const RunWire = {
  ...InstanceWire,
  name: Schema.String,
  issued: IssuedWire,
  spanId: Schema.NullOr(Schema.String),
  traceId: Schema.NullOr(Schema.String)
}

/**
 * The versioned, one-way Schema of what a log sends: a `Hello` once per
 * connection, then entries with their values already encoded.
 *
 * **Details**
 *
 * Models, messages, props and events are encoded through the component's
 * Schemas, and a send's message through its owner's `receives`.
 * A shared value a reader's `Update` holds is encoded through the
 * `schema` of its owner's `shares`, or structurally without one. Command
 * args and a mount's args are encoded through the definition's `args`
 * Schema, field by field, and a field that doesn't encode falls back to a structural
 * encoding, best effort: a value with no JSON form becomes
 * `{ "~unserialisable": "<kind>" }`, a `Redacted` becomes
 * `{ "~redacted": true }`, and a Model or message over `maxEntryBytes` becomes
 * `{ "~truncated": bytes }`. A Cause is sent as `Cause.pretty` plus its
 * reasons, best effort. An entry's `component` is sent as its name.
 *
 * A Subscription's `deps` are sent as an array of JSON values, or `null` for
 * a Subscription with none. They're there to be read: `NaN`, `Infinity` and
 * `-Infinity` are sent as `{ "~unserialisable": "number" }` and `-0` as
 * `0`. The `key` beside them still tells those deps apart.
 *
 * Every `Schema.Redacted` in props, Models, messages, events, Command and
 * mount args, sends and shared values is sent as the placeholder. Two values
 * have no Schema to mark them, and are sent in clear: a Subscription's
 * `key` and `deps`, and the message text of an error in a Cause. Build a
 * Subscription's key from an id that isn't secret, and keep secrets out of
 * error messages.
 *
 * A reader treats each placeholder (see `isPlaceholder`) as a leaf whose
 * value is unknown: two placeholders aren't known to be equal, and a value
 * that is one isn't known to have changed.
 *
 * @stability experimental
 * @category Wire
 * @since 0.1.0
 */
export const Wire = Schema.Union([
  Schema.TaggedStruct("Hello", {
    version: Schema.Number,
    host: Schema.Literals(["browser", "server", "terminal", "test"])
  }),
  Schema.TaggedStruct("SessionStarted", { ...BaseWire, app: Schema.String }),
  Schema.TaggedStruct("FetchStarted", {
    ...BaseWire,
    query: Schema.String,
    logKey: Schema.String,
    trigger: Schema.Literals([
      "watch",
      "get",
      "prefetch",
      "visibility",
      "connectivity",
      "interval",
      "invalidation",
      "loadMore",
      "reset"
    ]),
    restart: Schema.Boolean,
    inWindow: Schema.Boolean,
    stored: Schema.Boolean,
    page: Schema.optionalKey(Schema.Number),
    cursor: Schema.optionalKey(Schema.Json)
  }),
  Schema.TaggedStruct("Waiting", {
    ...InstanceWire,
    props: Schema.Json,
    model: Schema.Json,
    queries: Schema.optionalKey(Schema.Json),
    boundary: Schema.optionalKey(Schema.Number)
  }),
  Schema.TaggedStruct("Mounted", {
    ...InstanceWire,
    props: Schema.Json,
    model: Schema.Json,
    queries: Schema.optionalKey(Schema.Json),
    commands: Schema.Array(CommandWire),
    events: Schema.Array(Schema.Json),
    adopted: Schema.Boolean,
    boundary: Schema.optionalKey(Schema.Number)
  }),
  Schema.TaggedStruct("Update", {
    ...InstanceWire,
    source: SourceWire,
    message: Schema.Json,
    props: Schema.Json,
    model: Schema.Json,
    queries: Schema.optionalKey(Schema.Json),
    shared: Schema.optionalKey(Schema.Json),
    commands: Schema.Array(CommandWire),
    events: Schema.Array(Schema.Json),
    lists: Schema.Array(
      Schema.Struct({
        name: Schema.String,
        op: Schema.Literals(["loadMore", "reset"])
      })
    ),
    sends: Schema.Array(
      Schema.Struct({ owner: Schema.String, message: Schema.Json })
    ),
    viewTransition: Schema.optionalKey(Schema.Array(Schema.String)),
    boundary: Schema.optionalKey(Schema.Number),
    excluded: Schema.optionalKey(Schema.Boolean)
  }),
  Schema.TaggedStruct("PropsChanged", { ...InstanceWire, props: Schema.Json }),
  Schema.TaggedStruct("QueryChanged", {
    ...InstanceWire,
    name: Schema.String,
    result: Schema.Json
  }),
  Schema.TaggedStruct("LayerPending", {
    ...InstanceWire,
    status: Schema.optionalKey(
      Schema.Literals(["Pending", "Rebuilding", "Awaiting"])
    )
  }),
  Schema.TaggedStruct("LayerReady", InstanceWire),
  Schema.TaggedStruct("LayerFailed", {
    ...InstanceWire,
    cause: CauseWire,
    redacted: Schema.optionalKey(Schema.Boolean)
  }),
  Schema.TaggedStruct("Failed", {
    ...InstanceWire,
    props: Schema.Json,
    in: Schema.String,
    name: Schema.NullOr(Schema.String),
    cause: CauseWire,
    update: Schema.optionalKey(
      Schema.Struct({ message: Schema.Json, source: SourceWire })
    ),
    issued: Schema.optionalKey(IssuedWire)
  }),
  Schema.TaggedStruct("Unmounted", InstanceWire),
  Schema.TaggedStruct("Kept", InstanceWire),
  Schema.TaggedStruct("Drawn", InstanceWire),
  Schema.TaggedStruct("MountStarted", {
    ...InstanceWire,
    name: Schema.String,
    args: Schema.Json
  }),
  Schema.TaggedStruct("MountEnded", {
    ...InstanceWire,
    name: Schema.String,
    started: Schema.Number,
    reason: Schema.Literals(["completed", "closed", "failed"]),
    silent: Schema.Boolean
  }),
  Schema.TaggedStruct("CommandStarted", {
    ...InstanceWire,
    name: Schema.String,
    issued: IssuedWire,
    spanId: Schema.String,
    traceId: Schema.String
  }),
  Schema.TaggedStruct("CommandAwaiting", {
    ...InstanceWire,
    name: Schema.String,
    issued: IssuedWire,
    entries: Schema.Array(AwaitedEntryWire)
  }),
  Schema.TaggedStruct("CommandEnded", {
    ...RunWire,
    silent: Schema.Boolean,
    waitEnded: Schema.optionalKey(
      Schema.Literals([
        "settled",
        "nothing",
        "budget",
        "switch",
        "interrupt",
        "closed"
      ])
    ),
    outstanding: Schema.optionalKey(Schema.Array(AwaitedEntryWire))
  }),
  Schema.TaggedStruct("CommandInterrupted", {
    ...RunWire,
    reason: Schema.Literals(["interrupt", "switch", "unmount", "layer", "self"])
  }),
  Schema.TaggedStruct("CommandDropped", {
    ...InstanceWire,
    name: Schema.String,
    issued: IssuedWire,
    reason: Schema.Literal("server")
  }),
  Schema.TaggedStruct("SendDropped", {
    ...InstanceWire,
    owner: Schema.String,
    issued: IssuedWire
  }),
  Schema.TaggedStruct("SubscriptionStarted", {
    ...InstanceWire,
    ...SubscriptionWire
  }),
  Schema.TaggedStruct("SubscriptionStopped", {
    ...InstanceWire,
    ...SubscriptionWire
  })
])

/**
 * One frame of the Wire.
 *
 * @stability experimental
 * @category Wire
 * @since 0.1.0
 */
export type Wire = typeof Wire.Type

/**
 * The Wire's form of an entry, without the `Hello` frame.
 *
 * @stability experimental
 * @category Wire
 * @since 0.1.0
 */
export type WireEntry = Exclude<Wire, { readonly _tag: "Hello" }>

/**
 * A value the encoder sent in place of one it couldn't or mustn't send.
 *
 * @stability experimental
 * @category Wire
 * @since 0.1.0
 */
export type Placeholder =
  | { readonly "~unserialisable": string }
  | { readonly "~redacted": true }
  | { readonly "~truncated": number }

const placeholderChecks: Record<string, (value: unknown) => boolean> = {
  "~unserialisable": (value) => typeof value === "string",
  "~redacted": (value) => value === true,
  "~truncated": (value) => typeof value === "number"
}

/**
 * Whether a JSON value from a Wire frame is a `Placeholder`: an object with
 * one key, `"~unserialisable"` with a string, `"~redacted"` with `true`,
 * or `"~truncated"` with a number.
 *
 * @stability experimental
 * @category Wire
 * @since 0.1.0
 */
export const isPlaceholder = (value: unknown): value is Placeholder => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }
  const keys = Object.keys(value)
  return keys.length === 1 && Object.hasOwn(placeholderChecks, keys[0]) &&
    placeholderChecks[keys[0]]((value as Record<string, unknown>)[keys[0]])
}

/**
 * Turns entries into Wire frames.
 *
 * @stability experimental
 * @category Wire
 * @since 0.1.0
 */
export interface Encoder {
  readonly encode: (entry: Entry) => WireEntry
}

/**
 * Makes an encoder. `onWarning` is called once per component and field the
 * first time its Schema fails to encode a value, which is sent as a
 * placeholder instead.
 *
 * @stability experimental
 * @category Wire
 * @since 0.1.0
 */
export const makeEncoder = (options?: {
  readonly maxEntryBytes?: number | undefined
  readonly onWarning?: ((message: string) => void) | undefined
}): Encoder => {
  const maxEntryBytes = options?.maxEntryBytes ?? Infinity
  const warned = new Set<string>()
  const encoders = new WeakMap<Schema.Top, (value: unknown) => unknown>()
  const through = (
    component: Component.Any,
    field: "props" | "model" | "message" | "events",
    value: unknown
  ) =>
    encodeWith(
      component[field] as Schema.Top,
      `${component.definition.name}.${field}`,
      value
    )
  const encodeWith = (schema: Schema.Top, id: string, value: unknown) => {
    if (holdsRedactedOverlap(schema.ast)) {
      let rejected = false
      const out = guarded(() =>
        encodeAt(schema.ast, value, {
          path: new Set(),
          strict: true,
          leaf: () => {
            rejected = true
            return failed
          }
        })
      )
      if (rejected) warn(id, "a part of it didn't match its Schema")
      return out
    }
    let encode = encoders.get(schema)
    if (encode === undefined) {
      encode = Schema.encodeUnknownSync(
        Schema.toCodecJson(
          Schema.make<Schema.Codec<unknown, unknown>>(redactAST(schema.ast))
        )
      )
      encoders.set(schema, encode)
    }
    try {
      return encode(value) as Schema.Json
    } catch (error) {
      warn(id, String(error))
      return failed
    }
  }
  const warn = (id: string, error: string) => {
    if (warned.has(id)) return
    warned.add(id)
    options?.onWarning?.(
      `MessageLog: ${id} failed to encode, so it's sent as a placeholder: ${error}`
    )
  }
  const encodeQueries = (
    component: Component.Any,
    results: Component.Results | undefined
  ): { readonly queries?: Schema.Json } => {
    if (results === undefined) return {}
    const schema = (component["~queries"] as componentQueries.Bound | undefined)
      ?.logSchema
    return {
      queries: schema === undefined
        ? { "~unserialisable": "encode" }
        : cap(
          encodeWith(
            schema,
            `${component.definition.name}.queries`,
            results
          ) as Schema.Json
        )
    }
  }
  const encodeShared = (
    component: Component.Any,
    shared: Component.SharedRecord | undefined
  ): { readonly shared?: Schema.Json } => {
    if (shared === undefined) return {}
    const out: Record<string, Schema.Json> = {}
    for (const read of sharedReads.readsOf(component.definition)) {
      const value = shared[read.name]
      if (value === undefined) continue
      const schema = read.owner.definition.sharesSchema
      out[read.name] = schema === undefined
        ? structural(value)
        : encodeWith(
          schema,
          `${read.owner.definition.name}.shares`,
          value
        ) as Schema.Json
    }
    return { shared: cap(out) }
  }
  // A message can carry a query's whole result, so messages are capped like Models and query results.
  const capped = (
    component: Component.Any,
    field: "model" | "message",
    value: unknown
  ): Schema.Json => cap(through(component, field, value) as Schema.Json)
  const cap = (encoded: Schema.Json): Schema.Json => {
    if (maxEntryBytes === Infinity) return encoded
    const bytes = utf8Length(JSON.stringify(encoded))
    return bytes > maxEntryBytes ? { "~truncated": bytes } : encoded
  }
  const props = (
    entry: { readonly component: Component.Any; readonly props: unknown }
  ) => through(entry.component, "props", entry.props) as Schema.Json
  const events = (
    entry: {
      readonly component: Component.Any
      readonly events: ReadonlyArray<unknown>
    }
  ) =>
    entry.events.map((emitted) =>
      through(entry.component, "events", emitted) as Schema.Json
    )
  const run = (entry: CommandEnded | CommandInterrupted) => ({
    ...instanceBase(entry),
    name: entry.name,
    issued: entry.issued,
    spanId: entry.spanId ?? null,
    traceId: entry.traceId ?? null
  })
  return {
    encode(entry) {
      switch (entry._tag) {
        case "SessionStarted":
          return { _tag: "SessionStarted", ...base(entry), app: entry.app }
        case "FetchStarted":
          return {
            _tag: "FetchStarted",
            ...base(entry),
            query: entry.query,
            logKey: entry.logKey,
            trigger: entry.trigger,
            restart: entry.restart,
            inWindow: entry.inWindow,
            stored: entry.stored,
            ...(entry.page === undefined ? undefined : { page: entry.page }),
            ...(entry.cursor === undefined
              ? undefined
              : { cursor: entry.cursor })
          }
        case "Waiting":
          return {
            _tag: "Waiting",
            ...instanceBase(entry),
            props: props(entry),
            model: capped(entry.component, "model", entry.model),
            ...encodeQueries(entry.component, entry.queries),
            ...boundaryOf(entry)
          }
        case "Mounted":
          return {
            _tag: "Mounted",
            ...instanceBase(entry),
            props: props(entry),
            model: capped(entry.component, "model", entry.model),
            ...encodeQueries(entry.component, entry.queries),
            commands: entry.commands.map(encodeCommand),
            events: events(entry),
            adopted: entry.adopted,
            ...boundaryOf(entry)
          }
        case "Update":
          return {
            _tag: "Update",
            ...instanceBase(entry),
            source: encodeSource(entry.source),
            message: capped(entry.component, "message", entry.message),
            props: props(entry),
            model: capped(entry.component, "model", entry.model),
            ...encodeQueries(entry.component, entry.queries),
            ...encodeShared(entry.component, entry.shared),
            commands: entry.commands.map(encodeCommand),
            events: events(entry),
            lists: entry.lists,
            sends: entry.sends.map((send) => {
              const encoded = encodeSend(send)
              return { ...encoded, message: cap(encoded.message) }
            }),
            ...(entry.viewTransition === undefined
              ? undefined
              : { viewTransition: entry.viewTransition }),
            ...boundaryOf(entry),
            ...(entry.excluded === true ? { excluded: true } : undefined)
          }
        case "PropsChanged":
          return {
            _tag: "PropsChanged",
            ...instanceBase(entry),
            props: props(entry)
          }
        case "QueryChanged": {
          const schema =
            (entry.component["~queries"] as componentQueries.Bound | undefined)
              ?.logSchema
              .fields[entry.name]
          return {
            _tag: "QueryChanged",
            ...instanceBase(entry),
            name: entry.name,
            result: schema === undefined
              ? { "~unserialisable": "encode" }
              : cap(
                encodeWith(
                  schema,
                  `${entry.component.definition.name}.queries.${entry.name}`,
                  entry.result
                ) as Schema.Json
              )
          }
        }
        case "LayerPending":
          return {
            _tag: "LayerPending",
            ...instanceBase(entry),
            status: entry.status
          }
        case "LayerReady":
        case "Unmounted":
        case "Kept":
        case "Drawn":
          return { _tag: entry._tag, ...instanceBase(entry) }
        case "LayerFailed":
          return {
            _tag: "LayerFailed",
            ...instanceBase(entry),
            cause: encodeCause(entry.cause),
            ...(entry.redacted === true ? { redacted: true } : undefined)
          }
        case "Failed":
          return {
            _tag: "Failed",
            ...instanceBase(entry),
            props: props(entry),
            in: entry.in,
            name: entry.name ?? null,
            cause: encodeCause(entry.cause),
            ...(entry.update === undefined ? undefined : {
              update: {
                message: capped(
                  entry.component,
                  "message",
                  entry.update.message
                ),
                source: encodeSource(entry.update.source)
              }
            }),
            ...(entry.issued === undefined
              ? undefined
              : { issued: entry.issued })
          }
        case "MountStarted":
          return {
            _tag: "MountStarted",
            ...instanceBase(entry),
            name: entry.name,
            args: encodeArgs(entry.argsSchema, entry.args)
          }
        case "MountEnded":
          return {
            _tag: "MountEnded",
            ...instanceBase(entry),
            name: entry.name,
            started: entry.started,
            reason: entry.reason,
            silent: entry.silent
          }
        case "CommandStarted":
          return {
            _tag: "CommandStarted",
            ...instanceBase(entry),
            name: entry.name,
            issued: entry.issued,
            spanId: entry.spanId,
            traceId: entry.traceId
          }
        case "CommandAwaiting":
          return {
            _tag: "CommandAwaiting",
            ...instanceBase(entry),
            name: entry.name,
            issued: entry.issued,
            entries: entry.entries
          }
        case "CommandEnded":
          return {
            _tag: "CommandEnded",
            ...run(entry),
            silent: entry.silent,
            ...(entry.waitEnded === undefined
              ? undefined
              : { waitEnded: entry.waitEnded }),
            ...(entry.outstanding === undefined
              ? undefined
              : { outstanding: entry.outstanding })
          }
        case "CommandInterrupted":
          return {
            _tag: "CommandInterrupted",
            ...run(entry),
            reason: entry.reason
          }
        case "CommandDropped":
          return {
            _tag: "CommandDropped",
            ...instanceBase(entry),
            name: entry.name,
            issued: entry.issued,
            reason: entry.reason
          }
        case "SendDropped":
          return {
            _tag: "SendDropped",
            ...instanceBase(entry),
            owner: entry.owner,
            issued: entry.issued
          }
        case "SubscriptionStarted":
        case "SubscriptionStopped":
          return {
            _tag: entry._tag,
            ...instanceBase(entry),
            ...encodeSubscription(entry)
          }
      }
    }
  }
}

const base = (entry: Base) => ({
  seq: entry.seq,
  at: entry.at,
  session: entry.session,
  ...(entry.causedBy === undefined ? undefined : { causedBy: entry.causedBy })
})
const boundaryOf = (entry: { readonly boundary?: number | undefined }) =>
  entry.boundary === undefined ? undefined : { boundary: entry.boundary }

const instanceBase = (entry: InstanceBase) => ({
  ...base(entry),
  path: entry.path,
  instance: entry.instance,
  component: entry.component.definition.name
})

// JSON has no `-0`, and `structural` has the placeholder for a number that isn't finite.
const encodeSubscription = (
  subscription: {
    readonly key: string
    readonly name: string
    readonly deps: ReadonlyArray<Subscription.Dep> | undefined
  }
) => ({
  key: subscription.key,
  name: subscription.name,
  deps: subscription.deps === undefined
    ? null
    : subscription.deps.map((dep) => dep === 0 ? 0 : structural(dep))
})

const encodeSource = (source: Source): typeof SourceWire.Type => {
  switch (source._tag) {
    case "Command":
      return {
        ...source,
        spanId: source.spanId ?? null,
        traceId: source.traceId ?? null
      }
    case "Mount":
      return {
        _tag: "Mount",
        name: source.name,
        seq: source.seq,
        args: encodeArgs(source.argsSchema, source.args)
      }
    case "Subscription":
      return { _tag: "Subscription", ...encodeSubscription(source) }
    default:
      return source
  }
}

/**
 * Encodes a Command by name, group and args. Args and group fields use the
 * Command's `args` Schema, replacing every `Schema.Redacted` with a
 * placeholder. A leaf that fails to encode falls back to structural encoding.
 * An `Interrupt` has `null` args.
 *
 * @stability experimental
 * @category Wire
 * @since 0.1.0
 */
export const encodeCommand = (
  command: Command.Command<any, any>
): typeof CommandWire.Type => ({
  _tag: command._tag,
  name: command.name,
  group: encodeGroup(command),
  args: command._tag === "Interrupt"
    ? null
    : encodeArgs(command.argsSchema, command.args)
})

// The scheduling key holds the group fields' real encoding, so the log re-encodes them redacted.
const encodeGroup = (command: Command.Command<any, any>): string | null => {
  if (command.groupKey === undefined) return null
  const source =
    (command as { readonly "~group"?: Command.GroupSource | undefined })[
      "~group"
    ]
  return source === undefined
    ? JSON.stringify({ "~redacted": true })
    : canonical(encodeArgs(source.schema, source.picked))
}

/**
 * Encodes a `$.send` as the owner's definition name and the message. The
 * message goes through the owner's `receives` Schema the way `encodeArgs`
 * encodes Command args: redacted, with a structural fallback for what doesn't
 * encode.
 *
 * @stability experimental
 * @category Wire
 * @since 0.1.0
 */
export const encodeSend = (
  send: Component.Send
): { readonly owner: string; readonly message: Schema.Json } => ({
  owner: send.owner.definition.name,
  message: encodeArgs(send.owner.receives, send.message)
})

/** The redacting codec of `ast`, or `null` when it has none. */
const encoderOf = memoize(
  (ast: SchemaAST.AST): ((value: unknown) => unknown) | null => {
    try {
      return Schema.encodeUnknownSync(
        Schema.toCodecJson(
          Schema.make<Schema.Codec<unknown, unknown>>(redactAST(ast))
        )
      )
    } catch {
      return null
    }
  }
)
const guardOf = memoize((ast: SchemaAST.AST): (value: unknown) => boolean => {
  const is = Schema.is(Schema.make<Schema.Top>(ast))
  return (value) => {
    try {
      return is(value)
    } catch {
      return false
    }
  }
})
const isPlainRecord = (value: unknown): value is Record<PropertyKey, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) &&
  !Redacted.isRedacted(value)

/**
 * Detects objects anywhere in `ast` with a redacted index signature beside
 * another named or indexed signature. Each matching signature parses a key,
 * but the codec keeps only the named property's output or the last index
 * signature's. This can discard another signature's redaction, so these
 * Schemas bypass the whole codec.
 */
const holdsRedactedOverlap = memoize((ast: SchemaAST.AST): boolean => {
  const seen = new Set<SchemaAST.AST>()
  const visit = (node: SchemaAST.AST): boolean => {
    if (seen.has(node)) return false
    seen.add(node)
    if (
      node.encoding !== undefined &&
      node.encoding.some((link) => visit(link.to))
    ) return true
    switch (node._tag) {
      case "Objects":
        return (node.indexSignatures.length + node.propertySignatures.length >
            1 &&
          node.indexSignatures.some((index) => holdsRedacted(index.type))) ||
          node.propertySignatures.some((property) => visit(property.type)) ||
          node.indexSignatures.some((index) => visit(index.type))
      case "Arrays":
        return node.elements.some(visit) || node.rest.some(visit)
      case "Union":
        return node.types.some(visit)
      case "Suspend":
        return visit(node.thunk())
      case "Declaration":
        return node.typeParameters.some(visit)
      default:
        return false
    }
  }
  return visit(ast)
})

const redacted: Schema.Json = { "~redacted": true }
const failed: Schema.Json = { "~unserialisable": "encode" }
/** Reading a value can throw, from a getter. The log gets a placeholder for it instead. */
const guarded = (f: () => Schema.Json): Schema.Json => {
  try {
    return f()
  } catch {
    return failed
  }
}

interface Walk {
  readonly path: Set<object>
  readonly strict: boolean
  readonly leaf: (ast: SchemaAST.AST, value: unknown) => Schema.Json
}
/**
 * Encodes `value` through `ast`. When the whole fails, a struct, record,
 * tuple or array is encoded part by part, and a union through the member the
 * value belongs to, so only the leaf that fails falls back. A failing leaf
 * whose Schema declares a `Schema.Redacted` anywhere is a placeholder, since
 * `structural` can't tell which of its values is secret.
 *
 * Nothing is read that the codec wouldn't read, until a leaf falls back. A
 * cyclic value makes the codec overflow the stack, which is a failure like
 * any other: the walk goes on part by part, and the repeat is a placeholder.
 */
const encodeAt = (
  ast: SchemaAST.AST,
  value: unknown,
  walk: Walk
): Schema.Json => {
  if (typeof value === "object" && value !== null && walk.path.has(value)) {
    return { "~unserialisable": "cycle" }
  }
  const overlap = holdsRedactedOverlap(ast)
  const encode = overlap ? null : encoderOf(ast)
  if (encode !== null) {
    try {
      // A Schema such as `Schema.Any` passes a value through, so the result goes through `structural` too.
      return structural(encode(value))
    } catch {
      // Encoded part by part below.
    }
  }
  if (
    walk.strict &&
    (!overlap || (ast.checks !== undefined && !guardOf(ast)(value)))
  ) return walk.leaf(ast, value)
  if (ast.encoding === undefined) {
    switch (ast._tag) {
      case "Suspend":
        return encodeAt(ast.thunk(), value, walk)
      case "Objects":
        if (isPlainRecord(value)) {
          return within(walk.path, value, () => encodeObject(ast, value, walk))
        }
        break
      case "Arrays":
        if (Array.isArray(value)) {
          return within(walk.path, value, () => encodeArray(ast, value, walk))
        }
        break
      case "Union": {
        const member = ast.types.find((type) => guardOf(type)(value))
        if (member !== undefined) return encodeAt(member, value, walk)
        break
      }
    }
  }
  return walk.leaf(ast, value)
}
const within = <A>(path: Set<object>, value: object, f: () => A): A => {
  path.add(value)
  try {
    return f()
  } finally {
    path.delete(value)
  }
}
/**
 * The keys the parser outputs, each with every Schema that applies to it: its
 * property signature, if it has one, and every index signature it matches. The
 * parser runs all of them, even when it keeps only one output, so each one's
 * redaction counts. A key that matches nothing is left out. Only keys are read
 * here, never values.
 */
const encodeObject = (
  ast: SchemaAST.Objects,
  value: Record<PropertyKey, unknown>,
  walk: Walk
): Schema.Json => {
  const applies = new Map<string, Array<SchemaAST.AST>>()
  for (const property of ast.propertySignatures) {
    if (
      typeof property.name === "string" && Object.hasOwn(value, property.name)
    ) {
      applies.set(property.name, [property.type])
    }
  }
  const properties = new Set(applies.keys())
  for (const index of ast.indexSignatures) {
    for (const key of getIndexSignatureKeys(value, index.parameter)) {
      if (typeof key !== "string") continue
      const types = applies.get(key)
      if (types === undefined) applies.set(key, [index.type])
      else if (!types.includes(index.type)) types.push(index.type)
    }
  }
  const out: Record<string, Schema.Json> = {}
  for (const [key, types] of applies) {
    // Under two Schemas, either one's redaction could apply, so it's a placeholder. Otherwise the
    // parser's output is kept: the property's, or else the last index signature's.
    const type = properties.has(key) ? types[0]! : types[types.length - 1]!
    out[key] = types.length > 1 && types.some(holdsRedacted)
      ? redacted
      : guarded(() => encodeAt(type, value[key], walk))
  }
  return out
}
/** Elements, then the rest, then the trailing elements, which take the last positions. */
const encodeArray = (
  ast: SchemaAST.Arrays,
  value: ReadonlyArray<unknown>,
  walk: Walk
): Schema.Json => {
  const [rest, ...tail] = ast.rest
  const tailStart = Math.max(ast.elements.length, value.length - tail.length)
  return value.map((item, i) => {
    const element = i < ast.elements.length
      ? ast.elements[i]
      : rest === undefined
      ? undefined
      : i >= tailStart
      ? tail[i - tailStart]
      : rest
    return element === undefined
      ? walk.leaf(ast, item)
      : encodeAt(element, item, walk)
  })
}
const fallback = (ast: SchemaAST.AST, value: unknown): Schema.Json =>
  holdsRedacted(ast) ? redacted : guarded(() => structural(value))

/**
 * Encodes a value through a Schema with every `Schema.Redacted` redacted. A
 * leaf that fails to encode, such as a `File` under `Schema.instanceOf`,
 * falls back to `structural` on its own, and its siblings keep their codecs.
 * It never throws: a value that can't be read is a placeholder.
 *
 * @internal
 */
export const encodeArgs = (schema: Schema.Top, value: unknown): Schema.Json => {
  const walk: Walk = { path: new Set(), strict: false, leaf: fallback }
  // A struct or a class is encoded field by field.
  const fields = (schema as { readonly fields?: Schema.Struct.Fields }).fields
  if (fields !== undefined && isPlainRecord(value)) {
    return within(walk.path, value, () => {
      const out: Record<string, Schema.Json> = {}
      for (const key of Object.keys(fields)) {
        if (!Object.hasOwn(value, key)) continue
        out[key] = guarded(() =>
          encodeAt((fields[key] as Schema.Top).ast, value[key], walk)
        )
      }
      return out
    })
  }
  return guarded(() => encodeAt(schema.ast, value, walk))
}

const encodeCause = (cause: Cause.Cause<unknown>): typeof CauseWire.Type => ({
  pretty: Cause.pretty(cause),
  reasons: cause.reasons.map((reason): Schema.Json =>
    Cause.isFailReason(reason)
      ? { _tag: "Fail", error: structural(reason.error) }
      : Cause.isDieReason(reason)
      ? { _tag: "Die", defect: structural(reason.defect) }
      : { _tag: "Interrupt", fiberId: reason.fiberId ?? null }
  )
})

/**
 * The Schema the log encodes with: every `Schema.Redacted` in `schema`
 * encodes as `{ "~redacted": true }`, which never decodes. A Schema without
 * one is returned as is.
 *
 * @stability experimental
 * @category Wire
 * @since 0.1.0
 */
export const redactSchema = <S extends Schema.Top>(schema: S): S | Schema.Top =>
  holdsRedacted(schema.ast)
    ? Schema.make<Schema.Top>(redactAST(schema.ast))
    : schema

/**
 * Encodes any value as JSON, best effort, with the Wire's placeholders for
 * what has no JSON form.
 *
 * @stability experimental
 * @category Wire
 * @since 0.1.0
 */
export const structural = (
  value: unknown,
  seen: Set<unknown> = new Set()
): Schema.Json => {
  switch (typeof value) {
    case "string":
    case "boolean":
      return value
    case "number":
      return Number.isFinite(value) ? value : { "~unserialisable": "number" }
    case "undefined":
      return null
    case "bigint":
    case "symbol":
    case "function":
      return { "~unserialisable": typeof value }
  }
  if (value === null) return null
  if (Redacted.isRedacted(value)) return { "~redacted": true }
  if (seen.has(value)) return { "~unserialisable": "cycle" }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? { "~unserialisable": "Date" }
      : value.toISOString()
  }
  if (value instanceof Error) {
    return { name: value.name, message: value.message }
  }
  seen.add(value)
  try {
    if (Array.isArray(value)) return value.map((item) => structural(item, seen))
    const proto = Object.getPrototypeOf(value as object)
    if (proto !== Object.prototype && proto !== null) {
      if (typeof (value as any).toJSON === "function") {
        return structural((value as any).toJSON(), seen)
      }
      if (
        value instanceof Map || value instanceof Set ||
        ArrayBuffer.isView(value)
      ) {
        return { "~unserialisable": value.constructor.name }
      }
    }
    const out: Record<string, Schema.Json> = {}
    for (const key of Object.keys(value as object)) {
      out[key] = structural((value as any)[key], seen)
    }
    return out
  } finally {
    seen.delete(value)
  }
}

const utf8Length = (text: string): number => {
  let bytes = 0
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index)
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code >= 0xd800 && code < 0xdc00) {
      bytes += 4
      index++
    } else bytes += 3
  }
  return bytes
}

/**
 * Makes a log that encodes entries off the runtime's path. `record` only
 * queues an entry. A fiber in the current Scope takes everything queued,
 * encodes it as Wire frames, and passes the batch to `onBatch`.
 *
 * **Details**
 *
 * The runtime calls `record` on every `update`, so a sink that sends frames
 * somewhere builds on this rather than encode inside `record`. A value whose
 * Schema fails to encode is sent as a placeholder, and a warning is logged
 * the first time per component and field. `maxEntryBytes` caps Models,
 * messages, query results and shared values, as in `makeEncoder`. A batch
 * whose `onBatch` dies is dropped, and an error is logged. Entries
 * recorded once the Scope has closed are dropped.
 *
 * **Example** (Keeping encoded frames in an array)
 *
 * ```ts
 * import { MessageLog } from "@effect/ui"
 * import { Effect, Layer } from "effect"
 *
 * const frames: Array<MessageLog.WireEntry> = []
 *
 * const FramesLog = Layer.effect(
 *   MessageLog.MessageLog,
 *   MessageLog.makeEncoded((batch) => Effect.sync(() => frames.push(...batch)))
 * )
 * ```
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const makeEncoded = (
  onBatch: (batch: ReadonlyArray<WireEntry>) => Effect.Effect<void>,
  options?: { readonly maxEntryBytes?: number | undefined }
): Effect.Effect<MessageLog, never, Scope.Scope> =>
  Effect.gen(function*() {
    const entries = yield* Queue.unbounded<Entry>()
    const warnings: Array<string> = []
    const encoder = makeEncoder({
      maxEntryBytes: options?.maxEntryBytes,
      onWarning: (message) => warnings.push(message)
    })
    yield* Queue.takeAll(entries).pipe(
      Effect.flatMap((batch) =>
        Effect.suspend(() => {
          const frames = batch.map((entry) => encoder.encode(entry))
          const logged = warnings.splice(0)
          return Effect.andThen(
            Effect.catchCause(
              Effect.suspend(() => onBatch(frames)),
              (cause) =>
                Effect.logError(
                  "MessageLog: onBatch failed, and its batch was dropped",
                  cause
                )
            ),
            logged.length === 0
              ? Effect.void
              : Effect.forEach(logged, (message) => Effect.logWarning(message))
          )
        })
      ),
      Effect.forever,
      Effect.ensuring(Queue.shutdown(entries)),
      Effect.forkScoped
    )
    return {
      enabled: true,
      record: (entry: Entry) => {
        Queue.offerUnsafe(entries, entry)
      }
    }
  })

interface Sent {
  readonly seq: number
  readonly tag: WireEntry["_tag"]
  readonly owner: string
  /**
   * Identifies frames that replace one another during replay. State frames
   * use their sequence number so queued commands can keep older frames alive.
   */
  readonly slot: string
  readonly frame: string
}

const slotOf = (entry: WireEntry): string => {
  switch (entry._tag) {
    case "Waiting":
    case "Mounted":
    case "Update":
      return String(entry.seq)
    case "PropsChanged":
      return "props"
    case "QueryChanged":
      return "query/" + entry.name
    case "Failed":
    case "CommandStarted":
    case "CommandEnded":
    case "CommandInterrupted":
    case "CommandDropped":
      return entry.issued === undefined
        ? ""
        : entry.issued.seq + "/" + entry.issued.index
    default:
      return ""
  }
}

/**
 * Streams entries to a devtools process over a WebSocket, as newline-free
 * JSON Wire frames, one per message.
 *
 * **Details**
 *
 * Entries are encoded by `makeEncoded`. The Layer keeps the last `buffer`
 * frames (1,000 by default), which every new connection receives after its
 * `Hello`. It also retains older frames needed to reconstruct mounted
 * instances, their current state, and waiting or running commands. Retained
 * command outcomes prevent completed commands from appearing as waiting.
 * Older history may be missing.
 *
 * Session starts are retained for the lifetime of the layer. An instance
 * releases its retained frames when its `Unmounted` leaves the buffer.
 * Retained frames precede the buffer in sequence order on each connection.
 * A lost connection is retried with backoff, and one warning is logged.
 *
 * @stability experimental
 * @category layers
 * @since 0.1.0
 */
export const socket = (url: string, options?: {
  readonly buffer?: number | undefined
  readonly maxEntryBytes?: number | undefined
  readonly host?: WireHost | undefined
}): Layer.Layer<never, never, Socket.WebSocketConstructor> =>
  Layer.effect(
    MessageLog,
    Effect.gen(function*() {
      const size = Math.max(1, options?.buffer ?? 1_000)
      const outbox = yield* Queue.unbounded<string>()
      const replay: Array<Sent> = []
      // Frames that left `replay` and still hold live state.
      const sessions = new Map<string, Sent>()
      const live = new Map<string, Map<string, Sent>>()
      // A queued command has no CommandStarted yet; its issuing frame is
      // the only record replay can use to restore it.
      const pending = new Map<string, Set<string>>()
      const hello = JSON.stringify({
        _tag: "Hello",
        version: wireVersion,
        host: options?.host ?? "browser"
      })

      const isState = (tag: WireEntry["_tag"]) =>
        tag === "Waiting" || tag === "Mounted" || tag === "Update"
      const issues = (owner: string, slot: string) => {
        for (const run of pending.get(owner) ?? []) {
          if (run.startsWith(slot + "/")) return true
        }
        return false
      }

      const keep = (sent: Sent) => {
        const { tag, owner, slot } = sent
        if (tag === "SessionStarted") return void sessions.set(owner, sent)
        if (tag === "Unmounted") return void live.delete(owner)
        let kept = live.get(owner)
        if (isState(tag)) {
          if (kept === undefined) live.set(owner, kept = new Map())
          // State frames include props and query results, superseding earlier
          // changes. Keep Mounted to establish the instance, and older state
          // frames only while they are needed to restore queued commands.
          const replaced = new Set<string>()
          for (const [at, old] of kept) {
            if (at === "props" || at.startsWith("query/")) kept.delete(at)
            else if (
              isState(old.tag) && old.tag !== "Mounted" && !issues(owner, at)
            ) replaced.add(at)
          }
          for (const [at, old] of kept) {
            if (
              replaced.has(at) ||
              (old.tag !== "CommandStarted" && replaced.has(at.split("/")[0]))
            ) kept.delete(at)
          }
          kept.set(slot, sent)
        } else if (kept === undefined || slot === "") {
          return
        } else if (
          tag === "CommandStarted" || tag === "PropsChanged" ||
          tag === "QueryChanged" ||
          // A run's end is kept while the frame that issued it is, so
          // replaying that frame doesn't open the run again.
          kept.has(slot.slice(0, slot.indexOf("/")))
        ) kept.set(slot, sent)
        else kept.delete(slot)
      }

      const log = yield* makeEncoded(
        (batch) =>
          Effect.sync(() => {
            for (const encoded of batch) {
              const frame = JSON.stringify(encoded)
              const owner = "instance" in encoded
                ? encoded.session + "/" + encoded.instance
                : encoded.session
              const slot = slotOf(encoded)
              if (encoded._tag === "Unmounted") pending.delete(owner)
              else if ("commands" in encoded) {
                encoded.commands.forEach((command, index) => {
                  if (command._tag === "Interrupt") return
                  let runs = pending.get(owner)
                  if (runs === undefined) pending.set(owner, runs = new Set())
                  runs.add(slot + "/" + index)
                })
              } else if (slot !== "") pending.get(owner)?.delete(slot)
              replay.push({
                seq: encoded.seq,
                tag: encoded._tag,
                owner,
                slot,
                frame
              })
              if (replay.length > size) keep(replay.shift()!)
              Queue.offerUnsafe(outbox, frame)
            }
          }),
        { maxEntryBytes: options?.maxEntryBytes }
      )

      const replayed = () => {
        const kept = Array.from(sessions.values())
        for (const instance of live.values()) kept.push(...instance.values())
        kept.sort((a, b) => a.seq - b.seq)
        return [hello, ...kept.concat(replay).map((sent) => sent.frame)]
      }

      const connection = Effect.gen(function*() {
        const ws = yield* Socket.makeWebSocket(url)
        const writer = yield* ws.writer
        const reader = yield* ws.reader
        // What's queued is already in the replay buffer, so it's sent from there.
        const backlog = yield* Effect.map(Queue.clear(outbox), replayed)
        yield* Effect.forEach(backlog, (frame) => writer.write(frame), {
          discard: true
        })
        return yield* Effect.raceFirst(
          Effect.forever(
            Effect.flatMap(Queue.take(outbox), (frame) => writer.write(frame))
          ),
          Effect.forever(reader.pull)
        )
      }).pipe(Effect.scoped)

      let warned = false
      yield* connection.pipe(
        Effect.tapCause((cause) =>
          warned ? Effect.void : Effect.suspend(() => {
            warned = true
            return Effect.logWarning(
              `MessageLog: lost the connection to ${url}, retrying`,
              cause
            )
          })
        ),
        Effect.retry(
          Schedule.min([
            Schedule.exponential("200 millis"),
            Schedule.spaced("10 seconds")
          ])
        ),
        Effect.forever,
        Effect.forkScoped
      )

      return log
    })
  )
