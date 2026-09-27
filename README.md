# dsh-llm-session-header

A DeepSeek Harness host plugin that attaches a **stable per-conversation session
header** to model requests routed to configured providers.

The header name is **configurable**, so one plugin serves any backend that
implements conversation-affinity routing via a request header — SMG's
`X-SMG-Routing-Key`, OpenCode's `x-opencode-session`, and others.

## Why

Some LLM relays pin every request sharing the same session header value to the
same upstream backend, which keeps the prompt/KV cache warm across the turns of
one conversation. Without the header those relays either reject the request
(OpenCode returns `400 MissingSessionID`) or route each turn to an arbitrary
backend, discarding the cache every turn.

The value only has to be opaque and stable per conversation, so the plugin
reuses the DSH session id that already travels with each model call — the same
identity the official DeepSeek adapter sends as `x-deepseek-harness-session-id`.

### Why the header is injected rather than derived

A relay's alternative to an explicit key is deriving stickiness from a **prefix
hash** of the prompt. That approach **does not work for DSH**, and it was
verified experimentally rather than assumed: DSH sends a large *shared system
prompt*, so distinct sessions hash to the same value and pin to the same
backend. Extending the hashed prefix cannot fix it, because the shared preamble
*is* the hash input.

The plugin is therefore not an optimisation on top of a working router — it is
what makes per-conversation pinning work at all.

## Install

```bash
dsh plugin --profile <profile> add dsh-llm-session-header
```

Or from a local checkout:

```bash
dsh plugin --profile <profile> add /abs/path/to/dsh-llm-session-header
```

The package declares `dsh.bundle`, so `dsh plugin add` reconciles it into
`dsh.profile.bundles` automatically and it becomes a profile layer. **Restart
dsh once** for the change to take effect.

On boot you should see:

```
[llm-session-header] active for providers [opencode=x-opencode-session] with mode session-id
```

## Configuration

The row above is inserted by this package's own bundle layer with the defaults
shown. A profile customises it with an **id-targeted `config` override**, never
a second `insert`:

```yaml
- id: llm-session-header
  config:
    headerName: x-opencode-session   # default
    providers: [opencode, opencode-go]
    mode: session-id
    debug: false
```

| Field | Default | Meaning |
|---|---|---|
| `headerName` | `x-opencode-session` | Header to attach when `providers` is a list |
| `providers` | `[opencode, opencode-go]` | Which route keys get a header, and which header |
| `mode` | `session-id` | `session-id` reuses the DSH session id; `uuid` derives a process-stable uuid |
| `debug` | `false` | Log every streamed call that receives a header |
| `debugFile` | — | Append one JSON line per injected call to this path |

### `providers` accepts two shapes

**A list** — every listed route gets `headerName`:

```yaml
config:
  headerName: X-SMG-Routing-Key
  providers: [b70-smg]
```

**A map** — each route names its own header, overriding `headerName`:

```yaml
config:
  providers:
    opencode: x-opencode-session
    opencode-go: x-opencode-session
    b70-smg: X-SMG-Routing-Key
```

A list and a map cannot be mixed. The map form is how **one plugin instance
serves multiple backends with different header names**. It is also what makes
swapping the router behind a route a one-line config change:

```diff
-      b70-olla: X-Olla-Session-ID
+      b70-smg: X-SMG-Routing-Key
```

### Serving OpenCode and SMG together

The map form is what the production profile actually uses — one row covering
every route, each with the header name its own backend expects:

```yaml
- id: llm-session-header
  config:
    headerName: x-opencode-session
    providers:
      opencode: x-opencode-session
      opencode-go: x-opencode-session
      opencode-go-v41: x-opencode-session
      b70-smg: X-SMG-Routing-Key
    mode: session-id
    debug: false
```

> **Note:** the `config` of a patch row **replaces wholesale** — it does not
> merge. Restate every key you want to keep, `headerName` included.

