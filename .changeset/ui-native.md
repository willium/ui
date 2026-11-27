---
"@effect/ui-native": minor
"@effect/ui": minor
---

Add `@effect/ui-native`, which renders `@effect/ui` apps as React Native views through Fabric, without React. `NativeApp.register` runs an app on each surface native starts, and `NativeMetro.withEffectUi` configures Metro: release builds are pre-bundled with Vite, which tree-shakes `effect`, and development builds get Fast Refresh. `examples/native` is an Expo app built with it.

A `Renderer.Host` can set `hot: true` to let a hot-reload runtime other than Vite's swap the components mounted on it in place, keeping their state.
