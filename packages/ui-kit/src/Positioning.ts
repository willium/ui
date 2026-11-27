/**
 * Places a popup against an anchor element, keeps it inside a boundary, and
 * reports where it ended up.
 *
 * The kit's own popups, such as `Tooltip` and `Select`, are placed with this
 * module. Use it for a popup the kit doesn't have. The options have the
 * same names and defaults as the positioner props of those popups.
 *
 * It has two layers:
 *
 * - `place` is a pure function from rectangles and options to a position.
 *   It reads no DOM, so it runs in any environment and placement can be
 *   tested without a browser's layout.
 * - `TrackPosition` is a stream mount for the positioner, the element that
 *   holds the popup. It measures the anchor, the positioner and the arrow,
 *   calls `place`, writes the result on the positioner as inline style, and
 *   reports a `Placement` whenever the side, the alignment, the anchor's
 *   visibility or the arrow's centring changes.
 *
 * **Building a popup**
 *
 * 1. Spread `PositionerFields` into the component's props.
 * 2. Keep a `Placement` in the Model, with a message that stores each one
 *    the mount reports.
 * 3. Build the mount's args from the props with `trackArgs`.
 * 4. Draw the positioner as a manual popover with `positionerStyle` in its
 *    inline style, and issue `TrackPosition` on it while the popup shows.
 * 5. Write `data-side`, `data-align` and the like from the `Placement`,
 *    and give an arrow `arrowStyle`.
 *
 * The example on `TrackPosition` does all five.
 *
 * **What the mount writes**
 *
 * On the positioner, as inline style:
 *
 * - `left` and `top`: the position
 * - `--anchor-width`, `--anchor-height`: the anchor's size
 * - `--available-width`, `--available-height`: the space between the
 *   anchor and the edge of the boundary, for a `max-height`
 * - `--transform-origin`: the point on the anchor the popup grows from
 * - the arrow's offset, in a variable that `arrowStyle` reads
 * - with `offsetAsPadding`, the side offset as padding on the side that
 *   faces the anchor
 *
 * With `leaveCoordinates`, it writes everything but `left` and `top`, for
 * a component that places the positioner itself and still wants the
 * variables and the `Placement`.
 *
 * They survive view-rendered changes to the positioner's `style` attribute,
 * and stay after the mount ends, so a closing popup keeps its place through
 * an exit transition.
 *
 * While it runs, the mount places the popup again when the window resizes,
 * when the visual viewport resizes or scrolls, when the positioner changes
 * size, and, unless `disableAnchorTracking` is set, when anything outside
 * the positioner scrolls or the anchor changes size or moves. Scrolling
 * inside the positioner, such as a long list, doesn't move it.
 *
 * **Gotchas**
 *
 * - `left` and `top` are measured from the viewport, plus the page's scroll
 *   for `"absolute"`. So the positioner has to be positioned against the
 *   viewport, as a popover or a modal dialog in the top layer is. Inside a
 *   transformed or positioned ancestor it lands in the wrong place, unless
 *   `topLayer` is `false`.
 * - With `topLayer: false`, the positioner is an ordinary element where the
 *   view draws it, and `left` and `top` are measured from its containing
 *   block: the nearest positioned or transformed ancestor for
 *   `"absolute"`, the nearest transformed one or else the viewport for
 *   `"fixed"`. Draw it without `popover`, so an ancestor's `overflow`,
 *   `position` and stacking context apply to it, as to any other element.
 *   `"clipping-ancestors"` is then the area its ancestors' `overflow` leaves
 *   visible, inside the viewport, so the popup flips and shifts to stay in
 *   a small scrolling box.
 * - Collisions use the visual viewport (the visible area under pinch-zoom or
 *   a software keyboard), not the layout viewport.
 * - The positioner has to be laid out while the mount runs, so issue the
 *   mount only while the popup shows.
 * - The anchor is the first element in the positioner's tree (the
 *   document, or its shadow root) that matches `anchorSelector`, so build
 *   the selector from `h.id` to keep two instances apart. While nothing
 *   matches, the mount reports `anchorHidden`.
 * - `anchorRect` places the popup against a rectangle in the viewport, such
 *   as the point a context menu opened at, instead of an element. Nothing
 *   moves it, so use `"fixed"` as the `positionMethod`.
 * - An arrow needs an id, passed as `arrowId`, and a size of its own.
 * - `inline` places the popup against one line of a link that wraps,
 *   instead of the box around all its lines.
 * - There are no function-valued offsets.
 *
 * **Example** (A popup below its anchor, and above it when it doesn't fit)
 *
 * ```ts import.meta.vitest
 * import { Positioning } from "@effect/ui-kit"
 *
 * const viewport = { x: 0, y: 0, width: 1000, height: 800 }
 * const options = Positioning.resolveOptions({ sideOffset: 8 }, { side: "bottom" })
 *
 * const below = Positioning.place({
 *   anchor: { x: 400, y: 400, width: 100, height: 40 },
 *   popup: { width: 200, height: 100 },
 *   arrow: null,
 *   boundary: viewport,
 *   anchorClip: viewport,
 *   rtl: false,
 *   options
 * })
 * if (below.side !== "bottom" || below.x !== 350 || below.y !== 448) throw new Error("not below the anchor")
 *
 * const above = Positioning.place({
 *   anchor: { x: 400, y: 700, width: 100, height: 40 },
 *   popup: { width: 200, height: 100 },
 *   arrow: null,
 *   boundary: viewport,
 *   anchorClip: viewport,
 *   rtl: false,
 *   options
 * })
 * if (above.side !== "top" || above.y !== 592) throw new Error("not flipped above the anchor")
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Mount from "@effect/ui/Mount"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { idSelector } from "./internal/attributes.ts"
import { listenTrees, rootOf } from "./internal/dom.ts"
import {
  inlineEdges,
  lineAt,
  type Lines,
  linesOf
} from "./internal/inlineRect.ts"
import { isWebKit } from "./internal/platform.ts"

/**
 * The side of the anchor a popup shows on. `"inline-start"` and
 * `"inline-end"` follow the writing direction.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const Side = Schema.Literals([
  "top",
  "bottom",
  "left",
  "right",
  "inline-start",
  "inline-end"
])

/**
 * The side of the anchor a popup shows on.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Side = typeof Side.Type

/**
 * How a popup lines up with its anchor along the side it shows on.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const Align = Schema.Literals(["start", "center", "end"])

/**
 * How a popup lines up with its anchor along the side it shows on.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Align = typeof Align.Type

const Avoidance = Schema.Literals(["flip", "shift", "none"])
const FallbackAxisSide = Schema.Literals(["start", "end", "none"])

/**
 * What a popup does when it doesn't fit inside the boundary.
 *
 * **Details**
 *
 * - `side`: for a popup that reaches past the boundary away from the
 *   anchor. `"flip"` moves it to the opposite side, `"shift"` keeps the side
 *   and slides the popup over the anchor, and `"none"` leaves it. `"flip"`
 *   by default.
 * - `align`: for a popup that reaches past the boundary along the anchor's
 *   edge. `"flip"` tries the other alignment and then slides the popup
 *   along the edge, `"shift"` only slides it, and `"none"` leaves it.
 *   `"flip"` by default.
 * - `fallbackAxisSide`: the side on the other axis to try when neither side
 *   fits, or `"none"` to stay on the requested axis. `"end"` by default.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const CollisionAvoidance = Schema.Struct({
  side: Schema.optional(Avoidance),
  align: Schema.optional(Avoidance),
  fallbackAxisSide: Schema.optional(FallbackAxisSide)
})

/**
 * What a popup does when it doesn't fit inside the boundary.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type CollisionAvoidance = typeof CollisionAvoidance.Type

/**
 * A rectangle in viewport coordinates, in pixels.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const Rect = Schema.Struct({
  x: Schema.Number,
  y: Schema.Number,
  width: Schema.Number,
  height: Schema.Number
})

/**
 * A rectangle in viewport coordinates, in pixels.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Rect = typeof Rect.Type

/**
 * Where the pointer rested on an inline anchor: the point, in viewport
 * coordinates, and `line`, the index of the line under it among the
 * anchor's lines from the top, or `null` when it was on none.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const InlineHit = Schema.Struct({
  x: Schema.Number,
  y: Schema.Number,
  line: Schema.NullOr(Schema.Number)
})

/**
 * Where the pointer rested on an inline anchor.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type InlineHit = typeof InlineHit.Type

/**
 * The area a popup keeps inside: `"clipping-ancestors"`, which is the
 * viewport, an element in the popup's tree named by `{ id }`, or a
 * rectangle in viewport coordinates. An element or a rectangle is cut to
 * the viewport.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const CollisionBoundary = Schema.Union([
  Schema.Literal("clipping-ancestors"),
  Schema.Struct({ id: Schema.String }),
  Rect
])

/**
 * The area a popup keeps inside.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type CollisionBoundary = typeof CollisionBoundary.Type

/**
 * The pixels a popup keeps from the boundary's edges: one number for every
 * edge, or one per edge, where an edge left out is 0.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const CollisionPadding = Schema.Union([
  Schema.Number,
  Schema.Struct({
    top: Schema.optional(Schema.Number),
    right: Schema.optional(Schema.Number),
    bottom: Schema.optional(Schema.Number),
    left: Schema.optional(Schema.Number)
  })
])

/**
 * The pixels a popup keeps from the boundary's edges.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type CollisionPadding = typeof CollisionPadding.Type

/**
 * The CSS `position` of the positioner. `"fixed"` doesn't make the page
 * taller when the popup reaches past its end.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const PositionMethod = Schema.Literals(["absolute", "fixed"])

/**
 * The CSS `position` of the positioner.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type PositionMethod = typeof PositionMethod.Type

/**
 * The positioning options a popup takes as props, to spread into its props
 * Schema: `Schema.Struct({ open: Schema.Boolean, ...PositionerFields })`.
 * Every one is optional.
 *
 * **Details**
 *
 * - `side`: the side of the anchor the popup shows on. The component picks
 *   the default.
 * - `align`: how the popup lines up with the anchor along that side,
 *   `"center"` by default.
 * - `sideOffset`: the gap between the anchor and the popup, in pixels.
 * - `alignOffset`: pixels the popup moves along the side, toward the
 *   anchor's other end when aligned to the start or the end, and right or
 *   down when centred.
 * - `collisionAvoidance`: what happens when the popup doesn't fit. It
 *   replaces the component's default as a whole.
 * - `collisionBoundary`: the area the popup keeps inside, the viewport by
 *   default.
 * - `collisionPadding`: pixels kept from the boundary's edges, 5 by default.
 * - `sticky`: the popup stays in view when the anchor scrolls out of it.
 * - `arrowPadding`: pixels kept between the arrow and the popup's corners,
 *   5 by default.
 * - `positionMethod`: `"absolute"` by default.
 * - `disableAnchorTracking`: the popup is placed only when it opens, when
 *   the window resizes and when its own size changes, not when the page
 *   scrolls or the anchor moves or changes size.
 * - `anchor`: the id of an element in the popup's tree, or a `Rect` in
 *   the viewport, to place the popup against instead of the component's
 *   own anchor.
 * - `topLayer`: `false` draws the positioner in place, as the module's
 *   **Gotchas** describe. `true` when left out. The component's JSDoc says
 *   what else changes.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const PositionerFields = {
  side: Schema.optional(Side),
  align: Schema.optional(Align),
  sideOffset: Schema.optional(Schema.Number),
  alignOffset: Schema.optional(Schema.Number),
  collisionAvoidance: Schema.optional(CollisionAvoidance),
  collisionBoundary: Schema.optional(CollisionBoundary),
  collisionPadding: Schema.optional(CollisionPadding),
  sticky: Schema.optional(Schema.Boolean),
  arrowPadding: Schema.optional(Schema.Number),
  positionMethod: Schema.optional(PositionMethod),
  disableAnchorTracking: Schema.optional(Schema.Boolean),
  anchor: Schema.optional(Schema.Union([Schema.String, Rect])),
  topLayer: Schema.optional(Schema.Boolean)
}

/**
 * The positioning options a popup takes as props: the type of
 * `PositionerFields`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type PositionerOptions = Schema.Struct.Type<typeof PositionerFields>

/**
 * The default `collisionAvoidance` of a dropdown, such as a select or a menu:
 * it never moves to the other axis.
 *
 * @stability experimental
 * @category constants
 * @since 0.1.0
 */
