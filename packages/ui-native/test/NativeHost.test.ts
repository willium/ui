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

const Message = UiSchema.TaggedEnum({
  Pressed: {},
  Typed: { value: Schema.String },
  Scrolled: { y: Schema.Number },
  Toggled: {}
})

const Counter = Native.component({
  name: "Counter",
  model: Schema.Struct({
    count: Schema.Number,
    name: Schema.String,
    on: Schema.Boolean,
    y: Schema.Number
  }),
  message: Message
}).make({
  init: () => ({ count: 0, name: "", on: false, y: 0 }),
  update: {
    Pressed: ($) => $.evolve({ count: (count) => count + 1 }),
    // Keeps the name upper case, so an edit in lower case is replaced.
    Typed: ($, { value }) => $.evolve({ name: value.toUpperCase() }),
    Scrolled: ($, { y }) => $.evolve({ y }),
    Toggled: ($) => $.evolve({ on: (on) => !on })
  },
  view: (h, model) =>
    h.view.style({ flex: 1 }).children(
      h.view.style({ padding: 8 }).on("press", Message.Pressed()).children(
        h.text.children("Count ", String(model.count))
      ),
      h.input.value(model.name).placeholder("Name").on(
        "input",
        ({ value }) => Message.Typed({ value })
      ),
      h.text.children(
        "Hello, ",
        h.text.style({ fontWeight: "bold" }).children(model.name)
      ),
      h.view.style(model.on ? { backgroundColor: "red" } : {}).children(),
      h.scroll.horizontal(model.on).on("scroll", ({ y }) =>
        Message.Scrolled({ y }))
        .children(h.text.children("Row")),
      h.text.children(`y ${model.y}`)
    )
})

