/**
 * A union's base, set for the life of a Layer.
 *
 * @internal
 */
import * as Effect from "effect/Effect"
import type * as Scope from "effect/Scope"
import type * as Route from "../Route.ts"

/**
 * The base a union shares with its subsets.
 *
 * @internal
 */
export interface Ref {
  value: string
  /** The base from before the first open scope, then one per open scope. */
  stack?: Array<{ readonly value: string }> | undefined
}

/**
 * Each union's `Ref`, registered when it is built.
 *
 * @internal
 */
export const refs = new WeakMap<object, Ref>()

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
      const ref = refs.get(routes)!
      const stack = ref.stack ??= [{ value: ref.value }]
      routes.setBase(base)
      const entry = { value: ref.value }
      stack.push(entry)
      return () => {
        stack.splice(stack.indexOf(entry), 1)
        ref.value = stack.at(-1)!.value
        if (stack.length === 1) ref.stack = undefined
      }
    }),
    (release) => Effect.sync(release)
  ))
