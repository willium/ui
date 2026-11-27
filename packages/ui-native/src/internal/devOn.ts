// Fast Refresh without React. Metro's module system calls the refresh
// runtime it finds at `__ReactRefresh`: it asks whether a module's exports
// are all components, registers each export after the module runs, and after
// an edit re-runs the changed modules up to ones that are, then calls
// `performReactRefresh`. This runtime treats `@effect/ui` components as the
// components, and swaps the edited ones into the mounted roots in place,
// which keeps their state. A change the swap can't take reloads the app.
//
// Native starts Metro's HMR client through the `HMRClient` callable module.
// React Native's own imports React, so this file provides one.
import getDevServer from "react-native/Libraries/Core/Devtools/getDevServer"
import DevSettings from "react-native/Libraries/Utilities/DevSettings"
import WebSocket from "react-native/Libraries/WebSocket/WebSocket"
import * as Refresh from "./refresh.ts"

declare const global: any

global[(global.__METRO_GLOBAL_PREFIX__ ?? "") + "__ReactRefresh"] = Refresh
  .make({
    reload: (reason) => DevSettings.reload(reason),
    refreshed: () => DevSettings.onFastRefresh()
  })

interface Update {
  readonly added: ReadonlyArray<
    { readonly module: readonly [number, string]; readonly sourceURL: string }
  >
  readonly modified: Update["added"]
}

const inject = ({ module: [, code], sourceURL }: Update["added"][number]) => {
  if (global.globalEvalWithSourceUrl) {
    global.globalEvalWithSourceUrl(code, sourceURL)
  } // oxlint-disable-next-line no-eval
  else (0, eval)(code)
}

const makeClient = (url: string, entry: string) => {
  let enabled = false
  let socket: WebSocket | undefined
  const queue: Array<string> = []
  const send = (message: string) => {
    if (socket?.readyState === 1) socket.send(message)
    else queue.push(message)
  }
  socket = new WebSocket(url)
  socket.onopen = () => {
    for (const message of queue.splice(0)) socket!.send(message)
  }
  socket.onerror = (error: any) => {
    // oxlint-disable-next-line no-console
    console.warn(
      `[@effect/ui-native] Can't reach Metro at ${url}: ${
        error?.message ?? error
      }`
    )
  }
  socket.onmessage = (message: any) => {
    const data = JSON.parse(String(message.data))
    switch (data.type) {
      case "update": {
        const update = data.body as Update
        if (!enabled) return
        for (const item of update.added) inject(item)
        for (const item of update.modified) inject(item)
        return
      }
      case "error": {
        const body = data.body
        if (
          body.type === "GraphNotFoundError" ||
          body.type === "RevisionNotFoundError"
        ) {
          socket?.close()
          // oxlint-disable-next-line no-console
          console.warn(
            "[@effect/ui-native] Metro restarted since the app loaded. Reload to reconnect."
          )
          return
        }
        // oxlint-disable-next-line no-console
        console.error(`${body.type} ${body.message}`)
      }
    }
  }
  send(JSON.stringify({ type: "register-entrypoints", entryPoints: [entry] }))
  return {
    send,
    enable: () => {
      enabled = true
    },
    disable: () => {
      enabled = false
    }
  }
}

export const install = (
  register: (name: string, module: object) => void
): void => {
  global.WebSocket ??= WebSocket
  let client: ReturnType<typeof makeClient> | undefined
  register("HMRClient", {
    setup(
      platform: string,
      bundleEntry: string,
      host: string,
      port: number | string | null,
      isEnabled: boolean,
      scheme = "http"
    ) {
      const origin = `${scheme}://${
        port !== null && port !== "" ? `${host}:${port}` : host
      }`
      client = makeClient(
        `${origin}/hot`,
        getDevServer().fullBundleUrl ??
          `${origin}/hot?bundleEntry=${bundleEntry}&platform=${platform}`
      )
      if (isEnabled) client.enable()
    },
    enable: () => client?.enable(),
    disable: () => client?.disable(),
    registerBundle(url: string) {
      client?.send(
        JSON.stringify({ type: "register-entrypoints", entryPoints: [url] })
      )
    },
    log() {}
  })
}