export const dropdownCollisionAvoidance: CollisionAvoidance = {
  fallbackAxisSide: "none"
}

/**
 * The default `collisionAvoidance` of other popups, such as a tooltip or a
 * popover: when neither side fits, it tries the other axis.
 *
 * @stability experimental
 * @category constants
 * @since 0.1.0
 */
export const popupCollisionAvoidance: CollisionAvoidance = {
  fallbackAxisSide: "end"
}

/**
 * A width and a height, in pixels.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Size {
  readonly width: number
  readonly height: number
}

type Physical = "top" | "right" | "bottom" | "left"
type Axis = "x" | "y"
type FloatingPlacement = Physical | `${Physical}-start` | `${Physical}-end`

/**
 * The options `place` takes, with every default filled in. `resolveOptions`
 * makes one from a component's props.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const PlaceOptions = Schema.Struct({
  side: Side,
  align: Align,
  sideOffset: Schema.Number,
  alignOffset: Schema.Number,
  collisionAvoidance: Schema.Struct({
    side: Avoidance,
    align: Avoidance,
    fallbackAxisSide: FallbackAxisSide
  }),
  collisionPadding: Schema.Struct({
    top: Schema.Number,
    right: Schema.Number,
    bottom: Schema.Number,
    left: Schema.Number
  }),
  sticky: Schema.Boolean,
  arrowPadding: Schema.Number,
  shiftCrossAxis: Schema.Boolean
})

/**
 * The options `place` takes, with every default filled in.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type PlaceOptions = typeof PlaceOptions.Type
type Sides = PlaceOptions["collisionPadding"]

/**
 * Fills in the defaults of a popup's positioning props.
 *
 * **Details**
 *
 * `defaults` holds what differs between components: the `side` a popup shows
 * on when its props name none, its `collisionAvoidance`, which is
 * `popupCollisionAvoidance` when left out, and `shiftCrossAxis`, false when
 * left out. With `shiftCrossAxis`, unless `collisionAvoidance.side` is
 * `"flip"`, the popup keeps its side and slides toward the anchor to stay
 * inside the boundary, as with `sticky`, so it can cover the anchor.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const resolveOptions = (
  options: PositionerOptions,
  defaults: {
    readonly side: Side
    readonly collisionAvoidance?: CollisionAvoidance | undefined
    readonly shiftCrossAxis?: boolean | undefined
  }
): PlaceOptions => {
  const avoidance = options.collisionAvoidance ?? defaults.collisionAvoidance ??
    popupCollisionAvoidance
  const shiftCrossAxis = defaults.shiftCrossAxis === true &&
    avoidance.side !== "flip"
  const padding = options.collisionPadding ?? 5
  return {
    side: options.side ?? defaults.side,
    align: options.align ?? "center",
    sideOffset: options.sideOffset ?? 0,
    alignOffset: options.alignOffset ?? 0,
    collisionAvoidance: {
      side: avoidance.side ?? "flip",
      align: avoidance.align ?? "flip",
      fallbackAxisSide: avoidance.fallbackAxisSide ?? "end"
    },
    collisionPadding: typeof padding === "number"
      ? { top: padding, right: padding, bottom: padding, left: padding }
      : {
        top: padding.top ?? 0,
        right: padding.right ?? 0,
        bottom: padding.bottom ?? 0,
        left: padding.left ?? 0
      },
    sticky: options.sticky === true || shiftCrossAxis,
    arrowPadding: options.arrowPadding ?? 5,
    shiftCrossAxis
  }
}

/**
 * What `place` measures a popup from. Every rectangle is in the same
 * coordinates, which the result's `x` and `y` are in too.
 *
 * **Details**
 *
 * - `anchor`: the element the popup is placed against.
 * - `popup`: the popup's size.
 * - `arrow`: the arrow's size, or `null` without one.
 * - `boundary`: the area the popup keeps inside.
 * - `anchorClip`: the part of the page the anchor can be seen through, which
 *   decides `anchorHidden`. The viewport, cut by each ancestor that clips
 *   the anchor.
 * - `rtl`: whether the writing direction is right to left.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface PlaceInput {
  readonly anchor: Rect
  readonly popup: Size
  readonly arrow: Size | null
  readonly boundary: Rect
  readonly anchorClip: Rect
  readonly rtl: boolean
  readonly options: PlaceOptions
}

/**
 * Where `place` puts a popup.
 *
 * **Details**
 *
 * - `x`, `y`: the popup's top left corner.
 * - `side`, `align`: where the popup ended up, which differs from the
 *   options after a flip. A logical side stays logical.
 * - `availableWidth`, `availableHeight`: the space between the anchor and
 *   the boundary's edge on that side.
 * - `anchorHidden`: the anchor is outside `anchorClip`. An anchor with no
 *   width or height is outside only past the clip's edge, not on it.
 * - `arrow`: `null` without an arrow. Otherwise its offset from the popup's
 *   left edge as `x` or from its top edge as `y`, the other being `null`,
 *   and `uncentered` when it can't point at the anchor's middle.
 * - `transformOrigin`: a CSS `transform-origin` at the point on the anchor
 *   the popup grows from.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface PlaceResult {
  readonly x: number
  readonly y: number
  readonly side: Side
  readonly align: Align
  readonly availableWidth: number
  readonly availableHeight: number
  readonly anchorHidden: boolean
  readonly arrow: {
    readonly x: number | null
    readonly y: number | null
    readonly uncentered: boolean
  } | null
  readonly transformOrigin: string
}

const opposite: Record<Physical, Physical> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left"
}
const isBefore = (side: Physical): boolean => side === "top" || side === "left"
const sideOf = (placement: FloatingPlacement): Physical =>
  placement.split("-")[0] as Physical
const alignmentOf = (
  placement: FloatingPlacement
): "start" | "end" | undefined =>
  placement.split("-")[1] as "start" | "end" | undefined
const sideAxisOf = (placement: FloatingPlacement): Axis =>
  placement[0] === "t" || placement[0] === "b" ? "y" : "x"
const otherAxis = (axis: Axis): Axis => axis === "x" ? "y" : "x"
const lengthOf = (axis: Axis): "width" | "height" =>
  axis === "y" ? "height" : "width"
const clamp = (start: number, value: number, end: number): number =>
  Math.max(start, Math.min(value, end))
const oppositePlacement = (placement: FloatingPlacement): FloatingPlacement => {
  const side = sideOf(placement)
  return (opposite[side] + placement.slice(side.length)) as FloatingPlacement
}
const oppositeAlignment = (placement: FloatingPlacement): FloatingPlacement =>
  (placement.includes("start")
    ? placement.replace("start", "end")
    : placement.replace("end", "start")) as FloatingPlacement

const alignmentSides = (
  placement: FloatingPlacement,
  anchor: Size,
  popup: Size,
  rtl: boolean
): readonly [Physical, Physical] => {
  const alignment = alignmentOf(placement)
  const axis = otherAxis(sideAxisOf(placement))
  const length = lengthOf(axis)
  let main: Physical = axis === "x"
    ? alignment === (rtl ? "end" : "start") ? "right" : "left"
    : alignment === "start"
    ? "bottom"
    : "top"
  if (anchor[length] > popup[length]) main = opposite[main]
  return [main, opposite[main]]
}

const oppositeAxisPlacements = (
  placement: FloatingPlacement,
  direction: "start" | "end",
  rtl: boolean
): Array<FloatingPlacement> => {
  const alignment = alignmentOf(placement)
  const isStart = direction === "start"
  let list: Array<FloatingPlacement> = sideAxisOf(placement) === "y"
    ? isStart !== rtl ? ["left", "right"] : ["right", "left"]
    : isStart
    ? ["top", "bottom"]
    : ["bottom", "top"]
  if (alignment !== undefined) {
    list = list.map((side) => `${side}-${alignment}` as FloatingPlacement)
    list = list.concat(list.map(oppositeAlignment))
  }
  return list
}

const coordsFor = (
  anchor: Rect,
  popup: Size,
  placement: FloatingPlacement,
  rtl: boolean
) => {
  const sideAxis = sideAxisOf(placement)
  const alignAxis = otherAxis(sideAxis)
  const sideLength = lengthOf(sideAxis)
  const alignLength = lengthOf(alignAxis)
  const side = sideOf(placement)
  const alignment = alignmentOf(placement)
  const common = anchor[alignLength] / 2 - popup[alignLength] / 2
  const coords = { x: 0, y: 0 }
  coords[sideAxis] = isBefore(side)
    ? anchor[sideAxis] - popup[sideLength]
    : anchor[sideAxis] + anchor[sideLength]
  coords[alignAxis] = anchor[alignAxis] + common +
    (alignment === undefined
      ? 0
      : common * (alignment === "end" ? 1 : -1) *
        (rtl && sideAxis === "y" ? -1 : 1))
  return coords
}

const overflowOf = (rect: Rect, clip: Rect, padding: Sides): Sides => ({
  top: clip.y - rect.y + padding.top,
  bottom: rect.y + rect.height - (clip.y + clip.height) + padding.bottom,
  left: clip.x - rect.x + padding.left,
  right: rect.x + rect.width - (clip.x + clip.width) + padding.right
})

interface Data {
  offset?: { x: number; y: number; placement: FloatingPlacement }
  flip?: {
    index?: number
    overflows?: ReadonlyArray<
      { placement: FloatingPlacement; overflows: ReadonlyArray<number> }
    >
  }
  shift?: { x: number; y: number; enabled: { x: boolean; y: boolean } }
  arrow?: {
    x?: number
    y?: number
    centerOffset: number
    alignmentOffset?: number
  }
}

interface State {
  readonly x: number
  readonly y: number
  readonly placement: FloatingPlacement
  readonly data: Data
}

interface Step {
  readonly x?: number
  readonly y?: number
  readonly data?: object
  readonly reset?: boolean | { readonly placement: FloatingPlacement }
}

interface Middleware {
  readonly name: keyof Data
  readonly fn: (state: State) => Step
}

const physicalSide = (side: Side, rtl: boolean): Physical =>
  side === "inline-start"
    ? (rtl ? "right" : "left")
    : side === "inline-end"
    ? (rtl ? "left" : "right")
    : side

const logicalSide = (
  requested: Side,
  rendered: Physical,
  rtl: boolean
): Side => {
  if (requested !== "inline-start" && requested !== "inline-end") {
    return rendered
  }
  if (rendered === "right") return rtl ? "inline-start" : "inline-end"
  if (rendered === "left") return rtl ? "inline-end" : "inline-start"
  return rendered
}

const requestedSideBiasPx = 1

/**
 * Places a popup against an anchor: on the requested side, lined up as asked,
 * then flipped and shifted as `collisionAvoidance` allows to stay inside the
 * boundary.
 *
 * **Details**
 *
 * It reads no DOM and has no state, so the same input gives the same result.
 *
 * @stability experimental
 * @category placing
 * @since 0.1.0
 */
