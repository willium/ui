import { Command, Component, MessageLog, Query, UiSchema } from "@effect/ui"
import { Locator, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Option, Redacted, Schema } from "effect"
import { AsyncResult } from "effect/reactivity"
import { TestClock } from "effect/testing"

const User = Schema.Struct({ id: Schema.String, name: Schema.String })

/** A fresh read, mutation and components per test: the db is closed over. */
const makeApp = (options?: {
  readonly staleTime?: "30 seconds" | 0 | "Infinity"
  readonly interval?: boolean
  readonly debounce?: "300 millis"
  readonly dropPrevious?: boolean
  readonly interruptPrevious?: boolean
}) => {
  const db = {
    calls: 0,
    interrupted: [] as Array<string>,
    names: new Map<string, string>([["1", "Ann"], ["2", "Bea"]])
  }
  const order: Array<string> = []

  class GetUser extends Query.Service<GetUser>()(
    "users/GetUser",
    {
      args: { id: Schema.String },
      success: User,
      error: Schema.String,
      staleTime: options?.staleTime ?? "30 seconds",
      refetchInterval: options?.interval === true ? "5 seconds" : undefined
    }
  ) {
    static readonly layer = this.toLayer(
      Effect.fnUntraced(
        function*({ id }) {
          db.calls++
          yield* Effect.sleep("10 millis")
          const name = db.names.get(id)
          return name === undefined
            ? yield* Effect.fail("missing")
            : { id, name }
        },
        (effect, { id }) =>
          Effect.onInterrupt(
            effect,
            () => Effect.sync(() => db.interrupted.push(id))
          )
      )
    )
  }

  class RenameUser extends Command.Service<RenameUser>()(
    "users/RenameUser",
    {
      args: { id: Schema.String, name: Schema.String },
      success: Schema.String,
      error: Schema.String,
      invalidates: ({ id }) => [GetUser.entry({ id })],
      optimistic: (
        { id, name }
      ) => [GetUser.patch({ id }, (user) => ({ ...user, name }))]
    }
  ) {
    static readonly layer = this.toLayer(
      Effect.fnUntraced(function*({ id, name }) {
        yield* Effect.sleep("10 millis")
        if (name === "") return yield* Effect.fail("empty")
        db.names.set(id, name)
        return name
      })
    )
  }

  // An empty id disables the query.
  const userArgs = ({ props }: { readonly props: { readonly id: string } }) =>
    props.id === "" ? undefined : { id: props.id }
  const CardMessage = UiSchema.TaggedEnum({
    UserChanged: { state: Schema.String },
    Rename: { name: Schema.String },
    Renamed: {}
  })
  const Card = Component.define({
    name: "Card",
    props: Schema.Struct({ id: Schema.String, tag: Schema.String }),
    model: Schema.Struct({ saving: Schema.Boolean }),
    message: CardMessage,
    queries: {
      user: {
        query: GetUser,
        debounce: options?.debounce,
        dropPrevious: options?.dropPrevious,
        interruptPrevious: options?.interruptPrevious,
        args: userArgs,
        // The result is written by the runtime: the message only lets update see the change.
        onChange: (result) => CardMessage.UserChanged({ state: result._tag })
      }
    }
  }).make({
    init: () => ({ saving: false }),
    update: ($, message) =>
      CardMessage.match(message, {
        UserChanged: () => {
          order.push(`update ${$.props.tag} UserChanged`)
          return $.model
        },
        Rename: ({ name }) => {
          order.push(`update ${$.props.tag} Rename`)
          return $.set({ ...$.model, saving: true }).run(
            RenameUser.make({ id: $.props.id, name }).pipe(Command.match({
              onSuccess: () => CardMessage.Renamed(),
              onFailure: () => CardMessage.Renamed()
            }))
          )
        },
        Renamed: () => ({ ...$.model, saving: false })
      }),
    view: (h, model) => {
      const text = AsyncResult.match(h.queries.user, {
        onInitial: (initial) => initial.waiting ? "loading" : "idle",
        // "~": the value includes an unconfirmed patch. "…": a fetch is in flight.
        onSuccess: (success) =>
          success.value.name + (h.patched.user ? "~" : "") +
          (success.waiting ? "…" : ""),
        onFailure: () => "failed"
      })
      order.push(`view ${h.props.tag} ${text}${model.saving ? " saving" : ""}`)
      return h.el("p").on("click", CardMessage.Rename({ name: "Bob" }))
        .children(`${h.props.tag}=${text}`)
    }
  })

  /** A parent whose Model says which cards are mounted: "tag:id" each. */
  const ListMessage = UiSchema.TaggedEnum({
    Set: { cards: Schema.Array(Schema.String) }
  })
  const List = Component.define({
    name: "List",
    props: Schema.Struct({ cards: Schema.Array(Schema.String) }),
    model: Schema.Array(Schema.String),
    message: ListMessage
  }).make({
    init: ($) => $.props.cards,
    update: (_, message) => message.cards,
    view: (h, cards) =>
      h.el(
        "div",
        cards.map((card) => {
          const [tag, id] = card.split(":")
          return Card(h, { key: tag, props: { id, tag } })
        })
      )
  })

  /** Calls `get` and `prefetch` from Commands, as an app would outside a query field. */
  const ToolsMessage = UiSchema.TaggedEnum({
    Get: { id: Schema.String },
    Prefetch: { id: Schema.String },
    Got: { name: Schema.String }
  })
  class Load extends Command.Service<Load>()(
    "Load",
    {
      args: { id: Schema.String },
      success: Schema.String,
      error: Schema.String,
      invalidates: () => []
    }
  ) {
    static readonly layer = this.toLayer(
      Effect.map(
        Effect.context<GetUser>(),
        (context) => ({ id }) =>
          GetUser.get({ id }).pipe(
            Effect.map((user) => user.name),
            Effect.provide(context)
          )
      )
    )
  }
  class Warm extends Command.Service<Warm>()(
    "Warm",
    { args: { id: Schema.String }, success: Schema.Void, invalidates: () => [] }
  ) {
    static readonly layer = this.toLayer(
      Effect.map(
        Effect.context<GetUser>(),
        (context) => ({ id }) =>
          GetUser.prefetch({ id }).pipe(Effect.provide(context))
      )
    )
  }
  const got = (name: string) => ToolsMessage.Got({ name })
  const Tools = Component.define({
    name: "Tools",
    model: Schema.String,
    message: ToolsMessage
  }).make({
    init: () => "",
    update: ($, message) =>
      ToolsMessage.match(message, {
        Get: ({ id }) =>
          $.run(
            Load.make({ id }).pipe(
              Command.match({ onSuccess: got, onFailure: () => got("failed") })
            )
          ),
        Prefetch: ({ id }) =>
          $.run(Warm.make({ id }).pipe(Command.map(() => got("prefetched")))),
        Got: ({ name }) => name
      }),
    view: (h, model) => h.el("p", model)
  })

  return {
    db,
    order,
    GetUser,
    RenameUser,
    CardMessage,
    Card,
    List,
    ListMessage,
    Tools,
    ToolsMessage,
    layer: Layer.mergeAll(RenameUser.layer, Load.layer, Warm.layer).pipe(
      Layer.provideMerge(GetUser.layer)
    )
  }
}

