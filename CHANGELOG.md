# Changelog

All notable changes to this project are documented here. The format loosely
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.1] — 2026-09-29

### Changed

- **First release published through CI, with provenance.** 0.3.0 was uploaded with a
  long-lived token, so it carries no sigstore attestation; 0.3.1 and later are published by
  the `Publish to npm` GitHub Actions workflow over npm Trusted Publishing (OIDC) and are
  signed. No runtime change from 0.3.0 — the tree is identical, so this is a patch purely to
  hand the release process over to CI.

## [0.3.0] — 2026-09-29

### Added

- **Declared the supported harness generations** as a peer dependency on
  `@deepseek-ai/dsh-llm` — the package that provides the `llm` service this plugin
  `inject`s, and the one whose version tracks the harness release exactly:

  ```json
  "@deepseek-ai/dsh-llm": "^0.1.7-rc.2 || >=0.2.0-rc.1 <0.2.1-0"
  ```

  That is `>=0.1.7-rc.2 <0.2.0-0 || >=0.2.0-rc.1 <0.2.1-0`: the 0.1.7 line and the whole
  0.2.0 line (rc.1, rc.2 and the final), and **not** 0.2.1+ or 0.3+. Both ends are
  versions this plugin was actually verified against. Marked `optional`, so mounting
  it never depends on npm resolving the harness family — dsh provides these itself.

### Fixed

- **The settings card moved off `plugins.item` onto `plugins.row.config`**, keyed
  `dsh-llm-session-header#llm-session-header`. The page's slot contract marks
  `plugins.item` as *"OCCUPIED by the official settings pages, one companion
  package per host-plane namespace; a bundle's configuration belongs in
  `plugins.bundle.config` or `plugins.row.config` instead"*. As a third-party
  bundle we were squatting the official list — the card showed up under
  **Official**, which mislabelled it. It now appears where it belongs: the
  `llm-session-header` component on our own bundle's page gains a **Configure**
  button. (`plugins.row.config` rather than the `plugins.bundle.config` that was
  suggested: the latter is keyed by package name for a *bundle-level* config and
  is rendered with `view: 'page'` and **no `form`**, whereas our settings
  namespace is the row id, so the row is the true owner.)
  Verified rendering and a save-to-disk round trip on both dsh **0.1.7-rc.2** and
  **0.2.0-rc.2**, whose slot contracts are byte-identical.
- Dropped the now-dead `title` dictionary key: a keyed slot takes its heading
  from the bundle patch, not from a slot `label`.

### Verified

- **dsh `0.2.0-rc.2` compatibility — no changes required.** Audited every surface this plugin
  depends on. Byte-identical between 0.1.7-rc.2 and 0.2.0-rc.2: `dsh-llm` (the `llm/stream`
  waterfall contract), `dsh-settings`, `dsh-api-settings-controller`, `dsh-client-ui-settings`,
  `dsh-client-locale`. Only `dsh-client-ui-primitives` and `dsh-client-ui-plugin-manager`
  moved, and the card renders correctly on the new ones.
- Confirmed in an isolated 0.2.0 instance: the card renders every control, a save **persists to
  the profile patch**, and a route added through the card *after* activation injects its header
  on the next model call — verified on the wire at a header-recording mock.
- Added `tests/compat-0.2.mjs`: validates the schema against a 0.2.0 install's schemastery,
  asserts every field is a live volatile handle, asserts the write seam accepts a real boolean
  and rejects a string, and proves an in-place save reaches the next resolve. Run it against a
  specific install with `DSH_020=<prefix> npm run test:0.2`.

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

[0.3.1]: https://github.com/snailium/dsh-llm-session-header/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/snailium/dsh-llm-session-header/releases/tag/v0.3.0
[0.2.0]: https://github.com/snailium/dsh-llm-session-header/releases/tag/v0.2.0
[0.1.0]: https://github.com/snailium/dsh-llm-session-header/releases/tag/v0.1.0
