import { ensureCss, formLabels, MODES } from './constants.js';

// ------------------------------------------------------------------
// Card component
//
// The frame (title button, disclosure, artwork) is supplied by the
// 0.1.7 host for third-party cards; we render only the body. `summary`
// view returns one line of copy.

export function LlmSessionHeaderCard(props) {
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
