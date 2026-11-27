import * as Component from "@effect/ui/Component"

interface Family {
  readonly first: Component.Any
  next: Component.Any
}

type Swap = (
  first: object,
  next: object,
  names: ReadonlyArray<string>
) => boolean

const swapKey = Symbol.for("@effect/ui/hot/swap")

/**
 * The refresh runtime Metro's module system looks for at `__ReactRefresh`,
 * for `@effect/ui` components.
 */
export const make = (options: {
  readonly reload: (reason: string) => void
  readonly refreshed: () => void
}) => {
  const families = new Map<string, Family>()
  const familyOf = new WeakMap<object, Family>()
  const changed = new Map<string, Family>()
  return {
    isLikelyComponentType: Component.isComponent,
    register(type: unknown, id: string) {
      // Metro registers each export as `<module> %exports% <name>`. The other
      // ids come from React's Babel plugin, and name the same values.
      if (!id.includes(" %exports% ") || !Component.isComponent(type)) return
      const family = families.get(id)
      if (family === undefined) {
        const made = { first: type, next: type }
        families.set(id, made)
        familyOf.set(type, made)
      } else if (family.next !== type) {
        family.next = type
        familyOf.set(type, family)
        changed.set(id, family)
      }
    },
    getFamilyByType: (type: unknown) =>
      typeof type === "function" ? familyOf.get(type) : undefined,
    createSignatureFunctionForTransform: () => (type: unknown) => type,
    performReactRefresh() {
      if (changed.size === 0) return
      const first: Record<string, unknown> = {}
      const next: Record<string, unknown> = {}
      for (const [id, family] of changed) {
        first[id] = family.first
        next[id] = family.next
      }
      const names = [...changed.keys()]
      changed.clear()
      const swap = (globalThis as Record<symbol, unknown>)[swapKey] as
        | Swap
        | undefined
      // With nothing mounted, the next mount runs the new code.
      if (swap === undefined || swap(first, next, names)) options.refreshed()
      else {options.reload(
          "Fast Refresh: a component changed in a way it can't swap"
        )}
    },
    performFullRefresh: options.reload
  }
}
