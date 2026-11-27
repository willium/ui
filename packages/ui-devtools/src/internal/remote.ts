import type * as BrowserHost from "@effect/ui/html/BrowserHost"
import * as MessageLog from "@effect/ui/MessageLog"
import * as Effect from "effect/Effect"
import * as Schedule from "effect/Schedule"
import * as Schema from "effect/Schema"
import type * as Scope from "effect/Scope"
import * as Socket from "effect/socket/Socket"
import * as Stream from "effect/Stream"
import * as Control from "./control.ts"

export interface Controller {
  readonly roots: ReadonlyMap<string, BrowserHost.Controllable>
  readonly size: number
  readonly paused: () => Control.Paused | undefined
  readonly paint: (
    session: string,
    seq: number
  ) => Effect.Effect<BrowserHost.Painted | undefined>
  readonly resume: Effect.Effect<void>
  readonly notRecording: () => ReadonlyArray<string>
  readonly setRecording: (tag: string, recording: boolean) => void
  readonly changes: Stream.Stream<void>
}

type Json = Schema.Json

const isObject = (value: unknown): value is Record<string, Json> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const tagOf = (schema: Json, definitions: Record<string, Json>): unknown => {
  const resolved = isObject(schema) && typeof schema.$ref === "string"
    ? definitions[schema.$ref.slice(schema.$ref.lastIndexOf("/") + 1)]
    : schema
  const tag = isObject(resolved) && isObject(resolved.properties)
    ? resolved.properties._tag
    : undefined
  return isObject(tag)
    ? tag.const ??
      (Array.isArray(tag.enum) && tag.enum.length === 1
        ? tag.enum[0]
        : undefined)
    : undefined
}

// Bounds the padding for minLength and the items for minItems.
const most = 64

/**
 * A value for a JSON Schema, or `undefined` when none is found: a constant,
 * an example, or the smallest value of its type, preferring the first union
 * member that has one and one item in an array. A `$ref` already being
 * walked has none, so a recursive type stops at an empty array or a `None`.
 */
const exampleOf = (
  schema: Json,
  definitions: Record<string, Json>,
  open: Set<string> = new Set()
): Json | undefined => {
  if (schema === true) return null
  if (!isObject(schema)) return undefined
  if (typeof schema.$ref === "string") {
    const name = schema.$ref.slice(schema.$ref.lastIndexOf("/") + 1)
    if (open.has(name) || definitions[name] === undefined) return undefined
    open.add(name)
    const out = exampleOf(definitions[name], definitions, open)
    open.delete(name)
    return out
  }
  if ("const" in schema) return schema.const
  if (Array.isArray(schema.enum)) return schema.enum[0]
  if (Array.isArray(schema.examples) && schema.examples.length > 0) {
    return schema.examples[0]
  }
  if ("default" in schema) return schema.default
  const members = schema.anyOf ?? schema.oneOf
  if (Array.isArray(members)) {
    for (const member of members) {
      const out = exampleOf(member, definitions, open)
      if (out !== undefined) return out
    }
    return undefined
  }
  if (Array.isArray(schema.allOf)) {
    const { allOf, ...rest } = schema
    return exampleOf(Object.assign(rest, ...allOf), definitions, open)
  }
  if (isObject(schema.not)) return undefined
  const number = (key: string) =>
    typeof schema[key] === "number" ? schema[key] : undefined
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type
  switch (type) {
    case "string":
      return "a".repeat(Math.min(number("minLength") ?? 0, most))
    case "number":
    case "integer": {
      let out = Math.max(0, number("minimum") ?? -Infinity)
      const above = number("exclusiveMinimum")
      if (above !== undefined && out <= above) out = above + 1
      out = Math.min(out, number("maximum") ?? Infinity)
      const below = number("exclusiveMaximum")
      if (below !== undefined && out >= below) out = below - 1
      return out
    }
    case "boolean":
      return false
    case "null":
      return null
    case "array": {
      const out: Array<Json> = []
      for (
        const item of Array.isArray(schema.prefixItems)
          ? schema.prefixItems
          : []
      ) {
        const value = exampleOf(item, definitions, open)
        if (value === undefined) return undefined
        out.push(value)
      }
      const length = Math.min(
        Math.max(out.length + 1, number("minItems") ?? 0),
        number("maxItems") ?? Infinity,
        out.length + most
      )
      const item = schema.items === undefined ? true : schema.items
      while (out.length < length) {
        const value = exampleOf(item, definitions, open)
        if (value === undefined) break
        out.push(value)
      }
      return out.length < (number("minItems") ?? 0) ? undefined : out
    }
    case "object": {
      const out: Record<string, Json> = {}
      const required = Array.isArray(schema.required) ? schema.required : []
      const properties = isObject(schema.properties) ? schema.properties : {}
      for (const key of Object.keys(properties)) {
        const value = exampleOf(properties[key], definitions, open)
        if (value !== undefined) out[key] = value
        else if (required.includes(key)) return undefined
      }
      if (
        Object.keys(properties).length === 0 &&
        isObject(schema.additionalProperties)
      ) {
        const value = exampleOf(schema.additionalProperties, definitions, open)
        if (value !== undefined) out.key = value
      }
      return out
    }
    default:
      return null
  }
}

