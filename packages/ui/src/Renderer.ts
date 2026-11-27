/**
 * The renderer: mounts a component tree on a `Host` and keeps it in step with
 * each instance's Model.
 *
 * Rendering is a virtual DOM bounded by components. A message re-runs only the
 * view of the instance that received it, and the diff against its last view
 * stops at a child: a child's nodes belong to the child, and the parent only
 * places, moves or removes them. A child re-renders only when its props change,
 * compared shallowly. Dirty instances render in one flush, parents before
 * children.
 *
 * One render comes before its flush: a message or a query result for an
 * instance renders the dirty instances above it first, so its `update` reads
 * current props. The instance's own view still waits for the flush.
 *
 * The renderer only talks to a `Host`, which the `Renderer` service provides,
 * so switching target is a Layer swap. `Host` is public so third parties can
 * implement one.
 *
 * @stability experimental
 * @since 0.1.0
 */
import type * as Context from "effect/Context"
import type * as Duration from "effect/Duration"
import type * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import type * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Schema from "effect/Schema"
import * as SchemaTransformation from "effect/SchemaTransformation"
import type * as Scope from "effect/Scope"
import type * as Component from "./Component.ts"
import * as runtime from "./internal/runtime.ts"
import * as services from "./internal/services.ts"
import type * as View from "./View.ts"

