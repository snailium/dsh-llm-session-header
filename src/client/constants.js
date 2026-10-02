export const NS = "settings.llmSessionHeader"; // locale dict namespace
export const ENTRY_ID = "llm-session-header"; // settings scope id === loader entry id === row id
export const PACKAGE = "dsh-llm-session-header"; // bundle package name, for the row.config key
export const MODES = ["session-id", "uuid"];
export const DEFAULT_HEADER = "x-opencode-session";

export const css = `.llm-session-header-row{display:flex;align-items:center;gap:8px;margin:4px 0}.llm-session-header-provider-row{display:flex;gap:6px;margin:4px 0;align-items:center}.llm-session-header-provider-row input[type=text]{flex:1;min-width:0}.llm-session-header-route-cell{flex:1;min-width:0;display:flex;gap:4px;align-items:center}.llm-session-header-route-cell select{flex:1;min-width:0;box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);height:32px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);padding:0 8px;font-size:14px;cursor:pointer}.llm-session-header-route-cell select:disabled,.llm-session-header-toggle-custom:disabled{opacity:.5;cursor:not-allowed}.llm-session-header-toggle-custom{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);height:32px;background:0 0;color:var(--dsw-alias-label-secondary);font-size:11px;padding:0 8px;cursor:pointer;white-space:nowrap}.llm-session-header-toggle-custom:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.llm-session-header-add,.llm-session-header-remove{cursor:pointer}.llm-session-header-section-title{font-weight:600;margin:8px 0 2px}.llm-session-header-empty,.llm-session-header-invalid{margin:4px 0;font-size:12px;opacity:.75}`;

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