interface Document {
  readonly schema: Json
  readonly definitions: Record<string, Json>
}

const documentOf = (schema: Schema.Top): Document =>
  Schema.toJsonSchemaDocument(
    Schema.toCodecJson(schema)
  ) as unknown as Document

const membersOf = (document: Document): ReadonlyArray<Json> =>
  isObject(document.schema) && Array.isArray(document.schema.anyOf)
    ? document.schema.anyOf
    : [document.schema]

const messageSchema = (
  schema: Schema.Top,
  tag: string | undefined
): Effect.Effect<Json, string> =>
  Effect.suspend(() => {
    const document = documentOf(schema)
    const members = membersOf(document)
    const tags = members.map((member) => tagOf(member, document.definitions))
    const index = tag === undefined ? -1 : tags.indexOf(tag)
    if (tag !== undefined && index === -1) {
      return Effect.fail(
        "No message _tag " + tag + ". The tags are " +
          tags.filter((t) => typeof t === "string").join(", ") + "."
      )
    }
    const redactedSchema = MessageLog.redactSchema(schema)
    const redacted = redactedSchema === schema
      ? undefined
      : documentOf(redactedSchema)
    const decode = Schema.decodeUnknownEffect(
      Schema.toCodecJson(schema as Schema.Codec<unknown>)
    )
    const example = (i: number): Effect.Effect<Json> => {
      const message = exampleOf(members[i], document.definitions)
      if (message === undefined) {
        return Effect.succeed({
          ...(typeof tags[i] === "string" ? { tag: tags[i] } : {}),
          invalid: "No value fits this schema."
        })
      }
      // The JSON Schema doesn't show a Schema.Redacted, the redacting one does.
      const shown = redacted === undefined
        ? undefined
        : exampleOf(membersOf(redacted)[i], redacted.definitions)
      const entry = shown !== undefined &&
          JSON.stringify(shown) !== JSON.stringify(message)
        ? { message: shown, redacted: true }
        : { message }
      return Effect.match(decode(message, { errors: "all" }), {
        onFailure: (error) => ({ ...entry, invalid: error.message }),
        onSuccess: () => entry
      })
    }
    return tag === undefined
      ? Effect.map(
        Effect.forEach(members, (_, i) => example(i)),
        (examples) => ({
          schema: document.schema,
          definitions: document.definitions,
          examples
        })
      )
      : Effect.map(example(index), (entry) => ({
        schema: members[index],
        definitions: document.definitions,
        examples: [entry]
      }))
  })