/**
 * How a host reports an event: the event's name, the handler it found on the
 * innermost element with one, and the payload it built.
 *
 * **Details**
 *
 * The handler runs once, synchronously. When it produces a message,
 * `onMessage` runs before the message is sent, while the host's event is
 * still being handled, so the host can cancel the event's default there. It
 * doesn't run when the handler returns `undefined` or fails, or when the
 * instance is gone or not yet started. The result is whether a handler
 * produced a message.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Dispatch = (
  event: string,
  handler: View.Handler<unknown, any>,
  payload: unknown,
  onMessage?: (() => void) | undefined
) => boolean

/**
 * An element's events as a host reads them: its handlers, the dispatch that
 * runs them and their options.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Events {
  readonly handlers: Readonly<Record<string, View.Handler<unknown, any>>>
  readonly dispatch: Dispatch
  readonly options: Readonly<Record<string, View.EventOptions>>
}

/**
 * How a host reads its elements' events from the renderer when an event
 * fires, instead of storing them per element with `setEvents`.
 *
 * **Details**
 *
 * Each mount calls `connect` once with its `lookup`, and calls the function
 * it returns when the mount ends. A host may serve several mounts at once, so
 * it asks each mount's lookup. `lookup` takes an event's path, innermost node
 * first, as `composedPath()` gives it, and returns, at each index, the events
 * of that node if it is an element of the mount's tree. The renderer reads
 * them from the tree it rendered last, so a node that is no longer in the
 * tree gets no events. While a patch runs, the events it gave an element come
 * first: an event the patch causes, such as one a custom element's
 * `connectedCallback` fires, gets what `setEvents` would have given. The nodes of a
 * detached child are found from its container, for a host that dispatches
 * events there: a host listening on the document gets none from them.
 *
 * `listen` is called where `setEvents` would be, with the handlers and
 * options of an element that has some, so the host can start listening for
 * the events they name. It may be called again with the same names.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface HostEvents<Node> {
  connect(
    lookup: (path: ReadonlyArray<Node>) => ReadonlyArray<Events | undefined>
  ): () => void
  listen(
    handlers: Readonly<Record<string, View.Handler<unknown, any>>>,
    options: Readonly<Record<string, View.EventOptions>>
  ): void
}

/**
 * What a target must provide to show views: node operations plus a few
 * capabilities.
 *
 * **Details**
 *
 * The renderer never inserts by index and never relies on comment nodes: a
 * child's node range is computed from its rendered tree. Property values are
 * `unknown`, so a host decides what a property means. Hosts own events: an
 * element's handlers are stored as data with `setEvents`, and the host turns
 * its own events into plain payloads and calls `dispatch` for the innermost
 * element with a handler, so re-rendering never touches listeners. The
 * element's `EventOptions` come with its handlers: a host with cancellable
 * events honours `preventDefault: true` from `dispatch`'s `onMessage`, and
 * `preventDefault: "always"` before it calls `dispatch`.
 *
 * A handler value is opaque to the host. It may be a message, a function or
 * a value the renderer made, such as the one standing for every layer of an
 * element that parts of headless components decorated. The host stores it
 * as given and passes that same value back to `dispatch`, never calling or
 * copying it.
 *
 * `elements` lists the vocabularies the host shows, by name, or is `"any"`.
 * `controlled` lists the properties re-applied after every patch, since the
 * user may have changed them; the host skips a no-op. Its members must not
 * change once the host renders. `runsMounts` is `false` on hosts that never
 * run `onMount` work. `commit` is called once at the end of each flush and
 * after mounting, for hosts that apply changes in a batch.
 *
 * `head` receives the head the runtime folded, in the root vocabulary's form
 * (an `HtmlHead` for `Html` when `HtmlHead` is imported, else a title-only
 * `Head`), after the commit of every flush that changed
 * a view, once every instance has adopted. The host diffs it against what it
 * applied last. A mount with `head: false` never calls it. A host without a
 * document, such as a native one, leaves it out and the head is only
 * computed.
 *
 * `hydration` lets the renderer read nodes a server rendered, so a
 * hydrating mount adopts them. A host without it builds every node fresh.
 *
 * `createContainer` makes a node that holds the nodes of a kept child out of
 * the document, such as a `DocumentFragment`. It is never inserted. A host
 * without it fails the author of a child it keeps.
 *
 * `events`, if given, has the host read an element's events from the
 * renderer when an event fires, so the host stores nothing per element and
 * `setEvents` is never called. A host without it gets `setEvents`.
 *
 * `removeChildren`, if given, removes `nodes`, all children of `parent`, at
 * once, as `remove` on each would. The renderer may call it when a patch
 * removes every node of a list, so a host can clear a parent that holds
 * nothing else in one step. A host without it gets `remove` for each node.
 *
 * `unmounting`, if given, is called once when a mount's Scope closes, before
 * its instances close or its nodes are removed, so a host such as a terminal
 * can keep the last frame. `nodes` are the mount's own top-level nodes in
 * `container`, in order and still attached, including the empty text node a
 * blank view leaves. If it throws, the mount still tears down and closing the
 * Scope dies with the error. The `BrowserHost` DOM path, and a mount whose
 * Scope closed before it placed anything, never call it.
 *
 * `viewTransition`, if given, is called for a flush that renders an update
 * whose step called `$.viewTransition`, before it renders, with the rest of
 * the flush as `update` and the types the steps asked for. The host calls
 * `update` once, now or later, such as inside `document.startViewTransition`.
 * Until it does, the flush waits, and what arrives meanwhile renders in it,
 * without adding its types.
 * Once the root has closed, `update` does nothing. A host without it ignores
 * the request, and the flush runs as any other. The first mount never calls
 * it.
 *
 * `hot: true` lets a hot-reload runtime swap the code of a component mounted
 * on the host without losing its state, as Vite's does in the browser. In
 * development, `mount` registers its root with the hook at
 * `globalThis[Symbol.for("@effect/ui/hot/swap")]`, which takes the first
 * and the next exports of a module and the names of its components, swaps
 * them in place and returns `true`, or returns `false` when the change
 * needs a reload. In production it does nothing.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Host<Node> {
  createElement(tag: string): Node
  createText(text: string): Node
  setText(node: Node, text: string): void
  /**
   * Sets an attribute of `node`, or removes it when `value` is `undefined`.
   * `previous` is the value the renderer takes the attribute to hold before
   * the call: the one it last set, or the one hydration read from the node,
   * and `undefined` when it holds none.
   */
  setAttr(
    node: Node,
    name: string,
    value: string | undefined,
    previous?: string | undefined
  ): void
  setProp(node: Node, name: string, value: unknown): void
  insertBefore(parent: Node, node: Node, ref: Node | undefined): void
  remove(node: Node): void
  parentOf(node: Node): Node | undefined
  nextOf(node: Node): Node | undefined
  setEvents(
    node: Node,
    handlers: Readonly<Record<string, View.Handler<unknown, any>>>,
    dispatch: Dispatch,
    options: Readonly<Record<string, View.EventOptions>>
  ): void
  readonly elements: ReadonlyArray<string> | "any"
  readonly controlled: ReadonlySet<string>
  readonly runsMounts: boolean
  /**
   * Returns `attrs` keyed by the names `setAttr` stores them under on `node`,
   * the later of two aliases winning, so that updating or removing a losing
   * alias does not change the winning one. May return `attrs` itself. The
   * names it returns are passed to `setAttr` as they are.
   */
  readonly normalizeAttrs?:
    | ((
      node: Node,
      attrs: Readonly<Record<string, string>>
    ) => Readonly<Record<string, string>>)
    | undefined
  readonly commit?: (() => void) | undefined
  readonly head?: ((head: any) => void) | undefined
  readonly hydration?: Hydration<Node> | undefined
  readonly createContainer?: (() => Node) | undefined
  readonly removeChildren?:
    | ((parent: Node, nodes: ReadonlyArray<Node>) => void)
    | undefined
  readonly events?: HostEvents<Node> | undefined
  readonly viewTransition?:
    | ((update: () => void, types: ReadonlyArray<string>) => void)
    | undefined
  readonly unmounting?:
    | ((container: Node, nodes: ReadonlyArray<Node>) => void)
    | undefined
  readonly hot?: boolean | undefined
}

