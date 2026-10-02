// dsh-llm-session-header — client half (settings card)
//
// Self-contained module-loader bundle for the Plugins page under dsh 0.1.7 and
// 0.2.0 (session format 4). The settings namespace is the loader entry id
// (`llm-session-header`), which is also this bundle's row id, so the card
// registers behind `configForms.whileServed(["llm-session-header"])`.
//
// Shape mirrors the built-in client bundles (e.g. dsh-client-ui-settings-web-search):
// a single IIFE handed to window.__ModuleLoader__.load, whose factory pulls
// react and the shared primitives from the client module table — never from
// npm. The card manages its own drafts locally (the provider list is dynamic,
// which SettingsFormModel's fixed spec list cannot express) and writes them
// with one fenced scope.mutate(ops, baseline.revision) per save.

window.__ModuleLoader__.load({
	id: "dsh-llm-session-header",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let primitives = require("@deepseek-ai/dsh-client-ui-primitives");

		const NS = "settings.llmSessionHeader"; // locale dict namespace
		const ENTRY_ID = "llm-session-header"; // settings scope id === loader entry id === row id
		const PACKAGE = "dsh-llm-session-header"; // bundle package name, for the row.config key
		const MODES = ["session-id", "uuid"];
		const DEFAULT_HEADER = "x-opencode-session";

		const css = `.llm-session-header-row{display:flex;align-items:center;gap:8px;margin:4px 0}.llm-session-header-provider-row{display:flex;gap:6px;margin:4px 0;align-items:center}.llm-session-header-provider-row input[type=text]{flex:1;min-width:0}.llm-session-header-route-cell{flex:1;min-width:0;display:flex;gap:4px;align-items:center}.llm-session-header-route-cell select{flex:1;min-width:0;box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);height:32px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);padding:0 8px;font-size:14px;cursor:pointer}.llm-session-header-route-cell select:disabled,.llm-session-header-toggle-custom:disabled{opacity:.5;cursor:not-allowed}.llm-session-header-toggle-custom{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);height:32px;background:0 0;color:var(--dsw-alias-label-secondary);font-size:11px;padding:0 8px;cursor:pointer;white-space:nowrap}.llm-session-header-toggle-custom:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.llm-session-header-add,.llm-session-header-remove{cursor:pointer}.llm-session-header-section-title{font-weight:600;margin:8px 0 2px}.llm-session-header-empty,.llm-session-header-invalid{margin:4px 0;font-size:12px;opacity:.75}`;

		function ensureCss() {
			if (typeof document === "undefined" || document.querySelector('style[data-llm-session-header-css]')) return;
			const el = document.createElement("style");
			el.setAttribute("data-llm-session-header-css", "true");
			el.textContent = css;
			document.head.appendChild(el);
		}

		const inject = ["slots", "locale", "configForms"];

		function formLabels(t) {
			return {
				unavailable: t("unavailable"),
				readOnly: t("readOnly"),
				saveFailed: t("saveFailed"),
				save: t("save"),
				saving: t("saving")
			};
		}

		const LOCALES = {
			zh: {
				description: "为配置的模型路由附加稳定的每会话请求头，使多轮对话绑定到同一后端实例以保持 KV Cache 预热（SMG、OpenCode 等亲和路由）。",
				headerName: "默认头名",
				headerNameHint: "未单独指定头名的路由使用此值，例如 x-opencode-session。",
				mode: "取值模式",
				modeSessionId: "复用 DSH 会话 id（推荐）",
				modeUuid: "每会话随机 UUID",
				debug: "记录每次注入（日志）",
				providers: "路由 → 头名",
				noProviders: "尚未配置任何路由。",
				routePlaceholder: "路由 key，如 b70-smg",
				selectRoute: "选择 Provider 路由…",
				customRoute: "+ 自定义路由…",
				selectFromList: "从列表选择",
				headerPlaceholder: "头名，留空用默认",
				addProvider: "添加路由",
				remove: "删除",
				duplicateRoute: "存在重复的路由 key。",
				overridden: "已覆盖",
				reset: "重置",
				invalidHeaderName: "头名不能为空（除非不注入）。",
				unavailable: "配置不可用。",
				readOnly: "当前配置为只读。",
				saveFailed: "保存失败，请重试。",
				save: "保存",
				saving: "保存中…"
			},
			en: {
				description: "Attach a stable per-conversation session header to model requests routed to configured providers (SMG, OpenCode, and other affinity routers).",
				headerName: "Default header name",
				headerNameHint: "Used by any route without its own header, e.g. x-opencode-session.",
				mode: "Value mode",
				modeSessionId: "Reuse the DSH session id (recommended)",
				modeUuid: "Random UUID per session",
				debug: "Log every injection",
				providers: "Routes → header names",
				noProviders: "No routes configured yet.",
				routePlaceholder: "route key, e.g. b70-smg",
				selectRoute: "Select provider route…",
				customRoute: "+ Custom route…",
				selectFromList: "Select from list",
				headerPlaceholder: "header name, blank = default",
				addProvider: "Add route",
				remove: "Remove",
				duplicateRoute: "Duplicate route key.",
				overridden: "overridden",
				reset: "reset",
				invalidHeaderName: "Header name must not be empty (unless no injection).",
				unavailable: "Configuration is unavailable.",
				readOnly: "This configuration is read-only.",
				saveFailed: "Save failed, please retry.",
				save: "Save",
				saving: "Saving…"
			}
		};

		/**
		 * The minimal zustand-shaped store the slot renderer reads through its
		 * `use<Name>` hook: `getSnapshot()` for the current value plus
		 * `subscribe(listener)` for change notification. React 18 consumes it
		 * via `useSyncExternalStore`, so `subscribe` must return an unsubscribe
		 * function and `getSnapshot` must be referentially stable between
		 * notifications.
		 */
		function createLocalStore(initial) {
			let current = initial;
			const listeners = new Set();
			return {
				getSnapshot: () => current,
				set(next) {
					current = next;
					for (const listener of [...listeners]) listener();
				},
				subscribe(listener) {
					listeners.add(listener);
					return () => listeners.delete(listener);
				}
			};
		}

		function fieldState(field, draftValue, currentValue, baseValue, valid) {
			if (draftValue === undefined) {
				return { text: String(currentValue), overridden: false, invalid: !valid(String(currentValue)) };
			}
			const ok = valid(draftValue);
			return { text: String(draftValue), overridden: ok, invalid: !ok };
		}

		function rowsOf(providers) {
			if (Array.isArray(providers)) {
				return providers.map((route) => ({ route: String(route ?? ""), header: "" }));
			}
			if (providers !== null && typeof providers === "object") {
				return Object.entries(providers).map(([route, header]) => ({
					route: String(route),
					header: String(header ?? "")
				}));
			}
			return [];
		}

		function providersDiffer(a, b) {
			if (a.length !== b.length) return true;
			for (let i = 0; i < a.length; i++) {
				if (a[i].route !== b[i].route || a[i].header !== b[i].header) return true;
			}
			return false;
		}

		function addRowInvalid(rows) {
			const seen = new Set();
			for (const row of rows) {
				if (row.route === "") continue;
				if (seen.has(row.route)) return true;
				seen.add(row.route);
			}
			return false;
		}

		// ------------------------------------------------------------------
		// Controller
		//
		// Local draft state over the composed entry, re-seeded from the Host on
		// every external change. A save builds the full op list (set for each
		// changed field, unset for fields cleared back to their base value) and
		// writes it in ONE fenced mutate against the baseline revision captured
		// at first edit — the 0.1.7 write-path contract.

		class CardController {
			constructor(scope, ctx) {
				this.scope = scope;
				this.ctx = ctx;
				this.draft = null; // local edits: { headerName?, mode?, debug?, providers? }
				this.baseline = null; // first getSnapshot() of a draft session
				this.saving = false;
				this.failed = false;
				this.customRows = new Set();
				this.listeners = new Set();
				this.unsubscribe = scope.subscribe(() => this.reseed());
				this.describeUnsubscribe = null;
				try {
					const mirror = this.ctx?.configForms?.describe?.();
					if (mirror && typeof mirror.subscribe === "function") {
						this.describeUnsubscribe = mirror.subscribe(() => this.publish());
					}
				} catch {
					// ignore
				}
				this.reseed();
			}

			dispose() {
				if (this.unsubscribe) this.unsubscribe();
				this.unsubscribe = null;
				if (this.describeUnsubscribe) this.describeUnsubscribe();
				this.describeUnsubscribe = null;
			}

			reseed() {
				// Re-seed only when there is no open draft: while the user is
				// editing, external changes (e.g. our own save landing) must not
				// clobber their in-flight text. After a successful save we drop
				// the draft explicitly so the next snapshot re-seeds cleanly.
				if (this.draft === null) this.publish();
			}

			getAvailableRoutes() {
				const routes = new Set();
				try {
					const snap = this.ctx?.configForms?.describe?.()?.getSnapshot?.();
					const namespaces = snap?.view?.namespaces ?? snap?.namespaces ?? [];
					for (const ns of namespaces) {
						if (ns.ns === "llm-pi-ai" && ns.value?.providers && typeof ns.value.providers === "object") {
							for (const key of Object.keys(ns.value.providers)) {
								if (key && String(key).trim()) routes.add(String(key).trim());
							}
						} else if (ns.ns === "agent-default-model" && ns.value?.provider) {
							routes.add(String(ns.value.provider).trim());
						} else if (typeof ns.ns === "string" && ns.ns.startsWith("llm-") && ns.ns !== "llm-session-header") {
							const routeName = ns.ns.slice(4);
							if (routeName && routeName !== "deepseek-account") routes.add(routeName);
						}
					}
				} catch {
					// fallback gracefully
				}

				try {
					const piAi = this.ctx?.configForms?.get?.("llm-pi-ai")?.getSnapshot?.();
					const piAiProviders = piAi?.value?.providers;
					if (piAiProviders && typeof piAiProviders === "object") {
						for (const key of Object.keys(piAiProviders)) {
							if (key && String(key).trim()) routes.add(String(key).trim());
						}
					}
				} catch {
					// fallback gracefully
				}

				for (const p of ["opencode", "opencode-go"]) {
					routes.add(p);
				}

				return [...routes].sort((a, b) => a.localeCompare(b));
			}

			snapshot() {
				const snap = this.scope.getSnapshot();
				const value = snap.value ?? {};
				const base = snap.base ?? {};
				const d = this.draft ?? {};
				const rawProviders = d.providers !== undefined ? d.providers : rowsOf(value.providers);
				const providers = rawProviders.map((row, index) => ({
					...row,
					isCustom: this.customRows.has(index)
				}));
				return {
					available: snap.status === "ready",
					writable: Boolean(snap.writable),
					saving: this.saving,
					failed: this.failed,
					dirty: this.dirty(),
					availableRoutes: this.getAvailableRoutes(),
					headerName: fieldState("headerName", d.headerName, value.headerName ?? DEFAULT_HEADER, base.headerName, (v) => String(v).trim() !== ""),
					mode: fieldState("mode", d.mode, MODES.includes(value.mode) ? value.mode : "session-id", base.mode, (v) => MODES.includes(v)),
					debug: { text: String(d.debug ?? Boolean(value.debug)), overridden: false, invalid: false },
					providers,
					addInvalid: addRowInvalid(providers)
				};
			}

			bind() {
				// `@deepseek-ai/dsh-client-ui-primitives` uses dsh-client-store's
				// createSnapshotStore internally but does NOT re-export it, and
				// dsh-client-store is not a module-table seed we declare. So we
				// supply the tiny zustand-shaped store the slot renderer expects:
				// `set` for the controller, `subscribe`/`getSnapshot` for React's
				// useSyncExternalStore.
				const store = createLocalStore(this.snapshot());
				this.listeners.add(() => store.set(this.snapshot()));
				return store;
			}

			publish() {
				for (const listener of this.listeners) listener();
			}

			beginDraft() {
				if (this.baseline === null) this.baseline = this.scope.getSnapshot();
				this.draft ??= {};
				this.failed = false;
			}

			dirty() {
				if (this.draft === null) return false;
				const snap = this.scope.getSnapshot();
				const value = snap.value ?? {};
				const d = this.draft;
				if (d.headerName !== undefined && d.headerName !== String(value.headerName ?? DEFAULT_HEADER).trim()) return true;
				if (d.mode !== undefined && d.mode !== (MODES.includes(value.mode) ? value.mode : "session-id")) return true;
				if (d.debug !== undefined && d.debug !== Boolean(value.debug)) return true;
				if (d.providers !== undefined && providersDiffer(d.providers, rowsOf(value.providers))) return true;
				return false;
			}

			editHeaderName(text) {
				this.beginDraft();
				this.draft.headerName = text;
				this.publish();
			}

			editMode(mode) {
				if (!MODES.includes(mode)) return;
				this.beginDraft();
				this.draft.mode = mode;
				this.publish();
			}

			toggleDebug(value) {
				this.beginDraft();
				this.draft.debug = value;
				this.publish();
			}

			editProvider(index, which, text) {
				this.beginDraft();
				const rows = (this.draft.providers ?? this.snapshot().providers).map((row) => ({ ...row }));
				if (!rows[index]) return;
				rows[index][which] = text;
				this.draft.providers = rows;
				this.publish();
			}

			setCustomRoute(index, custom) {
				this.beginDraft();
				if (custom) {
					this.customRows.add(index);
				} else {
					this.customRows.delete(index);
				}
				this.publish();
			}

			removeProvider(index) {
				this.beginDraft();
				const rows = (this.draft.providers ?? this.snapshot().providers).filter((_, i) => i !== index);
				this.draft.providers = rows;
				const nextCustom = new Set();
				for (const i of this.customRows) {
					if (i < index) nextCustom.add(i);
					else if (i > index) nextCustom.add(i - 1);
				}
				this.customRows = nextCustom;
				this.publish();
			}

			addProvider() {
				this.beginDraft();
				const rows = (this.draft.providers ?? this.snapshot().providers).map((row) => ({ ...row }));
				rows.push({ route: "", header: "" });
				this.draft.providers = rows;
				this.publish();
			}

			discard() {
				if (this.draft === null && !this.failed) return;
				this.draft = null;
				this.baseline = null;
				this.failed = false;
				this.customRows.clear();
				this.publish();
			}

			async save() {
				const snap = this.scope.getSnapshot();
				const value = snap.value ?? {};
				if (!snap.writable || this.saving || !this.dirty()) return;

				const ops = [];
				const d = this.draft ?? {};

				const headerName = String(d.headerName ?? (value.headerName ?? DEFAULT_HEADER)).trim();
				if (headerName !== "") {
					ops.push({ op: "set", path: ["headerName"], value: headerName });
				} else if (Object.hasOwn(value, "headerName")) {
					ops.push({ op: "unset", path: ["headerName"] });
				}

				const mode = d.mode ?? (MODES.includes(value.mode) ? value.mode : "session-id");
				if (mode !== value.mode) ops.push({ op: "set", path: ["mode"], value: mode });

				const debug = d.debug ?? Boolean(value.debug);
				if (debug !== Boolean(value.debug)) ops.push({ op: "set", path: ["debug"], value: debug });

				// providers is always written in full when it changed: a list of
				// routes all using headerName, or a map when any row names a
				// different header. Empty rows are dropped; an empty result
				// clears the field entirely.
				const rows = (d.providers ?? rowsOf(value.providers)).map((row) => ({
					route: String(row.route ?? "").trim(),
					header: String(row.header ?? "").trim()
				})).filter((row) => row.route !== "");
				if (!providersDiffer(rows, rowsOf(value.providers))) {
					await this.commit(ops);
					return;
				}

				const defaultHeader = headerName !== "" ? headerName : DEFAULT_HEADER;
				// A blank header means "inherit the default": rows seeded from the
				// list form carry a blank header, and a map value of "" would pin
				// that route to an empty header instead of the configured default.
				const allDefault = rows.every((row) => row.header === "" || row.header === defaultHeader);
				if (allDefault) {
					ops.push({ op: "set", path: ["providers"], value: rows.map((row) => row.route) });
				} else {
					const map = {};
					// A row that still inherits keeps the default header spelled
					// out, because a map cannot express "use headerName".
					for (const row of rows) map[row.route] = row.header === "" ? defaultHeader : row.header;
					ops.push({ op: "set", path: ["providers"], value: map });
				}

				await this.commit(ops);
			}

			async commit(ops) {
				if (ops.length === 0) return;
				this.saving = true;
				this.publish();
				try {
					const landed = await this.scope.mutate(ops, this.baseline?.revision);
					if (landed) {
						this.draft = null;
						this.baseline = null;
						this.customRows.clear();
					} else {
						this.failed = true;
					}
				} finally {
					this.saving = false;
					this.publish();
				}
			}

			inject() {
				return {
					hooks: { llmSessionHeaderCard: this.bind() },
					editHeaderName: (text) => this.editHeaderName(text),
					editMode: (mode) => this.editMode(mode),
					toggleDebug: (value) => this.toggleDebug(value),
					editProvider: (index, which, text) => this.editProvider(index, which, text),
					setCustomRoute: (index, custom) => this.setCustomRoute(index, custom),
					removeProvider: (index) => this.removeProvider(index),
					addProvider: () => this.addProvider(),
					save: () => this.save(),
					discard: () => this.discard()
				};
			}
		}

		// ------------------------------------------------------------------
		// Card component
		//
		// The frame (title button, disclosure, artwork) is supplied by the
		// 0.1.7 host for third-party cards; we render only the body. `summary`
		// view returns one line of copy.

		function LlmSessionHeaderCard(props) {
			const { t } = props;
			const state = props.useLlmSessionHeaderCard((snapshot) => snapshot);
			if (props.view === "summary") return t("description");
			ensureCss();
			const disabled = !state.writable || state.saving;
			const availableRoutes = Array.isArray(state.availableRoutes) ? state.availableRoutes : [];
			return (0, react_jsx_runtime.jsxs)(primitives.SettingsForm, {
				labels: formLabels(t),
				state,
				onSave: props.save,
				onDiscard: props.discard,
				children: [
					(0, react_jsx_runtime.jsx)(primitives.SettingsValueField, {
						id: "llm-session-header-name",
						label: t("headerName"),
						hint: t("headerNameHint"),
						overriddenLabel: t("overridden"),
						resetLabel: t("reset"),
						invalidLabel: t("invalidHeaderName"),
						disabled,
						...state.headerName,
						onEdit: (text) => props.editHeaderName(text),
						onReset: () => props.editHeaderName("")
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: "llm-session-header-row",
						children: [
							(0, react_jsx_runtime.jsx)("label", {
								htmlFor: "llm-session-header-mode",
								children: t("mode")
							}),
							(0, react_jsx_runtime.jsx)("select", {
								id: "llm-session-header-mode",
								value: state.mode.text,
								disabled,
								onChange: (event) => props.editMode(event.target.value),
								children: MODES.map((mode) => (0, react_jsx_runtime.jsx)("option", { value: mode, children: t(mode === "session-id" ? "modeSessionId" : "modeUuid") }, mode))
							})
						]
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: "llm-session-header-row",
						children: [
							(0, react_jsx_runtime.jsx)("label", {
								htmlFor: "llm-session-header-debug",
								children: t("debug")
							}),
							(0, react_jsx_runtime.jsx)("input", {
								id: "llm-session-header-debug",
								type: "checkbox",
								checked: state.debug.text === "true",
								disabled,
								onChange: (event) => props.toggleDebug(event.target.checked)
							})
						]
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						children: [
							(0, react_jsx_runtime.jsx)("p", { className: "llm-session-header-section-title", children: t("providers") }),
							state.providers.length === 0 ? (0, react_jsx_runtime.jsx)("p", { className: "llm-session-header-empty", children: t("noProviders") }) : null,
							state.providers.map((row, index) => {
								const isCustom = Boolean(row.isCustom);
								const inAvailable = availableRoutes.includes(row.route);
								return (0, react_jsx_runtime.jsxs)("div", {
									className: "llm-session-header-provider-row",
									children: [
										isCustom
											? (0, react_jsx_runtime.jsxs)("div", {
												className: "llm-session-header-route-cell",
												children: [
													(0, react_jsx_runtime.jsx)("input", {
														type: "text",
														placeholder: t("routePlaceholder"),
														value: row.route,
														disabled,
														onChange: (event) => props.editProvider(index, "route", event.target.value)
													}),
													(0, react_jsx_runtime.jsx)("button", {
														type: "button",
														className: "llm-session-header-toggle-custom",
														disabled,
														onClick: () => props.setCustomRoute(index, false),
														children: t("selectFromList")
													})
												]
											})
											: (0, react_jsx_runtime.jsx)("div", {
												className: "llm-session-header-route-cell",
												children: (0, react_jsx_runtime.jsxs)("select", {
													value: row.route || "",
													disabled,
													onChange: (event) => {
														const val = event.target.value;
														if (val === "__custom__") {
															props.setCustomRoute(index, true);
														} else {
															props.editProvider(index, "route", val);
														}
													},
													children: [
														(0, react_jsx_runtime.jsx)("option", {
															value: "",
															disabled: true,
															children: t("selectRoute")
														}),
														...availableRoutes.map((r) => (0, react_jsx_runtime.jsx)("option", {
															value: r,
															children: r
														}, r)),
														row.route && !inAvailable ? (0, react_jsx_runtime.jsx)("option", {
															value: row.route,
															children: row.route
														}, row.route) : null,
														(0, react_jsx_runtime.jsx)("option", {
															value: "__custom__",
															children: t("customRoute")
														})
													]
												})
											}),
										(0, react_jsx_runtime.jsx)("input", {
											type: "text",
											placeholder: t("headerPlaceholder"),
											value: row.header,
											disabled,
											onChange: (event) => props.editProvider(index, "header", event.target.value)
										}),
										(0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: "llm-session-header-remove",
											disabled,
											onClick: () => props.removeProvider(index),
											children: t("remove")
										})
									]
								}, `provider-${index}`);
							}),
							state.addInvalid ? (0, react_jsx_runtime.jsx)("p", { className: "llm-session-header-invalid", children: t("duplicateRoute") }) : null,
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "llm-session-header-add",
								disabled,
								onClick: () => props.addProvider(),
								children: t("addProvider")
							})
						]
					})
				]
			});
		}

		function apply(ctx) {
			// Older web hosts (0.1.2/0.1.5) serve no `configForms`, so there is no
			// settings scope to attach to: register nothing rather than throw
			// inside their Plugins page.
			if (ctx.configForms === undefined || ctx.slots === undefined || ctx.locale === undefined) return;
			const t = ctx.locale.bind(NS);
			ctx.effect(() => ctx.locale.register(NS, LOCALES), "llm-session-header: locale");

			const controller = new CardController(ctx.configForms.get(ENTRY_ID), ctx);
			ctx.effect(() => () => controller.dispose(), "llm-session-header: dispose");

			// `plugins.item` is the OFFICIAL settings list: dsh's own slot contract
			// marks it "OCCUPIED by the official settings pages, one companion
			// package per host-plane namespace; a bundle's configuration belongs in
			// plugins.bundle.config or plugins.row.config instead"
			// (packages/client/ui-plugin-manager/src/client/slot-contract.ts).
			//
			// Our configuration belongs to the ROW this bundle declares — the row id
			// IS the settings namespace — so `plugins.row.config`, keyed
			// `<package name>#<row id>`, is the contract's match for it. That slot
			// makes the row on the bundle's page gain a Configure button, and it is
			// the only non-official config slot that is handed the page `form`.
			//
			// (`plugins.bundle.config` is the other non-official option, but it is
			// keyed by package name for a BUNDLE-level config, and the page renders
			// it with `view: 'page'` and no `form` at all.)
			ctx.effect(() => ctx.configForms.whileServed([ENTRY_ID], () => {
				ctx.slots.inject("plugins.row.config", () => {
					ctx.slots.register({
						name: "plugins.row.config",
						key: `${PACKAGE}#${ENTRY_ID}`,
						locale: NS,
						inject: () => controller.inject()
					}, LlmSessionHeaderCard);
				});
			}), "llm-session-header: card");
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
