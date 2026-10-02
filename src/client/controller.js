import { DEFAULT_HEADER, MODES } from './constants.js';
import { createLocalStore } from './store.js';

export function fieldState(field, draftValue, currentValue, baseValue, valid) {
	if (draftValue === undefined) {
		return { text: String(currentValue), overridden: false, invalid: !valid(String(currentValue)) };
	}
	const ok = valid(draftValue);
	return { text: String(draftValue), overridden: ok, invalid: !ok };
}

export function rowsOf(providers) {
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

export function providersDiffer(a, b) {
	if (a.length !== b.length) return true;
	for (let i = 0; i < a.length; i++) {
		if (a[i].route !== b[i].route || a[i].header !== b[i].header) return true;
	}
	return false;
}

export function addRowInvalid(rows) {
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

export class CardController {
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