export const place = (input: PlaceInput): PlaceResult => {
  const { anchor, arrow, boundary, anchorClip, options, popup, rtl } = input
  const padding = options.collisionPadding
  const { side: avoidSide, align: avoidAlign, fallbackAxisSide } =
    options.collisionAvoidance
  const physical = physicalSide(options.side, rtl)
  const initialPlacement: FloatingPlacement = options.align === "center"
    ? physical
    : `${physical}-${options.align}`
  const overflowAt = (
    at: { readonly x: number; readonly y: number },
    within: Sides
  ): Sides =>
    overflowOf(
      { x: at.x, y: at.y, width: popup.width, height: popup.height },
      boundary,
      within
    )

  const shiftDisabled = avoidAlign === "none" && avoidSide !== "shift"
  const crossAxisShift = !shiftDisabled &&
    (options.sticky || avoidSide === "shift")

  const offset: Middleware = {
    name: "offset",
    fn: ({ data, placement, x, y }) => {
      if (placement === data.offset?.placement && data.arrow?.alignmentOffset) {
        return {}
      }
      const side = sideOf(placement)
      const alignment = alignmentOf(placement)
      const vertical = sideAxisOf(placement) === "y"
      const main = options.sideOffset * (isBefore(side) ? -1 : 1)
      const crossMulti = rtl && vertical ? -1 : 1
      const cross = alignment === "end"
        ? -options.alignOffset
        : options.alignOffset
      const diff = vertical
        ? { x: cross * crossMulti, y: main }
        : { x: main, y: cross * crossMulti }
      return { x: x + diff.x, y: y + diff.y, data: { ...diff, placement } }
    }
  }

  const biased = (side: Physical): number =>
    padding[side] + requestedSideBiasPx +
    (options.side === opposite[side] ? requestedSideBiasPx : 0)
  const flipPadding: Sides = {
    top: biased("top"),
    right: biased("right"),
    bottom: biased("bottom"),
    left: biased("left")
  }
  const flipMainAxis = avoidSide === "flip" && !options.shiftCrossAxis
  const flipCrossAxis = avoidAlign === "flip"
  const initialSideAxis = sideAxisOf(initialPlacement)
  const placements: Array<FloatingPlacement> = [
    initialPlacement,
    ...(options.align === "center"
      ? [oppositePlacement(initialPlacement)]
      : [
        oppositeAlignment(initialPlacement),
        oppositePlacement(initialPlacement),
        oppositeAlignment(oppositePlacement(initialPlacement))
      ]),
    ...(fallbackAxisSide === "none"
      ? []
      : oppositeAxisPlacements(initialPlacement, fallbackAxisSide, rtl))
  ]

  const flip: Middleware = {
    name: "flip",
    fn: (state) => {
      const { data, placement } = state
      if (data.arrow?.alignmentOffset) return {}
      const overflow = overflowAt(state, flipPadding)
      const overflows: Array<number> = []
      if (flipMainAxis) overflows.push(overflow[sideOf(placement)])
      if (flipCrossAxis) {
        const [a, b] = alignmentSides(placement, anchor, popup, rtl)
        overflows.push(overflow[a], overflow[b])
      }
      if (overflows.every((value) => value <= 0)) return {}
      const history = [...(data.flip?.overflows ?? []), {
        placement,
        overflows
      }]
      const nextIndex = (data.flip?.index ?? 0) + 1
      const next = placements[nextIndex]
      if (next !== undefined) {
        const ignoreCross = flipCrossAxis &&
          initialSideAxis !== sideAxisOf(next)
        if (
          !ignoreCross ||
          history.every((entry) =>
            sideAxisOf(entry.placement) === initialSideAxis
              ? entry.overflows[0]! > 0
              : true
          )
        ) {
          return {
            data: { index: nextIndex, overflows: history },
            reset: { placement: next }
          }
        }
      }
      let reset = history.filter((entry) => entry.overflows[0]! <= 0)
        .sort((a, b) => a.overflows[1]! - b.overflows[1]!)[0]?.placement
      if (reset === undefined) {
        reset = history
          .filter((entry) =>
            fallbackAxisSide === "none" ||
            sideAxisOf(entry.placement) === initialSideAxis ||
            sideAxisOf(entry.placement) === "y"
          )
          .map((entry) =>
            [
              entry.placement,
              entry.overflows.reduce(
                (sum, value) => sum + Math.max(value, 0),
                0
              )
            ] as const
          )
          .sort((a, b) => a[1] - b[1])[0]?.[0]
      }
      return reset !== undefined && placement !== reset
        ? { reset: { placement: reset } }
        : {}
    }
  }

  const limit = (axis: Axis): number =>
    arrow === null ? 0 : axis === "x"
      ? arrow.width / 2 + (padding.left + padding.right) / 2
      : arrow.height / 2 + (padding.top + padding.bottom) / 2
  const shift: Middleware = {
    name: "shift",
    fn: (state) => {
      const { placement, x, y } = state
      const overflow = overflowAt(state, padding)
      const crossAxis = sideAxisOf(placement)
      const mainAxis = otherAxis(crossAxis)
      const coords = { x, y }
      const clampAxis = (axis: Axis, coord: number) =>
        clamp(
          coord + overflow[axis === "y" ? "top" : "left"],
          coord,
          coord - overflow[axis === "y" ? "bottom" : "right"]
        )
      const checkMain = avoidAlign !== "none"
      if (checkMain) coords[mainAxis] = clampAxis(mainAxis, coords[mainAxis])
      if (crossAxisShift) {
        coords[crossAxis] = clampAxis(crossAxis, coords[crossAxis])
      }
      if (!options.sticky) {
        const mainLength = lengthOf(mainAxis)
        const mainMin = anchor[mainAxis] - popup[mainLength] + limit(mainAxis)
        const mainMax = anchor[mainAxis] + anchor[mainLength] - limit(mainAxis)
        if (coords[mainAxis] < mainMin) coords[mainAxis] = mainMin
        else if (coords[mainAxis] > mainMax) coords[mainAxis] = mainMax
        const crossLength = lengthOf(crossAxis)
        const originSide = isBefore(sideOf(placement))
        const offsetData = state.data.offset?.[crossAxis] ?? 0
        const crossMin = anchor[crossAxis] - popup[crossLength] +
          (originSide ? offsetData : 0)
        const crossMax = anchor[crossAxis] + anchor[crossLength] +
          (originSide ? 0 : offsetData)
        if (coords[crossAxis] < crossMin) coords[crossAxis] = crossMin
        else if (coords[crossAxis] > crossMax) coords[crossAxis] = crossMax
      }
      const enabled = { x: false, y: false }
      enabled[mainAxis] = checkMain
      enabled[crossAxis] = crossAxisShift
      return { ...coords, data: { x: coords.x - x, y: coords.y - y, enabled } }
    }
  }

  const arrowSize = arrow ?? { width: 0, height: 0 }
  const arrowPadding = arrow === null ? 0 : options.arrowPadding
  const arrowStep: Middleware = {
    name: "arrow",
    fn: ({ data, placement, x, y }) => {
      const coords = { x, y }
      const axis = otherAxis(sideAxisOf(placement))
      const length = lengthOf(axis)
      const endDiff = anchor[length] + anchor[axis] - coords[axis] -
        popup[length]
      const startDiff = coords[axis] - anchor[axis]
      const centerToReference = endDiff / 2 - startDiff / 2
      const min = Math.min(
        arrowPadding,
        popup[length] / 2 - arrowSize[length] / 2 - 1
      )
      const max = popup[length] - arrowSize[length] - min
      const center = popup[length] / 2 - arrowSize[length] / 2 +
        centerToReference
      const at = clamp(min, center, max)
      const addOffset = data.arrow === undefined &&
        alignmentOf(placement) !== undefined && center !== at &&
        anchor[length] / 2 - min - arrowSize[length] / 2 < 0
      const alignmentOffset = addOffset
        ? (center < min ? center - min : center - max)
        : 0
      coords[axis] += alignmentOffset
      return {
        ...coords,
        data: {
          [axis]: at,
          centerOffset: center - at - alignmentOffset,
          ...(addOffset ? { alignmentOffset } : {})
        },
        reset: addOffset
      }
    }
  }

  const middleware: Array<Middleware> = [offset]
  const flipStep = avoidSide === "none" ? [] : [flip]
  const shiftStep = shiftDisabled ? [] : [shift]
  if (
    avoidSide === "shift" || avoidAlign === "shift" ||
    options.align === "center"
  ) {
    middleware.push(...shiftStep, ...flipStep)
  } else {
    middleware.push(...flipStep, ...shiftStep)
  }
  middleware.push(arrowStep)

  let { x, y } = coordsFor(anchor, popup, initialPlacement, rtl)
  let placement = initialPlacement
  let resets = 0
  const steps: Record<string, object> = {}
  for (let i = 0; i < middleware.length; i++) {
    const { fn, name } = middleware[i]!
    const step = fn({ x, y, placement, data: steps as Data })
    x = step.x ?? x
    y = step.y ?? y
    steps[name] = { ...steps[name], ...step.data }
    if (step.reset !== undefined && step.reset !== false && resets < 50) {
      resets++
      if (typeof step.reset === "object") {
        placement = step.reset.placement
        const coords = coordsFor(anchor, popup, placement, rtl)
        x = coords.x
        y = coords.y
      }
      i = -1
    }
  }

  const { arrow: arrowData, shift: shifted } = steps as Data
  const side = sideOf(placement)
  const alignment = alignmentOf(placement)
  const vertical = sideAxisOf(placement) === "y"

  const overflow = overflowAt({ x, y }, padding)
  const clipHeight = popup.height - overflow.top - overflow.bottom
  const clipWidth = popup.width - overflow.left - overflow.right
  const heightSide: Physical = vertical
    ? side
    : alignment === "end"
    ? "top"
    : "bottom"
  const widthSide: Physical = vertical
    ? alignment === (rtl ? "start" : "end") ? "left" : "right"
    : side
  let availableHeight = Math.min(
    popup.height - overflow[heightSide],
    clipHeight
  )
  let availableWidth = Math.min(popup.width - overflow[widthSide], clipWidth)
  if (shifted?.enabled.x) availableWidth = clipWidth
  if (shifted?.enabled.y) availableHeight = clipHeight
  if (shifted === undefined && alignment === undefined) {
    if (vertical) {
      availableWidth = popup.width - 2 * Math.max(overflow.left, overflow.right)
    } else {availableHeight = popup.height -
        2 * Math.max(overflow.top, overflow.bottom)}
  }

  let crossOrigin: string
  if (
    arrow === null && alignment !== undefined &&
    Math.abs((vertical ? shifted?.x : shifted?.y) ?? 0) <= 1
  ) {
    crossOrigin = (alignment === "start") === (vertical && rtl) ? "100%" : "0%"
  } else {
    const at = (vertical ? arrowData?.x : arrowData?.y) ?? 0
    crossOrigin = `${
      at + (vertical ? arrowSize.width : arrowSize.height) / 2
    }px`
  }
  let sideOrigin = isBefore(side)
    ? `calc(100% + ${options.sideOffset}px)`
    : `${-options.sideOffset}px`
  if (
    crossAxisShift && vertical && Math.abs(shifted?.y ?? 0) > options.sideOffset
  ) {
    sideOrigin = `${anchor.y + anchor.height / 2 - y}px`
  }

  const anchorOverflow = overflowOf(anchor, anchorClip, {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0
  })
  const outside = (overflow: number, length: number) =>
    length === 0 ? overflow > 0 : overflow - length >= 0
  const anchorClipped = outside(anchorOverflow.top, anchor.height) ||
    outside(anchorOverflow.right, anchor.width) ||
    outside(anchorOverflow.bottom, anchor.height) ||
    outside(anchorOverflow.left, anchor.width)

  return {
    x,
    y,
    side: logicalSide(options.side, side, rtl),
    align: alignment ?? "center",
    availableWidth,
    availableHeight,
    anchorHidden: anchorClipped,
    arrow: arrow === null || arrowData === undefined ? null : {
      x: arrowData.x ?? null,
      y: arrowData.y ?? null,
      uncentered: arrowData.centerOffset !== 0
    },
    transformOrigin: vertical
      ? `${crossOrigin} ${sideOrigin}`
      : `${sideOrigin} ${crossOrigin}`
  }
}

