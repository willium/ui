---
"@effect/ui-devtools": patch
"@effect/ui": patch
---

`get_message_schema` returns an example of each message, checked with the dispatch codec and marked `redacted` or `invalid` when it can't be sent as is. Add `MessageLog.redactSchema`, the Schema the log encodes with.
