/**
 * The browser's Router: `window.history` behind the `@effect/ui` Router
 * contract, plus link interception, scroll, route-change announcements and
 * focus.
 *
 * **Details**
 *
 * Provide `layer` (or `layerHash`, for static hosting) next to the host. The
 * root holds the route: mounting it with `Router.props` gives its props the
 * initial one, and `Router.subscription` delivers each change as a message.
 *
 * Links are plain anchors with a printed route. A click is intercepted only
 * when the routes parse its href and it has no modifier key, `target` or
 * `download`. Anything else is a full page load. `<form method="get">` is
 * intercepted by the same test. Following either to the current route sends a
 * message without scrolling to the top, announcing or moving focus. A `#hash`
 * link still scrolls to its target, even when it's the current hash, and a
 * bare `#` stays in the URL and scrolls to the top. Both work the same in a
 * root mounted inside a shadow root, open or closed. An unhandled POST, or a
 * GET targeting another window, submits natively.
 *
 * Once a navigation settles (the first flush after the root received it in
 * which no Layer build begun since is still pending), the router scrolls,
 * announces the page in a live region and moves focus. A push goes to the top
 * or to its `#hash` element, and back and forward restore the saved position.
 * An initial `#hash` element that renders after load is scrolled to and
 * focused once it appears, unless the reader interacts or navigates first.
 * A quiet navigation (see `Router.Settled`), such as `Router.patchSearch`,
 * stays on the page: nothing is announced and focus stays. Back and forward
 * still restore the saved position, and a `patchSearch` given
 * `{ scroll: true }` scrolls to the top.
 *
 * **Example** (A two-page app)
 *
 * ```ts import.meta.vitest
 * import { BrowserHost, BrowserRouter, Html } from "@effect/ui/html"
 * import { Effect, Layer, Schema } from "effect"
 * import { Route, Router, UiSchema } from "@effect/ui"
 * import { TestHost } from "@effect/ui/testing"
 *
 * const AppRoute = Route.union({
 *   Home: Route.make("/"),
 *   Person: Route.make("/people/:id", { params: { id: Schema.Number } }),
 *   NotFound: Route.make("/*")
 * })
 * type AppRoute = typeof AppRoute.Type
 *
 * const Message = UiSchema.TaggedEnum({ ChangedRoute: { route: AppRoute } })
 *
 * const App = Html.component({
 *   name: "App",
 *   props: Schema.Struct({ route: AppRoute }),
 *   model: AppRoute,
 *   message: Message
 * }).make({
 *   init: ($) => $.props.route,
 *   update: (_, message) => message.route,
 *   subscriptions: ({ model }) => [Router.subscription(AppRoute, model, (route) => Message.ChangedRoute({ route }))],
 *   view: (h, route) =>
 *     h.div(
 *       h.a.attr("href", AppRoute.print(AppRoute.Person({ params: { id: 1 } }))).children("Ada"),
 *       h.h1(route._tag)
 *     )
 * })
 *
 * // Router.props reads the initial `{ route }` from the browser Router's URL.
 * const main = (container: Element) =>
 *   BrowserHost.mount(App, Router.props(AppRoute), container).pipe(
 *     Layer.provide(BrowserRouter.layer({ routes: AppRoute })),
 *     Layer.launch
 *   )
 *
 * // Exercise the same component without a browser.
 * await Effect.runPromise(Effect.gen(function*() {
 *   const root = yield* TestHost.mount(App, Router.props(AppRoute))
 *   yield* TestHost.settle
 *   root.model()?._tag // => "Person"
 * }).pipe(
 *   Effect.provide(Router.memory({ routes: AppRoute, url: "/people/1" })),
 *   Effect.scoped,
 *   Effect.provide(TestHost.layer())
 * ))
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import type * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as base from "../internal/base.ts"
import * as services from "../internal/services.ts"
import { decodeComponent } from "../internal/url.ts"
import type * as Route from "../Route.ts"
import * as Router from "../Router.ts"
import * as submit from "./internal/submit.ts"

/** Fixed hover and focus delay before reporting link intent. */
const intentDelay = "50 millis"