/**
 * What `TrackPosition` reports: the facts about a popup's position that its
 * parts render as attributes. A component keeps the latest in its Model.
 *
 * **Details**
 *
 * - `side`, `align`: where the popup is, for `data-side` and `data-align`.
 * - `anchorHidden`: the anchor is scrolled or clipped out of view, for
 *   `data-anchor-hidden`.
 * - `arrowUncentered`: the arrow can't point at the anchor's middle, for
 *   `data-uncentered`.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const Placement = Schema.Struct({
  side: Side,
  align: Align,
  anchorHidden: Schema.Boolean,
  arrowUncentered: Schema.Boolean
})

/**
 * What `TrackPosition` reports about a popup's position.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Placement = typeof Placement.Type

/**
 * The args of `TrackPosition`. `trackArgs` makes them from a component's
 * props.
 *
 * **Details**
 *
 * - `options`: what `place` takes.
 * - `positionMethod`: the positioner's CSS `position`, which decides
 *   whether the page's scroll is added to `left` and `top`.
 * - `collisionBoundary`: the area the popup keeps inside.
 * - `disableAnchorTracking`: don't follow scrolling or the anchor.
 * - `anchorSelector`: a CSS selector for the anchor.
 * - `anchorRect`: a rectangle in the viewport to place against instead of
 *   the element `anchorSelector` matches, or `null`.
 * - `arrowId`: the id of the arrow, or `null` without one.
 * - `offsetAsPadding`: write `sideOffset` as padding on the positioner's
 *   side facing the anchor, and move the positioner up against the anchor.
 *   The gap is then part of the positioner, so a pointer can cross it
 *   without leaving the popup.
 * - `leaveCoordinates`: don't write `left` and `top`, and leave whatever
 *   is there. False when left out.
 * - `inline`: the anchor is inline text, such as a link, that can wrap over
 *   several lines. The popup is placed against one line instead of the box
 *   around all of them: the line `inlineHit` names, or else the line under
 *   its point. Without a hit for the anchor, or when no line is under the
 *   point, it is placed against the first line for `"top"`, the last line
 *   for `"bottom"`, and the lines that reach furthest toward the side for
 *   `"left"` and `"right"`. An anchor on one line is measured as a whole.
 *   False when left out.
 * - `inlineHit`: where the pointer rested on the anchor, for `inline`.
 * - `topLayer`: `false` for a positioner drawn in place, as the module's
 *   **Gotchas** describe. `true` when left out.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const TrackPositionArgs = Schema.Struct({
  options: PlaceOptions,
  positionMethod: PositionMethod,
  collisionBoundary: CollisionBoundary,
  disableAnchorTracking: Schema.Boolean,
  anchorSelector: Schema.String,
  anchorRect: Schema.optional(Schema.NullOr(Rect)),
  arrowId: Schema.NullOr(Schema.String),
  offsetAsPadding: Schema.Boolean,
  leaveCoordinates: Schema.optional(Schema.Boolean),
  inline: Schema.optional(Schema.Boolean),
  inlineHit: Schema.optional(Schema.NullOr(InlineHit)),
  topLayer: Schema.optional(Schema.Boolean)
})

/**
 * The args of `TrackPosition`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type TrackPositionArgs = typeof TrackPositionArgs.Type

const arrowX = "--ui-kit-arrow-x"
const arrowY = "--ui-kit-arrow-y"

/**
 * Makes the args of `TrackPosition` from a popup's positioning props.
 *
 * **Details**
 *
 * `popup` holds what the component decides:
 *
 * - `side`: the side the popup shows on when its props name none.
 * - `collisionAvoidance`: its default, `popupCollisionAvoidance` when left
 *   out.
 * - `anchorSelector`: a CSS selector for its anchor, which the `anchor` prop
 *   overrides.
 * - `anchorRect`: a rectangle in the viewport to place against instead of
 *   that anchor, which the `anchor` prop also overrides.
 * - `shiftCrossAxis`: see `resolveOptions`. False when left out.
 * - `arrowId`: the id of its arrow, when it draws one.
 * - `offsetAsPadding`: see `TrackPositionArgs`. False when left out.
 * - `leaveCoordinates`: see `TrackPositionArgs`. False when left out.
 * - `inline` and `inlineHit`: see `TrackPositionArgs`. False and `null`
 *   when left out. `inlineHit` is dropped while `props.anchor` gives
 *   another anchor, an element or a rectangle, since the pointer rested on
 *   the popup's own.
 *
 * `topLayer` comes from the props, true when left out.
 *
 * The result is plain data, so a view can also read the defaults from it:
 * `args.options.side` is the side to render before the mount first reports.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const trackArgs = (
  props: PositionerOptions,
  popup: {
    readonly side: Side
    readonly collisionAvoidance?: CollisionAvoidance | undefined
    readonly anchorSelector: string
    readonly anchorRect?: Rect | null | undefined
    readonly shiftCrossAxis?: boolean | undefined
    readonly arrowId?: string | null | undefined
    readonly offsetAsPadding?: boolean | undefined
    readonly leaveCoordinates?: boolean | undefined
    readonly inline?: boolean | undefined
    readonly inlineHit?: InlineHit | null | undefined
  }
): TrackPositionArgs => ({
  options: resolveOptions(props, popup),
  positionMethod: props.positionMethod ?? "absolute",
  collisionBoundary: props.collisionBoundary ?? "clipping-ancestors",
  disableAnchorTracking: props.disableAnchorTracking === true,
  anchorSelector: typeof props.anchor === "string"
    ? idSelector(props.anchor)
    : popup.anchorSelector,
  anchorRect: typeof props.anchor === "object"
    ? props.anchor
    : props.anchor === undefined
    ? popup.anchorRect ?? null
    : null,
  arrowId: popup.arrowId ?? null,
  offsetAsPadding: popup.offsetAsPadding === true,
  leaveCoordinates: popup.leaveCoordinates === true,
  inline: popup.inline === true,
  inlineHit: props.anchor === undefined ? popup.inlineHit ?? null : null,
  topLayer: props.topLayer !== false
})

/**
 * The inline style a positioner needs before `TrackPosition` places it: its
 * `position`, resets of the `inset` and `margin` a browser gives a popover,
 * and `--available-width` and `--available-height` at the viewport's size
 * until the mount measures them.
 *
 * **Details**
 *
 * A headless component puts it after the inline style its consumer gave the
 * positioner, so these declarations win.
 *
 * @stability experimental
 * @category styles
 * @since 0.1.0
 */
