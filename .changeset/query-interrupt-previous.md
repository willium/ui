---
"@effect/ui": patch
---

A `queries` entry can set `interruptPrevious: true`: changed args then interrupt the old args' fetch without a `debounce`, for args that change faster than fetches finish, such as a brush or a slider.