/** Runs a test on a fresh TestHost, with the app's reads and Commands built for the whole test. */
const run = <A, E>(
  layer: Layer.Layer<any>,
  effect: Effect.Effect<A, E, any>,
  flush?: TestHost.Flush
) =>
  effect.pipe(
    Effect.provide(layer),
    Effect.scoped,
    Effect.provide(TestHost.layer({ flush }))
  ) as Effect.Effect<A, E>

/** Starts what is due and lets the fetches finish: each fetcher sleeps 10 ms. */
const load = TestHost.settle.pipe(
  Effect.andThen(TestClock.adjust("10 millis")),
  Effect.andThen(TestHost.settle)
)

type Root = Pick<TestHost.TestRoot<any, any, any>, "fetches">
const triggers = (root: Root) => root.fetches().map((fetch) => fetch.trigger)

describe("Query results", () => {
  it.effect("a query field opens as Initial(waiting), then Success, from one fetch the watch started", () => {
    const app = makeApp()
    return run(
      app.layer,
      Effect.gen(function*() {
        const root = yield* TestHost.mount(app.Card, { id: "1", tag: "a" })
        assert.strictEqual(root.text(), "a=loading")
        yield* TestHost.settle
        yield* TestClock.adjust("10 millis")
        // The clock wake drained the scheduler: no settle needed.
        assert.strictEqual(root.text(), "a=Ann")
        assert.deepStrictEqual(
          root.fetches().map((f) => [f.query, f.logKey, f.trigger]),
          [[
            "users/GetUser",
            "{\"id\":\"1\"}",
            "watch"
          ]]
        )
        assert.deepStrictEqual(root.frames(), ["a=loading", "a=Ann"])
        const entry = root.entry(app.GetUser, { id: "1" })!
        assert.strictEqual(entry.watchers, 1)
        assert.isTrue(AsyncResult.isSuccess(entry.stored))
      })
    )
  })

  it.effect("debounce: a burst of args changes keeps the previous value, then fetches the last args once", () => {
    const app = makeApp({ debounce: "300 millis" })
    const set = (...cards: Array<string>) => app.ListMessage.Set({ cards })
    return run(
      app.layer,
      Effect.gen(function*() {
        const root = yield* TestHost.mount(app.List, { cards: ["a:1"] })
        // The first args at mount don't wait.
        yield* load
        assert.strictEqual(root.text(), "a=Ann")
        for (const id of ["2", "3", "2"]) {
          root.send(set(`a:${id}`))
          yield* TestHost.settle
          yield* TestClock.adjust("100 millis")
        }
        assert.strictEqual(root.text(), "a=Ann…")
        assert.strictEqual(app.db.calls, 1)
        // 300 ms after the last change.
        yield* TestClock.adjust("200 millis")
        yield* load
        assert.strictEqual(root.text(), "a=Bea")
        assert.deepStrictEqual(root.fetches().map((fetch) => fetch.logKey), [
          "{\"id\":\"1\"}",
          "{\"id\":\"2\"}"
        ])
      })
    )
  })

  // Users 9 and 8 do not exist, so their fetches fail.
  const switchUsers = (dropPrevious: boolean, ids: ReadonlyArray<string>) => {
    const app = makeApp({ dropPrevious })
    return run(
      app.layer,
      Effect.gen(function*() {
        const root = yield* TestHost.mount(app.List, { cards: ["a:1"] })
        yield* load
        const texts = [root.text()]
        for (const id of ids) {
          root.send(app.ListMessage.Set({ cards: [`a:${id}`] }))
          yield* TestHost.settle
          texts.push(root.text())
          yield* load
          texts.push(root.text())
        }
        return texts
      })
    )
  }

  it.effect("changed args keep the last Success, waiting, until their own result, but not a Failure", () =>
    Effect.map(
      switchUsers(false, ["9", "8"]),
      (texts) =>
        assert.deepStrictEqual(texts, [
          "a=Ann",
          "a=Ann…",
          "a=failed",
          "a=loading",
          "a=failed"
        ])
    ))

  it.effect("dropPrevious: changed args open as Initial, waiting", () =>
    Effect.map(
      switchUsers(true, ["2"]),
      (texts) => assert.deepStrictEqual(texts, ["a=Ann", "a=loading", "a=Bea"])
    ))

  it.effect("debounce: new args interrupt the old args' fetch, unless another watcher still needs it", () => {
    const app = makeApp({ debounce: "300 millis" })
    const set = (...cards: Array<string>) => app.ListMessage.Set({ cards })
    return run(
      app.layer,
      Effect.gen(function*() {
        const root = yield* TestHost.mount(app.List, { cards: ["a:1", "b:2"] })
        yield* TestHost.settle
        // Mid-fetch: a's fetch is a's alone, and b's is shared once a moves onto it.
        yield* TestClock.adjust("5 millis")
        root.send(set("a:2", "b:2"))
        yield* TestHost.settle
        yield* load
        assert.deepStrictEqual(app.db.interrupted, ["1"])
        assert.isUndefined(root.entry(app.GetUser, { id: "1" }))
        assert.strictEqual(root.text(), "a=Beab=Bea")
        assert.strictEqual(app.db.calls, 2)
        // c leaves 1 mid-fetch while d still watches it: the fetch runs on.
        const other = yield* TestHost.mount(app.List, { cards: ["c:1", "d:1"] })
        yield* TestHost.settle
        yield* TestClock.adjust("5 millis")
        other.send(set("c:", "d:1"))
        yield* load
        assert.deepStrictEqual(app.db.interrupted, ["1"])
        assert.strictEqual(other.text(), "c=idled=Ann")
        assert.strictEqual(app.db.calls, 3)
      })
    )
  })

  it.effect("new args let the old args' fetch run on and store its result", () => {
    const app = makeApp()
    return run(
      app.layer,
      Effect.gen(function*() {
        const root = yield* TestHost.mount(app.List, { cards: ["a:1"] })
        yield* TestHost.settle
        yield* TestClock.adjust("5 millis")
        root.send(app.ListMessage.Set({ cards: ["a:2"] }))
        yield* load
        assert.deepStrictEqual(app.db.interrupted, [])
        assert.strictEqual(root.text(), "a=Bea")
        assert.isTrue(
          AsyncResult.isSuccess(root.entry(app.GetUser, { id: "1" })!.stored)
        )
        assert.strictEqual(app.db.calls, 2)
      })
    )
  })

  it.effect("interruptPrevious: new args interrupt the old args' fetch at once, unless another watcher still needs it", () => {
    const app = makeApp({ interruptPrevious: true })
    const set = (...cards: Array<string>) => app.ListMessage.Set({ cards })
    return run(
      app.layer,
      Effect.gen(function*() {
        const root = yield* TestHost.mount(app.List, { cards: ["a:1"] })
        yield* TestHost.settle
        // Mid-fetch: a's fetch for 1 is a's alone, and 2's starts without waiting.
        yield* TestClock.adjust("5 millis")
        root.send(set("a:2"))
        yield* TestHost.settle
        assert.deepStrictEqual(app.db.interrupted, ["1"])
        assert.isUndefined(root.entry(app.GetUser, { id: "1" }))
        assert.strictEqual(app.db.calls, 2)
        yield* load
        assert.strictEqual(root.text(), "a=Bea")
        // c leaves 1 mid-fetch while d still watches it: the fetch runs on.
        const other = yield* TestHost.mount(app.List, { cards: ["c:1", "d:1"] })
        yield* TestHost.settle
        yield* TestClock.adjust("5 millis")
        other.send(set("c:", "d:1"))
        yield* load
        assert.deepStrictEqual(app.db.interrupted, ["1"])
        assert.strictEqual(other.text(), "c=idled=Ann")
        assert.strictEqual(app.db.calls, 3)
      })
    )
  })

  it.effect("debounce: args whose entry is fresh, and a disabled query, don't wait", () => {
    const app = makeApp({ debounce: "300 millis" })
    const set = (...cards: Array<string>) => app.ListMessage.Set({ cards })
    return run(
      app.layer,
      Effect.gen(function*() {
        const root = yield* TestHost.mount(app.List, { cards: ["a:1", "b:2"] })
        yield* load
        // b leaves, so a moves onto a fresh entry nothing watches.
        root.send(set("a:2"))
        yield* TestHost.settle
        assert.strictEqual(root.text(), "a=Bea")
        root.send(set("a:"))
        yield* TestHost.settle
        assert.strictEqual(root.text(), "a=idle")
        assert.strictEqual(app.db.calls, 2)
      })
    )
  })

  it.effect("a disabled query opens as Initial, not waiting, and nothing is fetched", () => {
    const app = makeApp()
    return run(
      app.layer,
      Effect.gen(function*() {
        const root = yield* TestHost.mount(app.Card, { id: "", tag: "a" })
        yield* load
        assert.strictEqual(root.text(), "a=idle")
        assert.deepStrictEqual(root.fetches(), [])
        assert.strictEqual(app.db.calls, 0)
        assert.isUndefined(root.entry(app.GetUser, { id: "" }))
      })
    )
  })

  it.effect("two instances share one fetch", () => {
    const app = makeApp()
    return run(
      app.layer,
      Effect.gen(function*() {
        const root = yield* TestHost.mount(app.List, { cards: ["a:1", "b:1"] })
        yield* load
        assert.strictEqual(root.text(), "a=Annb=Ann")
        assert.strictEqual(app.db.calls, 1)
        assert.strictEqual(root.entry(app.GetUser, { id: "1" })?.watchers, 2)
      })
    )
  })

  it.effect("watch: a swap on a stale shared entry is a zero-to-one and refetches; a joining child doesn't", () => {
    const app = makeApp()
    return run(
      app.layer,
      Effect.gen(function*() {
        const root = yield* TestHost.mount(app.List, { cards: ["a:1"] })
        yield* load
        yield* TestClock.adjust("31 seconds")
        assert.isTrue(root.entry(app.GetUser, { id: "1" })?.stale)
        // A child joining a watched stale entry starts nothing.
        root.send(app.ListMessage.Set({ cards: ["a:1", "c:1"] }))
        yield* load
        assert.strictEqual(root.text(), "a=Annc=Ann")
        assert.strictEqual(app.db.calls, 1)
        root.send(app.ListMessage.Set({ cards: ["a:1"] }))
        yield* TestHost.settle
        // a -> b: the new instance is created before the old one is destroyed, and the count still passes through zero.
        root.send(app.ListMessage.Set({ cards: ["b:1"] }))
        yield* TestHost.settle
        assert.strictEqual(root.entry(app.GetUser, { id: "1" })?.watchers, 1)
        assert.deepStrictEqual(triggers(root), ["watch", "watch"])
        // Stale data shows at once, waiting.
        assert.strictEqual(root.text(), "b=Ann…")
        yield* load
        assert.strictEqual(root.text(), "b=Ann")
        assert.strictEqual(app.db.calls, 2)
      })
    )
  })

  it.effect("watch: the pre-pass releases a removal below a kept element before a sibling element creates its watcher", () => {
    const app = makeApp()
    // Two kept sections: the second loses the old card as the first gains a new one on the same entry.
    const Sections = Component.define({
      name: "Sections",
      model: Schema.Boolean,
      message: Schema.Boolean
    }).make({
      init: () => false,
      update: (_, message) => message,
      view: (h, swapped) =>
        h.el(
          "div",
          h.el(
            "section",
            swapped
              ? [app.Card(h, { key: "new", props: { id: "1", tag: "n" } })]
              : []
          ),
          h.el(
            "section",
            swapped
              ? []
              : [app.Card(h, { key: "old", props: { id: "1", tag: "o" } })]
          )
        )
    })
    return run(
      app.layer,
      Effect.gen(function*() {
        const root = yield* TestHost.mount(Sections, {})
        yield* load
        yield* TestClock.adjust("31 seconds")
        root.send(true)
        yield* TestHost.settle
        assert.deepStrictEqual(triggers(root), ["watch", "watch"])
        assert.strictEqual(root.entry(app.GetUser, { id: "1" })?.watchers, 1)
        assert.strictEqual(root.text(), "n=Ann…")
        yield* load
        assert.strictEqual(app.db.calls, 2)
      })
    )
  })

  it.effect("watch: a kept child's new args release its old entry before a new sibling watches it", () => {
    const app = makeApp()
    return run(
      app.layer,
      Effect.gen(function*() {
        const root = yield* TestHost.mount(app.List, { cards: ["a:1"] })
        yield* load
        yield* TestClock.adjust("31 seconds")
        // b is created first in document order, and a, kept, moves from 1 to 2 after it.
        root.send(app.ListMessage.Set({ cards: ["b:1", "a:2"] }))
        yield* TestHost.settle
        assert.deepStrictEqual(
          root.fetches().map((fetch) => [fetch.logKey, fetch.trigger]),
          [
            ["{\"id\":\"1\"}", "watch"],
            ["{\"id\":\"1\"}", "watch"],
            ["{\"id\":\"2\"}", "watch"]
          ]
        )
        assert.strictEqual(root.entry(app.GetUser, { id: "1" })?.watchers, 1)
        yield* load
        assert.strictEqual(root.text(), "b=Anna=Bea")
      })
    )
  })

  it.effect("watch: a removal inside a kept child's re-render counts as it would if the child were inlined", () => {
    const app = makeApp()
    // The second section of the two-section test, extracted into a component.
    const Shell = Component.define({
      name: "Shell",
      props: Schema.Struct({ show: Schema.Boolean }),
      model: Schema.Null,
      message: Schema.Never
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
        h.el(
          "div",
          h.props.show
            ? [app.Card(h, { key: "old", props: { id: "1", tag: "o" } })]
            : []
        )
    })
    const Page = Component.define({
      name: "Page",
      model: Schema.Boolean,
      message: Schema.Boolean
    }).make({
      init: () => false,
      update: (_, message) => message,
      view: (h, swapped) =>
        h.el(
          "div",
          h.el(
            "section",
            swapped
              ? [app.Card(h, { key: "new", props: { id: "1", tag: "n" } })]
              : []
          ),
          Shell(h, { key: "shell", props: { show: !swapped } })
        )
    })
    return run(
      app.layer,
      Effect.gen(function*() {
        const root = yield* TestHost.mount(Page, {})
        yield* load
        yield* TestClock.adjust("31 seconds")
        root.send(true)
        yield* TestHost.settle
        assert.deepStrictEqual(triggers(root), ["watch", "watch"])
        assert.strictEqual(root.entry(app.GetUser, { id: "1" })?.watchers, 1)
        assert.strictEqual(root.text(), "n=Ann…")
        // The waiting value renders in the pass that decided the fetch: no frame shows it settled.
        assert.deepStrictEqual(root.frames(), ["o=loading", "o=Ann", "n=Ann…"])
        yield* load
        assert.strictEqual(app.db.calls, 2)
      })
    )
  })

  it.effect("watch: a kept child moving onto a stale entry that a later sibling leaves is a zero-to-one", () => {
    const app = makeApp()
    return run(
      app.layer,
      Effect.gen(function*() {
        const root = yield* TestHost.mount(app.List, { cards: ["a:2", "b:1"] })
        yield* load
        yield* TestClock.adjust("31 seconds")
        // a, kept and first, re-keys to 1 before b, which watched 1, is removed.
        root.send(app.ListMessage.Set({ cards: ["a:1"] }))
        yield* TestHost.settle
        assert.deepStrictEqual(
          root.fetches().map((fetch) => fetch.logKey).slice(2),
          ["{\"id\":\"1\"}"]
        )
        assert.strictEqual(root.entry(app.GetUser, { id: "1" })?.watchers, 1)
        assert.strictEqual(root.text(), "a=Ann…")
        yield* load
        assert.strictEqual(app.db.calls, 3)
      })
    )
  })

  /** Watches user `id`, and records each message's result as "tag Tag:waiting". */
  const makeWatcher = (
    app: ReturnType<typeof makeApp>,
    messages: Array<string>
  ) => {
    const WatchMessage = UiSchema.TaggedEnum({
      Changed: { state: Schema.String }
    })
    return Component.define({
      name: "Watcher",
      props: Schema.Struct({ id: Schema.String, tag: Schema.String }),
      model: Schema.Struct({}),
      message: WatchMessage,
      queries: {
        user: {
          query: app.GetUser,
          args: ({ props }) => ({ id: props.id }),
          onChange: (result) =>
            WatchMessage.Changed({ state: `${result._tag}:${result.waiting}` })
        }
      }
    }).make({
      init: () => ({}),
      update: ($, message) => {
        messages.push(`${$.props.tag} ${message.state}`)
        return $.model
      },
      view: (h) =>
        h.el(
          "p",
          `${h.props.tag}=${h.queries.user._tag}:${h.queries.user.waiting}`
        )
    })
  }

  it.effect("watch: a swap off a bare Failure clears it whether the old watcher is inlined or in a kept child", () => {
    const swap = (extracted: boolean) => {
      const app = makeApp()
      const messages: Array<string> = []
      const Watcher = makeWatcher(app, messages)
      const Shell = Component.define({
        name: "Shell",
        props: Schema.Struct({ show: Schema.Boolean }),
        model: Schema.Null,
        message: Schema.Never
      }).make({
        init: () => null,
        update: ($) => $.model,
        view: (h) =>
          h.el(
            "div",
            h.props.show
              ? [Watcher(h, { key: "old", props: { id: "9", tag: "o" } })]
              : []
          )
      })
      const Page = Component.define({
        name: "Page",
        model: Schema.Boolean,
        message: Schema.Boolean
      }).make({
        init: () => false,
        update: (_, message) => message,
        view: (h, swapped) =>
          h.el(
            "div",
            h.el(
              "section",
              swapped
                ? [Watcher(h, { key: "new", props: { id: "9", tag: "n" } })]
                : []
            ),
            extracted
              ? Shell(h, { key: "shell", props: { show: !swapped } })
              : h.el(
                "div",
                swapped
                  ? []
                  : [Watcher(h, { key: "old", props: { id: "9", tag: "o" } })]
              )
          )
      })
      return run(
        app.layer,
        Effect.gen(function*() {
          const root = yield* TestHost.mount(Page, {})
          // User 9 doesn't exist: a bare Failure.
          yield* load
          messages.length = 0
          root.send(true)
          yield* TestHost.settle
          const swapped = {
            messages: messages.slice(),
            text: root.text(),
            stored: root.entry(app.GetUser, { id: "9" })?.stored._tag,
            triggers: triggers(root)
          }
          yield* load
          return { swapped, settled: messages.slice(), frames: root.frames() }
        })
      )
    }
    return Effect.gen(function*() {
      const expected = {
        // The new watcher never sees the old Failure, and its view shows loading.
        swapped: {
          messages: [],
          text: "n=Initial:true",
          stored: "Initial" as const,
          triggers: ["watch", "watch"] as Array<Query.Trigger>
        },
        settled: ["n Failure:false"],
        frames: [
          "o=Initial:true",
          "o=Failure:false",
          "n=Initial:true",
          "n=Failure:false"
        ]
      }
      assert.deepStrictEqual(yield* swap(false), expected)
      assert.deepStrictEqual(yield* swap(true), expected)
    })
  })

  it.effect("watch: a bare Failure stored while a pass is open, or in an earlier one, is withheld in either layout", () => {
    const swap = (
      timing: "this pass" | "an earlier pass",
      extracted: boolean
    ) => {
      // The fetcher waits for the test to finish it.
      const finish = new Map<
        string,
        (effect: Effect.Effect<string, string>) => void
      >()
      const messages: Array<string> = []
      class Read extends Query.Service<Read>()(
        "test/Read",
        {
          args: { id: Schema.String },
          success: Schema.String,
          error: Schema.String,
          staleTime: "1 second"
        }
      ) {
        static readonly layer = this.toLayer(({ id }) =>
          Effect.callback<string, string>((resume) =>
            void finish.set(id, resume)
          )
        )
      }
      const Message = UiSchema.TaggedEnum({ Changed: { state: Schema.String } })
      const Watcher = Component.define({
        name: "Watcher",
        props: Schema.Struct({ tag: Schema.String }),
        model: Schema.Struct({}),
        message: Message,
        queries: {
          data: {
            query: Read,
            args: () => ({ id: "fail" }),
            onChange: (result) =>
              Message.Changed({ state: `${result._tag}:${result.waiting}` })
          }
        }
      }).make({
        init: () => ({}),
        update: ($, message) => {
          messages.push(`${$.props.tag} ${message.state}`)
          return $.model
        },
        view: (h) =>
          h.el(
            "p",
            `${h.props.tag}=${h.queries.data._tag}:${h.queries.data.waiting}`
          )
      })
      const Shell = Component.define({
        name: "Shell",
        props: Schema.Struct({ show: Schema.Boolean }),
        model: Schema.Null,
        message: Schema.Never
      }).make({
        init: () => null,
        update: ($) => $.model,
        view: (h) =>
          h.el(
            "div",
            h.props.show
              ? [Watcher(h, { key: "old", props: { tag: "o" } })]
              : []
          )
      })
      const PageMessage = UiSchema.TaggedEnum({
        Enable: {},
        Swap: {}
      })
      const Page = Component.define({
        name: "Page",
        model: Schema.Struct({
          enabled: Schema.Boolean,
          swapped: Schema.Boolean
        }),
        message: PageMessage,
        queries: {
          other: {
            query: Read,
            args: ({ model }) => model.enabled ? { id: "other" } : undefined
          }
        }
      }).make({
        init: () => ({ enabled: false, swapped: false }),
        update: ($, message) =>
          PageMessage.match(message, {
            Enable: () => ({ ...$.model, enabled: true }),
            Swap: () => ({ ...$.model, swapped: true })
          }),
        view: (h, model) =>
          h.el(
            "div",
            h.el(
              "section",
              model.swapped
                ? [Watcher(h, { key: "new", props: { tag: "n" } })]
                : []
            ),
            extracted
              ? Shell(h, { key: "shell", props: { show: !model.swapped } })
              : h.el(
                "div",
                model.swapped
                  ? []
                  : [Watcher(h, { key: "old", props: { tag: "o" } })]
              )
          )
      })
      return run(
        Read.layer,
        Effect.gen(function*() {
          const root = yield* TestHost.mount(Page, {})
          yield* TestHost.settle
          // An unrelated query opens a pass, and the old watcher's fetch fails while it is open.
          root.send(PageMessage.Enable())
          finish.get("fail")!(Effect.fail("missing"))
          if (timing === "an earlier pass") yield* TestHost.settle
          messages.length = 0
          root.send(PageMessage.Swap())
          yield* TestHost.settle
          return {
            messages,
            text: root.text(),
            frames: root.frames(),
            stored: root.entry(Read, { id: "fail" })?.stored._tag,
            fetches: root.fetches().map((fetch) =>
              `${fetch.trigger} ${fetch.logKey}`
            )
          }
        })
      )
    }
    return Effect.gen(function*() {
      for (const timing of ["this pass", "an earlier pass"] as const) {
        const expected = {
          // The new watcher never sees the Failure: it is dropped and refetched.
          messages: [],
          text: "n=Initial:true",
          frames: timing === "this pass"
            ? ["o=Initial:true", "n=Initial:true"]
            : ["o=Initial:true", "o=Failure:false", "n=Initial:true"],
          stored: "Initial" as const,
          fetches: [
            "watch {\"id\":\"fail\"}",
            "watch {\"id\":\"other\"}",
            "watch {\"id\":\"fail\"}"
          ]
        }
        assert.deepStrictEqual(
          yield* swap(timing, false),
          expected,
          `${timing}, inlined`
        )
        assert.deepStrictEqual(
          yield* swap(timing, true),
          expected,
          `${timing}, extracted`
        )
      }
    })
  })

  it.effect("watch: joining a bare Failure delivers it in the pass that registered, so no loading frame commits", () => {
    const app = makeApp()
    const messages: Array<string> = []
    const Watcher = makeWatcher(app, messages)
    const Pair = Component.define({
      name: "Pair",
      model: Schema.Boolean,
      message: Schema.Boolean
    }).make({
      init: () => false,
      update: (_, message) => message,
      view: (h, joined) =>
        h.el(
          "div",
          Watcher(h, { key: "a", props: { id: "9", tag: "a" } }),
          joined ? [Watcher(h, { key: "b", props: { id: "9", tag: "b" } })] : []
        )
    })
    return run(
      app.layer,
      Effect.gen(function*() {
        const root = yield* TestHost.mount(Pair, {})
        yield* load
        messages.length = 0
        root.send(true)
        yield* TestHost.settle
        assert.deepStrictEqual(messages, ["b Failure:false"])
        assert.strictEqual(root.text(), "a=Failure:falseb=Failure:false")
        assert.deepStrictEqual(root.frames(), [
          "a=Initial:true",
          "a=Failure:false",
          "a=Failure:falseb=Failure:false"
        ])
        // A join never refetches.
        assert.deepStrictEqual(triggers(root), ["watch"])
        assert.strictEqual(root.entry(app.GetUser, { id: "9" })?.watchers, 2)
      })
    )
  })

  it.effect("a kept child's warm re-key emits through the onEmit of the view that re-keyed it", () => {
    const app = makeApp()
    const EmitterMessage = UiSchema.TaggedEnum({ UserChanged: {} })
    const Emitter = Component.define({
      name: "Emitter",
      props: Schema.Struct({ id: Schema.String }),
      model: Schema.Struct({}),
      message: EmitterMessage,
      events: Schema.String,
      queries: {
        user: {
          query: app.GetUser,
          args: ({ props }) => ({ id: props.id }),
          onChange: () => EmitterMessage.UserChanged()
        }
      }
    }).make({
      init: () => ({}),
      update: ($) => $.emit($.props.id),
      view: (h) => h.el("p", "emitter")
    })
    const ParentMessage = UiSchema.TaggedEnum({
      Switch: {},
      Noted: { label: Schema.String }
    })
    const Parent = Component.define({
      name: "Parent",
      model: Schema.Struct({
        switched: Schema.Boolean,
        labels: Schema.Array(Schema.String)
      }),
      message: ParentMessage
    }).make({
      init: () => ({ switched: false, labels: [] }),
      update: ($, message) =>
        message._tag === "Switch"
          ? { ...$.model, switched: true }
          : { ...$.model, labels: [...$.model.labels, message.label] },
      view: (h, model) =>
        h.el(
          "div",
          app.Card(h, { key: "warm", props: { id: "2", tag: "w" } }),
          Emitter(h, {
            key: "emitter",
            props: { id: model.switched ? "2" : "1" },
            onEmit: (id) =>
              ParentMessage.Noted({
                label: (model.switched ? "new " : "old ") + id
              })
          })
        )
    })
    return run(
      app.layer,
      Effect.gen(function*() {
        const root = yield* TestHost.mount(Parent, {})
        yield* load
        root.send(ParentMessage.Switch())
        yield* TestHost.settle
        assert.deepStrictEqual(root.model()?.labels, ["old 1", "new 2"])
      })
    )
  })

  it.effect("a failed instance drops its watchers before its Command cleanup ends, so its fallback refetches", () => {
    const app = makeApp()
    // Stopping it takes 10 seconds of uninterruptible cleanup.
    let cleaned = false
    const cleanup = Effect.sleep("10 seconds").pipe(
      Effect.andThen(Effect.sync(() => {
        cleaned = true
      }))
    )
    const Hold = Command.make(
      "Hold",
      { args: {} },
      () => Effect.never.pipe(Effect.ensuring(Effect.uninterruptible(cleanup)))
    )
    const BadMessage = UiSchema.TaggedEnum({ Crash: {} })
    const Bad = Component.define({
      name: "Bad",
      model: Schema.Struct({}),
      message: BadMessage,
      queries: { user: { query: app.GetUser, args: () => ({ id: "1" }) } }
    }).make({
      init: ($) => $.set({}).run(Hold.make()),
      update: (): {} => {
        throw new Error("crash")
      },
      view: (h) => h.el("p").on("click", BadMessage.Crash()).children("bad")
    })
    const Host = Component.define({
      name: "Host",
      model: Schema.Null,
      message: Schema.Never
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
        Bad(h, {
          key: "bad",
          fallback: () =>
            app.Card(h, { key: "fallback", props: { id: "1", tag: "f" } })
        })
    })
    return run(
      app.layer,
      Effect.gen(function*() {
        const root = yield* TestHost.mount(Host, {})
        yield* load
        yield* TestClock.adjust("31 seconds")
        Locator.fire(root.get(Locator.text("bad", { exact: true })), "click")
        yield* TestHost.settle
        // Hold is still cleaning up, and the fallback's watch was a zero-to-one. Read now and checked
        // after the cleanup, so a failure doesn't leave the close waiting on the clock.
        const during = {
          cleaned,
          watchers: root.entry(app.GetUser, { id: "1" })?.watchers,
          triggers: triggers(root),
          text: root.text()
        }
        yield* TestClock.adjust("10 seconds")
        assert.deepStrictEqual(during, {
          cleaned: false,
          watchers: 1,
          triggers: ["watch", "watch"],
          text: "f=Ann…"
        })
        assert.isTrue(cleaned)
        assert.strictEqual(root.text(), "f=Ann")
        assert.strictEqual(root.entry(app.GetUser, { id: "1" })?.watchers, 1)
      })
    )
  })

  it.effect("settle waits for a resolved Promise while an interval sleeps on the clock", () => {
    const app = makeApp({ interval: true })
    const PollMessage = UiSchema.TaggedEnum({
      Go: {},
      Done: {}
    })
    const Go = Command.make(
      "Go",
      { args: {} },
      () => Effect.promise(() => Promise.resolve(PollMessage.Done()))
    )
    const Poll = Component.define({
      name: "Poll",
      model: Schema.Struct({ done: Schema.Boolean }),
      message: PollMessage,
      queries: { user: { query: app.GetUser, args: () => ({ id: "1" }) } }
    }).make({
      init: () => ({ done: false }),
      update: ($, message) =>
        PollMessage.match(message, {
          Go: () => $.run(Go.make()),
          Done: () => ({ ...$.model, done: true })
        }),
      view: (h, model) => h.el("p", model.done ? "done" : "not yet")
    })
    return run(
      app.layer,
      Effect.gen(function*() {
        const root = yield* TestHost.mount(Poll, {})
        yield* load
        root.send(PollMessage.Go())
        yield* TestHost.settle
        assert.strictEqual(root.text(), "done")
        assert.deepStrictEqual(root.pending(), [])
      })
    )
  })

  it.effect("mounting or re-keying onto an entry the cache holds never renders loading", () => {
    const app = makeApp()
    return run(
      app.layer,
      Effect.gen(function*() {
        const root = yield* TestHost.mount(app.List, { cards: ["a:1", "b:2"] })
        yield* load
        app.order.length = 0
        // A new instance on user 1, and card b re-keyed from user 2 to user 1.
        root.send(app.ListMessage.Set({ cards: ["a:1", "c:1", "b:1"] }))
        yield* TestHost.settle
        // Each folds the cache's value through update before its first render.
        assert.deepStrictEqual(app.order, [
          "update c UserChanged",
          "view c Ann",
          "update b UserChanged",
          "view b Ann"
        ])
        assert.strictEqual(root.text(), "a=Annc=Annb=Ann")
        assert.strictEqual(app.db.calls, 2)
      })
    )
  })

  it.effect("a Command issued by the folded first emission starts after init's, and after the first render", () => {
    const app = makeApp()
    const seen: Array<string> = []
    const Message = UiSchema.TaggedEnum({ UserChanged: {}, Noted: {} })
    const Note = Command.make(
      "Note",
      { args: { text: Schema.String } },
      ({ text }) =>
        Effect.sync(() => {
          seen.push(`command ${text}`)
          return Message.Noted()
        })
    )
    const Noter = Component.define({
      name: "Noter",
      model: Schema.Struct({}),
      message: Message,
      queries: {
        user: {
          query: app.GetUser,
          args: () => ({ id: "1" }),
          onChange: () => Message.UserChanged()
        }
      }
    }).make({
      init: ($) => $.set({}).run(Note.make({ text: "init" })),
      update: ($, message) =>
        Message.match(message, {
          UserChanged: () => {
            seen.push("update UserChanged")
            return $.run(Note.make({ text: "fold" }))
          },
          Noted: () => $.model
        }),
      view: (h) => {
        seen.push(`view ${h.queries.user._tag}`)
        return h.el("i", "noter")
      }
    })
    const Host = Component.define({
      name: "Host",
      model: Schema.Boolean,
      message: Schema.Boolean
    }).make({
      init: () => false,
      update: (_, message) => message,
      view: (h, show) =>
        h.el(
          "div",
          app.Card(h, { key: "a", props: { id: "1", tag: "a" } }),
          show && Noter(h, { key: "n" })
        )
    })
    return run(
      app.layer,
      Effect.gen(function*() {
        const root = yield* TestHost.mount(Host, {})
        yield* load
        root.send(true)
        yield* TestHost.settle
        assert.deepStrictEqual(seen, [
          "update UserChanged",
          "view Success",
          "command init",
          "command fold",
          "view Success"
        ])
      }),
      // Counts renders: a flush between the two Commands' messages is one more view.
      "queued"
    )
  })

  it.effect("the watcher count drops when instances unmount and when the root closes", () => {
    const app = makeApp()
    return run(
      app.layer,
      Effect.gen(function*() {
        const root = yield* Effect.scoped(Effect.gen(function*() {
          const root = yield* TestHost.mount(app.List, {
            cards: ["a:1", "b:2"]
          })
          yield* load
          root.send(app.ListMessage.Set({ cards: ["a:1"] }))
          yield* TestHost.settle
          assert.strictEqual(root.entry(app.GetUser, { id: "1" })?.watchers, 1)
          assert.strictEqual(root.entry(app.GetUser, { id: "2" })?.watchers, 0)
          return root
        }))
        assert.strictEqual(
          root.entry(app.GetUser, { id: "1" })?.watchers ?? 0,
          0
        )
      })
    )
  })

  it.effect("invalidation: an optimistic patch reaches a second watching instance before the flush that renders the issuing update", () => {
    const app = makeApp()
    return run(
      app.layer,
      Effect.gen(function*() {
        const root = yield* TestHost.mount(app.List, { cards: ["a:1", "b:1"] })
        yield* load
        app.order.length = 0
        Locator.fire(root.get(Locator.text("a=Ann", { exact: true })), "click")
        yield* TestHost.settle
        // Both instances get the patched result (and its onChange) before the one flush that renders the issuing update.
        assert.deepStrictEqual(app.order, [
          "update a Rename",
          "update a UserChanged",
          "update b UserChanged",
          "view a Bob~ saving",
          "view b Bob~"
        ])
        // A live patch is patched, not waiting.
        assert.strictEqual(root.text(), "a=Bob~b=Bob~")
        yield* TestClock.adjust("10 millis")
        // The run succeeded. Through the confirming refetch the patch is held: patched and waiting.
        assert.strictEqual(root.text(), "a=Bob~…b=Bob~…")
        yield* load
        assert.strictEqual(root.text(), "a=Bobb=Bob")
        assert.deepStrictEqual(triggers(root), ["watch", "invalidation"])
        assert.deepStrictEqual(root.entry(app.GetUser, { id: "1" })?.patches, {
          live: 0,
          held: 0
        })
      })
    )
  })

  it.effect("a failed mutation takes its patch back and still invalidates", () => {
    const app = makeApp()
    return run(
      app.layer,
      Effect.gen(function*() {
        const root = yield* TestHost.mount(app.Card, { id: "1", tag: "a" })
        yield* load
        root.send(app.CardMessage.Rename({ name: "" }))
        yield* TestHost.settle
        assert.strictEqual(root.text(), "a=~")
        yield* TestClock.adjust("10 millis")
        // The patch is gone, and the refetch a failure also asks for is in flight.
        assert.deepStrictEqual(root.entry(app.GetUser, { id: "1" })?.patches, {
          live: 0,
          held: 0
        })
        assert.strictEqual(root.text(), "a=Ann…")
        yield* load
        assert.strictEqual(root.text(), "a=Ann")
        assert.deepStrictEqual(triggers(root), ["watch", "invalidation"])
      })
    )
  })

  it.effect("visibility: an edge refetches a stale watched entry, and nothing fetches while hidden", () => {
    const app = makeApp()
    return run(
      app.layer,
      Effect.gen(function*() {
        const root = yield* TestHost.mount(app.Card, { id: "1", tag: "a" })
        yield* load
        yield* TestHost.setVisible(false)
        yield* TestClock.adjust("31 seconds")
        assert.strictEqual(app.db.calls, 1)
        app.db.names.set("1", "Ann2")
        yield* TestHost.setVisible(true)
        yield* load
        assert.deepStrictEqual(triggers(root), ["watch", "visibility"])
        assert.strictEqual(root.text(), "a=Ann2")
      })
    )
  })

  it.effect("connectivity: coming back online refetches a stale watched entry", () => {
    const app = makeApp()
    return run(
      app.layer,
      Effect.gen(function*() {
        const root = yield* TestHost.mount(app.Card, { id: "1", tag: "a" })
        yield* load
        yield* TestHost.setOnline(false)
        yield* TestClock.adjust("31 seconds")
        app.db.names.set("1", "Ann2")
        yield* TestHost.setOnline(true)
        yield* load
        assert.deepStrictEqual(triggers(root), ["watch", "connectivity"])
        assert.strictEqual(root.text(), "a=Ann2")
      })
    )
  })

  it.effect("interval: refetchInterval refetches a watched entry on the clock", () => {
    const app = makeApp({ interval: true })
    return run(
      app.layer,
      Effect.gen(function*() {
        const root = yield* TestHost.mount(app.Card, { id: "1", tag: "a" })
        yield* load
        app.db.names.set("1", "Ann2")
        yield* TestClock.adjust("5 seconds")
        yield* load
        assert.deepStrictEqual(triggers(root), ["watch", "interval"])
        assert.strictEqual(root.text(), "a=Ann2")
      })
    )
  })

  it.effect("get: a Command's get of a cold entry fetches, and a watch of it then joins the stored value", () => {
    const app = makeApp()
    return run(
      app.layer,
      Effect.gen(function*() {
        const root = yield* TestHost.mount(app.Tools, {})
        root.send(app.ToolsMessage.Get({ id: "2" }))
        yield* load
        assert.strictEqual(root.text(), "Bea")
        assert.deepStrictEqual(triggers(root), ["get"])
        assert.isTrue(
          AsyncResult.isSuccess(root.entry(app.GetUser, { id: "2" })!.stored)
        )
      })
    )
  })

  it.effect("prefetch: a Command's prefetch fetches a cold entry and stores it", () => {
    const app = makeApp()
    return run(
      app.layer,
      Effect.gen(function*() {
        const root = yield* TestHost.mount(app.Tools, {})
        root.send(app.ToolsMessage.Prefetch({ id: "2" }))
        yield* load
        assert.strictEqual(root.text(), "prefetched")
        assert.deepStrictEqual(triggers(root), ["prefetch"])
        assert.isTrue(
          AsyncResult.isSuccess(root.entry(app.GetUser, { id: "2" })!.stored)
        )
        // A prefetch of a fresh entry starts nothing.
        root.send(app.ToolsMessage.Prefetch({ id: "2" }))
        yield* load
        assert.strictEqual(app.db.calls, 1)
      })
    )
  })

  it("make rejects a queries entry that isn't { query, args } or { queryMany, args }", () => {
    const app = makeApp()
    class ListUsers extends Query.InfiniteService<ListUsers>()(
      "users/ListUsers",
      {
        args: {},
        page: Schema.Array(User),
        items: (page) => page,
        key: (user) => user.id,
        error: Schema.Never,
        cursor: Schema.Number,
        next: () => Option.none(),
        staleTime: "30 seconds"
      }
    ) {}
    const make = (queries: unknown) =>
      Component.define({
        name: "Bad",
        model: Schema.Struct({}),
        message: Schema.Never,
        queries
      } as any).make({
        init: () => ({}),
        update: ($: any) => $.model,
        view: (h: any) => h.text("")
      } as any)
    const args = () => ({ id: "1" })
    assert.throws(() => make(42), /Bad: queries must be a record/)
    assert.throws(
      () => make({ user: args }),
      /Bad: queries\.user must be \{ query, args \} or \{ queryMany, args \}/
    )
    assert.throws(
      () => make({ user: { args } }),
      /queries\.user must have exactly one of query and queryMany/
    )
    assert.throws(
      () =>
        make({ user: { query: app.GetUser, queryMany: app.GetUser, args } }),
      /must have exactly one of query and queryMany/
    )
    assert.throws(
      () => make({ user: { query: "users/GetUser", args } }),
      /has a query that isn't a Query/
    )
    assert.throws(
      () => make({ user: { queryMany: {}, args } }),
      /has a queryMany that isn't a Query/
    )
    assert.throws(
      () => make({ user: { query: app.GetUser } }),
      /must have an args function/
    )
    assert.throws(
      () => make({ user: { query: app.GetUser, args, onChange: 1 } }),
      /has an onChange that isn't a function/
    )
    assert.throws(
      () => make({ users: { queryMany: ListUsers, args: () => [{}] } }),
      /An infinite query takes query/
    )
    // The well-formed entries pass.
    make({
      user: { query: app.GetUser, args },
      users: { query: ListUsers, args: () => ({}) }
    })
    make({ users: { queryMany: app.GetUser, args: () => [{ id: "1" }] } })
  })

  it.effect("queries that read each other in a cycle fail the instance, and settle fails with RootCrashed", () => {
    const app = makeApp()
    const Cycle = Component.define({
      name: "Cycle",
      model: Schema.Struct({}),
      message: Schema.Never,
      queries: {
        a: {
          query: app.GetUser,
          args: ({ queries }: any) => (queries.b, { id: "1" })
        },
        b: {
          query: app.GetUser,
          args: ({ queries }: any) => (queries.a, { id: "2" })
        }
      }
    } as any).make({
      init: () => ({}),
      update: ($: any) => $.model,
      view: (h: any) => h.el("p", "never")
    } as any)
    return run(
      app.layer,
      Effect.gen(function*() {
        yield* TestHost.mount(Cycle as any, {})
        const error = yield* Effect.flip(TestHost.settle)
        assert.strictEqual(error._tag, "RootCrashed")
        assert.match(String(error.message), /read each other in a cycle/)
      })
    )
  })

  it.effect("Schema.Redacted in a query's args and success: the log is redacted, the Model and the cache are not", () => {
    const Account = Schema.Struct({
      id: Schema.String,
      secret: Schema.Redacted(Schema.String)
    })
    class GetAccount extends Query.Service<GetAccount>()(
      "accounts/GetAccount",
      {
        args: { token: Schema.Redacted(Schema.String) },
        success: Account,
        error: Schema.Never,
        staleTime: "30 seconds"
      }
    ) {
      static readonly layer = this.toLayer(({ token }) =>
        Effect.succeed({
          id: "acc",
          secret: Redacted.make(`secret-of-${Redacted.value(token)}`)
        })
      )
    }
    const Page = Component.define({
      name: "Page",
      props: Schema.Struct({ token: Schema.Redacted(Schema.String) }),
      model: Schema.Struct({}),
      message: Schema.Never,
      queries: {
        account: {
          query: GetAccount,
          args: ({ props }) => ({ token: props.token })
        }
      }
    }).make({
      init: () => ({}),
      update: ($) => $.model,
      view: (h) =>
        h.el(
          "p",
          AsyncResult.isSuccess(h.queries.account)
            ? Redacted.value(h.queries.account.value.secret)
            : "…"
        )
    })
    return run(
      GetAccount.layer,
      Effect.gen(function*() {
        const root = yield* TestHost.mount(Page, {
          token: Redacted.make("tok-123")
        })
        yield* TestHost.settle
        // Page state keeps the real values: the result's key and value as the state's JSON codec writes them.
        assert.strictEqual(root.text(), "secret-of-tok-123")
        const changed = root.log().filter((entry) =>
          entry._tag === "QueryChanged"
        )
        assert.deepStrictEqual(changed.map((entry) => entry.name), ["account"])
        // Page state is { model, queries }, with the results encoded by the queries' Schemas.
        const queries = (Page["~queries"] as {
          readonly schema: Schema.Codec<unknown, unknown>
        }).schema
        const codec = Schema.toCodecJson(
          Schema.Struct({ model: Page.model, queries })
        )
        const state = JSON.stringify(
          Schema.encodeUnknownSync(codec)({
            model: root.model(),
            queries: { account: changed[0].result }
          })
        )
        assert.include(state, "tok-123")
        assert.include(state, "secret-of-tok-123")
        // The log doesn't: not the args in the log key, nor the value in the written result.
        const fetch = root.fetches()[0]
        assert.notInclude(fetch.logKey, "tok-123")
        const encoder = MessageLog.makeEncoder()
        const wire = JSON.stringify(
          root.log().map((entry) => encoder.encode(entry))
        )
        assert.notInclude(wire, "tok-123")
        assert.notInclude(wire, "secret-of")
        assert.include(wire, "FetchStarted")
        assert.notInclude(TestHost.formatLog(root.log()), "tok-123")
      })
    )
  })

  it.effect("a problem fails settle until expectProblem takes it", () => {
    const app = makeApp()
    class BadRename extends Command.Service<BadRename>()(
      "users/BadRename",
      {
        args: { id: Schema.String },
        success: Schema.Never,
        invalidates: () => [],
        // The patched value fails the query's success Schema.
        optimistic: (
          { id }
        ) => [
          app.GetUser.patch(
            { id },
            (user) => ({ ...user, name: 42 as unknown as string })
          )
        ]
      }
    ) {
      static readonly layer = this.toLayer(() => Effect.never)
    }
    const Message = UiSchema.TaggedEnum({ Break: {} })
    const Breaker = Component.define({
      name: "Breaker",
      model: Schema.Struct({}),
      message: Message,
      queries: { user: { query: app.GetUser, args: () => ({ id: "1" }) } }
    }).make({
      init: () => ({}),
      update: ($) =>
        $.run(
          BadRename.make({ id: "1" }).pipe(Command.map(() => Message.Break()))
        ),
      view: (h) => h.el("p", "breaker")
    })
    return run(
      Layer.merge(app.layer, BadRename.layer),
      Effect.gen(function*() {
        const root = yield* TestHost.mount(Breaker, {})
        yield* load
        root.send(Message.Break())
        const error = yield* Effect.flip(TestHost.settle)
        assert.strictEqual(error._tag, "ProblemsError")
        const [problem] = yield* TestHost.expectProblem("PatchInvalid")
        assert.deepStrictEqual(
          [problem.query, problem.logKey, problem.command],
          [
            "users/GetUser",
            `{"id":"1"}`,
            "users/BadRename"
          ]
        )
        assert.deepStrictEqual(yield* TestHost.problems, [])
        // Taken: settle passes, and the patched value is shown as it is.
        yield* TestHost.settle
        assert.strictEqual(root.entry(app.GetUser, { id: "1" })?.patched, true)
      })
    )
  })

  it.effect("a clock wake that runs out of budget reports DrainExhausted", () => {
    const Message = UiSchema.TaggedEnum({ Tick: {} })
    const Wait = Command.make(
      "Wait",
      { args: {} },
      () => Effect.sleep("1 millis").pipe(Effect.as(Message.Tick()))
    )
    const Spin = Command.make(
      "Spin",
      { args: {} },
      () => Effect.succeed(Message.Tick())
    )
    const Spinner = Component.define({
      name: "Spinner",
      model: Schema.Number,
      message: Message
    }).make({
      init: ($) => $.set(0).run(Wait.make()),
      // Each Tick issues the next: the work never runs out.
      update: ($) => $.set($.model + 1).run(Spin.make()),
      view: (h, count) => h.el("p", String(count))
    })
    return Effect.gen(function*() {
      const root = yield* TestHost.mount(Spinner, {})
      yield* TestHost.settle
      yield* TestClock.adjust("1 millis")
      const [problem] = yield* TestHost.expectProblem("DrainExhausted")
      assert.match(problem.message, /clock wake ran 50 tasks/)
      assert.isAbove(root.model()!, 0)
    }).pipe(Effect.scoped, Effect.provide(TestHost.layer({ budget: 50 })))
  })
})