export const positionerStyle = (positionMethod: PositionMethod): string =>
  `position:${positionMethod};inset:auto;margin:0;--available-width:100vw;--available-height:100vh`

/**
 * The inline style that puts an arrow where `TrackPosition` measured it:
 * `position: absolute` and a `left` or a `top`, by the side the popup is on.
 * The arrow has to be inside the positioner, and its offset across the
 * popup's edge is left to the consumer's CSS.
 *
 * @stability experimental
 * @category styles
 * @since 0.1.0
 */
export const arrowStyle = (side: Side): string =>
  side === "top" || side === "bottom"
    ? `position:absolute;left:var(${arrowX})`
    : `position:absolute;top:var(${arrowY})`

const zero: Rect = { x: 0, y: 0, width: 0, height: 0 }

const intersect = (a: Rect, b: Rect): Rect => {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  return {
    x,
    y,
    width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x),
    height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y)
  }
}

const clientRect = (element: Element): Rect => {
  const { height, left, top, width } = element.getBoundingClientRect()
  return { x: left, y: top, width, height }
}

const scaleOf = (
  element: Element,
  rect: DOMRect
): { readonly x: number; readonly y: number } => {
  const html = element as HTMLElement
  const x = html.offsetWidth ? rect.width / html.offsetWidth : 1
  const y = html.offsetHeight ? rect.height / html.offsetHeight : 1
  return { x: x || 1, y: y || 1 }
}

