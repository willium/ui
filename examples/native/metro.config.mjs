import { NativeMetro } from "@effect/ui-native/node"
import ExpoMetro from "expo/metro-config"

// A release build is pre-bundled with Vite, which tree-shakes `effect`.
// In development Metro serves the sources, with Fast Refresh.
export default NativeMetro.withEffectUi(
  ExpoMetro.getDefaultConfig(import.meta.dirname)
)
