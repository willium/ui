/**
 * Starts an `@effect/ui` app on React Native, without React.
 *
 * Native starts each surface, such as an Android activity's root view, by
 * calling `RN$AppRegistry.runApplication`. {@link register} installs that
 * global, and the rest of what React Native's own startup would: the event
 * emitters native sends device events through, `performance`, and in
 * development the Fast Refresh client.
 *
 * @example
 * ```ts
 * import * as NativeApp from "@effect/ui-native/NativeApp"
 * import { Counter } from "./Counter.ts"
 *
 * NativeApp.register(NativeApp.mount(Counter, {}))
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as dev from "#dev"
import type * as Component from "@effect/ui/Component"
import * as Renderer from "@effect/ui/Renderer"
import type * as View from "@effect/ui/View"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import type * as AsyncResult from "effect/reactivity/AsyncResult"
import type * as Scope from "effect/Scope"
import RCTDeviceEventEmitter from "react-native/Libraries/EventEmitter/RCTDeviceEventEmitter"
import processColor from "react-native/Libraries/StyleSheet/processColor"
import Platform from "react-native/Libraries/Utilities/Platform"
import * as Native from "./Native.ts"
import * as NativeHost from "./NativeHost.ts"

declare const global: any

/**
 * The surface an app was started on, as native passes it.
 *
 * @stability experimental
 * @category services
 * @since 0.1.0
 */
export class Surface extends Context.Service<Surface, {
  readonly appKey: string
  readonly rootTag: number
  readonly initialProps: Readonly<Record<string, unknown>>
}>()("@effect/ui-native/NativeApp/Surface") {}

/**
 * Passes when a root component renders native elements or is host-neutral,
 * and otherwise names the host its vocabulary requires.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type NativeRoot<V> = [Renderer.HostOf<V>] extends [Native.Host] ? unknown
  : {
    readonly "NativeApp.mount shows native elements. This root's vocabulary needs":
      Renderer.HostOf<V>
  }

/**
 * Options accepted by {@link mount} and {@link mountEffect}.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface MountOptions<
  V extends View.Elements,
  RF = never,
  Events = unknown
> {
  /** Receives the root's events in emission order, as for `Renderer.mount`. */
  readonly onEmit?: ((event: Events) => void) | undefined
  readonly fallback?:
    | ((
      failure: AsyncResult.Failure<never, unknown>,
      h: View.WithTags<never, {}, V>
    ) => View.Content<never, RF>)
    | undefined
  readonly query?: Renderer.QueryOptions | undefined
  /** Called after every commit to Fabric. */
  readonly onCommit?: (() => void) | undefined
}

/**
 * Mounts `component` on the current surface for the life of the Scope.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const mountEffect = <
  Name extends string,
  Props,
  Model,
  Msg,
  Events,
  R,
  V extends View.Elements,
  RF = never,
  RP = never
>(
  component:
    & Component.Members<Name, Props, Model, Msg, Events, R, V, any>
    & NativeRoot<V>,
  props: Props | Effect.Effect<Props, never, RP>,
  options?: MountOptions<V, RF, Events> | undefined
): Effect.Effect<
  Renderer.Root<Model, Msg>,
  never,
  Exclude<R | RF | RP, Native.Host> | Surface | Scope.Scope
> =>
  Surface.use((surface) => {
    const made = NativeHost.make({
      ui: global.nativeFabricUIManager,
      rootTag: surface.rootTag,
      os: Platform.OS,
      processColor,
      onCommit: options?.onCommit
    })
    return Effect.provideContext(
      Renderer.mount(component as any, props as any, made.root, options),
      Context.make(Renderer.Renderer, { host: made.host }).pipe(
        Context.add(Native.Host, made.operations)
      )
    )
  }) as any

/**
 * A Layer that mounts `component` on the current surface while it's alive.
 * Pass it to {@link register}.
 *
 * @stability experimental
 * @category layers
 * @since 0.1.0
 */
export const mount = <
  Name extends string,
  Props,
  Model,
  Msg,
  Events,
  R,
  V extends View.Elements,
  RF = never,
  RP = never
>(
  component:
    & Component.Members<Name, Props, Model, Msg, Events, R, V, any>
    & NativeRoot<V>,
  props: Props | Effect.Effect<Props, never, RP>,
  options?: MountOptions<V, RF, Events> | undefined
): Layer.Layer<never, never, Exclude<R | RF | RP, Native.Host> | Surface> =>
  Layer.effectDiscard(mountEffect(component, props, options))

let installed = false

const install = () => {
  if (installed) return
  installed = true
  // Native's requestAnimationFrame reads the frame time from here.
  global.performance ??= { now: global.nativePerformanceNow ?? Date.now }
  const register = (name: string, module: object) =>
    global.RN$registerCallableModule(name, () => module)
  // Native sends device events, such as the keyboard's and the network's,
  // through these. React Native's own emitter keeps its modules working.
  register("RCTDeviceEventEmitter", RCTDeviceEventEmitter)
  register("RCTNativeAppEventEmitter", RCTDeviceEventEmitter)
  register("RCTLog", {
    logIfNoNativeHook(level: string, ...args: ReadonlyArray<unknown>) {
      if (global.nativeLoggingHook !== undefined) return // oxlint-disable-next-line no-console
      ;(level === "error" || level === "fatal" ? console.error : console.log)(
        ...args
      )
    }
  })
  dev.install(register)
}

/**
 * Runs `app` on every surface native starts, from the start until native
 * stops the surface, which closes the Layer's Scope. Call it once, from the
 * module the bundle starts at.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const register = <A>(app: Layer.Layer<A, never, Surface>): void => {
  install()
  const surfaces = new Map<number, Fiber.Fiber<unknown>>()
  const stop = (rootTag: number) => {
    const fiber = surfaces.get(rootTag)
    surfaces.delete(rootTag)
    if (fiber !== undefined) Effect.runFork(Fiber.interrupt(fiber))
  }
  global.RN$AppRegistry = {
    runApplication(
      appKey: string,
      params: {
        readonly rootTag: number
        readonly initialProps?: Readonly<Record<string, unknown>>
      }
    ) {
      stop(params.rootTag)
      surfaces.set(
        params.rootTag,
        Effect.runFork(
          Layer.launch(Layer.provide(
            app,
            Layer.succeed(Surface, {
              appKey,
              rootTag: params.rootTag,
              initialProps: params.initialProps ?? {}
            })
          ))
        )
      )
    },
    setSurfaceProps() {}
  }
  global.RN$stopSurface = stop
}
