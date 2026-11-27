/// <reference types="vite/client" />
import { Router } from "@effect/ui"
import { BrowserRouter, HtmlHydrate } from "@effect/ui/html"
import { Effect, Layer } from "effect"
import { App, AppRoute, People } from "../../routed.ts"

HtmlHydrate.hydrate(
  App,
  Router.props(AppRoute),
  document.getElementById("app")!,
  JSON.parse(document.getElementById("state")!.textContent!)
).pipe(
  Layer.provide([
    BrowserRouter.layer({ routes: AppRoute, base: import.meta.env.BASE_URL }),
    People.layer
  ]),
  Layer.launch,
  Effect.runFork
)
