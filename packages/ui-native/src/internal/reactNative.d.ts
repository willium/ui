// The React Native modules ui-native reaches into, which ship no types.

declare module "react-native/Libraries/StyleSheet/processColor" {
  const processColor: (color: unknown) => unknown
  export default processColor
}

declare module "react-native/Libraries/Utilities/Platform" {
  const Platform: { readonly OS: string }
  export default Platform
}

declare module "react-native/Libraries/EventEmitter/RCTDeviceEventEmitter" {
  const RCTDeviceEventEmitter: object
  export default RCTDeviceEventEmitter
}

declare module "react-native/Libraries/WebSocket/WebSocket" {
  const WebSocket: typeof globalThis.WebSocket
  export default WebSocket
}

declare module "react-native/Libraries/Core/Devtools/getDevServer" {
  const getDevServer: () => { readonly fullBundleUrl: string | null }
  export default getDevServer
}

declare module "react-native/Libraries/Utilities/DevSettings" {
  const DevSettings: {
    readonly reload: (reason?: string) => void
    readonly onFastRefresh: () => void
  }
  export default DevSettings
}
