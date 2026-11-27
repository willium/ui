/**
 * The React Native element vocabulary: `view`, `text`, `scroll` and
 * `input`, rendered by `NativeHost` as Fabric's native views.
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Component from "@effect/ui/Component"
import * as Renderer from "@effect/ui/Renderer"
import * as View from "@effect/ui/View"
import * as Context from "effect/Context"
import type { NativeNode } from "./NativeHost.ts"

/**
 * A colour as React Native parses it: a CSS colour string or a number.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Color = string | number

/**
 * A length in density-independent pixels, a percentage, or `"auto"`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Dimension = number | `${number}%` | "auto"

/**
 * Layout properties, which Yoga applies as CSS flexbox with
 * `flexDirection: "column"` by default.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface LayoutStyle {
  readonly display?: "flex" | "none" | "contents" | undefined
  readonly position?: "relative" | "absolute" | "static" | undefined
  readonly flex?: number | undefined
  readonly flexBasis?: Dimension | undefined
  readonly flexDirection?:
    | "row"
    | "column"
    | "row-reverse"
    | "column-reverse"
    | undefined
  readonly flexGrow?: number | undefined
  readonly flexShrink?: number | undefined
  readonly flexWrap?: "wrap" | "nowrap" | "wrap-reverse" | undefined
  readonly justifyContent?:
    | "flex-start"
    | "flex-end"
    | "center"
    | "space-between"
    | "space-around"
    | "space-evenly"
    | undefined
  readonly alignItems?:
    | "flex-start"
    | "flex-end"
    | "center"
    | "stretch"
    | "baseline"
    | undefined
  readonly alignSelf?:
    | "auto"
    | "flex-start"
    | "flex-end"
    | "center"
    | "stretch"
    | "baseline"
    | undefined
  readonly alignContent?:
    | "flex-start"
    | "flex-end"
    | "center"
    | "stretch"
    | "space-between"
    | "space-around"
    | "space-evenly"
    | undefined
  readonly gap?: number | undefined
  readonly rowGap?: number | undefined
  readonly columnGap?: number | undefined
  readonly width?: Dimension | undefined
  readonly height?: Dimension | undefined
  readonly minWidth?: Dimension | undefined
  readonly minHeight?: Dimension | undefined
  readonly maxWidth?: Dimension | undefined
  readonly maxHeight?: Dimension | undefined
  readonly aspectRatio?: number | undefined
  readonly top?: Dimension | undefined
  readonly right?: Dimension | undefined
  readonly bottom?: Dimension | undefined
  readonly left?: Dimension | undefined
  readonly margin?: Dimension | undefined
  readonly marginHorizontal?: Dimension | undefined
  readonly marginVertical?: Dimension | undefined
  readonly marginTop?: Dimension | undefined
  readonly marginRight?: Dimension | undefined
  readonly marginBottom?: Dimension | undefined
  readonly marginLeft?: Dimension | undefined
  readonly padding?: Dimension | undefined
  readonly paddingHorizontal?: Dimension | undefined
  readonly paddingVertical?: Dimension | undefined
  readonly paddingTop?: Dimension | undefined
  readonly paddingRight?: Dimension | undefined
  readonly paddingBottom?: Dimension | undefined
  readonly paddingLeft?: Dimension | undefined
  readonly overflow?: "visible" | "hidden" | "scroll" | undefined
  readonly zIndex?: number | undefined
}

/**
 * Style properties of a `view`, a `scroll` and an `input`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface ViewStyle extends LayoutStyle {
  readonly backgroundColor?: Color | undefined
  readonly opacity?: number | undefined
  readonly borderWidth?: number | undefined
  readonly borderTopWidth?: number | undefined
  readonly borderRightWidth?: number | undefined
  readonly borderBottomWidth?: number | undefined
  readonly borderLeftWidth?: number | undefined
  readonly borderColor?: Color | undefined
  readonly borderTopColor?: Color | undefined
  readonly borderRightColor?: Color | undefined
  readonly borderBottomColor?: Color | undefined
  readonly borderLeftColor?: Color | undefined
  readonly borderRadius?: number | undefined
  readonly borderTopLeftRadius?: number | undefined
  readonly borderTopRightRadius?: number | undefined
  readonly borderBottomLeftRadius?: number | undefined
  readonly borderBottomRightRadius?: number | undefined
  readonly borderStyle?: "solid" | "dotted" | "dashed" | undefined
  readonly elevation?: number | undefined
  readonly pointerEvents?: "auto" | "none" | "box-none" | "box-only" | undefined
}

/**
 * Style properties of `text`. Nested `text` inherits them.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface TextStyle extends ViewStyle {
  readonly color?: Color | undefined
  readonly fontFamily?: string | undefined
  readonly fontSize?: number | undefined
  readonly fontStyle?: "normal" | "italic" | undefined
  readonly fontWeight?:
    | "normal"
    | "bold"
    | "100"
    | "200"
    | "300"
    | "400"
    | "500"
    | "600"
    | "700"
    | "800"
    | "900"
    | undefined
  readonly letterSpacing?: number | undefined
  readonly lineHeight?: number | undefined
  readonly textAlign?:
    | "auto"
    | "left"
    | "right"
    | "center"
    | "justify"
    | undefined
  readonly textDecorationLine?:
    | "none"
    | "underline"
    | "line-through"
    | "underline line-through"
    | undefined
  readonly textDecorationColor?: Color | undefined
  readonly textTransform?:
    | "none"
    | "capitalize"
    | "uppercase"
    | "lowercase"
    | undefined
  /** Truncates the text to this many lines. */
  readonly numberOfLines?: number | undefined
  readonly selectable?: boolean | undefined
}

