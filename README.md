# dsh-llm-session-header

A DeepSeek Harness host plugin that attaches a **stable per-conversation session
header** to model requests routed to configured providers.

The header name is **configurable**, so one plugin serves any backend that
implements conversation-affinity routing via a request header — OpenCode's
`x-opencode-session`, Olla's `X-Olla-Session-ID`, and others.

## Why

Some LLM relays pin every request sharing the same session header value to the
same upstream backend, which keeps the prompt/KV cache warm across the turns of
one conversation. Without the header those relays either reject the request
(OpenCode returns `400 MissingSessionID`) or route each turn to an arbitrary
backend, discarding the cache every turn.

The value only has to be opaque and stable per conversation, so the plugin
reuses the DSH session id that already travels with each model call — the same
identity the official DeepSeek adapter sends as `x-deepseek-harness-session-id`.

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

Each profile row may set a `config`:

```yaml
- insert:
    - id: llm-session-header
      name: dsh-llm-session-header
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
  headerName: X-Olla-Session-ID
  providers: [olla]
```

**A map** — each route names its own header, overriding `headerName`:

```yaml
config:
  providers:
    opencode: x-opencode-session
    opencode-go: x-opencode-session
    olla: X-Olla-Session-ID
```

A list and a map cannot be mixed. The map form is how **one plugin instance
serves multiple backends with different header names**.

### Serving OpenCode and Olla together

```yaml
- insert:
    - id: llm-session-header
      name: dsh-llm-session-header
      config:
        providers:
          opencode: x-opencode-session
          opencode-go: x-opencode-session
          opencode-go-v41: x-opencode-session
          b70-olla: X-Olla-Session-ID
        mode: session-id
```

> **Note:** the `config` of a patch row **replaces wholesale** — it does not
> merge. Restate every key you want to keep.

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
npm test          # unit + real-boot integration
```

The integration test boots the plugin, patches `fetch`, drives a real HTTP
request through a local mock, and asserts per-provider header routing.

## Credits

Derived from [dsh-opencode-session](https://github.com/nobu121/dsh-opencode-session)
by nobu121 (MIT), generalised from a hardcoded header to a configurable one.

## License

MIT
