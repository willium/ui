// Every export of this module is a component, so an edit to it swaps in
// place in the dev client and keeps the count, the name and the list.
import * as Native from "@effect/ui-native/Native"
import * as UiSchema from "@effect/ui/UiSchema"
import * as Schema from "effect/Schema"

const Message = UiSchema.TaggedEnum({
  ClickedDecrement: {},
  ClickedIncrement: {},
  ClickedReset: {},
  ChangedName: { value: Schema.String },
  ClickedAdd: {}
})

const button = {
  backgroundColor: "#111827",
  paddingHorizontal: 20,
  paddingVertical: 12,
  borderRadius: 8
} as const

const label = { color: "white", fontSize: 18 } as const

export const App = Native.component({
  name: "App",
  model: Schema.Struct({
    count: Schema.Number,
    name: Schema.String,
    items: Schema.Array(Schema.String)
  }),
  message: Message
}).make({
  init: () => ({ count: 0, name: "", items: [] }),
  update: {
    ClickedDecrement: ($) => $.evolve({ count: (count) => count - 1 }),
    ClickedIncrement: ($) => $.evolve({ count: (count) => count + 1 }),
    ClickedReset: ($) => $.evolve({ count: 0 }),
    ChangedName: ($, { value }) => $.evolve({ name: value }),
    ClickedAdd: ($) =>
      $.evolve({
        items: (
          items
        ) => [
          ...items,
          `Item ${items.length + 1}: ${$.model.name || "stranger"}`
        ]
      })
  },
  view: (h, model) =>
    h.view.style({
      flex: 1,
      paddingTop: 64,
      paddingHorizontal: 24,
      gap: 20,
      backgroundColor: "white"
    }).children(
      h.text.style({
        fontSize: 64,
        fontWeight: "bold",
        color: "#1f2937",
        textAlign: "center"
      }).children(
        String(model.count)
      ),
      h.view.style({ flexDirection: "row", justifyContent: "center", gap: 16 })
        .children(
          h.view.style(button).on("press", Message.ClickedDecrement()).children(
            h.text.style(label).children("-")
          ),
          h.view.style(button).on("press", Message.ClickedReset()).children(
            h.text.style(label).children("Reset")
          ),
          h.view.style(button).on("press", Message.ClickedIncrement()).children(
            h.text.style(label).children("+")
          )
        ),
      h.input.value(model.name).placeholder("Your name").style({
        borderWidth: 1,
        borderColor: "#9ca3af",
        borderRadius: 8,
        padding: 8,
        fontSize: 18
      }).on("input", ({ value }) => Message.ChangedName({ value })),
      h.text.style({ fontSize: 18, color: "#374151" }).children(
        "Hello, ",
        h.text.style({ fontWeight: "bold" }).children(model.name || "stranger")
      ),
      h.view.style(button).on("press", Message.ClickedAdd()).children(
        h.text.style({ ...label, textAlign: "center" }).children("Add to list")
      ),
      h.scroll.style({ flex: 1 }).children(
        ...model.items.map((item) =>
          h.text.key(item).style({
            fontSize: 16,
            paddingVertical: 8,
            color: "#111827"
          }).children(item)
        )
      )
    )
})