/**
 * How a host reads the nodes a server rendered, so hydration can adopt them.
 *
 * **Details**
 *
 * The server brackets an instance's nodes with two markers carrying its path,
 * `<!--[path-->` and `<!--]path-->` in HTML, except for a declared child whose
 * state is shipped, whose component provides no `Layer`, and whose view's root
 * is an element: that child is written as its element alone, and hydration
 * matches it by position when its path is in the state. Hydration still
 * accepts marker pairs for any child. `inspect` tells the renderer what a node
 * is: an element by tag, a text node, one of those markers, or anything else,
 * which never matches. Siblings are read with the host's `nextOf`. An element
 * whose content the host parses as text only, such as an HTML `textarea`, is
 * marked `textOnly`: the server writes only its text, and hydration adopts the
 * element but builds its children fresh.
 *
 * `adoptProp`, if given, sets a property of an adopted element in place of
 * `setProp`, so the host can keep what the user changed in the server's
 * nodes before they adopted. A host without it gets `setProp`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Hydration<Node> {
  firstChild(node: Node): Node | undefined
  inspect(node: Node):
    | {
      readonly _tag: "Element"
      readonly tag: string
      readonly textOnly?: boolean | undefined
    }
    | { readonly _tag: "Text"; readonly text: string }
    | { readonly _tag: "Open"; readonly path: string }
    | { readonly _tag: "Close"; readonly path: string }
    | { readonly _tag: "Other" }
  getAttr(node: Node, name: string): string | undefined
  readonly adoptProp?:
    | ((node: Node, name: string, value: unknown) => void)
    | undefined
}

/**
 * What a server render hands the client: each instance's Schema-encoded
 * Model and query results by path, the paths to build fresh, and the query entries the
 * server's per-request cache settled.
 *
 * **Details**
 *
 * `~deferred` lists instances the client builds fresh instead of adopting:
 * a provided Layer kept off the server, and state that can't be shipped. A
 * deferred path covers its subtree.
 *
 * `~query` holds every entry that settled on the server, a typed Failure
 * included, by query name and args key. The client's cache hydrates from it,
 * so a watch over a shipped entry doesn't fetch while the hydration window is
 * open. An entry still in flight at the budget isn't shipped, and the client
 * fetches it. `~static` is set by a render with `static: true`.
 *
 * `~reported` holds, by path, the message an owner of shared state last got
 * from its readers' reports. An owner that adopts its Model starts from it,
 * so the client sends that message again only if its reports differ, even
 * with no reader left to report. The comparison waits until nothing below the
 * owner is still building its Layer to adopt. An owner whose message Schema holds a
 * `Schema.Redacted` can't ship it, so it's deferred with its subtree.
 *
 * **Gotchas**
 *
 * Query data is public: a query's success, error and args are in the state
 * even when no view renders them.
 *
 * An instance whose Model or query Schemas hold a `Schema.Redacted` is
 * never in the state: it's deferred, so the client builds it and its
 * subtree fresh, and the server logs a warning once per component.
 *
 * The client decodes the state with its own Schemas, so it has to come from a
 * server on the same build. A path whose state doesn't decode isn't adopted:
 * the client runs `init` and builds it and its subtree fresh. Only `~query`
 * hydrates the cache. Without it, every query fetches again, and instances
 * whose snapshots reference `~query` are built fresh rather than adopted.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface State {
  readonly [path: string]: unknown
  readonly "~deferred"?: ReadonlyArray<string> | undefined
  readonly "~query"?: unknown
  readonly "~reported"?: { readonly [path: string]: unknown } | undefined
  readonly "~static"?: boolean | undefined
}

/**
 * A node of a server-rendered tree. A `Range` is one instance's nodes, a
 * slot's content, or the `fallback` of a child, under its path. A declared
 * child whose state is shipped, whose component provides no `Layer`, and whose
 * view's root is an element is emitted as that `Element` without a wrapping
 * `Range`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ServerNode =
  | {
    readonly _tag: "Element"
    readonly tag: string
    readonly attrs: Readonly<Record<string, string>>
    readonly props: Readonly<Record<string, unknown>>
    readonly children: ReadonlyArray<ServerNode>
  }
  | { readonly _tag: "Text"; readonly text: string }
  | {
    readonly _tag: "Range"
    readonly path: string
    readonly children: ReadonlyArray<ServerNode>
  }

/**
 * The result of `prerender`: the tree to serialise, the state the client
 * adopts, the root's Model and the folded head.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Prerendered<out Model, out H = unknown> {
  readonly nodes: ReadonlyArray<ServerNode>
  readonly state: State
  /** The root's Model after the server run, or `undefined` if the root failed. */
  readonly model: Model | undefined
  /** The head folded with the root vocabulary's merge: an `HtmlHead` for `Html`. */
  readonly head: H
}

