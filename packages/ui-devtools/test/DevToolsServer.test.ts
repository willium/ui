// @vitest-environment happy-dom
import * as NodeHttpClient from "@effect/platform-node/NodeHttpClient"
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer"
import { Command, MessageLog, Query, UiSchema } from "@effect/ui"
import { DevTools, Inspector } from "@effect/ui-devtools"
import * as Mcp from "@effect/ui-devtools/internal/mcp"
import * as Remote from "@effect/ui-devtools/internal/remote"
import * as Server from "@effect/ui-devtools/internal/server"
import { DevToolsServer, DevToolsVite } from "@effect/ui-devtools/node"
import { BrowserHost, Html } from "@effect/ui/html"
import { HtmlLocator } from "@effect/ui/html/testing"
import { assert, describe, it } from "@effect/vitest"
import { Context, Effect, Layer, Schedule, Schema, Stream } from "effect"
import { McpClient, McpProtocol } from "effect/ai"
import { HttpRouter } from "effect/http"
import { AsyncResult } from "effect/reactivity"
import * as Socket from "effect/socket/Socket"
import { createServer, request } from "node:http"
import type { AddressInfo } from "node:net"
import { type Capture, EditorMessage, play } from "./fixtures/TwoEditors.ts"

const wait = (ms: number) =>
  Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, ms)))
const token = "tok_live_9f2c"

const text = (node: Element | null | undefined) =>
  (node?.textContent ?? "").replace(/\s+/g, " ").trim()
const overlay = () =>
  document.querySelector<HTMLIFrameElement>("iframe[data-effect-ui-devtools]")!
    .contentDocument!.body

// happy-dom's fetch applies CORS, so the origin probes use node:http.
const probeStatus = (
  url: string,
  options: {
    readonly method?: string
    readonly headers: Record<string, string>
  },
  body = ""
) =>
  Effect.promise(
    () =>
      new Promise<number>((resolve, reject) => {
        const req = request(url, options, (res) => {
          res.resume()
          res.on("end", () => resolve(res.statusCode ?? 0))
        })
        req.on("upgrade", (res, socket) => {
          socket.destroy()
          resolve(res.statusCode ?? 0)
        })
        req.on("error", reject)
        req.end(body)
      })
  )

const makeAgent = Effect.fnUntraced(function*(base: string) {
  const transport = yield* McpClient.http({
    url: base + "/mcp",
    protocol: McpProtocol.v2025_11_25
  }).pipe(Effect.provide(NodeHttpClient.layerNodeHttp))
  const client = yield* McpClient.make({ name: "test", version: "0" }).pipe(
    Effect.provideService(McpClient.Transport, transport)
  )
  const tools = yield* client.listTools()
  const byName = new Map(tools.map((tool) => [tool.name, tool]))
  const results: Array<string> = []
  const invoke = (name: string, args?: Record<string, unknown>) =>
    client.callTool({ tool: byName.get(name)!, arguments: args }).pipe(
      Effect.orDie,
      Effect.tap((result) =>
        Effect.sync(() => results.push(JSON.stringify(result)))
      )
    )
  return {
    tools,
    results,
    call: <A = any>(
      name: string,
      args?: Record<string, unknown>
    ): Effect.Effect<A> =>
      invoke(name, args).pipe(
        Effect.map((result) => {
          if (result.isError === true) {
            throw new Error(
              result.content?.[0]?.type === "text"
                ? result.content[0].text
                : JSON.stringify(result)
            )
          }
          return (result.structuredContent as { readonly result: A }).result
        })
      ),
    fails: (
      name: string,
      args?: Record<string, unknown>
    ): Effect.Effect<string> =>
      invoke(name, args).pipe(
        Effect.map((result) => {
          assert.isTrue(result.isError, name + " should fail")
          return JSON.stringify(result.content ?? result.structuredContent)
        })
      )
  }
})

const serve = Effect.fnUntraced(function*(options?: DevToolsServer.Options) {
  const port = options?.port ?? (yield* freePort)
  yield* Layer.build(DevToolsServer.layer({ ...options, port }))
  const url = DevToolsServer.url({ port })
  return { url, agent: yield* makeAgent(url) }
})

const open = Effect.fnUntraced(
  function*(url: string, capture: Capture) {
    localStorage.clear()
    const services = yield* Layer.build(DevTools.layer({ server: url }))
    const app = yield* play(capture).pipe(Effect.provide(services))
    yield* wait(150)
    return app
  }
)

const until = (check: () => boolean) =>
  Effect.suspend(function loop(): Effect.Effect<void> {
    return check()
      ? Effect.void
      : Effect.andThen(wait(10), Effect.suspend(loop))
  }).pipe(Effect.timeout("2 seconds"))

// A fixed port can collide with one the OS hands out.
const freePort = Effect.promise(() =>
  new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.on("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo
      server.close(() => resolve(port))
    })
  })
)

class GetNote extends Query.Service<GetNote>()("notes/GetNote", {
  args: { id: Schema.String },
  success: Schema.String,
  error: Schema.Never,
  staleTime: "30 seconds"
}) {}
class Touch extends Command.Service<Touch>()("notes/Touch", {
  args: { id: Schema.String },
  success: Schema.Void
}) {}
const Note = Html.component({
  name: "Note",
  props: Schema.Struct({ id: Schema.String }),
  model: Schema.Struct({}),
  message: UiSchema.TaggedEnum({ Click: {} }),
  queries: { note: { query: GetNote, args: ({ props }) => ({ id: props.id }) } }
}).make({ init: () => ({}), update: ($) => $.model, view: (h) => h.div() })

