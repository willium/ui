import type * as On from "./devOn.ts"

// A debug app can run a production bundle, and native still calls this.
const hmrClient = {
  setup() {},
  enable() {},
  disable() {},
  registerBundle() {},
  log() {}
}

export const install: typeof On.install = (register) => {
  register("HMRClient", hmrClient)
}