/**
 * The `Renderer` service: the `Host` a tree is mounted on.
 *
 * @stability experimental
 * @category services
 * @since 0.1.0
 */
export interface Renderer {
  readonly host: Host<any>
}

/**
 * The `Renderer` service.
 *
 * @stability experimental
 * @category services
 * @since 0.1.0
 */
export const Renderer: Context.Service<Renderer, Renderer> = services.Renderer

/**
 * Provides a `Host` to mount on.
 *
 * @stability experimental
 * @category layers
 * @since 0.1.0
 */
export const layer = <Node>(host: Host<Node>): Layer.Layer<Renderer> =>
  Layer.succeed(Renderer, { host })

/**
 * A name for an element, so a Command can reach its host node.
 *
 * **Details**
 *
 * Refs are declared at module level and typed by the node they reach, so a
 * vocabulary types them by tag. A ref resolves within the instance that issued
 * the Command, so two instances never collide. `at` derives a ref for one row
 * of a list.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Ref<in out Node> {
  readonly name: string
  /** The name plus any `at` keys: what the element stores. */
  readonly key: string
  /** A ref for one row: `Row.at(id)`. */
  readonly at: (key: string | number) => Ref<Node>
  readonly "~Node"?: (_: Node) => Node
}

/**
 * Declares a ref. A vocabulary wraps this to type the node by tag.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const ref = <Node = unknown>(name: string): Ref<Node> =>
  refAt(name, name)

const refAt = <Node>(name: string, key: string): Ref<Node> => ({
  name,
  key,
  at: (row) => refAt(name, `${key}[${row}]`)
})

const isRef = (u: unknown): u is Ref<any> =>
  Predicate.hasProperty(u, "name") && typeof u.name === "string" &&
  Predicate.hasProperty(u, "key") &&
  typeof u.key === "string" && Predicate.hasProperty(u, "at") &&
  typeof u.at === "function"

/**
 * The Schema of a ref in a Command's `args`: it encodes to the ref's `key`.
 *
 * **Details**
 *
 * The log shows a ref Command's args through it. Decoding a key gives a ref
 * with that key, named by the part before any `at` keys.
 *
 * **Gotchas**
 *
 * The name is read up to the first `[`, so a ref whose name contains `[`
 * decodes with a shorter name. Its `key` is still exact, and the runtime
 * resolves refs by key.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const Ref: Schema.decodeTo<Schema.declare<Ref<any>>, Schema.String> =
  Schema.String.pipe(
    Schema.decodeTo(
      Schema.declare(isRef, { expected: "Renderer.Ref" }),
      SchemaTransformation.transform({
        decode: (key: string): Ref<any> => {
          const at = key.indexOf("[")
          return refAt(at < 0 ? key : key.slice(0, at), key)
        },
        encode: (ref: Ref<any>) => ref.key
      })
    )
  )

/**
 * How a Command reaches an element of the instance that issued it.
 *
 * **Details**
 *
 * `lookup` waits until the render the issuing `update` caused has been
 * committed, and returns `Option.none()` for a ref that isn't rendered. The
 * runtime gives every Command run one, so it's a framework service and never
 * part of a component's requirements.
 *
 * @stability experimental
 * @category services
 * @since 0.1.0
 */
