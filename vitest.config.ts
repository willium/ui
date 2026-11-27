import * as path from "node:path"
import { defineConfig, mergeConfig, type ViteUserConfig } from "vitest/config"

const isDeno = process.versions.deno !== undefined
const isBun = process.versions.bun !== undefined
const isNode = typeof process !== "undefined" &&
  process.release.name === "node" &&
  !isDeno &&
  !isBun

const ffi = isNode ? ["--experimental-ffi"] : []

const project = (
  name: string,
  directory: string,
  include: boolean = true,
  config: ViteUserConfig = {}
) => {
  if (!include) {
    return []
  }

  const cfg = mergeConfig({
    root: directory,
    test: { name }
  }, config)

  return [mergeConfig(shared, cfg)]
}

const example = (name: string) =>
  project(name, path.join("examples", name), true, {
    test: {
      include: ["src/**/*.test.ts"]
    }
  })

export const exclude = [
  "**/.*/**",
  "**/node_modules/**",
  "**/dist/**",
  "**/benchmark/**",
  "**/typetest/**",
  "**/coverage/**",
  "**/test/utils/**",
  "**/*.d.ts",
  "**/*.config.*",
  "**/vitest.*"
]

const shared: ViteUserConfig = {
  server: {
    watch: {
      ignored: exclude
    }
  },
  resolve: {
    tsconfigPaths: true
  },
  test: {
    exclude,
    passWithNoTests: true,
    setupFiles: [path.join(import.meta.dirname, "vitest.setup.ts")],
    sequence: {
      concurrent: true
    },
    include: ["test/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["html"],
      reportsDirectory: "coverage",
      exclude
    }
  }
}

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      ...project("scripts", "scripts", true, {
        test: { include: ["codemods/jsdoc.test.ts"] }
      }),
      // Node reuses workers across test files, which skips re-importing the effect module graph for every file.
      ...project("@effect/ui", "packages/ui", true, {
        test: { isolate: !isNode }
      }),
      ...project("@effect/ui-kit", "packages/ui-kit"),
      ...project("@effect/ui-devtools", "packages/ui-devtools"),
      ...project("@effect/ui-opentui", "packages/ui-opentui", true, {
        test: { execArgv: ffi }
      }),
      ...project("@effect/ui-native", "packages/ui-native"),
      ...example("auth"),
      ...example("canvas-art"),
      ...example("counter"),
      ...example("counters"),
      ...example("domains"),
      ...example("file-preview"),
      ...example("interrupting-commands"),
      ...example("launch"),
      ...example("routing"),
      ...example("snake"),
      ...example("web-components"),
      ...project("snake-tui", path.join("examples", "snake-tui"), true, {
        test: {
          include: ["src/**/*.test.ts"],
          execArgv: ffi
        }
      })
    ]
  }
})