const serveFast = Effect.fnUntraced(function*(timeout: number, size = 100) {
  const http = createServer()
  const { routes, server } = Server.make({
    size,
    dispatch: true,
    keep: 5,
    timeout
  })
  yield* Layer.build(
    HttpRouter.serve(Layer.mergeAll(routes, Mcp.layer(server)), {
      disableLogger: true,
      disableListenLog: true
    }).pipe(
      Layer.provide(
        NodeHttpServer.layer(() => http, { port: 0, host: "127.0.0.1" })
      )
    )
  )
  const url = "http://127.0.0.1:" + (http.address() as AddressInfo).port
  return { url, agent: yield* makeAgent(url) }
})

const connectSocket = (url: string) =>
  Effect.callback<WebSocket>((resume) => {
    const socket = new WebSocket(url)
    socket.addEventListener("open", () => resume(Effect.succeed(socket)))
  })

const at = { session: "s", at: 0, path: "/App", instance: 1, component: "App" }
const propsAt = (seq: number) =>
  JSON.stringify({ _tag: "PropsChanged", ...at, seq, props: { seq } })

const updateAt = (seq: number, excluded: boolean) =>
  JSON.stringify({
    _tag: "Update",
    ...at,
    seq,
    source: { _tag: "DomEvent", name: "click" },
    message: { _tag: excluded ? "Ticked" : "Clicked" },
    props: {},
    model: { seq },
    commands: [],
    events: [],
    lists: [],
    sends: [],
    ...(excluded ? { excluded: true } : {})
  })

const fakePage = Effect.fnUntraced(function*(
  url: string,
  dispatch: (log: WebSocket, message: unknown) => Effect.Effect<
    BrowserHost.Dispatched
  >
) {
  const log = yield* connectSocket(url.replace("http", "ws") + "/log")
  yield* Effect.addFinalizer(() => Effect.sync(() => log.close()))
  log.send(JSON.stringify({ _tag: "Hello", version: 1, host: "test" }))
  log.send(
    JSON.stringify({ _tag: "SessionStarted", ...at, seq: 0, app: "App" })
  )
  log.send(propsAt(1))
  const found = {
    instance: 1,
    path: "/App",
    component: "App",
    message: Schema.Struct({ _tag: Schema.Literal("Go"), n: Schema.Number }),
    dispatch: (message: unknown) => dispatch(log, message)
  }
  const root = { instance: (n: number) => n === 1 ? found : undefined }
  yield* Remote.connect(url.replace("http", "ws") + "/control", {
    roots: new Map([["s", root as unknown as BrowserHost.Controllable]]),
    size: 100,
    paused: () => undefined,
    paint: () => Effect.succeed(undefined),
    resume: Effect.void,
    notRecording: () => [],
    setRecording: () => {},
    changes: Stream.never
  }).pipe(Effect.provide(Socket.layerWebSocketConstructorGlobal))
  yield* wait(100)
  return log
})

const go = (count: number) =>
  Array.from({ length: count }, (_, n) => ({ _tag: "Go", n }))