export interface Refs {
  readonly lookup: <Node>(ref: Ref<Node>) => Effect.Effect<Option.Option<Node>>
}

/**
 * The `Refs` service.
 *
 * @stability experimental
 * @category services
 * @since 0.1.0
 */
export const Refs: Context.Service<Refs, Refs> = services.Refs

/**
 * A mounted tree.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Root<out Model, in Msg> {
  /** The root instance's path, `/<name>`. */
  readonly path: string
  /** The session the message log groups this mount's entries under. */
  readonly session: string
  /** The root's current Model, or `undefined` before `init` or after a crash. */
  readonly model: () => Model | undefined
  /** Sends a message to the root, as if from outside the tree. */
  readonly send: (message: Msg) => void
  /**
   * Completes once every instance has adopted the server's nodes, at once
   * without hydration. Head sync and the router's announcements start with
   * the commit of the flush that finished adoption, which may still be
   * running when this completes, so don't expect the document head to show
   * it yet.
   */
  readonly adopted: Effect.Effect<void>
}

/**
 * What `mount` requires for a root with vocabulary `V`: the vocabulary's host
 * marker, or nothing for a host-neutral root.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type HostOf<V> = [V] extends [never] ? never
  : V extends View.Elements ? V["Host"]
  : never

/**
 * Mounts a component tree in `container` on the `Renderer`'s host, for the
 * life of the current Scope.
 *
 * **Details**
 *
 * Every instance gets its own child Scope. Commands, Subscriptions and
 * provided Layers run in it, and closing the Scope unmounts the tree. Every
 * child is a failure boundary: a failed child shows its `fallback` until
 * its key changes. When the root itself fails, `fallback` is shown in its place
 * and the log records the root's `Failed` and `Unmounted`.
 *
 * Mounting requires the root vocabulary's host marker, so mounting a root on
 * the wrong host is a type error. Nested components are checked when they
 * mount, and a mismatch fails that child.
 *
 * `props` is the root's props or an Effect of them, such as
 * `Router.props(AppRoute)`. An Effect is run once, before `init`, and its
 * requirements are added to the mount's. `init` still only sees plain props,
 * so a Story or a test can pass them directly.
 *
 * It builds every node fresh. A server render is hydrated with
 * `HtmlHydrate.hydrate`.
 *
 * `onEmit` receives the root's events in emission order, as a parent's
 * `onEmit` would; without it nothing is retained. `init`'s events arrive
 * before `mount` returns and an update's inside `send`, both before the
 * container shows the new view, so don't read the container from the
 * callback. If the callback throws, the root fails `in` `"onEmit"` and the
 * transition's remaining events are dropped.
 *
 * The mount owns the head: on every flush that changed a view it folds the
 * placed tree's head with the root vocabulary's merge, and gives it to the
 * host's `head` once every instance has adopted. Two siblings that set one
 * single slot, such as the title, are reported to `Query.Problems` as a
 * `Head.Conflict`. With `head: false`, for a mount embedded in a page
 * something else owns, the head is computed and the Router still reads its
 * title, but the host is never given it.
 *
 * **Gotchas**
 *
 * Any Effect passed as `props` is run, so a root's props can't themselves be
 * an Effect. Props decoded from a Schema never are.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const mount: <
  Name extends string,
  Props,
  Model,
  Msg,
  Events,
  R,
  V extends View.Elements,
  RF = never,
  RP = never
>(
  component: Component.Members<Name, Props, Model, Msg, Events, R, V, any>,
  props: Props | Effect.Effect<Props, never, RP>,
  container: unknown,
  options?: {
    readonly fallback?:
      | ((
        failure: AsyncResult.Failure<never, unknown>,
        h: View.WithTags<never, {}, V>
      ) => View.Content<never, RF>)
      | undefined
    readonly query?: QueryOptions | undefined
    readonly head?: boolean | undefined
    readonly onEmit?: ((event: Events) => void) | undefined
  }
) => Effect.Effect<
  Root<Model, Msg>,
  never,
  R | RF | RP | HostOf<V> | Renderer | Scope.Scope
> = runtime.mount as any

/**
 * Cache-wide options for the query cache a mount owns. The app never
 * provides the cache, so they go through `mount`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface QueryOptions {
  /** How long an entry stays once nothing watches it. 5 minutes by default; a query can override it. */
  readonly idleTimeToLive?: Duration.Input | undefined
}

