import * as Native from "@effect/ui-native/Native"
import * as NativeApp from "@effect/ui-native/NativeApp"
import * as UiSchema from "@effect/ui/UiSchema"
import * as Schema from "effect/Schema"
import { afterAll, assert, describe, it, vi } from "vitest"
import * as FakeFabric from "./utils/FakeFabric.ts"

// React Native ships Flow sources, so the modules NativeApp reaches into
// are stood in for.
vi.mock(
  "react-native/Libraries/EventEmitter/RCTDeviceEventEmitter",
  () => ({ default: { emit() {} } })
)
vi.mock(
  "react-native/Libraries/StyleSheet/processColor",
  () => ({ default: (color: unknown) => color })
)
vi.mock(
  "react-native/Libraries/Utilities/Platform",
  () => ({ default: { OS: "android" } })
)
vi.mock(
  "react-native/Libraries/Core/Devtools/getDevServer",
  () => ({ default: () => ({ fullBundleUrl: null }) })
)
vi.mock(
  "react-native/Libraries/Utilities/DevSettings",
  () => ({ default: { reload() {}, onFastRefresh() {} } })
)
vi.mock(
  "react-native/Libraries/WebSocket/WebSocket",
  () => ({ default: function WebSocket() {} })
)

const global = globalThis as any

const Greeting = Native.component({
  name: "Greeting",
  props: Schema.Struct({ name: Schema.String }),
  model: Schema.Struct({ name: Schema.String }),
  message: UiSchema.TaggedEnum({ Cleared: {} })
}).make({
  init: ($) => ({ name: $.props.name }),
  update: { Cleared: ($) => $.evolve({ name: () => "" }) },
  view: (h, model) => h.text.children(`Hello, ${model.name}`)
})

const settle = () => new Promise((r) => setTimeout(r, 10))

describe("NativeApp", () => {
  const fabric = FakeFabric.make()
  const modules = new Map<string, unknown>()
  global.nativeFabricUIManager = fabric.ui
  global.RN$registerCallableModule = (name: string, factory: () => unknown) =>
    modules.set(name, factory())
  afterAll(() => {
    for (
      const key of [
        "nativeFabricUIManager",
        "RN$registerCallableModule",
        "RN$AppRegistry",
        "RN$stopSurface"
      ]
    ) {
      delete global[key]
    }
  })

  it("mounts the app on each surface native starts, until native stops it", async () => {
    NativeApp.register(
      NativeApp.mount(
        Greeting,
        NativeApp.Surface.useSync(({ initialProps }) => ({
          name: String(initialProps.name)
        }))
      )
    )
    assert.includeMembers([...modules.keys()], [
      "RCTDeviceEventEmitter",
      "RCTNativeAppEventEmitter",
      "RCTLog",
      "HMRClient"
    ])
    assert.isFunction(global.performance.now)

    global.RN$AppRegistry.runApplication("main", {
      rootTag: 11,
      initialProps: { name: "Tim" }
    })
    await settle()
    assert.strictEqual(
      FakeFabric.print(fabric.committed()),
      "<RCTText>Hello, Tim</>"
    )

    global.RN$stopSurface(11)
    await settle()
    assert.strictEqual(FakeFabric.print(fabric.committed()), "")
  })
})
