// @vitest-environment happy-dom
import {
  Command,
  Component,
  MessageLog,
  Query,
  Route,
  Router,
  UiSchema
} from "@effect/ui"
import {
  BrowserHost,
  BrowserRouter,
  Html,
  HtmlHydrate,
  HtmlServer
} from "@effect/ui/html"
import { HtmlLocator } from "@effect/ui/html/testing"
import { assert, expect, it } from "@effect/vitest"
import { Context, Effect, Exit, Layer, Option, Schema, Scope } from "effect"
import { TestClock } from "effect/testing"
import { describe, vi } from "vitest"
import { App, AppRoute, Message, People } from "./fixtures/routed.ts"

const SearchRoute = Route.union({
  Search: Route.make("/search", {
    search: { q: Schema.optional(Schema.String) }
  }),
  Other: Route.make("/other"),
  Page: Route.make("/a/b"),
  NotFound: Route.make("/*")
})

/** A root that holds a route with an optional search. */
const SearchApp = Html.component({
  name: "SearchApp",
  props: Schema.Struct({ route: SearchRoute }),
  model: SearchRoute,
  message: SearchRoute
}).make({
  init: ($) => $.props.route,
  update: (_, route) => route,
  subscriptions: (
    { model: route }
  ) => [Router.subscription(SearchRoute, route, (next) => next)],
  view: (h, route) => h.h1(SearchRoute.print(route))
})

const ListRoute = Route.union({
  List: Route.make("/list", {
    search: {
      q: Schema.optional(Schema.String),
      page: Schema.Number.pipe(Schema.withDecodingDefaultKey(Effect.succeed(1)))
    }
  }),
  Other: Route.make("/other")
})
const ListOnly = ListRoute.subset(["List"])

const ListMessage = UiSchema.TaggedEnum({
  Typed: { value: Schema.String },
  Next: {},
  Patched: {}
})
const patched = Command.map(() => ListMessage.Patched())

/** A page whose search text and page number live in the search only. */
const ListPage = Html.component({
  name: "ListPage",
  props: Schema.Struct({ route: ListOnly }),
  model: Schema.Struct({}),
  message: ListMessage
}).make({
  init: () => ({}),
  update: ($, message) =>
    ListMessage.match(message, {
      Typed: ({ value }) =>
        $.run(
          Router.patchSearch(ListRoute, $.props.route, {
            q: value || undefined
          }).pipe(patched)
        ),
      Next: () =>
        $.run(
          Router.patchSearch(ListRoute, $.props.route, {
            page: $.props.route.search.page + 1
          }, {
            history: "push",
            scroll: true
          }).pipe(patched)
        ),
      Patched: () => $.model
    }),
  view: (h) =>
    h.div(
      h.h1(`List page ${h.props.route.search.page}`),
      h.input.attr("aria-label", "Search").value(h.props.route.search.q ?? "")
        .on("input", ({ value }) => ListMessage.Typed({ value })),
      h.button.on("click", ListMessage.Next()).children("Next"),
      h.a.attr("href", ListRoute.print(ListRoute.List({ search: { page: 2 } })))
        .children("Page 2"),
      h.a.attr("href", "#results").children("Results")
    )
})

/** Holds the route, and keys the list page by its path. */
const ListApp = Html.component({
  name: "ListApp",
  props: Schema.Struct({ route: ListRoute }),
  model: ListRoute,
  message: ListRoute
}).make({
  init: ($) => $.props.route,
  update: (_, route) => route,
  subscriptions: (
    { model: route }
  ) => [Router.subscription(ListRoute, route, (next) => next)],
  view: (h, route) =>
    ListRoute.match(route, {
      List: (route) =>
        ListPage(h, { key: ListRoute.printPath(route), props: { route } }),
      Other: () => h.h1("Other")
    })
})

/** Lets popstate, the render flush, Commands and the announcement frame run. */
const tick = Effect.promise(() =>
  new Promise<void>((resolve) => setTimeout(resolve, 30))
)

const container = Effect.acquireRelease(
  Effect.sync(() => document.body.appendChild(document.createElement("div"))),
  (element) => Effect.sync(() => element.remove())
)

/** Renders `SearchApp` at `url` on the server. */
const prerender = (
  url: string,
  route: typeof SearchRoute.Type,
  isStatic: boolean
) =>
  HtmlServer.renderToHtml(SearchApp, { route }, { static: isStatic }).pipe(
    Effect.provide(Router.static({ routes: SearchRoute, url }))
  )

/** Hydrates a `SearchApp` render from the route of the Router in `context`. */
const hydrate = Effect.fnUntraced(function*(
  context: Context.Context<Router.Services>,
  rendered: HtmlServer.Rendered<unknown>
) {
  const element = yield* container
  element.innerHTML = rendered.html
  const root = yield* Effect.flatMap(
    Router.currentRoute(SearchRoute),
    (route) =>
      HtmlHydrate.hydrateEffect(
        SearchApp,
        { route },
        element,
        rendered.state
      )
  ).pipe(Effect.provideContext(context))
  yield* tick
  return root
})