/**
 * The least time between two same-page replaces. WebKit throws after 100
 * history calls in 10 seconds, and Chromium and Firefox allow 200 (Chromium
 * drops the rest, Firefox throws). 200 ms is at most 50 replaces in 10
 * seconds, half of WebKit's budget, leaving the rest for pushes and back and
 * forward.
 */
const replaceInterval = "200 millis"

/**
 * The options of `layer`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Options {
  readonly routes: Route.AnyUnion
  /**
   * The base path the routes are relative to, set while the Layer is built.
   * A string is used as it is, such as Vite's `import.meta.env.BASE_URL`. A
   * function is given the first segment of the URL's path at startup and
   * says whether it's the base, as with an i18n prefix like `/en`.
   */
  readonly base?: string | ((segment: string) => boolean) | undefined
  /** Scroll to the top, a `#hash` or the saved position after a navigation. Defaults to `true`. */
  readonly scroll?: boolean | undefined
  /** Announce each navigation in a live region. Defaults to `true`. */
  readonly announce?: boolean | undefined
  /** Move focus after each navigation. Defaults to `true`. */
  readonly focus?: boolean | undefined
  /** The window to run in. Defaults to the global `window`. */
  readonly window?: Window | undefined
}

/**
 * The browser Router, with routes in the URL's path.
 *
 * **Details**
 *
 * There's one per document: building a second fails as a defect, and the
 * claim is released when the Layer's Scope closes.
 *
 * Reports link intent to `Router.prefetch` declarations through `intent`
 * after 50 ms of hover or focus on the Effect `Clock`, or immediately on
 * touch. Only links a click would follow count.
 *
 * Replaces that stay on the page, such as a `Router.patchSearch` per
 * keystroke, are written to `window.history` at most once per 200 ms on the
 * Effect `Clock`, to stay under the browsers' rate limits. The route changes
 * at once; the address bar gets the latest URL at the end of the interval, or
 * before a navigation, a link click, a form submission or `pagehide`.
 *
 * @stability experimental
 * @category layers
 * @since 0.1.0
 */
export const layer = (options: Options): Layer.Layer<Router.Services> =>
  make(options, false)

/**
 * The browser Router for static hosting, with routes in the URL's fragment,
 * as `/#/people/1`.
 *
 * **Details**
 *
 * Parsing and printing work as with `layer`, with the base `"#"`. As the
 * fragment holds the route, there are no in-page `#hash` links. To hydrate a
 * prerendered shell, set `routes.setBase("#")` before rendering on the server
 * with `Router.static` at `"#/"`. Hydration adopts that shell, then delivers
 * the browser route without reporting an initial `RouteMismatch`. Client-only
 * hash roots are still checked.
 *
 * @stability experimental
 * @category layers
 * @since 0.1.0
 */
export const layerHash = (
  options: Omit<Options, "base">
): Layer.Layer<Router.Services> => make(options, true)

const claimed = new WeakSet<Document>()