export const makeHandler = (
  controller: Omit<Controller, "changes">
): (request: Control.Request) => Effect.Effect<Json, string> => {
  const noRoot = (session: string) =>
    "Session " + session + " has no root on this page."

  const target = (session: string, instance: number) =>
    Effect.suspend(() => {
      const root = controller.roots.get(session)
      if (root === undefined) return Effect.fail(noRoot(session))
      const found = root.instance(instance)
      return found === undefined
        ? Effect.fail(
          "Instance " + instance + " is not mounted in session " + session + "."
        )
        : Effect.succeed(found)
    })

  return (request: Control.Request): Effect.Effect<Json, string> => {
    switch (request._tag) {
      case "Show":
        return Effect.flatMap(
          controller.paint(request.session, request.seq),
          (painted) =>
            painted !== undefined
              ? Effect.succeed({
                fellBack: [...painted.fellBack],
                fallbacks: [...painted.fallbacks],
                skipped: [...painted.skipped]
              })
              : Effect.fail(
                controller.roots.has(request.session)
                  ? "#" + request.seq + " is not among the last " +
                    controller.size + " entries the page keeps to paint from."
                  : noRoot(request.session)
              )
        )
      case "Resume":
        return Effect.as(controller.resume, null)
      case "SetRecording":
        return Effect.sync(() => {
          controller.setRecording(request.tag, request.recording)
          return controller.notRecording()
        })
      case "MessageSchema":
        return Effect.flatMap(
          target(request.session, request.instance),
          (found) => messageSchema(found.message, request.tag)
        )
      case "Dispatch":
        return Effect.gen(function*() {
          const found = yield* target(request.session, request.instance)
          const decode = Schema.decodeUnknownEffect(
            Schema.toCodecJson(found.message as Schema.Codec<unknown>)
          )
          const messages = yield* Effect.forEach(
            request.messages,
            (message, index) =>
              Effect.mapError(
                decode(message),
                (error) =>
                  "Message " + index + " does not decode: " + error.message
              )
          )
          const deadline = Date.now() + request.within
          const outcomes: Array<Control.Outcome> = []
          for (const message of messages) {
            const left = deadline - Date.now()
            if (left <= 0) break
            const outcome = yield* found.dispatch(message).pipe(
              Effect.timeoutOrElse({
                duration: left,
                orElse: () => Effect.succeed({ _tag: "Unknown" } as const)
              })
            )
            outcomes.push(outcome)
            if (outcome._tag !== "Updated") break
          }
          const paused = controller.paused()
          return {
            outcomes,
            paused: paused?.session === request.session ? paused.seq : null
          }
        })
    }
  }
}

export const connect = (
  url: string,
  controller: Controller
): Effect.Effect<void, never, Scope.Scope | Socket.WebSocketConstructor> => {
  const handle = makeHandler(controller)

  const connection = Effect.gen(function*() {
    const socket = yield* Socket.makeWebSocket(url)
    const writer = yield* socket.writer
    const pull = yield* Socket.readerString(socket)
    const send = (message: Control.ToServer) =>
      writer.write(Control.encodeToServer(message))
    const state = Effect.suspend(() =>
      send({
        _tag: "State",
        sessions: Array.from(controller.roots.keys()),
        paused: controller.paused() ?? null,
        notRecording: controller.notRecording()
      })
    )
    yield* state
    yield* controller.changes.pipe(
      Stream.runForEach(() => state),
      Effect.ignore,
      Effect.forkScoped
    )
    return yield* Effect.forever(
      Effect.flatMap(pull, (chunks) =>
        Effect.forEach(chunks, (chunk) => {
          const decoded = Control.decodeToPage(chunk)
          if (decoded._tag === "None") return Effect.void
          const message = decoded.value
          return handle(message.request).pipe(
            Effect.matchEffect({
              onSuccess: (value) =>
                send({ _tag: "Reply", id: message.id, ok: true, value }),
              onFailure: (value) =>
                send({ _tag: "Reply", id: message.id, ok: false, value })
            }),
            Effect.ignore,
            Effect.forkScoped
          )
        }, { discard: true }))
    )
  }).pipe(Effect.scoped)

  return connection.pipe(
    Effect.retry(
      Schedule.min([
        Schedule.exponential("200 millis"),
        Schedule.spaced("5 seconds")
      ])
    ),
    Effect.forever,
    Effect.ignore,
    Effect.forkScoped,
    Effect.asVoid
  )
}
