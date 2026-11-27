/// <reference types="vite/client" />
import { layerHttp } from "@effect/ui/html/HtmlServerHttp"
import { Layer } from "effect"
import { document } from "virtual:@effect/ui/document"
import { App, AppRoute, People } from "../../routed.ts"

export default layerHttp(App, {
  routes: AppRoute,
  document,
  base: import.meta.env.BASE_URL
}).pipe(
  Layer.provide(People.layer)
)

export const prerender = [
  AppRoute.print(AppRoute.Home()),
  AppRoute.print(AppRoute.Person({ params: { id: 1 } })),
  "/missing"
]
