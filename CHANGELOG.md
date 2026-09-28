# Changelog

All notable changes to this project are documented here. The format loosely
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] — 2026-09-28

Verified against **dsh 0.1.7-rc.2** (session format 4).

### Added

- **A settings card on the Plugins page** (`Plugins → Session Header
  Injection`), which makes the whole route table editable without YAML:
  the default header name, the value mode, the debug flag, and the route
  rows themselves (add, edit, remove). The card is the browser half
  (`lib/client.js`), registered into the `plugins.item` slot behind
  `configForms.whileServed(["llm-session-header"])`.
- **Live config updates without a restart.** Every schema field is declared
  `.volatile()`, so the Host rewrites the existing config reference in place
  rather than remounting the plugin fiber; the route table is re-resolved on
  every `llm/stream` call. A route added in the UI starts receiving its header
  on the very next model call.
- `tests/config-update.test.mjs` covering the volatile read path.
- `test/compat/mock-llm.py`, a dependency-free mock model server used to prove
  end-to-end injection over real HTTP.

### Changed

- **Packaging aligned with the dsh client-bundle contract**: the client half
  now lives at `lib/client.js` and is exported as `exports["./client"]`, which
  is how the Host discovers and serves it. Previously it sat at `client/ui.js`
  with no export entry and could never have been served.
- `@deepseek-ai/schemastery` is now a declared (optional) peer dependency and a
  dev dependency, mirroring the working reference plugins. The Host identifies
  a plugin's schema by its `~standard.vendor` string, not by object identity,
  so a plugin-local copy is safe.
- The host half imports schemastery statically instead of through a guarded
  dynamic import that silently degraded to "no settings card".
- `engines.node` is now `^22.19 || >=24`, matching the dsh runtime.

### Fixed

- The host half no longer reads a non-existent `ctx.onConfigUpdate`, which threw
  `cannot get property "onConfigUpdate" without inject` during activation and
  prevented the plugin from loading at all.
- A route row left with a blank header is written as the configured default
  header instead of an empty string, so saving the list form no longer pins
  routes to `""`.
- `providers` schema is wrapped in a single volatile field: schemastery rejects
  a volatile field nested inside another (`volatile fields require a fixed
  object path without an enclosing volatile field`).

## [0.1.0] — 2026-09-27

### Added

- Initial release: a host plugin that attaches a stable per-conversation session
  header to model requests routed to configured providers, generalised from
  `dsh-opencode-session` to a configurable header name so one plugin serves
  OpenCode (`x-opencode-session`), SMG (`X-SMG-Routing-Key`) and any other
  header-based affinity router.
- `providers` accepts a list (one header for all routes) or a map (a header per
  route).
- `mode`: `session-id` reuses the DSH session id; `uuid` derives a
  process-stable random uuid per session.
- `debug` / `debugFile` diagnostics.

[0.2.0]: https://github.com/snailium/dsh-llm-session-header/releases/tag/v0.2.0
[0.1.0]: https://github.com/snailium/dsh-llm-session-header/releases/tag/v0.1.0