/**
 * Style properties of an `input`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface InputStyle extends TextStyle {
  readonly placeholderTextColor?: Color | undefined
  readonly selectionColor?: Color | undefined
}

/**
 * Where a press ended, in points from the top left of the screen.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface PressPayload {
  readonly x: number
  readonly y: number
}

/**
 * A scroll view's offset and sizes, in points.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface ScrollPayload {
  readonly x: number
  readonly y: number
  readonly contentWidth: number
  readonly contentHeight: number
  readonly width: number
  readonly height: number
}

/**
 * The text of an `input`.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface ValuePayload {
  readonly value: string
}

/**
 * The events of a `view` and a `text`. A press ends on the element, or
 * at most 20 points outside it.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface PressEvents {
  readonly press: PressPayload
}

/**
 * The events of a `scroll`.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface ScrollEvents extends PressEvents {
  readonly scroll: ScrollPayload
}

/**
 * The events of an `input`. `input` fires on every edit and `submit` when
 * the keyboard's return key is pressed.
 *
 * @stability experimental
 * @category events
 * @since 0.1.0
 */
export interface InputEvents {
  readonly input: ValuePayload
  readonly submit: ValuePayload
  readonly focus: {}
  readonly blur: {}
}

/**
 * A host node's position and size on screen, in points.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Rect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/**
 * The native host marker, and the imperative operations a Command can run on
 * a node it holds a ref to. Provided by `NativeApp`.
 *
 * @stability experimental
 * @category services
 * @since 0.1.0
 */
export class Host extends Context.Service<Host, {
  /** Focuses an `input`, which shows the keyboard. */
  readonly focus: (node: NativeNode) => void
  readonly blur: (node: NativeNode) => void
  readonly scrollTo: (
    node: NativeNode,
    x: number,
    y: number,
    animated?: boolean | undefined
  ) => void
  /** `undefined` until the node has been committed. */
  readonly measure: (node: NativeNode) => Rect | undefined
}>()("@effect/ui-native/Native/Host") {}

declare module "@effect/ui/Command" {
  interface FrameworkServices {
    readonly NativeHost: Host
  }
}

/**
 * Any child of a `view` or a `scroll`. Text must be inside a `text`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type NoTextInput<Msg, R = never> =
  | View.Element<Msg, R>
  | View.Child<Msg, R>
  | View.Outlet
  | View.ElementBuilder<Msg, R, any, any>
  | false
  | null
  | undefined
  | ReadonlyArray<
    | View.Element<Msg, R>
    | View.Child<Msg, R>
    | View.Outlet
    | View.ElementBuilder<Msg, R, any, any>
    | false
    | null
    | undefined
  >

/**
 * The builder of every native element. Its `style` sets native props.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export class Element<
  out Msg,
  out R = never,
  in out E = Record<string, unknown>,
  out Tag extends string = string,
  in Style extends object = ViewStyle
> extends View.ElementBuilder<Msg, R, E, NativeNode, Tag> {
  /**
   * Phantom: keeps the native builder type through `View.WithRequirements`.
   *
   * @since 0.1.0
   */
  declare readonly "~With"?: Element<Msg, R | this["~Add"], E, Tag, Style>

  /**
   * Sets style properties. A later call merges with earlier ones, and
   * `undefined` removes a property.
   *
   * @since 0.1.0
   */
  style(style: Style): this {
    let props: Record<string, unknown> | undefined
    for (const key in style) {
      const value = (style as Record<string, unknown>)[key]
      props ??= { ...this.props }
      if (value === undefined) delete props[key]
      else props[key] = value
    }
    return props === undefined ? this : View.withFields(this, { props })
  }
}

/**
 * The builder of `view` and `scroll`, whose children can't be text.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export class ViewElement<
  out Msg,
  out R = never,
  in out E = Record<string, unknown>,
  out Tag extends string = string
> extends Element<Msg, R, E, Tag, ViewStyle> {
  /**
   * Phantom: keeps `children` through `View.WithRequirements`.
   *
   * @since 0.1.0
   */
  declare readonly "~With"?: ViewElement<Msg, R | this["~Add"], E, Tag>

  /**
   * Adds children. Text is rejected: wrap it in `h.text(...)`.
   *
   * @since 0.1.0
   */
  children<This, const C extends ReadonlyArray<NoTextInput<Msg, unknown>>>(
    this: This,
    ...inputs: C
  ): View.WithRequirements<This, View.Requirements<C[number]>>
  children(...inputs: ReadonlyArray<View.Input<Msg, unknown>>): unknown {
    return View.withNoTextContent(this, inputs, vocabulary)
  }

  /**
   * Scrolls a `scroll` sideways instead of down.
   *
   * @since 0.1.0
   */
  horizontal(this: ViewElement<Msg, R, E, "scroll">, horizontal = true): this {
    return this.prop("horizontal", horizontal) as this
  }
}