/** Mounts the app at `url` under a browser Router, for the life of the returned Scope. */
const start = Effect.fnUntraced(
  function*(
    url: string,
    options?: Partial<BrowserRouter.Options>,
    shadow?: ShadowRootMode
  ) {
    window.history.replaceState(null, "", url)
    const host = yield* container
    const app = shadow === undefined
      ? host
      : host.attachShadow({ mode: shadow }).appendChild(
        document.createElement("div")
      )
    const context = yield* Layer.build(
      BrowserRouter.layer({ routes: AppRoute, ...options })
    )
    const router = Context.get(context, Router.Router)
    const root = yield* Effect.flatMap(
      Router.currentRoute(AppRoute),
      (route) => BrowserHost.mountEffect(App, { route }, app)
    )
      .pipe(
        Effect.provide(People.layer),
        Effect.provideContext(context)
      )
    yield* tick
    return { app, root, router }
  }
)

/** The global window, with animation frames that only run when `run` is called. */
const manualFrames = () => {
  const frames = new Map<number, FrameRequestCallback>()
  let next = 0
  const proxy = new Proxy(window, {
    get(target, key) {
      if (key === "requestAnimationFrame") {
        return (f: FrameRequestCallback) => {
          frames.set(++next, f)
          return next
        }
      }
      if (key === "cancelAnimationFrame") {
        return (id: number) => frames.delete(id)
      }
      const value = Reflect.get(target, key)
      return typeof value === "function" ? value.bind(target) : value
    }
  })
  const run = () => {
    const due = [...frames.values()]
    frames.clear()
    for (const f of due) f(0)
  }
  return { window: proxy as Window, run }
}

const link = (app: Element, name: string) =>
  HtmlLocator.getByRole(app, "link", { name })
const submitForm = (app: Element, name: string) => {
  const event = new Event("submit", { bubbles: true, cancelable: true })
  HtmlLocator.getByRole(app, "form", { name }).dispatchEvent(event)
  return event.defaultPrevented
}
const intentsOf = (router: Router.Router) => {
  const intents: Array<string> = []
  const intent = router.intent
  ;(router as { intent: Router.Router["intent"] }).intent = (href) => {
    intents.push(href)
    return intent(href)
  }
  return intents
}
const region = () => document.querySelector("[aria-live=assertive]")
const description = () =>
  document.head.querySelector("meta[name=description]")?.getAttribute("content")

/** Clicks `element`, reporting whether something prevented the browser's default. The default never runs. */
const clickReporting = (element: Element, init?: MouseEventInit) => {
  let prevented = false
  const record = (event: Event) => {
    prevented = event.defaultPrevented
    event.preventDefault()
  }
  window.addEventListener("click", record)
  element.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
      ...init
    })
  )
  window.removeEventListener("click", record)
  return prevented
}

const homeRoute = AppRoute.Home()

/** Prerenders `component` at Home as a hash-routing shell. The `#` base lasts for the Scope. */
const hashShell = Effect.fnUntraced(function*(component: typeof App) {
  AppRoute.setBase("#")
  yield* Effect.addFinalizer(() => Effect.sync(() => AppRoute.setBase("")))
  return yield* HtmlServer.renderToHtml(component, { route: homeRoute }, {
    static: true
  }).pipe(
    Effect.provide(Router.static({ routes: AppRoute, url: "#/" }))
  )
})

/** The hash Router, with the browser at the deep link `/#/people/1`. */
const hashRouter = Effect.suspend(() => {
  window.history.replaceState(null, "", "/#/people/1")
  return Layer.build(BrowserRouter.layerHash({ routes: AppRoute }))
})