> **Do not `insert` this row from a profile patch.** The package ships its own
> `dsh.bundle` layer that already inserts the `llm-session-header` row, so a
> second `insert` at the profile layer produces a **duplicate row id and a boot
> failure**. Use the id-targeted `config` form above, exactly as shown.

### Verifying the deployed composition

```bash
dsh --profile <profile> --dump-config | grep -A11 "id: llm-session-header"
```

Expect exactly **one** row, carrying `name: dsh-llm-session-header`.

## How it works

1. **`llm/stream` waterfall** — calls whose `options.provider` is a configured
   route and which carry a `sessionId` are wrapped.
2. **AsyncLocalStorage** — the header name and value are held in an ALS store.
   The plugin wraps the downstream iterator so every pull executes inside
   `als.run(...)`, which is what makes the value visible to the code that
   eventually issues the HTTP request.
3. **`globalThis.fetch` patch** — patched once, fiber-scoped via `ctx.effect`.
   While a store is active it merges `<headerName>: <value>` into the outgoing
   request headers. An existing header of that name always wins.

On plugin stop/update/unload the listener is removed and the original `fetch`
restored.

Requests that are not routed to a configured provider, requests with no
`sessionId`, and model-discovery requests pass through untouched.

## Verifying a live deployment

The header is *injected* into an outgoing request, so a passing unit test is not
proof that a deployed router is receiving it. Check the router's own state.

With SMG, `GET <smg>/workers` reports a non-zero `load` per worker — the count of
routing keys currently assigned to it. `load` can only become non-zero if a
routing key was actually received, which makes it a direct end-to-end check:

```bash
curl -s http://<smg-host>:40114/workers | python3 -m json.tool
```

A response that shows `"load": 0` on every worker while sessions are streaming
means the header is **not** arriving. SMG also echoes `X-SMG-Routed-Worker-Id`
on responses, which identifies which backend served a given request.

## Notes and limitations

- **Provider keys are matched case-sensitively** against `options.provider`.
  A custom route key must be listed explicitly — it is not inferred.
- **The model-listing flow (`GET <baseURL>/models`) does not receive the
  header.** It is a separate code path and is not session-scoped.
- **The plugin relies on DSH outbound LLM requests going through Node's global
  `fetch`.** If a future dsh version changes its network stack, injection stops
  (symptom: the upstream rejection returns).
- **Only one `llm/stream` listener is registered per plugin instance.** Do not
  mount two rows of this plugin with overlapping provider sets — the outer
  wrapper would win and inner configuration would be ignored. Use one row with
  the map form instead.

## Development

```bash
npm test
```

| Layer | File | What it proves |
|---|---|---|
| Unit | `tests/test.mjs` | Config resolution, value modes, fetch injection, stream wrapping |
| Integration | `tests/integration.mjs` | Real `fetch` patch + **real HTTP** to a local mock; per-route headers |
| Coexistence | `tests/coexistence.mjs` | Byte-parity with the original, and both mounted together |

The integration test boots the plugin, patches `fetch`, drives a real HTTP
request through a local mock, and asserts per-route header routing. It covers
the shipping `b70-smg` route by name, plus `x-opencode-session` parity.

> **Never point a test at production DSH.** Use an isolated `DSH_HOME` under a
> **durable** path (not `/tmp`, which can be swept between commands), and set it
> in the *same* shell invocation as the command:
>
> ```bash
> ISO=~/dsh-build/iso-home
> DSH_HOME="$ISO" dsh plugin --profile boot-test add /abs/path/to/this/plugin
> ```
>
> If the variable is lost, `DSH_HOME` silently falls back to `~/.dsh` and the
> command writes to the production profile. Verify isolation afterwards.

## Credits

Derived from [dsh-opencode-session](https://github.com/nobu121/dsh-opencode-session)
by nobu121 (MIT), generalised from a hardcoded header to a configurable one.

## License

MIT
