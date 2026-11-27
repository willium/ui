// The app's entry, in place of Expo's `registerRootComponent`. It mounts
// `App` on each surface native starts, with no React in the bundle.
import * as NativeApp from "@effect/ui-native/NativeApp"
import { App } from "./App.ts"

NativeApp.register(NativeApp.mount(App, {}))
