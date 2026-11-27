---
"@effect/ui": patch
---

Support a non-root Vite `base` in `HtmlServerVite`: pass `import.meta.env.BASE_URL` as the new `base` option of `layerHttp`, and `prerender` paths stay relative to it. A route union's base now keeps its trailing slash for Home, and Router and server Layers restore the previous base when their Scope closes.
