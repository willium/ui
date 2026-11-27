import { Command, Component, MessageLog, Mount, UiSchema } from "@effect/ui"
import { BrowserHost, Html, HtmlSubscription } from "@effect/ui/html"
import { HtmlLocator } from "@effect/ui/html/testing"
import { Effect, Redacted, Schema } from "effect"

const wait = (ms: number) =>
  Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, ms)))

export const EditorMessage = UiSchema.TaggedEnum({
  UpdatedDraft: { text: Schema.String },
  ClickedSave: {},
  SucceededSaveNote: { savedAt: Schema.String },
  FailedSaveNote: { reason: Schema.String },
  PressedEscape: {},
  ReceivedPresence: { viewers: Schema.Number },
  CompletedFocusBody: {}
})

class SaveNote extends Command.Service<SaveNote>()(
  "notes/SaveNote",
  {
    args: {
      noteId: Schema.String,
      text: Schema.String,
      token: Schema.Redacted(Schema.String)
    },
    success: EditorMessage,
    group: ["noteId"],
    mode: "switch"
  }
) {
  static readonly layer = this.toLayer(
    Effect.gen(function*() {
      yield* wait(15)
      return Effect.fn("Notes.save")(function*({ noteId }) {
        yield* Effect.withSpan(
          wait(noteId === "n1" ? 40 : 100_000),
          "PUT /notes/" + noteId
        )
        return EditorMessage.SucceededSaveNote({
          savedAt: "2026-11-22T18:10:00Z"
        })
      })
    })
  )
}

const FocusBody = Mount.make(
  "FocusBody",
  { args: { noteId: Schema.String } },
  (node: HTMLElement) => Effect.sync(() => node.focus())
)

const EditorNoDeps = Html.component({
  name: "Editor",
  props: Schema.Struct({
    noteId: Schema.String,
    token: Schema.Redacted(Schema.String)
  }),
  model: Schema.Struct({
    draft: Schema.String,
    saved: Schema.String,
    status: Schema.Literals(["Clean", "Dirty", "Saving", "Saved"]),
    viewers: Schema.Number,
    linkPickerOpen: Schema.Boolean
  }),
  message: EditorMessage
}).make({
  init: () => ({
    draft: "",
    saved: "",
    status: "Clean" as const,
    viewers: 1,
    linkPickerOpen: false
  }),
  update: {
    UpdatedDraft: ($, { text }) =>
      $.evolve({ draft: text, status: "Dirty" as const }),
    ClickedSave: ($) =>
      $.evolve({ status: "Saving" as const }).run(
        SaveNote.make({
          noteId: $.props.noteId,
          text: $.model.draft,
          token: $.props.token
        })
      ),
    SucceededSaveNote: ($) =>
      $.evolve({ saved: $.model.draft, status: "Saved" as const }),
    FailedSaveNote: ($) => $.evolve({ status: "Dirty" as const }),
    PressedEscape: ($) =>
      $.evolve({ linkPickerOpen: false }).run(
        Command.interrupt(SaveNote, { noteId: $.props.noteId })
      ),
    ReceivedPresence: ($, { viewers }) => $.evolve({ viewers }),
    CompletedFocusBody: ($) => $.model
  },
  subscriptions: () => [
    HtmlSubscription.onDocument(
      "keydown",
      ({ key }) => key === "Escape" ? EditorMessage.PressedEscape() : undefined
    )
  ],
  view: (h, model) =>
    h.section.attr("aria-label", "Editor " + h.props.noteId).children(
      h.textarea.attr("aria-label", "Body " + h.props.noteId).value(model.draft)
        .on("input", ({ value }) => EditorMessage.UpdatedDraft({ text: value }))
        .onMount(
          FocusBody({ noteId: h.props.noteId }).pipe(
            Mount.map(() => EditorMessage.CompletedFocusBody())
          )
        ),
      h.button.on("click", EditorMessage.ClickedSave()).children(
        "Save " + h.props.noteId
      ),
      h.p(model.status)
    )
})
const Editor = EditorNoDeps.pipe(Component.provide(SaveNote.layer))

const WorkspaceMessage = UiSchema.TaggedEnum({
  ClickedClose: { noteId: Schema.String }
})
const Workspace = Html.component({
  name: "Workspace",
  model: Schema.Struct({ open: Schema.Array(Schema.String) }),
  message: WorkspaceMessage
}).make({
  init: () => ({ open: ["n1", "n2"] }),
  update: {
    ClickedClose: ($, { noteId }) =>
      $.evolve({ open: $.model.open.filter((id) => id !== noteId) })
  },
  view: (h, model) =>
    h.main(
      model.open.map((noteId) =>
        h.div.key(noteId).children(
          Editor(h, {
            key: noteId,
            props: { noteId, token: Redacted.make("tok_live_9f2c") }
          }),
          h.button.on("click", WorkspaceMessage.ClickedClose({ noteId }))
            .children(
              "Close " + noteId
            )
        )
      )
    )
})

export type Capture = "interrupted" | "open" | "closed" | "switched"

export const play = Effect.fnUntraced(function*(capture: Capture) {
  const app = document.body.appendChild(document.createElement("div"))
  yield* Effect.addFinalizer(() => Effect.sync(() => app.remove()))
  yield* BrowserHost.mountEffect(Workspace, {}, app)
  yield* wait(60)
  const body = (id: string) =>
    HtmlLocator.getByRole(app, "textbox", {
      name: "Body " + id
    }) as HTMLTextAreaElement
  const button = (label: string) =>
    HtmlLocator.getByRole(app, "button", { name: label })

  HtmlLocator.type(body("n1"), "Ship the inspector")
  yield* wait(20)
  HtmlLocator.click(button("Save n1"))
  yield* wait(10)
  HtmlLocator.type(body("n2"), "Follow the command")
  yield* wait(20)
  HtmlLocator.click(button("Save n2"))
  yield* wait(120)
  if (capture === "interrupted") {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
    yield* wait(60)
    HtmlLocator.click(button("Close n2"))
    yield* wait(60)
  }
  if (capture === "closed") {
    HtmlLocator.click(button("Close n2"))
    yield* wait(60)
  }
  if (capture === "switched") {
    HtmlLocator.click(button("Save n2"))
    yield* wait(60)
  }
  return app
})

export const record = Effect.fnUntraced(function*(capture: Capture) {
  const log = MessageLog.makeMemory({ size: 500 })
  yield* play(capture).pipe(Effect.provideService(MessageLog.MessageLog, log))
  const encoder = MessageLog.makeEncoder()
  return log.entries().map((entry) => encoder.encode(entry))
}, Effect.scoped)