/**
 * The builder of `text`, which holds strings and nested `text`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export class TextElement<
  out Msg,
  out R = never,
  in out E = Record<string, unknown>,
  out Tag extends string = string
> extends Element<Msg, R, E, Tag, TextStyle> {
  /**
   * Phantom: keeps `children` through `View.WithRequirements`.
   *
   * @since 0.1.0
   */
  declare readonly "~With"?: TextElement<Msg, R | this["~Add"], E, Tag>

  /**
   * Adds text and nested `text`.
   *
   * @since 0.1.0
   */
  children<This, const C extends ReadonlyArray<View.Input<Msg, unknown>>>(
    this: This,
    ...inputs: C
  ): View.WithRequirements<This, View.Requirements<C[number]>>
  children(...inputs: ReadonlyArray<View.Input<Msg, unknown>>): unknown {
    return View.withContent(this, inputs)
  }
}

/**
 * The builder of `input`, a single-line text field.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export class InputElement<
  out Msg,
  out R = never,
  in out E = Record<string, unknown>,
  out Tag extends string = string
> extends Element<Msg, R, E, Tag, InputStyle> {
  /**
   * Phantom: keeps the builder type through `View.WithRequirements`.
   *
   * @since 0.1.0
   */
  declare readonly "~With"?: InputElement<Msg, R | this["~Add"], E, Tag>

  /**
   * Sets the text. An edit native has made since is replaced.
   *
   * @since 0.1.0
   */
  value(value: string): this {
    return this.prop("value", value)
  }

  /**
   * Sets the text shown while the field is empty.
   *
   * @since 0.1.0
   */
  placeholder(placeholder: string | undefined): this {
    return this.prop("placeholder", placeholder)
  }
}

/**
 * The element builders the native vocabulary adds to `h`.
 *
 * @stability experimental
 * @category vocabulary
 * @since 0.1.0
 */
export interface Tags<Msg> {
  readonly view: View.Shorthand<ViewElement<Msg, never, PressEvents, "view">>
  readonly scroll: View.Shorthand<
    ViewElement<Msg, never, ScrollEvents, "scroll">
  >
  readonly text: View.Shorthand<TextElement<Msg, never, PressEvents, "text">>
  readonly input: InputElement<Msg, never, InputEvents, "input">
}

/**
 * A native tag name.
 *
 * @stability experimental
 * @category vocabulary
 * @since 0.1.0
 */
export type TagName = keyof Tags<unknown>

/**
 * The type-level native vocabulary.
 *
 * @stability experimental
 * @category vocabulary
 * @since 0.1.0
 */
export interface Elements extends View.Elements {
  readonly Tags: Tags<this["Msg"]>
  readonly Host: Host
}

/**
 * The view helper for pure native view functions, without a component.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type H<Msg> = View.WithTags<Msg, unknown, Elements>

/**
 * Phantom type carrier so the `Native` module namespace satisfies
 * `View.Vocabulary<Elements>`.
 *
 * @stability experimental
 * @category vocabulary
 * @since 0.1.0
 */
export const Elements: Elements | undefined = undefined

/**
 * The vocabulary name matched against `Host.elements`.
 *
 * @stability experimental
 * @category vocabulary
 * @since 0.1.0
 */
export const name = "native"

/**
 * The element builders installed on `h`.
 *
 * @stability experimental
 * @category vocabulary
 * @since 0.1.0
 */
export const tags: Readonly<Record<TagName, Element<any, any, any, any, any>>> =
  {
    view: View.shorthand(new ViewElement("view")),
    scroll: View.shorthand(new ViewElement("scroll")),
    text: View.shorthand(new TextElement("text")),
    input: new InputElement("input")
  }

/**
 * Whether `tag` is a native tag.
 *
 * @stability experimental
 * @category vocabulary
 * @since 0.1.0
 */
export const isTag = (tag: string): tag is TagName => Object.hasOwn(tags, tag)

/**
 * The native vocabulary, for `Component.define({ elements })`.
 *
 * @stability experimental
 * @category vocabulary
 * @since 0.1.0
 */
export const vocabulary: View.Vocabulary<Elements> = {
  name,
  tags,
  textParents: ["text"]
}

/**
 * Defines a component with the native vocabulary, as
 * `Component.define({ ...options, elements: Native.vocabulary })`.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const component: Component.Define<Elements> = Component.withElements(
  vocabulary
)

/**
 * Declares a ref to a native node, for the operations of `Host`.
 *
 * @stability experimental
 * @category refs
 * @since 0.1.0
 */
export const ref = (name: string): Renderer.Ref<NativeNode> =>
  Renderer.ref<NativeNode>(name)
