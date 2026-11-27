import * as Refresh from "@effect/ui-native/internal/refresh"
import * as Native from "@effect/ui-native/Native"
import * as NativeHost from "@effect/ui-native/NativeHost"
import * as Renderer from "@effect/ui/Renderer"
import * as UiSchema from "@effect/ui/UiSchema"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Scope from "effect/Scope"
import { assert, describe, it } from "vitest"
import * as FakeFabric from "./utils/FakeFabric.ts"

const Message = UiSchema.TaggedEnum({ Pressed: {} })

const counter = (
  label: string,
  model: Schema.Top = Schema.Struct({ count: Schema.Number })
) =>
  Native.component({
    name: "Counter",
    model: model as Schema.Struct<{ count: Schema.Number }>,
    message: Message
  }).make({
    init: () => ({ count: 0 }),
    update: { Pressed: ($) => $.evolve({ count: (count) => count + 1 }) },
    view: (h, model) => h.text.children(`${label} ${model.count}`)
  })

const setup = async () => {
  const fabric = FakeFabric.make()
  let commits = 0
  const made = NativeHost.make({
    ui: fabric.ui,
    rootTag: 1,
    os: "android",
    processColor: (c) => c,
    onCommit: () => commits++
  })
  const reloads: Array<string> = []
  let refreshed = 0
  const runtime = Refresh.make({
    reload: (reason) => reloads.push(reason),
    refreshed: () => refreshed++
  })
  const first = counter("v1")
  // Metro registers a module's exports after it runs.
  runtime.register(first, "7 %exports% Counter")
  const scope = Scope.makeUnsafe()
  const root = await Effect.runPromise(
    Renderer.mount(first, {}, made.root).pipe(
      Effect.provideContext(
        Context.make(Renderer.Renderer, { host: made.host }).pipe(
          Context.add(Native.Host, made.operations)
        )
      ),
      Scope.provide(scope)
    )
  )
  const settle = async () => {
    const before = commits
    // oxlint-disable-next-line no-unmodified-loop-condition
    for (let i = 0; i < 50 && commits === before; i++) {
      await new Promise((r) => setTimeout(r, 0))
    }
  }
  await settle()
  root.send(Message.Pressed())
  await settle()
  return {
    fabric,
    first,
    runtime,
    reloads,
    refreshed: () => refreshed,
    settle,
    printed: () => FakeFabric.print(fabric.committed()),
    close: () => Effect.runPromise(Scope.close(scope, Effect.void as any))
  }
}

describe("Fast Refresh", () => {
  it("treats components as the components Metro asks about", () => {
    const runtime = Refresh.make({ reload: () => {}, refreshed: () => {} })
    assert.isTrue(runtime.isLikelyComponentType(counter("v1")))
    assert.isFalse(runtime.isLikelyComponentType(() => null))
    assert.isFalse(runtime.isLikelyComponentType({}))
  })

  it("swaps an edited component in place and keeps its state", async () => {
    const { printed, refreshed, reloads, runtime, settle, close } =
      await setup()
    assert.strictEqual(printed(), "<RCTText>v1 1</>")
    const next = counter("v2")
    runtime.register(next, "7 %exports% Counter")
    // An id from React's Babel plugin names the same value, and is ignored.
    runtime.register(next, "7 Counter")
    runtime.performReactRefresh()
    await settle()
    assert.strictEqual(printed(), "<RCTText>v2 1</>")
    assert.strictEqual(refreshed(), 1)
    assert.deepStrictEqual(reloads, [])
    // A second edit swaps into the same mounted component.
    runtime.register(counter("v3"), "7 %exports% Counter")
    runtime.performReactRefresh()
    await settle()
    assert.strictEqual(printed(), "<RCTText>v3 1</>")
    await close()
  })

  it("keeps one family across edits, so Metro doesn't invalidate the boundary", async () => {
    const { first, runtime, close } = await setup()
    assert.isUndefined(runtime.getFamilyByType(counter("unregistered")))
    const next = counter("v2")
    runtime.register(next, "7 %exports% Counter")
    assert.isDefined(runtime.getFamilyByType(next))
    assert.strictEqual(
      runtime.getFamilyByType(next),
      runtime.getFamilyByType(first)
    )
    await close()
  })

  it("reloads when the state no longer fits the component", async () => {
    const { printed, refreshed, reloads, runtime, settle, close } =
      await setup()
    runtime.register(
      counter("v2", Schema.Struct({ count: Schema.String })),
      "7 %exports% Counter"
    )
    runtime.performReactRefresh()
    await settle()
    assert.strictEqual(printed(), "<RCTText>v1 1</>")
    assert.strictEqual(refreshed(), 0)
    assert.strictEqual(reloads.length, 1)
    await close()
  })

  it("does nothing when no module changed", async () => {
    const { refreshed, reloads, runtime, close } = await setup()
    runtime.performReactRefresh()
    assert.strictEqual(refreshed(), 0)
    assert.deepStrictEqual(reloads, [])
    await close()
  })
})