/**
 * Runs a component tree the way a server renders it, and returns the tree to
 * serialise. Server renderers such as `HtmlServer.renderToHtml` build on it.
 *
 * **Details**
 *
 * The tree renders synchronously. Provided Layers are built, and data comes
 * from queries: a per-request cache fetches each key at most once, ignores
 * `staleTime`, and dispatches each watch when its entry settles, so a watch
 * message that changes a query's args fetches the next key in the same
 * render. No Command runs: `init`'s are dropped silently, and one from
 * `update` is dropped, logged as `CommandDropped` with reason `"server"`
 * and reported as `Command.ServerCommandIssued`. Events are applied, so a
 * child can change its parent. Subscriptions other than query watches, and
 * `onMount` work, never run.
 *
 * Rendering waits until nothing is in flight or `budget` (default 500 ms) is
 * spent, whichever comes first. Any fetch in flight holds it, a prefetch
 * nobody renders included. The budget limits waiting on Layers and fetches,
 * not the render itself. A Layer that missed it, or that a `provide` kept off
 * the server with `{ server: false }`, defers its instance. A fetch that
 * missed it is interrupted and its entry isn't shipped, so the client fetches
 * it. A budget of 0 starts no fetch. The tree and the cache are serialised
 * once, in document order, and its Scopes are closed.
 *
 * `static: true` is for HTML built at deploy or held in a CDN. It is written
 * into the state, and the client hydrates every entry with an unknown age: an
 * entry is stale, and refetches once, unless its query's `staleTime` is
 * `"Infinity"`, and there is no fetch-free window.
 *
 * `elements` lists the vocabularies the server renders, by name, as a host's
 * `elements` does.
 *
 * `props` may be an Effect, as with `mount`: it is run once, before `init`,
 * and its requirements are added to the render's. The client resolves its
 * own, so with `Router.props` both sides read the route from their Router.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const prerender: <
  Name extends string,
  Props,
  Model,
  Msg,
  Events,
  R,
  V extends View.Elements,
  RP = never
>(
  component: Component.Members<Name, Props, Model, Msg, Events, R, V, any>,
  props: Props | Effect.Effect<Props, never, RP>,
  options?: {
    readonly budget?: Duration.Input | undefined
    readonly elements?: ReadonlyArray<string> | "any" | undefined
    readonly static?: boolean | undefined
  }
) => Effect.Effect<Prerendered<Model, View.HeadValue<V>>, never, R | RP> = (
  component,
  props,
  options
) =>
  runtime.prerender(component as any, props, {
    budget: options?.budget ?? "500 millis",
    elements: options?.elements ?? "any",
    static: options?.static
  }) as Effect.Effect<Prerendered<any, any>>