describe("BrowserRouter", { concurrent: false }, () => {
  it.effect("hydrates a server render when both sides take their props from their own Router", () => {
    const problems: Array<Query.Problem.Any> = []
    return Effect.gen(function*() {
      const rendered = yield* HtmlServer.renderToHtml(
        App,
        Router.props(AppRoute)
      ).pipe(
        Effect.provide([
          People.layer,
          Router.static({ routes: AppRoute, url: "/people/1" })
        ])
      )
      window.history.replaceState(null, "", "/people/1")
      const app = yield* container
      app.innerHTML = rendered.html
      const heading = app.querySelector("h1")
      yield* Layer.build(
        HtmlHydrate.hydrate(App, Router.props(AppRoute), app, rendered.state)
          .pipe(
            Layer.provide([
              BrowserRouter.layer({ routes: AppRoute }),
              People.layer
            ])
          )
      )
      yield* tick
      assert.strictEqual(app.querySelector("h1"), heading)
      assert.strictEqual(heading?.textContent, "Person 1")
      assert.deepStrictEqual(problems, [])
    }).pipe(
      Effect.provideService(Query.Problems, (problem) => problems.push(problem))
    )
  })

  it.effect("exempts hydrated hash roots, but checks client-only hash roots", () => {
    const problems: Array<Query.Problem.Any> = []
    return Effect.gen(function*() {
      const rendered = yield* hashShell(App)
      const context = yield* hashRouter
      const hydratedContainer = yield* container
      hydratedContainer.innerHTML = rendered.html
      const home = hydratedContainer.querySelector("h1")
      const hydrated = yield* Effect.flatMap(
        Router.currentRoute(AppRoute),
        (route) =>
          HtmlHydrate.hydrateEffect(
            App,
            { route },
            hydratedContainer,
            rendered.state
          )
      ).pipe(Effect.provideContext(context))
      assert.strictEqual(hydratedContainer.querySelector("h1"), home)
      yield* tick
      assert.strictEqual(hydrated.model()?.route._tag, "Person")
      assert.deepStrictEqual(problems, [])
      const clientContainer = yield* container
      const client = yield* BrowserHost.mountEffect(
        App,
        { route: homeRoute },
        clientContainer
      ).pipe(
        Effect.provideContext(context)
      )
      yield* tick
      assert.strictEqual(client.model()?.route._tag, "Person")
      assert.strictEqual(problems.length, 1)
      assert.strictEqual(problems[0]._tag, "RouteMismatch")
    }).pipe(
      Effect.provide(People.layer),
      Effect.provideService(Query.Problems, (problem) => problems.push(problem))
    )
  })

  it.effect("exempts roots hydrated from a static render when only the search differs", () => {
    const problems: Array<Query.Problem.Any> = []
    const search = SearchRoute.Search({ search: {} })
    const mismatches = () =>
      problems.filter((problem) => problem._tag === "RouteMismatch").length
    return Effect.gen(function*() {
      const prerendered = yield* prerender("/search", search, true)
      const dynamic = yield* prerender("/search", search, false)
      const other = yield* prerender("/other", SearchRoute.Other(), true)
      window.history.replaceState(null, "", "/search?q=x")
      const context = yield* Layer.build(
        BrowserRouter.layer({ routes: SearchRoute })
      )

      // Static, search only: no report, and the route is delivered.
      const root = yield* hydrate(context, prerendered)
      assert.deepStrictEqual(
        root.model(),
        SearchRoute.Search({ search: { q: "x" } })
      )
      assert.strictEqual(mismatches(), 0)

      // A dynamic render with another search is the bug the check exists for.
      const fromDynamic = yield* hydrate(context, dynamic)
      assert.deepStrictEqual(
        fromDynamic.model(),
        SearchRoute.Search({ search: { q: "x" } })
      )
      assert.strictEqual(mismatches(), 1)

      // A static render of another path still reports.
      const fromOther = yield* hydrate(context, other)
      assert.deepStrictEqual(
        fromOther.model(),
        SearchRoute.Search({ search: { q: "x" } })
      )
      assert.strictEqual(mismatches(), 2)
    }).pipe(
      Effect.provideService(Query.Problems, (problem) => problems.push(problem))
    )
  })

  it.effect("exempts roots hydrated from a static 404 at another unknown path", () => {
    const problems: Array<Query.Problem.Any> = []
    return Effect.gen(function*() {
      // Captures "a/b", which prints as the path of `Page`.
      const rendered = yield* prerender(
        "/a%2Fb",
        SearchRoute.NotFound({ params: { "*": "a/b" } }),
        true
      )
      // Captures "other/"; the Router strips the trailing slash, giving "/other".
      window.history.replaceState(null, "", "/other%2F/")
      const context = yield* Layer.build(
        BrowserRouter.layer({ routes: SearchRoute })
      )
      const root = yield* hydrate(context, rendered)
      assert.deepStrictEqual(
        root.model(),
        SearchRoute.NotFound({ params: { "*": "other/" } })
      )
      assert.deepStrictEqual(problems, [])
    }).pipe(
      Effect.provideService(Query.Problems, (problem) => problems.push(problem))
    )
  })

  it.effect("checks hash roots that cannot adopt a server Model", () => {
    const problems: Array<Query.Problem.Any> = []
    return Effect.gen(function*() {
      const Deferred = App.pipe(
        Component.provide(People.layer, { server: false })
      )
      const deferred = yield* hashShell(Deferred)
      const rendered = yield* hashShell(App)
      const context = yield* hashRouter
      for (
        const [component, state] of [
          [Deferred, deferred.state],
          [App, {}],
          [App, { ...rendered.state, "/App": null }]
        ] as const
      ) {
        const element = yield* container
        const root = yield* HtmlHydrate.hydrateEffect(
          component,
          { route: homeRoute },
          element,
          state
        ).pipe(
          Effect.provideContext(context)
        )
        yield* tick
        assert.strictEqual(root.model()?.route._tag, "Person")
        assert.strictEqual(
          problems.filter((problem) => problem._tag === "RouteMismatch").length,
          1
        )
        problems.length = 0
      }
    }).pipe(
      Effect.provide(People.layer),
      Effect.provideService(Query.Problems, (problem) => problems.push(problem))
    )
  })

  it.effect("navigates by link, back and forward, and the head and announcement follow", () =>
    Effect.gen(function*() {
      const { app, root } = yield* start("/")
      expect(document.title).toBe("Home · App")
      expect(document.documentElement.getAttribute("lang")).toBe("en")
      expect(document.documentElement.getAttribute("data-eui")).toBe(
        "lang class"
      )
      expect(description()).toBe("Home page")
      // Nothing is announced on first load.
      expect(region()?.textContent).toBe("")

      expect(clickReporting(link(app, "Person 1"))).toBe(true)
      yield* tick
      expect(window.location.pathname).toBe("/people/1")
      expect(root.model()?.route._tag).toBe("Person")
      expect(HtmlLocator.getByRole(app, "heading").textContent).toBe("Person 1")
      expect(document.title).toBe("Person 1 · App")
      expect(description()).toBe("About person 1")
      expect(
        document.head.querySelector(
          "script[type='application/ld+json'][data-eui]"
        )?.textContent
      ).toBe(
        "{\"@type\":\"Person\",\"identifier\":1}"
      )
      expect(region()?.textContent).toBe("Person 1 · App")

      window.history.back()
      yield* tick
      expect(window.location.pathname).toBe("/")
      expect(document.title).toBe("Home · App")
      expect(description()).toBe("Home page")
      expect(document.head.querySelector("script[type='application/ld+json']"))
        .toBeNull()
      expect(region()?.textContent).toBe("Home · App")

      window.history.forward()
      yield* tick
      expect(window.location.pathname).toBe("/people/1")
      expect(document.title).toBe("Person 1 · App")
    }).pipe(Effect.scoped))

  it.effect("clicking the current route notifies subscribers without scrolling, announcing or adding history", () =>
    Effect.gen(function*() {
      const log = MessageLog.makeMemory()
      const { app } = yield* start("/?utm_source=news").pipe(
        Effect.provideService(MessageLog.MessageLog, log)
      )
      const entries = window.history.length
      window.scrollTo(0, 80)
      expect(clickReporting(link(app, "Home"))).toBe(true)
      yield* tick
      expect(window.location.pathname + window.location.search).toBe(
        "/?utm_source=news"
      )
      expect(window.history.length).toBe(entries)
      expect(window.scrollY).toBe(80)
      expect(region()?.textContent).toBe("")
      expect(
        log.entries().flatMap((entry) =>
          entry._tag === "Update" ? [entry.message] : []
        )
      )
        .toEqual([Message.ChangedRoute({ route: homeRoute })])
    }).pipe(Effect.scoped))

  it.effect("repeating Slow after Back preserves the entry's pending scroll restoration", () =>
    Effect.gen(function*() {
      const { app } = yield* start("/slow")
      yield* TestClock.adjust("1 second")
      yield* tick
      window.scrollTo(0, 90)
      clickReporting(link(app, "Home"))
      yield* tick
      expect(window.scrollY).toBe(0)
      window.history.back()
      yield* tick
      expect(window.location.pathname).toBe("/slow")
      window.scrollTo(0, 40)
      clickReporting(link(app, "Slow"))
      yield* tick
      expect(window.scrollY).toBe(40)
      yield* TestClock.adjust("1 second")
      yield* tick
      expect(window.scrollY).toBe(90)
    }).pipe(Effect.scoped))

  it.effect("a redirect reusing its route object announces only after the new visit settles", () =>
    Effect.gen(function*() {
      const frames = manualFrames()
      const slow = AppRoute.Slow()
      const routes = Route.union(
        AppRoute.routes,
        Route.redirect("/old-slow", () => slow)
      )
      const { app, router } = yield* start("/", {
        routes,
        window: frames.window
      })

      yield* router.navigate("/old-slow")
      yield* tick
      yield* TestClock.adjust("1 second")
      yield* tick
      expect(document.title).toBe("Slow · App")

      // Keep the first visit's announcement frame queued across both navigations.
      yield* router.navigate("/")
      yield* router.navigate("/old-slow")
      frames.run()
      expect(region()?.textContent).toBe("")

      yield* tick
      yield* TestClock.adjust("1 second")
      yield* tick
      // A click on this visit, unlike a new visit, preserves its queued announcement.
      clickReporting(link(app, "Slow"))
      yield* tick
      frames.run()
      expect(region()?.textContent).toBe("Slow · App")
    }).pipe(Effect.scoped))

  it.effect("leaves modified clicks, targets, downloads and other origins to the browser", () =>
    Effect.gen(function*() {
      const { app } = yield* start("/")
      const person = link(app, "Person 1")
      expect(clickReporting(person, { ctrlKey: true })).toBe(false)
      expect(clickReporting(person, { metaKey: true })).toBe(false)
      person.setAttribute("target", "_blank")
      expect(clickReporting(person)).toBe(false)
      person.removeAttribute("target")
      person.setAttribute("download", "")
      expect(clickReporting(person)).toBe(false)
      person.removeAttribute("download")
      expect(clickReporting(link(app, "Elsewhere"))).toBe(false)
      yield* tick
      expect(window.location.pathname).toBe("/")
    }).pipe(Effect.scoped))

  it.effect("doesn't follow a routed link whose click handler cancelled the default", () =>
    Effect.gen(function*() {
      window.history.replaceState(null, "", "/")
      yield* Layer.build(BrowserRouter.layer({ routes: AppRoute }))
      const Peek = Html.component({
        name: "Peek",
        model: Schema.Number,
        message: Schema.Literal("Peek")
      }).make({
        init: () => 0,
        update: ($) => $.model + 1,
        view: (h) =>
          h.a.attr("href", "/people/1").on("click", "Peek", {
            preventDefault: true
          }).children("Person 1")
      })
      const app = yield* container
      const root = yield* BrowserHost.mountEffect(Peek, {}, app)
      expect(clickReporting(link(app, "Person 1"))).toBe(true)
      yield* tick
      expect(window.location.pathname).toBe("/")
      expect(root.model()).toBe(1)
    }).pipe(Effect.scoped))

  it.effect("reports link intent after 50 ms of hover or focus, at once on touch, for the links a click follows", () =>
    Effect.gen(function*() {
      const { app, router } = yield* start("/")
      const intents = intentsOf(router)
      const person = link(app, "Person 1")
      const inner = person.appendChild(document.createElement("span"))
      const fire = (
        target: Element,
        type: string,
        relatedTarget: Element | null = null
      ) =>
        target.dispatchEvent(
          new MouseEvent(type, { bubbles: true, relatedTarget })
        )
      // Hover: 50 ms on the Clock. Moving onto an element inside the anchor neither cancels nor restarts.
      fire(person, "mouseover")
      yield* TestClock.adjust("30 millis")
      fire(person, "mouseout", inner)
      fire(inner, "mouseover", person)
      yield* TestClock.adjust("19 millis")
      expect(intents).toEqual([])
      yield* TestClock.adjust("1 millis")
      expect(intents).toEqual(["/people/1"])
      // Leaving the anchor cancels the wait.
      fire(inner, "mouseout", document.body)
      fire(link(app, "Slow"), "mouseover")
      fire(link(app, "Slow"), "mouseout", document.body)
      yield* TestClock.adjust("1 second")
      expect(intents).toEqual(["/people/1"])
      // Focus waits too, and touch doesn't.
      link(app, "Slow").dispatchEvent(
        new FocusEvent("focusin", { bubbles: true })
      )
      yield* TestClock.adjust("50 millis")
      link(app, "Home").dispatchEvent(
        new Event("touchstart", { bubbles: true })
      )
      expect(intents).toEqual(["/people/1", "/slow", "/"])
      // The links a click leaves to the browser show no intent.
      person.setAttribute("target", "_blank")
      person.dispatchEvent(new Event("touchstart", { bubbles: true }))
      person.removeAttribute("target")
      person.setAttribute("download", "")
      person.dispatchEvent(new Event("touchstart", { bubbles: true }))
      person.removeAttribute("download")
      link(app, "Elsewhere").dispatchEvent(
        new Event("touchstart", { bubbles: true })
      )
      expect(intents).toEqual(["/people/1", "/slow", "/"])
    }).pipe(Effect.scoped))

  it.effect("follows a GET form the app has no submit handler for, and leaves handled and POST forms alone", () =>
    Effect.gen(function*() {
      const { app, root } = yield* start("/")
      expect(submitForm(app, "Filter")).toBe(true)
      expect(submitForm(app, "Sign out")).toBe(false)
      yield* tick
      expect(window.location.pathname).toBe("/")
      // A control named `getAttribute` shadows the form's method in a browser.
      // happy-dom reads `id` through it for its own form lookups.
      const search = HtmlLocator.getByRole(app, "form", { name: "Search" })
      Object.defineProperty(search, "getAttribute", {
        value(this: Element, name: string) {
          if (name !== "id") throw new TypeError("getAttribute is shadowed")
          return Element.prototype.getAttribute.call(this, name)
        },
        configurable: true
      })
      const event = new Event("submit", { bubbles: true, cancelable: true })
      search.dispatchEvent(event)
      delete (search as { getAttribute?: unknown }).getAttribute
      expect(event.defaultPrevented).toBe(true)
      yield* tick
      expect(window.location.pathname + window.location.search).toBe(
        "/search?q=ada"
      )
      expect(root.model()?.route._tag).toBe("Search")
      expect(HtmlLocator.getByRole(app, "heading").textContent).toBe(
        "Search ada"
      )
      // The same event dispatched again on a handled form isn't the Router's.
      HtmlLocator.getByRole(app, "form", { name: "Filter" }).dispatchEvent(
        event
      )
      yield* tick
      expect(window.location.search).toBe("?q=ada")
    }).pipe(Effect.scoped))

  it.effect("follows GET forms and reports each composed touch intent once in a closed shadow root", () =>
    Effect.gen(function*() {
      const { app, router } = yield* start("/", {}, "closed")
      const intents = intentsOf(router)
      const touch = new Event("touchstart", { bubbles: true, composed: true })
      link(app, "Person 1").dispatchEvent(touch)
      expect(intents).toEqual(["/people/1"])
      link(app, "Person 1").dispatchEvent(touch)
      expect(intents).toEqual(["/people/1", "/people/1"])
      submitForm(app, "Search")
      yield* tick
      expect(window.location.pathname + window.location.search).toBe(
        "/search?q=ada"
      )
    }).pipe(Effect.scoped))

  it.effect("restores the scroll position on back and forward between #hash entries", () =>
    Effect.gen(function*() {
      const { app, router } = yield* start("/")
      clickReporting(link(app, "Person 2 bio"))
      yield* tick
      // Happy DOM has no layout; make a scroll back to the anchor observable.
      app.querySelector<HTMLElement>("#bio")!.scrollIntoView = () =>
        window.scrollTo(0, 300)
      window.scrollTo(0, 0)
      // Clicking the current #hash again scrolls back to it.
      clickReporting(link(app, "Person 2 bio"))
      yield* tick
      expect(window.scrollY).toBe(300)
      window.scrollTo(0, 100)
      yield* router.navigate("/people/2#top")
      yield* tick
      window.scrollTo(0, 40)
      const announced = region()?.textContent

      window.history.back()
      yield* tick
      expect(window.location.hash).toBe("#bio")
      expect(window.scrollY).toBe(100)
      window.history.forward()
      yield* tick
      expect(window.location.hash).toBe("#top")
      expect(window.scrollY).toBe(40)
      // Traversing entries that differ only by hash announces nothing.
      expect(region()?.textContent).toBe(announced)
    }).pipe(Effect.scoped))

  it.effect("goes to a link's #hash and moves focus there, and to the top for a bare #", () =>
    Effect.gen(function*() {
      const { app } = yield* start("/")
      clickReporting(link(app, "Person 2 bio"))
      yield* tick
      expect(window.location.pathname + window.location.hash).toBe(
        "/people/2#bio"
      )
      const bio = document.getElementById("bio")!
      expect(document.activeElement).toBe(bio)
      expect(bio.getAttribute("tabindex")).toBe("-1")

      const follow = (href: string) => {
        const anchor = app.appendChild(document.createElement("a"))
        anchor.setAttribute("href", href)
        clickReporting(anchor)
        return tick
      }
      // A fragment ending in # isn't bare.
      yield* follow("#bio#")
      expect(window.location.hash).toBe("#bio#")
      window.scrollTo(0, 1500)
      yield* follow("#")
      expect(window.location.href).toBe(`${window.location.origin}/people/2#`)
      expect(window.scrollY).toBe(0)
    }).pipe(Effect.scoped))

  /** Appends `<h2 id="late">` to `app`, as data arriving after load would render it. */
  const renderLate = (app: Element) => {
    const late = app.appendChild(document.createElement("h2"))
    // Happy DOM has no layout; make the scroll to it observable.
    late.scrollIntoView = () => window.scrollTo(0, 300)
    late.id = "late"
    return late
  }

  it.effect("goes to an initial #hash rendered after load and moves focus there", () =>
    Effect.gen(function*() {
      window.scrollTo(0, 0)
      const { app } = yield* start("/people/1#late")
      const late = renderLate(app)
      yield* tick
      expect(window.scrollY).toBe(300)
      expect(document.activeElement).toBe(late)
    }).pipe(Effect.scoped))

  it.effect("leaves a late initial #hash alone once the reader has interacted", () =>
    Effect.gen(function*() {
      window.scrollTo(0, 0)
      const { app } = yield* start("/people/1#late")
      app.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
      const late = renderLate(app)
      yield* tick
      expect(window.scrollY).toBe(0)
      expect(document.activeElement).not.toBe(late)
    }).pipe(Effect.scoped))

  it.effect("stops waiting for a late initial #hash when the hash changes", () =>
    Effect.gen(function*() {
      const disconnect = vi.spyOn(MutationObserver.prototype, "disconnect")
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => disconnect.mockRestore())
      )
      const { router } = yield* start("/people/1#late")
      yield* router.navigate("/people/1#other")
      expect(disconnect).toHaveBeenCalled()
    }).pipe(Effect.scoped))

  it.effect("ignores links and reverts back and forward while blocked", () =>
    Effect.gen(function*() {
      const { app, root } = yield* start("/")
      clickReporting(link(app, "Person 1"))
      yield* tick
      HtmlLocator.click(HtmlLocator.getByRole(app, "button", { name: "Block" }))
      yield* tick
      region()!.textContent = ""

      expect(clickReporting(link(app, "Home"))).toBe(true)
      yield* tick
      expect(window.location.pathname).toBe("/people/1")

      window.history.back()
      yield* tick
      yield* tick
      expect(window.location.pathname).toBe("/people/1")
      expect(root.model()?.route._tag).toBe("Person")
      expect(region()?.textContent).toBe("")
    }).pipe(Effect.scoped))

  it.effect("puts the shell's title back and removes the region when it closes", () =>
    Effect.gen(function*() {
      document.title = "Shell"
      const scope = yield* Scope.make()
      yield* start("/").pipe(Scope.provide(scope))
      expect(document.title).toBe("Home · App")
      expect(region()).not.toBeNull()
      yield* Scope.close(scope, Exit.void)
      yield* tick
      expect(region()).toBeNull()
      expect(document.title).toBe("Shell")
      expect(document.documentElement.hasAttribute("lang")).toBe(false)
      expect(document.documentElement.hasAttribute("data-eui")).toBe(false)
      expect(document.documentElement.classList.contains("routed")).toBe(false)
      expect(document.head.querySelector("[data-eui]")).toBeNull()
    }))

  it.effect("allows one Router per document", () =>
    Effect.gen(function*() {
      yield* Layer.build(BrowserRouter.layer({ routes: AppRoute }))
      const second = yield* Effect.exit(
        Layer.build(BrowserRouter.layer({ routes: AppRoute }))
      )
      expect(Exit.isFailure(second)).toBe(true)
    }).pipe(Effect.scoped))

  describe("quiet navigations", () => {
    /** Mounts the list app at `url`, with a marker in the live region that only a loud navigation clears. */
    const startList = Effect.fnUntraced(function*(url: string) {
      window.history.replaceState(null, "", url)
      const app = yield* container
      const context = yield* Layer.build(
        BrowserRouter.layer({ routes: ListRoute })
      )
      yield* Effect.flatMap(
        Router.currentRoute(ListRoute),
        (route) => BrowserHost.mountEffect(ListApp, { route }, app)
      )
        .pipe(Effect.provideContext(context))
      yield* tick
      region()!.textContent = "marker"
      const field = HtmlLocator.getByRole(app, "textbox", {
        name: "Search"
      }) as HTMLInputElement
      return { app, field }
    })
    const url = () => window.location.pathname + window.location.search

    it.effect("a search patch announces nothing and leaves focus and scroll alone", () =>
      Effect.gen(function*() {
        const { field } = yield* startList("/list?utm_source=news")
        window.scrollTo(0, 50)
        field.focus()
        HtmlLocator.type(field, "ab")
        yield* tick
        expect(url()).toBe("/list?q=ab&utm_source=news")
        expect(document.activeElement).toBe(field)
        expect(window.scrollY).toBe(50)
        expect(region()?.textContent).toBe("marker")
      }).pipe(Effect.scoped))

    it.effect("a quiet push scrolls to the top when asked, and back restores the position, both quietly", () =>
      Effect.gen(function*() {
        const { app, field } = yield* startList("/list")
        const next = HtmlLocator.getByRole(app, "button", { name: "Next" })
        window.scrollTo(0, 80)
        next.focus()
        HtmlLocator.click(next)
        yield* tick
        expect(url()).toBe("/list?page=2")
        expect(HtmlLocator.getByRole(app, "heading").textContent).toBe(
          "List page 2"
        )
        expect(window.scrollY).toBe(0)
        expect(document.activeElement).toBe(next)
        window.scrollTo(0, 30)
        window.history.back()
        yield* tick
        expect(url()).toBe("/list")
        expect(HtmlLocator.getByRole(app, "heading").textContent).toBe(
          "List page 1"
        )
        expect(window.scrollY).toBe(80)
        expect(document.activeElement).toBe(next)
        expect(region()?.textContent).toBe("marker")
        // The page keyed by its path stayed mounted.
        expect(HtmlLocator.getByRole(app, "textbox", { name: "Search" })).toBe(
          field
        )
      }).pipe(Effect.scoped))

    it.effect("throttles the search writes of typing to one per 200 ms, writing the latest", () =>
      Effect.gen(function*() {
        const { app, field } = yield* startList("/list")
        for (const value of ["a", "ab", "abc"]) {
          HtmlLocator.type(field, value)
          yield* tick
        }
        // The page shows the latest search at once; the address bar has the first.
        expect(url()).toBe("/list?q=a")
        expect(
          (HtmlLocator.getByRole(app, "textbox", {
            name: "Search"
          }) as HTMLInputElement).value
        ).toBe("abc")
        yield* TestClock.adjust("199 millis")
        expect(url()).toBe("/list?q=a")
        yield* TestClock.adjust("1 millis")
        expect(url()).toBe("/list?q=abc")
      }).pipe(Effect.scoped))

    it.effect("writes the pending search on pagehide, and stops listening when its Scope closes", () =>
      Effect.gen(function*() {
        const listening = new Set<unknown>()
        const recording = new Proxy(window, {
          get(target, key) {
            if (key === "addEventListener") {
              return (type: string, f: EventListener, options?: unknown) => {
                if (type === "pagehide") listening.add(f)
                target.addEventListener(
                  type,
                  f,
                  options as AddEventListenerOptions
                )
              }
            }
            if (key === "removeEventListener") {
              return (type: string, f: EventListener, options?: unknown) => {
                if (type === "pagehide") listening.delete(f)
                target.removeEventListener(
                  type,
                  f,
                  options as EventListenerOptions
                )
              }
            }
            const value = Reflect.get(target, key)
            return typeof value === "function" ? value.bind(target) : value
          }
        }) as Window
        window.history.replaceState(null, "", "/list")
        yield* Effect.gen(function*() {
          const context = yield* Layer.build(
            BrowserRouter.layer({ routes: ListRoute, window: recording })
          )
          const router = Context.get(context, Router.Router)
          const held = ListOnly.List()
          yield* router.patchSearch(held, { q: "a" })
          yield* router.patchSearch(held, { q: "ab" })
          expect(url()).toBe("/list?q=a")
          expect(listening.size).toBe(1)
          window.dispatchEvent(new Event("pagehide"))
          expect(url()).toBe("/list?q=ab")
        }).pipe(Effect.scoped)
        expect(listening.size).toBe(0)
      }))

    it.effect("writes the pending search before following an in-page #hash link", () =>
      Effect.gen(function*() {
        const { app, field } = yield* startList("/list")
        HtmlLocator.type(field, "a")
        yield* tick
        HtmlLocator.type(field, "ab")
        yield* tick
        expect(url()).toBe("/list?q=a")
        // The link resolves against the document's URL, which must be the Router's.
        expect(clickReporting(link(app, "Results"))).toBe(true)
        yield* tick
        expect(url() + window.location.hash).toBe("/list?q=ab#results")
        expect(
          (HtmlLocator.getByRole(app, "textbox", {
            name: "Search"
          }) as HTMLInputElement).value
        ).toBe("ab")
      }).pipe(Effect.scoped))

    it.effect("a link to its own page's search is loud", () =>
      Effect.gen(function*() {
        const { app } = yield* startList("/list")
        window.scrollTo(0, 80)
        expect(clickReporting(link(app, "Page 2"))).toBe(true)
        yield* tick
        expect(url()).toBe("/list?page=2")
        expect(window.scrollY).toBe(0)
        expect(region()?.textContent).toBe("List page 2")
      }).pipe(Effect.scoped))
  })

  it.effect("keeps the route in the fragment with layerHash", () =>
    Effect.gen(function*() {
      window.history.replaceState(null, "", "/")
      const context = yield* Layer.build(
        BrowserRouter.layerHash({ routes: AppRoute })
      )
      const router = Context.get(context, Router.Router)
      expect(window.location.hash).toBe("#/")
      expect(router.location().route._tag).toBe("Home")
      expect(yield* router.push(AppRoute.Person({ params: { id: 3 } }))).toBe(
        "navigated"
      )
      expect(window.location.pathname + window.location.hash).toBe(
        "/#/people/3"
      )
      expect(Option.getOrThrow(AppRoute.parse("#/people/3"))._tag).toBe(
        "Person"
      )
    }).pipe(
      Effect.scoped,
      Effect.ensuring(Effect.sync(() => AppRoute.setBase("")))
    ))

  it.effect("restores the union's previous base when its Scope closes", () =>
    Effect.gen(function*() {
      window.history.replaceState(null, "", "/docs/people/1")
      yield* Effect.gen(function*() {
        yield* Layer.build(
          BrowserRouter.layer({ routes: AppRoute, base: "/docs/" })
        )
        expect(AppRoute.base()).toBe("/docs/")
        expect(AppRoute.print(AppRoute.Home())).toBe("/docs/")
      }).pipe(Effect.scoped)
      expect(AppRoute.base()).toBe("")
    }))
})