const innerRect = (element: Element): Rect => {
  const rect = element.getBoundingClientRect()
  const scale = scaleOf(element, rect)
  return {
    x: rect.left + element.clientLeft * scale.x,
    y: rect.top + element.clientTop * scale.y,
    width: element.clientWidth * scale.x,
    height: element.clientHeight * scale.y
  }
}

const clipping = /auto|scroll|hidden|clip/
const painting = /paint|strict|content/
const containing = /paint|layout|strict|content/
const fixedProperties = [
  "transform",
  "translate",
  "scale",
  "rotate",
  "perspective",
  "filter",
  "backdrop-filter",
  "offset-path"
]
const fixedChanges = new Set([
  ...fixedProperties,
  "offset",
  "offset-position",
  "contain",
  "transform-style"
])

const set = (value: string | undefined, none = "none"): boolean =>
  value !== undefined && value !== "" && value !== none

const paintContained = (style: CSSStyleDeclaration): boolean =>
  painting.test(style.contain) || set(style.contentVisibility, "visible")

const containsFixed = (style: CSSStyleDeclaration): boolean =>
  fixedProperties.some((name) => set(style.getPropertyValue(name))) ||
  style.transformStyle === "preserve-3d" ||
  style.willChange.toLowerCase().split(",").some((name) =>
    fixedChanges.has(name.trim())
  ) ||
  containing.test(style.contain) || paintContained(style)

const contains = (style: CSSStyleDeclaration, position: string): boolean =>
  position === "fixed"
    ? containsFixed(style)
    : position === "absolute"
    ? set(style.position, "static") || containsFixed(style)
    : true

const inTopLayer = (element: Element): boolean =>
  [":popover-open", ":modal"].some((selector) => {
    try {
      return element.matches(selector)
    } catch {
      return false
    }
  })

const clippersOf = (element: Element): Array<Element> => {
  const view = element.ownerDocument.defaultView!
  const root = element.ownerDocument.documentElement
  const clippers: Array<Element> = []
  let position = view.getComputedStyle(element).position
  for (
    let current = inTopLayer(element) ? null : element.parentElement;
    current !== null && current !== root &&
    current !== element.ownerDocument.body;
    current = current.parentElement
  ) {
    const style = view.getComputedStyle(current)
    if (contains(style, position)) {
      if (
        clipping.test(style.overflow + style.overflowX + style.overflowY) ||
        paintContained(style)
      ) {
        clippers.push(current)
      }
      position = style.position
    }
    if (inTopLayer(current)) break
  }
  return clippers
}

const clipOf = (element: Element, viewport: Rect): Rect => {
  let clip = viewport
  for (const clipper of clippersOf(element)) {
    clip = intersect(clip, innerRect(clipper))
  }
  return clip
}

interface Origin {
  readonly x: number
  readonly y: number
  readonly scale: { readonly x: number; readonly y: number }
}

