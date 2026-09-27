# Correction: SMG's `load` field does not prove routing-key injection

**Date:** 2026-09-27
**Supersedes:** the "decisive evidence" section of `smg-verified.md` (2026-09-19),
and the open item it created in `HANDOVER-llm-session-header.md` §7.

---

## 1. What was believed

`smg-verified.md` recorded this as proof that the plugin's injected header reaches SMG:

```
SMG /workers:
  18080 (B70)  healthy=True  load=0
  18090 (XTX)  healthy=True  load=1     <- one session assigned here
```

The reasoning was: `load` is the count of **assigned routing keys**, so a non-zero
value can only appear if a routing key was received. The handover then repeated
this as the verification recipe for flipping `debug: false`
("confirm injection still works via SMG's `/workers` `load` counter").

## 2. What is actually true

Sending the *same* routing key repeatedly produces perfectly sticky routing:

```
sticky-alpha -> ['18090','18090','18090','18090']  distinct=['18090']  STICKY
sticky-beta  -> ['18090','18090','18090','18090']  distinct=['18090']  STICKY
sticky-gamma -> ['18090','18090','18090','18090']  distinct=['18090']  STICKY
```

Yet `/workers` reports `load=0` on **both** workers the entire time, checked
immediately after each response and again several seconds later.

This is reproducible **without DSH and without the plugin**: sending
`X-SMG-Routing-Key` straight to SMG with a plain HTTP client also leaves `load=0`
while the response still carries a `x-smg-routed-worker-id` header.

## 3. Why the original reading was wrong

`/workers` exposes exactly **one** `load` field, and it does not distinguish
"assigned routing-key count" from "in-flight request count". On the running image
(`lightseekorg/smg:latest`, digest `sha256:41f57263111d…`, built 2026-09-24) with
`--assignment-mode min_group`, `load` renders the **in-flight request count**,
which returns to zero as soon as a request completes.

The `load=1` observed on 2026-09-19 was therefore most likely a request that
happened to be in flight at the moment of sampling, not a registered sticky
assignment. The two quantities coincided on that occasion, which is what made the
inference look sound.

Live SMG arguments for reference:

```
--policy manual
--assignment-mode min_group
--routing-key-headers X-SMG-Routing-Key
--routing-key-override
--request-timeout-secs 1800
```

## 4. How to verify injection correctly

**Do not use `load`.** Use the response header instead:

```
x-smg-routed-worker-id: http://<worker-host>:<port>
```

Send several requests with the **same** routing key and check that this header
**always names the same worker**. That is stable per-key assignment, which is the
property the plugin exists to provide, and it is directly observable.

- Same worker every time -> sticky routing is working -> the header was received.
- Worker varies across requests -> the key is not driving assignment.

This holds regardless of how `/workers` happens to render `load` on a given build,
which is what makes it the more durable check.

## 5. Impact

- **The plugin is not at fault.** `X-SMG-Routing-Key` is received by SMG and does
  drive per-conversation pinning; the corrected check above confirms it.
- **The acceptance criterion was invalid.** The previous "verified" conclusion
  rested on a coincidental reading, so any decision justified by `load` alone
  should be re-checked against `x-smg-routed-worker-id`.
- The `debug: false` flip does not depend on this counter; it was verified with
  the corrected method.