const make = (
  options: Options,
  inFragment: boolean
): Layer.Layer<Router.Services> =>
  Layer.effectContext(Effect.gen(function*() {
    const window = options.window ?? globalThis.window
    const document = window.document
    if (claimed.has(document)) {
      return yield* Effect.die(
        new Error("BrowserRouter: this document already has a Router")
      )
    }
    claimed.add(document)
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => claimed.delete(document))
    )

    const { routes } = options
    const scroll = options.scroll !== false
    const announce = options.announce !== false
    const focus = options.focus !== false
    const location = window.location
    const history = window.history

    const segment = location.pathname.split("/")[1] ?? ""
    yield* base.scoped(
      routes,
      inFragment
        ? "#"
        : typeof options.base === "function"
        ? segment !== "" && options.base(segment) ? `/${segment}` : ""
        : options.base ?? ""
    )

    /** `url.hash`, but `"#"` for a bare `#`, which `hash` reports as `""`. */
    const hashOf = (url: URL | Location) =>
      url.hash || (url.href.endsWith("#") ? "#" : "")
    const currentUrl = () =>
      inFragment
        ? (location.hash === "" ? "#/" : location.hash)
        : location.pathname + location.search + hashOf(location)

    // --- scroll ------------------------------------------------------------
    const positions = new Map<
      number,
      { readonly x: number; readonly y: number }
    >()
    if (scroll && "scrollRestoration" in history) {
      const previous = history.scrollRestoration
      history.scrollRestoration = "manual"
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => (history.scrollRestoration = previous))
      )
    }
    const target = (hash: string): HTMLElement | null => {
      if (hash.length <= 1) return null
      // A malformed escape, as in `#%`, is matched as written.
      const id = decodeComponent(hash.slice(1)) ?? hash.slice(1)
      return document.getElementById(id) ??
        document.getElementsByName(id)[0] as HTMLElement | undefined ?? null
    }
    const scrollTo = (hash: string) => {
      const element = target(hash)
      if (element !== null) element.scrollIntoView()
      else window.scrollTo(0, 0)
    }

    // --- announcements -----------------------------------------------------
    let region: HTMLElement | undefined
    if (announce) {
      const live = document.createElement("div")
      live.setAttribute("aria-live", "assertive")
      live.setAttribute("aria-atomic", "true")
      live.setAttribute(
        "style",
        "position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0"
      )
      document.body.appendChild(live)
      region = live
      yield* Effect.addFinalizer(() => Effect.sync(() => live.remove()))
    }
    /** Runs `f` on the next frame, and returns a function that cancels it. */
    const nextFrame = (f: () => void): () => void => {
      if (typeof window.requestAnimationFrame === "function") {
        const id = window.requestAnimationFrame(f)
        return () => window.cancelAnimationFrame(id)
      }
      const id = setTimeout(f, 0)
      return () => clearTimeout(id)
    }
    let cancelAnnouncement: (() => void) | undefined
    yield* Effect.addFinalizer(() => Effect.sync(() => cancelAnnouncement?.()))

    // --- focus -------------------------------------------------------------
    const focusOn = (element: HTMLElement) =>
      element.focus({ preventScroll: true })
    const focusTarget = (element: HTMLElement) => {
      if (element.tabIndex < 0 && !element.hasAttribute("tabindex")) {
        element.setAttribute("tabindex", "-1")
      }
      focusOn(element)
    }
    const resetFocus = () => {
      const body = document.body
      if (
        document.activeElement !== null && document.activeElement !== body
      ) return
      const tabindex = body.getAttribute("tabindex")
      body.setAttribute("tabindex", "-1")
      focusOn(body)
      if (tabindex === null) body.removeAttribute("tabindex")
      else body.setAttribute("tabindex", tabindex)
    }

    /** Stops watching for a late initial `#hash` target. */
    let stopWaiting = () => {}

    const onSettled = (settled: Router.Settled) => {
      stopWaiting()
      const { action, hash } = settled.location
      if (settled.quiet) {
        // Within the page: no announcement and no focus move, and scroll only for a pop or when asked.
        if (scroll && settled.scroll) {
          const saved = action === "pop"
            ? positions.get(settled.index)
            : undefined
          window.scrollTo(saved?.x ?? 0, saved?.y ?? 0)
        }
        return
      }
      const container = settled.container as Element
      // Decided in the announcing flush, applied after scroll.
      const autofocus = focus
        ? container.querySelector<HTMLElement>("[autofocus]")
        : null
      const hashTarget = focus && action === "push" && !inFragment
        ? target(hash)
        : null
      if (scroll) {
        if (action === "pop") {
          const saved = positions.get(settled.index)
          window.scrollTo(saved?.x ?? 0, saved?.y ?? 0)
        } else scrollTo(inFragment ? "" : hash)
      }
      if (focus) {
        if (autofocus !== null) focusOn(autofocus)
        else if (hashTarget !== null) focusTarget(hashTarget)
        else resetFocus()
      }
      if (region !== undefined) {
        const live = region
        const text = (settled.title ?? "").trim() ||
          (container.querySelector("h1")?.textContent ?? "").trim() ||
          new URL(settled.location.url, location.href).pathname
        const seq = settled.location.seq
        live.textContent = ""
        cancelAnnouncement?.()
        cancelAnnouncement = nextFrame(() => {
          cancelAnnouncement = undefined
          // A navigation that started before the frame makes this one obsolete.
          if (router.location().seq === seq) live.textContent = text
        })
      }
    }

    // --- history -----------------------------------------------------------
    const browserHistory: Router.History = {
      current: () => ({ url: currentUrl(), state: history.state }),
      push: (url, state) => history.pushState(state, "", url),
      replace: (url, state) => history.replaceState(state, "", url),
      go: (delta) => history.go(delta),
      load: (href) => location.assign(href),
      listen: (popped) => {
        const f = () => popped(currentUrl(), history.state)
        window.addEventListener("popstate", f)
        return () => window.removeEventListener("popstate", f)
      }
    }

    /** Writes a pending same-page replace now. Links and forms resolve against the document's URL. */
    let flushHistory = () => {}
    const routerLayer = Router.make({
      routes,
      history: browserHistory,
      throttle: {
        interval: replaceInterval,
        flushOn: (flush) => {
          flushHistory = flush
          window.addEventListener("pagehide", flush)
          return () => window.removeEventListener("pagehide", flush)
        }
      },
      onSettled,
      onHash: (hash, action, index) => {
        stopWaiting()
        if (!scroll) return
        const saved = action === "pop" ? positions.get(index) : undefined
        if (saved !== undefined) window.scrollTo(saved.x, saved.y)
        else scrollTo(hash)
      },
      onLeave: (index) => {
        positions.set(index, { x: window.scrollX, y: window.scrollY })
      }
    })
    const context = yield* Layer.build(routerLayer)
    const router = Context.get(context, Router.Router)

    // --- late initial #hash ------------------------------------------------
    // Browsers only go to the fragment during load, so watch for a target rendered later. The
    // location check covers a navigation that renders before it settles.
    const initial = router.location()
    if (
      !inFragment && (scroll || focus) && initial.hash.length > 1 &&
      target(initial.hash) === null
    ) {
      const view = window as Window & typeof globalThis
      const listening = new view.AbortController()
      const stop = () => {
        stopWaiting = () => {}
        observer.disconnect()
        listening.abort()
      }
      const observer = new view.MutationObserver(() => {
        if (router.location() !== initial) return stop()
        const element = target(initial.hash)
        if (element === null) return
        stop()
        if (scroll) element.scrollIntoView()
        if (focus) focusTarget(element)
      })
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["id", "name"]
      })
      stopWaiting = stop
      for (const type of ["pointerdown", "keydown", "wheel", "touchstart"]) {
        window.addEventListener(type, stop, {
          capture: true,
          passive: true,
          signal: listening.signal
        })
      }
      yield* Effect.addFinalizer(() => Effect.sync(stop))
    }

    // --- interception ------------------------------------------------------
    /** The href the routes see for an absolute URL, or undefined when it leaves this app. */
    const local = (url: URL): string | undefined => {
      if (url.origin !== location.origin) return undefined
      if (!inFragment) return url.pathname + url.search + hashOf(url)
      return url.pathname === location.pathname &&
          url.search === location.search && url.hash !== ""
        ? url.hash
        : undefined
    }
    const follow = (event: Event, href: string | undefined) => {
      if (href === undefined || Option.isNone(routes.parse(href))) return
      event.preventDefault()
      Effect.runSync(router.navigate(href))
    }
    /** The nearest anchor with an `href` on the event's path. */
    const anchorOf = (event: Event): Element | undefined =>
      event.composedPath().find((node): node is Element =>
        "localName" in node && (node as Element).localName === "a" &&
        (node as Element).hasAttribute("href")
      )
    /** The href a click on `anchor` would follow, or undefined when the browser keeps it. */
    const hrefOf = (anchor: Element): string | undefined => {
      const targetAttribute = anchor.getAttribute("target")
      if (
        (targetAttribute !== null && targetAttribute !== "" &&
          targetAttribute !== "_self") ||
        anchor.hasAttribute("download")
      ) return undefined
      const href = local(
        new URL(anchor.getAttribute("href")!, document.baseURI)
      )
      return href === undefined || Option.isNone(routes.parse(href))
        ? undefined
        : href
    }
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return
      if (
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
      ) return
      const anchor = anchorOf(event)
      if (anchor === undefined) return
      flushHistory()
      follow(event, hrefOf(anchor))
    }

    // --- intent ------------------------------------------------------------
    // Hover and focus count after 50 ms on the Effect Clock, touch at once. Moving between elements
    // inside one anchor neither cancels nor restarts the wait.
    const intentContext = yield* Effect.context<never>()
    let intended: Element | undefined
    let waiting: Fiber.Fiber<void> | undefined
    const cancelIntent = () => {
      intended = undefined
      waiting?.interruptUnsafe()
      waiting = undefined
    }
    const onEnter = (event: Event) => {
      const anchor = anchorOf(event)
      if (anchor === intended) return
      cancelIntent()
      if (anchor === undefined) return
      intended = anchor
      const href = hrefOf(anchor)
      if (href === undefined) return
      waiting = Effect.runForkWith(intentContext)(
        Effect.andThen(
          Effect.sleep(intentDelay),
          Effect.suspend(() => {
            waiting = undefined
            return router.intent(href)
          })
        )
      )
    }
    const onLeave = (event: FocusEvent | MouseEvent) => {
      if (intended === undefined) return
      const next = event.relatedTarget
      if (
        next !== null && "nodeType" in next && intended.contains(next as Node)
      ) return
      cancelIntent()
    }
    const onTouch = (event: TouchEvent) => {
      cancelIntent()
      const anchor = anchorOf(event)
      const href = anchor === undefined ? undefined : hrefOf(anchor)
      if (href !== undefined) Effect.runSync(router.intent(href))
    }
    const onSubmit = (event: SubmitEvent) => {
      const ownedUnhandled = submit.ownedUnhandled.has(event)
      if (event.defaultPrevented && !ownedUnhandled) return
      const form = event.target as HTMLFormElement | null
      if (form === null || form.localName !== "form") return
      flushHistory()
      const submitter = event.submitter as HTMLButtonElement | null
      if (submit.kindOf(form, submitter) !== "get") return
      const action = submitter?.getAttribute("formaction") ??
        submit.attribute(form, "action") ?? ""
      const url = new URL(action, document.baseURI)
      const data = new FormData(form, submitter ?? undefined)
      const search = new URLSearchParams()
      for (const [name, value] of data) {
        if (typeof value === "string") search.append(name, value)
      }
      url.search = search.toString()
      url.hash = ""
      const href = local(url)
      // The host already stopped the browser's submission, so the Router makes it: a full page
      // load for anything the routes don't parse.
      if (ownedUnhandled) {
        Effect.runSync(
          href !== undefined ? router.navigate(href) : router.load(url.href)
        )
      } else follow(event, href)
    }
    const handled = new WeakSet<Event>()
    const begin = (event: Event) => {
      handled.delete(event)
    }
    const once = <E extends Event>(f: (event: E) => void) => (event: E) => {
      if (handled.has(event)) return
      handled.add(event)
      f(event)
    }
    const listeners: ReadonlyArray<
      readonly [string, (event: any) => void, AddEventListenerOptions?]
    > = [
      ["click", once(onClick)],
      ["submit", once(onSubmit)],
      ["mouseover", once(onEnter)],
      ["focusin", once(onEnter)],
      ["mouseout", once(onLeave)],
      ["focusout", once(onLeave)],
      ["touchstart", once(onTouch), { passive: true }]
    ]
    const listen = (target: EventTarget) => {
      for (const [type, f, options] of listeners) {
        target.addEventListener(type, begin, { capture: true, passive: true })
        target.addEventListener(type, f, options)
      }
    }
    const unlisten = (target: EventTarget) => {
      for (const [type, f] of listeners) {
        target.removeEventListener(type, begin, true)
        target.removeEventListener(type, f)
      }
    }
    const shadows = new Map<ShadowRoot, number>()
    listen(document)
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        cancelIntent()
        unlisten(document)
        for (const shadow of shadows.keys()) unlisten(shadow)
      })
    )

    const hooks = Context.getUnsafe(context, services.RootHooks)
    return Context.add(context, services.RootHooks, {
      ...hooks,
      attach: (root) => {
        const detach = hooks.attach(root)
        const node = (root.container as Partial<Node>).getRootNode?.()
        if (node === undefined || !("host" in node)) return detach
        const shadow = node as ShadowRoot
        const count = shadows.get(shadow) ?? 0
        if (count === 0) listen(shadow)
        shadows.set(shadow, count + 1)
        return () => {
          detach()
          const count = shadows.get(shadow)!
          if (count > 1) shadows.set(shadow, count - 1)
          else {
            shadows.delete(shadow)
            unlisten(shadow)
          }
        }
      }
    })
  }))
