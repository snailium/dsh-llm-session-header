export const NS = "settings.llmSessionHeader"; // locale dict namespace
export const ENTRY_ID = "llm-session-header"; // settings scope id === loader entry id === row id
export const PACKAGE = "dsh-llm-session-header"; // bundle package name, for the row.config key
export const MODES = ["session-id", "uuid"];
export const DEFAULT_HEADER = "x-opencode-session";

// Minimal styling for the provider rows; kept inline so the bundle has
// no CSS-module dependency. The host frame already owns the card chrome.
export const css = `.llm-session-header-row{display:flex;align-items:center;gap:8px;margin:4px 0}.llm-session-header-provider-row{display:flex;gap:6px;margin:4px 0}.llm-session-header-provider-row input[type=text]{flex:1;min-width:0}.llm-session-header-add,.llm-session-header-remove{cursor:pointer}.llm-session-header-section-title{font-weight:600;margin:8px 0 2px}.llm-session-header-empty,.llm-session-header-invalid{margin:4px 0;font-size:12px;opacity:.75}`;

export function ensureCss() {
	if (typeof document === "undefined" || document.querySelector('style[data-llm-session-header-css]')) return;
	const el = document.createElement("style");
	el.setAttribute("data-llm-session-header-css", "true");
	el.textContent = css;
	document.head.appendChild(el);
}

export const inject = ["slots", "locale", "configForms"];

export function formLabels(t) {
	return {
		unavailable: t("unavailable"),
		readOnly: t("readOnly"),
		saveFailed: t("saveFailed"),
		save: t("save"),
		saving: t("saving")
	};
}