describe("DevToolsServer", { concurrent: false }, () => {
  it.live(
    "answers why a save never finished from the server's copy of the log",
    () =>
      Effect.gen(function*() {
        const { agent, url } = yield* serve()
        yield* open(url, "interrupted")

        assert.deepStrictEqual(agent.tools.map((tool) => tool.name), [
          "list_sessions",
          "list_instances",
          "list_entries",
          "count_entries",
          "get_entry",
          "get_chain",
          "get_state",
          "diff_state",
          "show_entry",
          "resume",
          "set_recording",
          "get_message_schema",
          "dispatch",
          "wait"
        ])
        assert.isTrue(
          agent.tools.find((tool) => tool.name === "dispatch")?.annotations
            ?.destructiveHint
        )
        assert.isTrue(
          agent.tools.find((tool) => tool.name === "get_state")?.annotations
            ?.readOnlyHint
        )

        const [session] = yield* agent.call("list_sessions")
        assert.strictEqual(session.app, "Workspace")
        assert.strictEqual(session.host, "browser")
        assert.isTrue(session.connected)
        assert.isTrue(session.controllable)

        const instances: ReadonlyArray<any> = yield* agent.call(
          "list_instances"
        )
        const n2 = instances.find((instance) =>
          instance.path === "/Workspace/Editor[n2]"
        )
        assert.match(n2.status, /interrupted/)
        assert.isDefined(n2.unmounted)

        const { rows } = yield* agent.call("list_entries", {
          instance: n2.instance,
          filter: "commands"
        })
        const interrupted = rows.find((row: any) =>
          row.tag === "CommandInterrupted"
        )
        const save = rows.find((row: any) => row.label === "ClickedSave")
        assert.isDefined(interrupted)

        const chain: ReadonlyArray<any> = yield* agent.call("get_chain", {
          seq: interrupted.seq
        })
        const steps = JSON.stringify(chain)
        assert.include(steps, "ClickedSave")
        assert.include(steps, "PressedEscape")
        assert.include(steps, "notes/SaveNote")

        const diff = yield* agent.call("diff_state", { seq: save.seq })
        assert.deepInclude(diff.changes, {
          path: ["status"],
          kind: "changed",
          before: "Dirty",
          after: "Saving"
        })

        const state = yield* agent.call("get_state", {
          instance: n2.instance,
          at: save.seq
        })
        assert.strictEqual(state.model.status, "Saving")
        assert.deepStrictEqual(state.props.token, { "~redacted": true })
        const now = yield* agent.call("get_state", { instance: n2.instance })
        assert.match(now.unmounted, /^unmounted at #\d+$/)

        const counts = yield* agent.call("count_entries")
        assert.strictEqual(counts.messages.ClickedSave, 2)

        const entry = yield* agent.call("get_entry", {
          seq: save.seq,
          path: ["message"]
        })
        assert.deepStrictEqual(entry, { _tag: "ClickedSave" })
        assert.notInclude(agent.results.join("\n"), token)
      }).pipe(Effect.scoped),
    30_000
  )

  it.live(
    "reads and sets the page's choice of what to record",
    () =>
      Effect.gen(function*() {
        const { agent, url } = yield* serve()
        localStorage.clear()
        sessionStorage.clear()
        const services = yield* Layer.build(
          DevTools.layer({ server: url, exclude: ["UpdatedDraft"] })
        )
        const app = yield* play("open").pipe(Effect.provide(services))
        yield* wait(150)
        const body = HtmlLocator.getByRole(app, "textbox", { name: "Body n1" })
        const labels = Effect.map(
          agent.call("list_entries", { filter: "messages", limit: 100 }),
          ({ rows }) => rows.map((row: any) => row.label) as Array<string>
        )

        assert.notInclude(yield* labels, "UpdatedDraft")
        const [session] = yield* agent.call("list_sessions")
        assert.deepStrictEqual(session.notRecording, ["UpdatedDraft"])

        assert.deepStrictEqual(
          yield* agent.call("set_recording", {
            tag: "UpdatedDraft",
            recording: true
          }),
          []
        )
        HtmlLocator.type(body, "draft")
        yield* wait(100)
        assert.include(yield* labels, "UpdatedDraft")
      }).pipe(Effect.scoped),
    30_000
  )

  it.live(
    "keeps the state of an instance whose entries the ring dropped",
    () =>
      Effect.gen(function*() {
        const { agent, url } = yield* serve({ size: 12 })
        yield* open(url, "open")
        // Wait for eviction, not just the socket connection.
        const [session] = yield* agent.call<ReadonlyArray<any>>(
          "list_sessions"
        ).pipe(
          Effect.filterOrFail(([session]) => session?.first > 1),
          Effect.retry(Schedule.spaced("10 millis")),
          Effect.timeout("2 seconds")
        )
        const instances: ReadonlyArray<any> = yield* agent.call(
          "list_instances"
        )
        const workspace = instances.find((instance) =>
          instance.path === "/Workspace"
        )
        assert.isBelow(workspace.mounted, session.first)
        const state = yield* agent.call("get_state", {
          instance: workspace.instance
        })
        assert.deepStrictEqual(state.model, { open: ["n1", "n2"] })
        const message = yield* agent.fails("get_state", {
          instance: workspace.instance,
          at: 0
        })
        assert.include(message, "older than the last 12 entries")
      }).pipe(Effect.scoped),
    30_000
  )

  it.live(
    "shows live state that left the page's buffer before the server started",
    () =>
      Effect.gen(function*() {
        const port = yield* freePort
        const page = yield* Layer.build(
          MessageLog.socket(
            DevToolsServer.url({ port }).replace("http", "ws") + "/log",
            { buffer: 1 }
          ).pipe(Layer.provide(Socket.layerWebSocketConstructorGlobal))
        )
        const log = Context.get(page, MessageLog.MessageLog)
        const def = Query.defOf(GetNote)
        const note = (id: string) =>
          Query.makeSnapshot(
            def,
            "note",
            { args: { id }, argsKey: def.argsKey({ id }) },
            AsyncResult.success("Note " + id, { timestamp: 0 })
          )
        const base = (seq: number) => ({
          seq,
          at: 0,
          session: "s",
          path: "/Note",
          instance: 1,
          component: Note
        })
        const run = (seq: number, index: number) => ({
          ...base(seq),
          name: "notes/Touch",
          issued: { seq: 1, index },
          spanId: "span",
          traceId: "trace"
        })
        const update = (
          seq: number,
          commands: ReadonlyArray<Command.Command<any, any>>
        ) => ({
          _tag: "Update",
          ...base(seq),
          source: { _tag: "Dispatch" },
          message: { _tag: "Click" },
          props: { id: "b" },
          model: {},
          queries: { note: note("b") },
          commands,
          events: [],
          lists: [],
          sends: []
        })
        for (
          const entry of [
            {
              _tag: "SessionStarted",
              seq: 0,
              at: 0,
              session: "s",
              app: "Note"
            },
            {
              _tag: "Mounted",
              ...base(1),
              props: { id: "a" },
              model: {},
              queries: { note: note("a") },
              commands: [Touch.make({ id: "a" }), Touch.make({ id: "b" })],
              events: [],
              adopted: false
            },
            { _tag: "CommandStarted", ...run(2, 0) },
            { _tag: "CommandEnded", ...run(3, 0), silent: true },
            { _tag: "CommandStarted", ...run(4, 1) },
            // Simulate a queued command with no CommandStarted yet.
            update(5, [Touch.make({ id: "b" })]),
            update(6, []),
            { _tag: "PropsChanged", ...base(7), props: { id: "c" } },
            {
              _tag: "QueryChanged",
              ...base(8),
              name: "note",
              result: note("c")
            },
            { _tag: "Drawn", ...base(9) }
          ] as ReadonlyArray<MessageLog.Entry>
        ) log.record(entry)

        const { agent } = yield* serve({ port })
        const [session] = yield* agent.call<ReadonlyArray<any>>(
          "list_sessions"
        ).pipe(
          Effect.filterOrFail(([session]) => session?.last === 9),
          Effect.retry(Schedule.spaced("10 millis")),
          Effect.timeout("5 seconds")
        )
        assert.strictEqual(session.app, "Note")
        const [instance] = yield* agent.call("list_instances")
        assert.strictEqual(instance.status, "1 ended, 1 running, 1 waiting")
        const state = yield* agent.call("get_state", { instance: 1 })
        assert.deepStrictEqual(state.props, { id: "c" })
        assert.strictEqual(state.queries.note[2], "Note c")
      }).pipe(Effect.scoped),
    30_000
  )

  it.live(
    "refuses browser origins on /mcp and foreign origins on the WebSocket routes",
    () =>
      Effect.gen(function*() {
        const { agent, url } = yield* serve()
        const mcpStatus = yield* probeStatus(
          url + "/mcp",
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              accept: "application/json, text/event-stream",
              origin: "http://evil.example"
            }
          },
          JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })
        )
        assert.strictEqual(mcpStatus, 403)
        for (const path of ["/log", "/control"]) {
          const probe = (origin: string) =>
            probeStatus(url + path, {
              headers: {
                connection: "Upgrade",
                upgrade: "websocket",
                "sec-websocket-version": "13",
                "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
                origin
              }
            })
          assert.strictEqual(yield* probe("http://evil.example"), 403, path)
          assert.strictEqual(yield* probe("http://localhost:5173"), 101, path)
        }
        const message = yield* agent.fails("list_instances")
        assert.include(message, "No session has connected yet")
      }).pipe(Effect.scoped),
    30_000
  )

  it.live(
    "shares one pause between an agent and the overlay",
    () =>
      Effect.gen(function*() {
        const { agent, url } = yield* serve()
        const app = yield* open(url, "open")
        const root = overlay()
        const { rows } = yield* agent.call("list_entries", {
          tag: "ClickedSave"
        })
        const seq = rows[0].seq

        const shown = yield* agent.call("show_entry", { seq })
        assert.deepStrictEqual(shown, {
          paused: seq,
          fellBack: [],
          fallbacks: [],
          skipped: ["/Workspace/Editor[n1]", "/Workspace/Editor[n2]"]
        })
        assert.strictEqual(app.style.display, "none")
        yield* until(() =>
          text(root.querySelector(".paused-label")) === "Paused at #" + seq
        )
        const [paused] = yield* agent.call("list_sessions")
        assert.strictEqual(paused.paused, seq)

        yield* agent.call("resume")
        assert.notStrictEqual(app.style.display, "none")
        yield* until(() => root.querySelector(".paused") === null)

        HtmlLocator.click(
          HtmlLocator.getByRole(root, "button", {
            name: "Open the Effect UI inspector"
          })
        )
        yield* wait(20)
        const saves = HtmlLocator.queryAllByRole(root, "button", {
          name: /Update ClickedSave$/
        })
          .filter((node) => node.classList.contains("row-button"))
        HtmlLocator.click(saves.at(-1)!)
        yield* wait(20)
        HtmlLocator.click(
          HtmlLocator.getByRole(root, "button", { name: "Time travel" })
        )
        yield* wait(50)
        const [human] = yield* agent.call("list_sessions")
        assert.strictEqual(
          "Paused at #" + human.paused,
          text(root.querySelector(".paused-label"))
        )
        yield* agent.call("resume")
        yield* until(() => root.querySelector(".paused") === null)

        const both: ReadonlyArray<number> = rows.map((row: any) => row.seq)
        yield* Effect.all(
          both.map((seq) => agent.call("show_entry", { seq })),
          { concurrency: "unbounded" }
        )
        const [raced] = yield* agent.call("list_sessions")
        assert.include(both, raced.paused)
        yield* until(() =>
          text(root.querySelector(".paused-label")) ===
            "Paused at #" + raced.paused
        )
        assert.strictEqual(document.querySelectorAll("[inert]").length, 1)
        yield* agent.call("resume")
        yield* until(() => root.querySelector(".paused") === null)
        assert.strictEqual(document.querySelectorAll("[inert]").length, 0)

        const outside = yield* agent.fails("show_entry", { seq: 10_000 })
        assert.include(outside, "not in the session's buffer")
        const off = yield* agent.fails("dispatch", {
          instance: 1,
          messages: [{ _tag: "ClickedSave" }]
        })
        assert.include(off, "Dispatch is off")
      }).pipe(Effect.scoped),
    30_000
  )

  it.live(
    "dispatches decoded messages to an instance and waits for their Commands",
    () =>
      Effect.gen(function*() {
        const { agent, url } = yield* serve({ dispatch: true })
        const app = yield* open(url, "open")
        const instances: ReadonlyArray<any> = yield* agent.call(
          "list_instances"
        )
        const n1 = instances.find((instance) =>
          instance.path === "/Workspace/Editor[n1]"
        ).instance

        const schema = yield* agent.call("get_message_schema", {
          instance: n1,
          tag: "UpdatedDraft"
        })
        assert.include(JSON.stringify(schema), "text")
        assert.deepStrictEqual(schema.examples, [
          { message: { _tag: "UpdatedDraft", text: "" } }
        ])
        const exampleSent = yield* agent.call("dispatch", {
          instance: n1,
          messages: [schema.examples[0].message]
        })
        assert.strictEqual(exampleSent.applied, 1)

        const allSchemas = yield* agent.call("get_message_schema", {
          instance: n1
        })
        assert.deepStrictEqual(
          allSchemas.examples.map((entry: any) =>
            entry.message._tag
          ),
          Object.keys(EditorMessage.cases)
        )
        const decodeEditor = Schema.decodeUnknownSync(
          Schema.toCodecJson(EditorMessage)
        )
        for (const entry of allSchemas.examples) {
          assert.isUndefined(entry.redacted)
          assert.isUndefined(entry.invalid)
          assert.doesNotThrow(() => decodeEditor(entry.message))
        }

        const unknownTag = yield* agent.fails("get_message_schema", {
          instance: n1,
          tag: "Nope"
        })
        assert.include(unknownTag, "ClickedSave")

        const bad = yield* agent.fails("dispatch", {
          instance: n1,
          messages: [{ _tag: "UpdatedDraft", text: "ok" }, {
            _tag: "UpdatedDraft",
            text: 1
          }]
        })
        assert.include(bad, "Message 1 does not decode")
        const { last } = yield* agent.call("wait", { timeout: 0, instance: n1 })

        const sent = yield* agent.call("dispatch", {
          instance: n1,
          messages: [{ _tag: "UpdatedDraft", text: "From the agent" }, {
            _tag: "ClickedSave"
          }]
        })
        assert.strictEqual(sent.applied, 2)
        assert.deepStrictEqual(
          sent.outcomes.map((outcome: any) => outcome._tag),
          ["Updated", "Updated"]
        )
        const update = yield* agent.call("get_entry", {
          seq: sent.outcomes[0].seq
        })
        assert.deepStrictEqual(update.source, { _tag: "Dispatch" })
        assert.strictEqual(
          (HtmlLocator.getByRole(app, "textbox", {
            name: "Body n1"
          }) as HTMLTextAreaElement).value,
          "From the agent"
        )

        const settled = yield* agent.call("wait", {
          since: last,
          instance: n1,
          timeout: 2_000
        })
        assert.isTrue(settled.settled)
        const state = yield* agent.call("get_state", { instance: n1 })
        assert.strictEqual(state.model.status, "Saved")

        const pending = yield* agent.call("wait", { timeout: 50 })
        assert.isFalse(pending.settled)
        assert.strictEqual(pending.open.length, 1)
      }).pipe(Effect.scoped),
    30_000
  )

  it.live(
    "returns validated, redacted, and invalid examples from get_message_schema",
    () =>
      Effect.gen(function*() {
        const SampleMessage = UiSchema.TaggedEnum({
          SelectedItem: {
            index: Schema.Number,
            maybeLabel: Schema.Option(Schema.String),
            tags: Schema.Array(Schema.String)
          },
          SavedToken: { token: Schema.Redacted(Schema.String) },
          SetEmail: {
            email: Schema.String.check(Schema.isPattern(/^\S+@\S+$/))
          },
          SavedCredential: {
            token: Schema.Redacted(Schema.String),
            email: Schema.String.check(Schema.isPattern(/^\S+@\S+$/))
          },
          Impossible: { never: Schema.Never },
          Unset: { secret: Schema.Option(Schema.Redacted(Schema.Never)) },
          Listed: {
            items: Schema.Array(Schema.String).check(Schema.isMinLength(65))
          }
        }).annotate({ identifier: "SampleMessage" })
        const Sample = Html.component({
          name: "Sample",
          model: Schema.Struct({ count: Schema.Number }),
          message: SampleMessage
        }).make({
          init: () => ({ count: 0 }),
          update: ($) => ({ count: $.model.count + 1 }),
          view: (h, model) => h.p(String(model.count))
        })

        const { agent, url } = yield* serve({ dispatch: true })
        localStorage.clear()
        const services = yield* Layer.build(DevTools.layer({ server: url }))
        const app = document.body.appendChild(document.createElement("div"))
        yield* Effect.addFinalizer(() => Effect.sync(() => app.remove()))
        yield* BrowserHost.mountEffect(Sample, {}, app).pipe(
          Effect.provide(services)
        )
        yield* wait(150)

        const [{ instance }] = yield* agent.call<ReadonlyArray<any>>(
          "list_instances"
        )
        const all = yield* agent.call("get_message_schema", { instance })
        assert.isArray(all.examples)
        assert.strictEqual(all.examples.length, 7)

        const [
          selected,
          savedToken,
          setEmail,
          savedCredential,
          impossible,
          unset,
          listed
        ] = all.examples

        assert.deepStrictEqual(selected, {
          message: {
            _tag: "SelectedItem",
            index: 0,
            maybeLabel: { _tag: "Some", value: "" },
            tags: [""]
          }
        })
        const filtered = yield* agent.call("get_message_schema", {
          instance,
          tag: "SelectedItem"
        })
        assert.deepStrictEqual(filtered.examples, [selected])
        const dispatched = yield* agent.call("dispatch", {
          instance,
          messages: [filtered.examples[0].message]
        })
        assert.strictEqual(dispatched.applied, 1)

        assert.deepStrictEqual(savedToken, {
          message: { _tag: "SavedToken", token: { "~redacted": true } },
          redacted: true
        })
        const rejectedRedacted = yield* agent.fails("dispatch", {
          instance,
          messages: [savedToken.message]
        })
        assert.include(rejectedRedacted, "does not decode")

        assert.deepStrictEqual(setEmail.message, {
          _tag: "SetEmail",
          email: ""
        })
        assert.isUndefined(setEmail.redacted)
        assert.isString(setEmail.invalid)
        assert.include(setEmail.invalid, "email")

        assert.deepStrictEqual(savedCredential.message, {
          _tag: "SavedCredential",
          token: { "~redacted": true },
          email: ""
        })
        assert.isTrue(savedCredential.redacted)
        assert.isString(savedCredential.invalid)
        assert.include(savedCredential.invalid, "email")

        assert.strictEqual(impossible.tag, "Impossible")
        assert.isUndefined(impossible.message)
        assert.isString(impossible.invalid)
        assert.isAbove(impossible.invalid.length, 0)

        assert.deepStrictEqual(unset, {
          message: { _tag: "Unset", secret: { _tag: "None" } }
        })

        assert.strictEqual(listed.message.items.length, 64)
        assert.include(listed.invalid, "items")
      }).pipe(Effect.scoped),
    30_000
  )

  it.live(
    "keeps a closed session readable but not controllable",
    () =>
      Effect.gen(function*() {
        const { agent, url } = yield* serve({ keep: 1 })
        yield* open(url, "open").pipe(Effect.scoped)
        yield* wait(100)
        const [closed] = yield* agent.call("list_sessions")
        assert.isFalse(closed.connected)
        assert.isFalse(closed.controllable)
        const instances: ReadonlyArray<any> = yield* agent.call(
          "list_instances"
        )
        assert.isAbove(instances.length, 0)
        const message = yield* agent.fails("show_entry", {
          seq: closed.last
        })
        assert.include(message, "can't be controlled")

        yield* open(url, "open").pipe(Effect.scoped)
        yield* open(url, "open").pipe(Effect.scoped)
        yield* wait(100)
        const sessions: ReadonlyArray<any> = yield* agent.call("list_sessions")
        assert.strictEqual(sessions.length, 1)
        assert.notStrictEqual(sessions[0].session, closed.session)
      }).pipe(Effect.scoped),
    30_000
  )

  it.live(
    "keeps a truncated query map opaque when a query changes",
    () =>
      Effect.gen(function*() {
        const { agent, url } = yield* serve({ size: 3 })
        const socket = new WebSocket(url.replace("http", "ws") + "/log")
        yield* Effect.callback<void>((resume) =>
          socket.addEventListener("open", () => resume(Effect.void))
        )
        const base = { session: "s", at: 0 }
        const at = { ...base, path: "/App", instance: 1, component: "App" }
        const frames = [
          { _tag: "Hello", version: 1, host: "test" },
          { _tag: "SessionStarted", ...base, seq: 0, app: "App" },
          {
            _tag: "Mounted",
            ...at,
            seq: 1,
            props: {},
            model: 0,
            queries: { "~truncated": 9000 },
            commands: [],
            events: [],
            adopted: false
          },
          { _tag: "QueryChanged", ...at, seq: 2, name: "todos", result: [1] },
          { _tag: "PropsChanged", ...at, seq: 3, props: { a: 1 } },
          { _tag: "PropsChanged", ...at, seq: 4, props: { a: 2 } },
          { _tag: "PropsChanged", ...at, seq: 5, props: { a: 3 } }
        ]
        for (const frame of frames) socket.send(JSON.stringify(frame))
        yield* wait(100)
        const state = yield* agent.call("get_state", {
          session: "s",
          instance: 1
        })
        assert.deepStrictEqual(state.queries, { "~truncated": 9000 })
        assert.deepStrictEqual(state.props, { a: 3 })
        socket.close()
      }).pipe(Effect.scoped),
    30_000
  )

  it.live(
    "scrubs the root an agent paused when the page has two",
    () =>
      Effect.gen(function*() {
        const { agent, url } = yield* serve()
        localStorage.clear()
        const services = yield* Layer.build(DevTools.layer({ server: url }))
        const older = yield* play("open").pipe(Effect.provide(services))
        const newer = yield* play("open").pipe(Effect.provide(services))
        yield* wait(150)
        const [first] = yield* agent.call("list_sessions")
        const { rows } = yield* agent.call("list_entries", {
          session: first.session,
          tag: "ClickedSave"
        })
        yield* agent.call("show_entry", {
          session: first.session,
          seq: rows[0].seq
        })
        assert.strictEqual(older.style.display, "none")

        const root = overlay()
        HtmlLocator.click(
          HtmlLocator.getByRole(root, "button", {
            name: "Open the Effect UI inspector"
          })
        )
        yield* wait(20)
        const slider = root.querySelector<HTMLInputElement>(
          "input[type=range]"
        )!
        assert.strictEqual(
          slider.getAttribute("aria-valuetext"),
          "#" + rows[0].seq
        )
        slider.value = "0"
        slider.dispatchEvent(new Event("input", { bubbles: true }))
        yield* wait(50)
        const sessions: ReadonlyArray<any> = yield* agent.call("list_sessions")
        const paused = sessions.find((session) =>
          session.session === first.session
        ).paused
        assert.isBelow(paused, rows[0].seq)
        assert.strictEqual(older.style.display, "none")
        assert.notStrictEqual(newer.style.display, "none")
        assert.strictEqual(document.querySelectorAll("[inert]").length, 1)
      }).pipe(Effect.scoped),
    30_000
  )

  it.live(
    "adds no meta tag when the plugin's port is taken, and injects overlay and hot modules unless disabled",
    () =>
      Effect.gen(function*() {
        const port = yield* freePort
        yield* serve({ port })
        const start = Effect.fnUntraced(
          function*(options: DevToolsVite.Options) {
            let close = () => {}
            const warnings: Array<string> = []
            const plugin = DevToolsVite.plugin(options)
            plugin.configureServer({
              config: {
                logger: {
                  info: () => {},
                  warn: (message) => warnings.push(message)
                }
              },
              httpServer: { once: (_, listener) => close = listener }
            })
            yield* Effect.addFinalizer(() => Effect.sync(close))
            return { plugin, warnings }
          }
        )
        const taken = yield* start({ port, overlay: { position: "TopLeft" } })
        const takenTags = yield* Effect.promise(() =>
          taken.plugin.transformIndexHtml()
        )
        assert.deepStrictEqual(takenTags, [
          {
            tag: "script",
            attrs: { type: "module", src: "/@effect-ui/devtools" },
            injectTo: "head-prepend"
          },
          {
            tag: "script",
            attrs: { type: "module", src: "/@effect-ui/hot" },
            injectTo: "head"
          }
        ])
        const resolvedHot = taken.plugin.resolveId("/@effect-ui/hot")
        assert.isDefined(resolvedHot)
        assert.include(
          taken.plugin.load(resolvedHot!)!,
          "vite:beforeFullReload"
        )
        const resolvedDevTools = taken.plugin.resolveId("/@effect-ui/devtools")
        assert.isDefined(resolvedDevTools)
        assert.include(
          taken.plugin.load(resolvedDevTools!)!,
          "DevTools.attach({\"position\":\"TopLeft\"})"
        )
        assert.include(
          taken.warnings[0],
          "could not start on http://127.0.0.1:" + port
        )
        const off = yield* start({ port, hot: false, overlay: false })
        assert.deepStrictEqual(
          yield* Effect.promise(() => off.plugin.transformIndexHtml()),
          []
        )
        assert.isUndefined(off.plugin.resolveId("/@effect-ui/hot"))
        assert.isUndefined(off.plugin.resolveId("/@effect-ui/devtools"))
        const freed = yield* freePort
        const free = yield* start({ port: freed })
        const tags = yield* Effect.promise(() =>
          free.plugin.transformIndexHtml()
        )
        assert.deepStrictEqual(free.warnings, [])
        assert.strictEqual(
          JSON.parse(tags[0]!.attrs.content!).url,
          "http://127.0.0.1:" + freed
        )
        assert.strictEqual(tags[1]!.attrs.src, "/@effect-ui/devtools")
        assert.strictEqual(tags[2]!.attrs.src, "/@effect-ui/hot")
      }).pipe(Effect.scoped),
    30_000
  )

  it.live(
    "auto-attached DevTools captures initial mount before iframe load and yields to explicit DevTools.layer",
    () =>
      Effect.gen(function*() {
        localStorage.clear()
        const dispose = DevTools.attach()
        yield* Effect.addFinalizer(() => Effect.sync(dispose))
        yield* play("open")
        yield* until(() =>
          document.querySelectorAll("iframe[data-effect-ui-devtools]")
              .length === 1 &&
          overlay().querySelector("button") !== null
        )
        const root = overlay()
        HtmlLocator.click(
          HtmlLocator.getByRole(root, "button", {
            name: "Open the Effect UI inspector"
          })
        )
        yield* until(() => text(root).includes("Workspace"))
        assert.strictEqual(
          document.querySelectorAll("iframe[data-effect-ui-devtools]").length,
          1
        )
        yield* Layer.build(DevTools.layer())
        yield* wait(20)
        assert.strictEqual(
          document.querySelectorAll("iframe[data-effect-ui-devtools]").length,
          1
        )
      }).pipe(Effect.scoped),
    30_000
  )

  it.live(
    "returns the outcomes of a batch that ran out of time, and what it didn't send",
    () =>
      Effect.gen(function*() {
        const { agent, url } = yield* serveFast(1_000)
        const applied: Array<number> = []
        yield* fakePage(url, (log, message) =>
          Effect.gen(function*() {
            const n = (message as { n: number }).n
            yield* Effect.sleep("300 millis")
            applied.push(n)
            log.send(propsAt(n + 2))
            return { _tag: "Updated", seq: n + 2 } as const
          }))
        const sent = yield* agent.call("dispatch", {
          session: "s",
          instance: 1,
          messages: go(5)
        })
        assert.deepStrictEqual(sent.outcomes, [
          { _tag: "Updated", seq: 2 },
          { _tag: "Updated", seq: 3 },
          { _tag: "Unknown" }
        ])
        assert.strictEqual(sent.applied, 2)
        assert.deepStrictEqual(sent.notSent, [3, 4])
        assert.include(sent.note, "Message 2 was sent but did not finish")
        assert.include(
          sent.note,
          "Messages 3, 4 were not sent, because message 2's outcome is unknown."
        )
        assert.isUndefined(sent.unseen)
        yield* wait(500)
        assert.deepStrictEqual(applied, [0, 1])
      }).pipe(Effect.scoped),
    30_000
  )

  it.live(
    "tells the agent any message may have applied when the page's reply is lost",
    () =>
      Effect.gen(function*() {
        const { agent, url } = yield* serveFast(300)
        const log = yield* connectSocket(url.replace("http", "ws") + "/log")
        log.send(JSON.stringify({ _tag: "Hello", version: 1, host: "test" }))
        log.send(
          JSON.stringify({ _tag: "SessionStarted", ...at, seq: 0, app: "App" })
        )
        log.send(propsAt(1))
        const control = yield* connectSocket(
          url.replace("http", "ws") + "/control"
        )
        control.send(
          JSON.stringify({
            _tag: "State",
            sessions: ["s"],
            paused: null,
            notRecording: []
          })
        )
        yield* wait(100)
        const message = yield* agent.fails("dispatch", {
          session: "s",
          instance: 1,
          messages: go(2)
        })
        assert.include(message, "did not answer within 300ms")
        assert.include(
          message,
          "Any of the messages may have been applied, or none"
        )
        assert.include(message, "after #1")
        log.close()
        control.close()
      }).pipe(Effect.scoped),
    30_000
  )

  it.live(
    "accepts a pause from a page that reports no skipped mounts",
    () =>
      Effect.gen(function*() {
        const { agent, url } = yield* serveFast(300)
        const log = yield* connectSocket(url.replace("http", "ws") + "/log")
        log.send(JSON.stringify({ _tag: "Hello", version: 1, host: "test" }))
        log.send(
          JSON.stringify({ _tag: "SessionStarted", ...at, seq: 0, app: "App" })
        )
        const control = yield* connectSocket(
          url.replace("http", "ws") + "/control"
        )
        control.send(
          JSON.stringify({
            _tag: "State",
            sessions: ["s"],
            paused: { session: "s", seq: 0, fellBack: [], fallbacks: [] },
            notRecording: []
          })
        )
        yield* wait(100)
        const [session] = yield* agent.call("list_sessions")
        assert.strictEqual(session.paused, 0)
        log.close()
        control.close()
      }).pipe(Effect.scoped),
    30_000
  )

  it.live(
    "tells a coalesced excluded update from a skipped one, and replays the kept one to a late viewer as the next diff's baseline",
    () =>
      Effect.gen(function*() {
        const { agent, url } = yield* serveFast(1_000)
        const log = yield* fakePage(url, (log, message) =>
          Effect.sync(() => {
            const seq = 2 + (message as { n: number }).n
            log.send(updateAt(seq, true))
            return { _tag: "Updated", seq } as const
          }))
        const sent = yield* agent.call("dispatch", {
          session: "s",
          instance: 1,
          messages: go(2)
        })
        assert.isUndefined(sent.unseen)
        assert.deepStrictEqual(sent.unavailable, [{
          seq: 2,
          reason: "excluded"
        }])

        log.send(updateAt(4, false))
        yield* wait(100)
        const watch = yield* connectSocket(
          url.replace("http", "ws") + "/watch"
        )
        yield* Effect.addFinalizer(() => Effect.sync(() => watch.close()))
        const frames: Array<any> = []
        watch.addEventListener("message", (event) => {
          const frame = JSON.parse(String(event.data))
          if (frame._tag !== "Held") frames.push(frame)
        })
        yield* until(() => frames.some((frame) => frame.seq === 4))
        const viewer = Inspector.make()
        viewer.ingest(frames)
        assert.strictEqual(viewer.sessions()[0]!.previous(4)?.seq, 3)
      }).pipe(Effect.scoped),
    30_000
  )

  it.live(
    "reports a dispatched entry the server will never hold when a later frame arrives, inside or before the kept window",
    () =>
      Effect.gen(function*() {
        const { agent, url } = yield* serveFast(1_000, 1)
        let first = true
        yield* fakePage(url, (log) => {
          // Seq 2 is kept as the hidden baseline of 4, so 3 is inside the window.
          if (first) {
            first = false
            log.send(updateAt(2, true))
            log.send(propsAt(4))
            return Effect.succeed({ _tag: "Updated", seq: 3 } as const)
          }
          log.send(propsAt(5))
          log.send(propsAt(6))
          return Effect.as(wait(100), { _tag: "Updated", seq: 5 } as const)
        })
        const sent = yield* agent.call("dispatch", {
          session: "s",
          instance: 1,
          messages: go(1)
        })
        assert.deepStrictEqual(sent.outcomes, [{ _tag: "Updated", seq: 3 }])
        assert.deepStrictEqual(sent.unavailable, [{
          seq: 3,
          reason: "skipped"
        }])
        assert.isUndefined(sent.unseen)
        assert.include(
          sent.note,
          "#3 were logged by the page, but the server can't show them"
        )
        yield* agent.fails("get_entry", { session: "s", seq: 3 })
        const shown = yield* agent.call("get_entry", { session: "s", seq: 4 })
        assert.strictEqual(shown._tag, "PropsChanged")

        const old = yield* agent.call("dispatch", {
          session: "s",
          instance: 1,
          messages: go(1)
        })
        assert.deepStrictEqual(old.unavailable, [{
          seq: 5,
          reason: "evicted"
        }])
      }).pipe(Effect.scoped),
    30_000
  )
})
