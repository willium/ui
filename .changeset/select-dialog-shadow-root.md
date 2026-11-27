---
"@effect/ui-kit": patch
---

Resolve `Select`, `Dialog`, and `Positioning` part lookups in the node's own root (document or shadow root) and listen across ancestor trees for outside pointer, focus, and keyboard interactions, fixing click-to-open, popup placement, keyboard navigation, and modal outside dismissal inside shadow roots.