const toLocal = (rect: Rect, origin: Origin): Rect => ({
  x: (rect.x - origin.x) / origin.scale.x,
  y: (rect.y - origin.y) / origin.scale.y,
  width: rect.width / origin.scale.x,
  height: rect.height / origin.scale.y
})

// Where the top layer puts `left: 0; top: 0`, and a positioner in place
// without a containing block of its own. Fixed positioning uses layout
// coordinates, but WebKit's client rects are relative to the visual viewport.
const pageOrigin = (
  view: Window,
  position: string,
  webkit: boolean
): Origin => {
  if (position !== "fixed") {
    return { x: -view.scrollX, y: -view.scrollY, scale: { x: 1, y: 1 } }
  }
  const visual = webkit ? view.visualViewport : null
  return {
    x: -(visual?.offsetLeft ?? 0),
    y: -(visual?.offsetTop ?? 0),
    scale: { x: 1, y: 1 }
  }
}

// The viewport point that `left: 0; top: 0` puts a positioner at, and the
// scale of the box it is measured in: the padding box of its containing
// block, less that block's scroll.
const originOf = (
  element: Element,
  position: string,
  webkit: boolean
): Origin => {
  const document = element.ownerDocument
  const view = document.defaultView!
  for (
    let current = element.parentElement;
    current !== null && current !== document.documentElement;
    current = current.parentElement
  ) {
    const style = view.getComputedStyle(current)
    if (style.display === "contents" || !contains(style, position)) continue
    const rect = current.getBoundingClientRect()
    const scale = scaleOf(current, rect)
    return {
      x: rect.left + (current.clientLeft - current.scrollLeft) * scale.x,
      y: rect.top + (current.clientTop - current.scrollTop) * scale.y,
      scale
    }
  }
  return pageOrigin(view, position, webkit)
}

const sameRect = (a: Rect, b: Rect): boolean =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height

const observeMove = (element: Element, onMove: () => void): () => void => {
  const view = element.ownerDocument.defaultView
  if (view === null || typeof view.IntersectionObserver !== "function") {
    return () => {}
  }
  const root = element.ownerDocument.documentElement
  let observer: IntersectionObserver | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  const cleanup = () => {
    clearTimeout(timer)
    observer?.disconnect()
    observer = null
  }
  const refresh = (skip: boolean, threshold = 1): void => {
    cleanup()
    const before = element.getBoundingClientRect()
    if (!skip) onMove()
    if (!before.width || !before.height) return
    const rootMargin = [
      -Math.floor(before.top),
      -Math.floor(root.clientWidth - (before.left + before.width)),
      -Math.floor(root.clientHeight - (before.top + before.height)),
      -Math.floor(before.left)
    ].map((inset) => inset + "px").join(" ")
    let first = true
    const onIntersect = (entries: Array<IntersectionObserverEntry>) => {
      const ratio = entries[0]!.intersectionRatio
      if (!sameRect(before, element.getBoundingClientRect())) {
        return refresh(false)
      }
      if (ratio !== threshold) {
        if (!first) return refresh(false)
        // Clipped in place: retry slowly so it doesn't loop.
        if (ratio === 0) timer = setTimeout(() => refresh(false, 1e-7), 1000)
        else refresh(false, ratio)
      }
      first = false
    }
    const init = { rootMargin, threshold: clamp(0, threshold, 1) || 1 }
    try {
      observer = new view.IntersectionObserver(onIntersect, {
        ...init,
        root: element.ownerDocument
      })
    } catch {
      observer = new view.IntersectionObserver(onIntersect, init)
    }
    observer.observe(element)
  }
  const onResize = () => refresh(true)
  view.addEventListener("resize", onResize)
  refresh(true)
  return () => {
    view.removeEventListener("resize", onResize)
    cleanup()
  }
}

const written = new WeakMap<HTMLElement, Map<string, string>>()

const sameReport = Schema.toEquivalence(Placement)
const sameArgs = Schema.toEquivalence(TrackPositionArgs)

/**
 * The body of `TrackPosition`: the Stream of a positioner's `Placement`s,
 * which places the positioner as it runs.
 *
 * **Details**
 *
 * An element takes one mount. To do more on the positioner than place it,
 * pass `Mount.makeStream` a body that merges this Stream with its own. The
 * arguments are the ones a body gets: the node, the args and the Stream of
 * later args.
 *
 * @stability experimental
 * @category mounts
 * @since 0.1.0
 */