const setup = async () => {
  const fabric = FakeFabric.make()
  let commits = 0
  const colors: Array<unknown> = []
  const made = NativeHost.make({
    ui: fabric.ui,
    rootTag: 1,
    os: "android",
    processColor: (color) => {
      colors.push(color)
      return `processed ${String(color)}`
    },
    onCommit: () => commits++
  })
  const scope = Scope.makeUnsafe()
  const root = await Effect.runPromise(
    Renderer.mount(Counter, {}, made.root).pipe(
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
    // `commits` changes while the loop awaits.
    // oxlint-disable-next-line no-unmodified-loop-condition
    for (let i = 0; i < 50 && commits === before; i++) {
      await new Promise((r) => setTimeout(r, 0))
    }
  }
  await settle()
  const find = (test: (n: FakeFabric.ShadowNode) => boolean) =>
    FakeFabric.find(fabric.committed(), test)!
  const printed = () => FakeFabric.print(fabric.committed())
  return { fabric, made, root, settle, colors, find, printed, scope }
}

const touch = (
  fabric: ReturnType<typeof FakeFabric.make>,
  node: FakeFabric.ShadowNode,
  end: "topTouchEnd" | "topTouchCancel" = "topTouchEnd",
  at = { pageX: 10, pageY: 10 }
) => {
  fabric.emit(node, "topTouchStart", {})
  fabric.emit(node, end, { changedTouches: [at] })
}

describe("NativeHost", () => {
  it("presses the nearest view with a press handler", async () => {
    const { fabric, find, printed, settle } = await setup()
    assert.include(printed(), "<RCTText>Count 0</>")
    touch(fabric, find(FakeFabric.byText("Count 0")))
    await settle()
    assert.include(printed(), "<RCTText>Count 1</>")
  })

  it("drops a press that is cancelled or ends outside the view", async () => {
    const { fabric, find, printed, settle } = await setup()
    const label = find(FakeFabric.byText("Count 0"))
    const button = find((n) => n.props.padding === 8)
    assert.strictEqual(button.props.collapsable, false)
    fabric.place(button, [0, 0, 100, 40])
    touch(fabric, label, "topTouchCancel")
    touch(fabric, label, "topTouchEnd", { pageX: 50, pageY: 61 })
    await settle()
    assert.include(printed(), "<RCTText>Count 0</>")
    touch(fabric, label, "topTouchEnd", { pageX: 50, pageY: 59 })
    await settle()
    assert.include(printed(), "<RCTText>Count 1</>")
  })

  it("sends an input's value back only when it differs from the edit", async () => {
    const { fabric, find, printed, settle } = await setup()
    const input = () => find(FakeFabric.byName("AndroidTextInput"))
    fabric.emit(input(), "topChange", { text: "tim", eventCount: 1 })
    await settle()
    assert.strictEqual(input().props.text, "TIM")
    assert.strictEqual(input().props.mostRecentEventCount, 1)
    assert.include(printed(), "<RCTText>Hello, <RCTVirtualText>TIM</></>")

    const before = input()
    fabric.emit(before, "topChange", { text: "TIMO", eventCount: 2 })
    await settle()
    assert.include(printed(), "<RCTVirtualText>TIMO</>")
    // Native shows "TIMO" already, so the field isn't cloned.
    assert.strictEqual(input(), before)
  })

  it("clones only the changed path", async () => {
    const { fabric, find, settle, root } = await setup()
    fabric.reset()
    root.send(Message.Pressed())
    await settle()
    assert.include(FakeFabric.print(fabric.committed()), "Count 1")
    assert.strictEqual(fabric.calls.createNode, undefined)
    // The raw text, then its text, button and the outer view.
    assert.strictEqual(fabric.calls.cloneNodeWithNewProps, 1)
    assert.strictEqual(fabric.calls.cloneNodeWithNewChildren, 3)
    assert.strictEqual(fabric.calls.completeRoot, 1)
    assert.isDefined(find(FakeFabric.byText("Count 1")))
  })

  it("processes colours and removes a style property", async () => {
    const { colors, find, root, settle } = await setup()
    root.send(Message.Toggled())
    await settle()
    assert.deepStrictEqual(colors, ["red"])
    const red = () =>
      FakeFabric.find(
        find(FakeFabric.byName("RCTView")).children,
        (n) => n.props.backgroundColor !== undefined
      )
    assert.strictEqual(red()?.props.backgroundColor, "processed red")
    root.send(Message.Toggled())
    await settle()
    assert.strictEqual(red(), undefined)
  })

  it("holds a scroll view's children in its content view and maps scroll events", async () => {
    const { fabric, find, printed, root, settle } = await setup()
    assert.include(
      printed(),
      "<RCTScrollView><RCTScrollContentView><RCTText>Row</></></>"
    )
    const scroll = find(FakeFabric.byName("RCTScrollView"))
    fabric.emit(scroll, "topScroll", {
      contentOffset: { x: 0, y: 120 },
      contentSize: { width: 100, height: 900 },
      layoutMeasurement: { width: 100, height: 300 }
    })
    await settle()
    assert.include(printed(), "y 120")

    root.send(Message.Toggled())
    await settle()
    const horizontal = find(FakeFabric.byName("AndroidHorizontalScrollView"))
    assert.include(
      printed(),
      "<AndroidHorizontalScrollView><AndroidHorizontalScrollContentView><RCTText>Row</></></>"
    )
    // Native can't change a view's type, so the views are new ones.
    assert.notStrictEqual(horizontal.tag, scroll.tag)
    assert.notStrictEqual(horizontal.children[0]!.tag, scroll.children[0]!.tag)
    assert.strictEqual(horizontal.props.flexDirection, "row")
    assert.strictEqual(horizontal.props.overflow, "scroll")
    assert.strictEqual(horizontal.children[0]!.props.flexDirection, "row")

    root.send(Message.Toggled())
    await settle()
    assert.isUndefined(
      find(FakeFabric.byName("RCTScrollContentView")).props.flexDirection
    )
  })

  it("recreates text that moves into or out of text", () => {
    const fabric = FakeFabric.make()
    const { host, root } = NativeHost.make({
      ui: fabric.ui,
      rootTag: 1,
      os: "android",
      processColor: (c) => c
    })
    const outer = host.createElement("text")
    const box = host.createElement("view")
    const inner = host.createElement("text")
    host.insertBefore(inner, host.createText("moving"), undefined)
    host.insertBefore(root, outer, undefined)
    host.insertBefore(root, box, undefined)
    host.insertBefore(outer, inner, undefined)
    host.commit!()
    assert.strictEqual(
      FakeFabric.print(fabric.committed()),
      "<RCTText><RCTVirtualText>moving</></><RCTView></>"
    )
    const nested = FakeFabric.find(
      fabric.committed(),
      FakeFabric.byName("RCTVirtualText")
    )!

    host.insertBefore(box, inner, undefined)
    host.commit!()
    assert.strictEqual(
      FakeFabric.print(fabric.committed()),
      "<RCTText></><RCTView><RCTText>moving</></>"
    )
    const moved = FakeFabric.find(
      fabric.committed(),
      (n) => n.viewName === "RCTText" && n.children.length > 0
    )!
    assert.notStrictEqual(moved.tag, nested.tag)

    host.insertBefore(outer, inner, undefined)
    host.commit!()
    assert.strictEqual(
      FakeFabric.print(fabric.committed()),
      "<RCTText><RCTVirtualText>moving</></><RCTView></>"
    )
  })

  it("recreates a view and its subtree when it moves to another parent", () => {
    const fabric = FakeFabric.make()
    const { host, root } = NativeHost.make({
      ui: fabric.ui,
      rootTag: 1,
      os: "android",
      processColor: (c) => c
    })
    const left = host.createElement("view")
    const right = host.createElement("view")
    const moving = host.createElement("view")
    const label = host.createElement("text")
    host.insertBefore(label, host.createText("moving"), undefined)
    host.insertBefore(moving, label, undefined)
    host.insertBefore(left, moving, undefined)
    host.insertBefore(root, left, undefined)
    host.insertBefore(root, right, undefined)
    host.commit!()
    const tags = () => {
      const text = FakeFabric.find(
        fabric.committed(),
        FakeFabric.byText("moving")
      )!
      const box = FakeFabric.find(
        fabric.committed(),
        (n) => n.children.some((c) => c.viewName === "RCTText")
      )!
      return [box.tag, box.children[0]!.tag, text.tag]
    }
    const before = tags()

    // Fabric keeps a tag's parent for good, so each tag here has to be new.
    host.insertBefore(right, moving, undefined)
    host.commit!()
    assert.strictEqual(
      FakeFabric.print(fabric.committed()),
      "<RCTView></><RCTView><RCTView><RCTText>moving</></></>"
    )
    const after = tags()
    for (let i = 0; i < before.length; i++) {
      assert.notStrictEqual(after[i], before[i])
    }

    // A move among the same parent's children keeps the views.
    const other = host.createElement("view")
    host.insertBefore(right, other, undefined)
    host.commit!()
    host.insertBefore(right, other, moving)
    host.commit!()
    assert.deepStrictEqual(tags(), after)
  })

  it("runs the Host operations on committed nodes", async () => {
    const { fabric, made, find } = await setup()
    const input = find(FakeFabric.byName("AndroidTextInput"))
    const node = input.handle as NativeHost.NativeNode
    made.operations.focus(node)
    made.operations.scrollTo(node, 0, 40)
    fabric.place(input, [1, 2, 3, 4])
    assert.deepStrictEqual(made.operations.measure(node), {
      x: 1,
      y: 2,
      width: 3,
      height: 4
    })
    assert.deepStrictEqual(fabric.commands, [
      [input.tag, "focus", []],
      [input.tag, "scrollTo", [0, 40, true]]
    ])
  })

  it("names the views for iOS", () => {
    const fabric = FakeFabric.make()
    const { host, root } = NativeHost.make({
      ui: fabric.ui,
      rootTag: 1,
      os: "ios",
      processColor: (c) => c
    })
    const scroll = host.createElement("scroll")
    host.setProp(scroll, "horizontal", true)
    host.insertBefore(root, scroll, undefined)
    host.insertBefore(root, host.createElement("input"), undefined)
    host.commit!()
    assert.strictEqual(
      FakeFabric.print(fabric.committed()),
      "<RCTScrollView><RCTScrollContentView></></><RCTSinglelineTextInputView></>"
    )
  })
})
