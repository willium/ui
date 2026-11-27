/**
 * A union's base, set for the life of a Layer.
 *
 * @internal
 */
import * as Effect from "effect/Effect"
import type * as Scope from "effect/Scope"
import type * as Route from "../Route.ts"

interface Entry {
  readonly base: string
}

/** Each union's base from before its first open scope, then one per open scope. */
const stacks = new WeakMap<Route.AnyUnion, Array<Entry>>()

/**
 * Sets the base of `routes` until the Scope closes. Scopes can close in any
 * order, as when a dev server reloads its entry, and the newest open one's
 * base stays.
 *
 * @internal
 */
export const scoped = (
  routes: Route.AnyUnion,
  base: string
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.asVoid(Effect.acquireRelease(
    Effect.sync(() => {
      const stack = stacks.get(routes) ?? [{ base: routes.base() }]
      stacks.set(routes, stack)
      const entry: Entry = { base }
      stack.push(entry)
      routes.setBase(base)
      return () => {
        stack.splice(stack.indexOf(entry), 1)
        routes.setBase(stack.at(-1)!.base)
        if (stack.length === 1) stacks.delete(routes)
      }
    }),
    (release) => Effect.sync(release)
  ))