export const trackPosition = (
  node: HTMLElement,
  args: TrackPositionArgs,
  changes: Stream.Stream<TrackPositionArgs>
): Stream.Stream<Placement> =>
  Stream.callback<Placement>((queue) => {
    const document = node.ownerDocument
    const view = document.defaultView!
    let current = args
    let reported: Placement | null = null
    let owned = written.get(node) ?? new Map<string, string>()

    // WebKit client rects are relative to the visual viewport.
    const webkit = isWebKit(view)

    const viewportOf = (): Rect => {
      const visual = view.visualViewport
      if (visual == null) {
        return {
          x: 0,
          y: 0,
          width: document.documentElement.clientWidth,
          height: document.documentElement.clientHeight
        }
      }
      return {
        x: webkit ? 0 : visual.offsetLeft,
        y: webkit ? 0 : visual.offsetTop,
        width: visual.width,
        height: visual.height
      }
    }

    const boundaryOf = (viewport: Rect): Rect => {
      const boundary = current.collisionBoundary
      if (boundary === "clipping-ancestors") {
        return current.topLayer === false ? clipOf(node, viewport) : viewport
      }
      if ("id" in boundary) {
        const element = rootOf(node).getElementById(boundary.id)
        return element === null
          ? viewport
          : intersect(innerRect(element), viewport)
      }
      return intersect(boundary, viewport)
    }

    const bridged = (side: Physical): number => {
      const value = owned.get("padding-" + side)
      return value !== undefined ? parseFloat(value) : 0
    }

    const popupSize = (): Size => ({
      width: Math.max(0, node.offsetWidth - bridged("left") - bridged("right")),
      height: Math.max(
        0,
        node.offsetHeight - bridged("top") - bridged("bottom")
      )
    })

    const inlineLines = (anchor: Element): Lines | null => {
      if (current.inline !== true) return null
      const lines = linesOf(anchor.getClientRects())
      return lines.lines.length < 2 ? null : lines
    }

    const lineRect = (lines: Lines, side: Physical): Rect => {
      const hit = current.inlineHit ?? null
      const line = hit === null
        ? null
        : hit.line !== null && hit.line < lines.lines.length
        ? hit.line
        : lineAt(lines.lines, hit)
      const { bottom, left, right, top } = inlineEdges(
        lines,
        side,
        line,
        hit !== null
      )
      return { x: left, y: top, width: right - left, height: bottom - top }
    }

    const pass = (popup: Size): void => {
      const virtual = current.anchorRect ?? null
      const root = rootOf(node)
      const anchor = virtual === null
        ? root.querySelector(current.anchorSelector)
        : null
      const arrow = current.arrowId === null
        ? null
        : root.getElementById(current.arrowId)
      const viewport = viewportOf()
      const rtl = view.getComputedStyle(node).direction === "rtl"
      const lines = anchor === null ? null : inlineLines(anchor)
      const origin = current.topLayer === false
        ? originOf(node, current.positionMethod, webkit)
        : pageOrigin(view, current.positionMethod, webkit)
      const input = {
        popup,
        arrow: arrow === null
          ? null
          : { width: arrow.offsetWidth, height: arrow.offsetHeight },
        boundary: toLocal(boundaryOf(viewport), origin),
        anchorClip: toLocal(
          anchor === null ? viewport : clipOf(anchor, viewport),
          origin
        ),
        rtl,
        options: current.options
      }
      const requested = physicalSide(current.options.side, rtl)
      let rawAnchor = virtual ??
        (anchor === null
          ? zero
          : lines === null
          ? clientRect(anchor)
          : lineRect(lines, requested))
      let anchorRect = toLocal(rawAnchor, origin)
      let placed = place({ ...input, anchor: anchorRect })
      const flipped = physicalSide(placed.side, rtl)
      if (lines !== null && flipped !== requested) {
        rawAnchor = lineRect(lines, flipped)
        anchorRect = toLocal(rawAnchor, origin)
        placed = place({ ...input, anchor: anchorRect })
      }
      const side = physicalSide(placed.side, rtl)
      const bridge = current.offsetAsPadding
        ? Math.max(0, current.options.sideOffset)
        : 0
      const dpr = view.devicePixelRatio || 1
      const snap = (start: number, length: number) =>
        (Math.round((start + length) * dpr) - Math.round(start * dpr)) / dpr
      const next = new Map<string, string>([
        [
          "left",
          (placed.x - (side === "right" ? bridge : 0)) + "px"
        ],
        [
          "top",
          (placed.y - (side === "bottom" ? bridge : 0)) + "px"
        ],
        ["--anchor-width", snap(anchorRect.x, anchorRect.width) + "px"],
        ["--anchor-height", snap(anchorRect.y, anchorRect.height) + "px"],
        ["--available-width", placed.availableWidth + "px"],
        ["--available-height", placed.availableHeight + "px"],
        ["--transform-origin", placed.transformOrigin]
      ])
      if (bridge > 0) next.set("padding-" + opposite[side], bridge + "px")
      if (placed.arrow?.x != null) next.set(arrowX, placed.arrow.x + "px")
      if (placed.arrow?.y != null) next.set(arrowY, placed.arrow.y + "px")
      for (const name of owned.keys()) {
        if (!next.has(name)) node.style.removeProperty(name)
      }
      owned = next
      written.set(node, owned)
      const leave = current.leaveCoordinates === true
      for (const [name, value] of owned) {
        if (leave && (name === "left" || name === "top")) continue
        if (node.style.getPropertyValue(name) !== value) {
          node.style.setProperty(name, value)
        }
      }
      const report: Placement = {
        side: placed.side,
        align: placed.align,
        anchorHidden: placed.anchorHidden ||
          (virtual === null && sameRect(rawAnchor, zero)),
        arrowUncentered: placed.arrow?.uncentered ?? false
      }
      if (reported === null || !sameReport(reported, report)) {
        reported = report
        Queue.offerUnsafe(queue, report)
      }
    }

    const update = (): void => {
      const before = popupSize()
      pass(before)
      const after = popupSize()
      if (before.width !== after.width || before.height !== after.height) {
        pass(after)
      }
    }

    const onScroll = (event: Event): void => {
      if (!node.contains(event.target as Node | null)) update()
    }

    const observe = (): () => void => {
      const root = rootOf(node)
      const anchor = current.disableAnchorTracking || current.anchorRect != null
        ? null
        : root.querySelector(current.anchorSelector)
      const controller = new AbortController()
      const { signal } = controller
      const visual = view.visualViewport
      view.addEventListener("resize", update, { signal })
      visual?.addEventListener("resize", update, { signal })
      visual?.addEventListener("scroll", update, { signal })
      if (!current.disableAnchorTracking && current.anchorRect == null) {
        listenTrees(node, "scroll", onScroll, {
          capture: true,
          passive: true,
          signal
        })
      }
      let frame = -1
      const watch = () => sizes?.observe(node, { box: "border-box" })
      const sizes = typeof view.ResizeObserver === "function"
        ? new view.ResizeObserver((entries) => {
          if (entries.some((entry) => entry.target !== node)) {
            // A size the update gives the popup after an observed element resized would be reported as a loop.
            sizes?.unobserve(node)
            view.cancelAnimationFrame(frame)
            frame = view.requestAnimationFrame(watch)
          }
          update()
        })
        : null
      if (anchor !== null) sizes?.observe(anchor)
      const boundary = current.collisionBoundary
      if (boundary === "clipping-ancestors") {
        if (current.topLayer === false) {
          for (const clipper of clippersOf(node)) sizes?.observe(clipper)
        }
      } else if ("id" in boundary) {
        const element = root.getElementById(boundary.id)
        if (element !== null) sizes?.observe(element)
      }
      watch()
      const moves = anchor === null ? () => {} : observeMove(anchor, update)
      return () => {
        controller.abort()
        view.cancelAnimationFrame(frame)
        sizes?.disconnect()
        moves()
      }
    }

    let stop = () => {}
    const start = (): void => {
      stop()
      stop = observe()
      update()
    }
    return Effect.acquireRelease(
      Effect.sync(start).pipe(
        Effect.tap(() =>
          Effect.forkScoped(Stream.runForEach(changes, (next) =>
            Effect.sync(() => {
              if (sameArgs(next, current)) return
              current = next
              start()
            })))
        )
      ),
      () =>
        Effect.sync(() => stop())
    )
  })

/**
 * A stream mount that places a positioner against its anchor and keeps it
 * there while it runs. Issue it on the positioner while the popup shows, and
 * map each `Placement` it reports to a message.
 *
 * **Details**
 *
 * It reports once when it starts, then only when a field of the `Placement`
 * changes, so following a scroll renders nothing. The position itself goes
 * straight to the positioner's inline style. The module's JSDoc lists what
 * it writes and when it measures again.
 *
 * A `Scene` has no layout, so send a `Placement` there with
 * `mounted(Positioning.TrackPosition, placement)`.
 *
 * A `Placement` is a measurement, so a Model that stores one clears it in
 * `restore`: after Back the mount reports it again.
 *
 * **Example** (A hint that stays next to its button)
 *
 * ```ts import.meta.vitest
 * import { Mount, UiSchema, UiStruct } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { Positioning } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const HintMessage = UiSchema.TaggedEnum({ ChangedPlacement: { placement: Positioning.Placement } })
 *
 * const Hint = Html.component({
 *   name: "Hint",
 *   props: Schema.Struct({ open: Schema.Boolean, ...Positioning.PositionerFields }),
 *   model: Schema.Struct({ placement: Schema.NullOr(Positioning.Placement) }),
 *   message: HintMessage,
 *   restore: (model) => UiStruct.evolve(model, { placement: null })
 * }).make({
 *   init: () => ({ placement: null }),
 *   update: {
 *     ChangedPlacement: ($, { placement }) => $.evolve({ placement })
 *   },
 *   view: (h, model) => {
 *     const anchorId = h.id("anchor")
 *     const args = Positioning.trackArgs(h.props, { side: "bottom", anchorSelector: `[id="${anchorId}"]` })
 *     const positioner = h.div
 *       .popover("manual", h.props.open)
 *       .attrs({
 *         style: Positioning.positionerStyle(args.positionMethod),
 *         "data-side": model.placement?.side ?? args.options.side
 *       })
 *       .children("Saved")
 *     return h.span(
 *       h.button.id(anchorId).children("Save"),
 *       h.props.open
 *         ? positioner.onMount(
 *           Positioning.TrackPosition(args).pipe(Mount.map((placement) => HintMessage.ChangedPlacement({ placement })))
 *         )
 *         : positioner
 *     )
 *   }
 * })
 *
 * // Before the mount measures, the positioner has its resets and the requested side.
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Hint, { open: true, sideOffset: 8 }))
 * if (!html.includes("position:absolute;inset:auto;margin:0")) throw new Error("the positioner has no resets")
 * if (!html.includes("data-side=\"bottom\"")) throw new Error("the positioner doesn't name its side")
 * ```
 *
 * @stability experimental
 * @category mounts
 * @since 0.1.0
 */
export const TrackPosition = Mount.makeStream("TrackPosition", {
  args: TrackPositionArgs
}, trackPosition)
