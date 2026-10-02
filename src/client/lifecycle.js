import { NS, ENTRY_ID, PACKAGE } from './constants.js';
import { LOCALES } from './locales.js';
import { CardController } from './controller.js';
import { LlmSessionHeaderCard } from './card.js';

export function apply(ctx) {
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
