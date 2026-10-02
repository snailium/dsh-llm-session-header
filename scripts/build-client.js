/**
 * Build script for dsh-llm-session-header/client.
 *
 * Assembles modular source files in src/client/ into the single distribution file lib/client.js
 * required by the DeepSeek Harness client module loader (__ModuleLoader__.load).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC_DIR = join(ROOT, 'src', 'client');
const OUTPUT_FILE = join(ROOT, 'lib', 'client.js');

export async function buildClientBundle() {
	const [constants, locales, store, controller, card, lifecycle] = await Promise.all([
		readFile(join(SRC_DIR, 'constants.js'), 'utf8'),
		readFile(join(SRC_DIR, 'locales.js'), 'utf8'),
		readFile(join(SRC_DIR, 'store.js'), 'utf8'),
		readFile(join(SRC_DIR, 'controller.js'), 'utf8'),
		readFile(join(SRC_DIR, 'card.js'), 'utf8'),
		readFile(join(SRC_DIR, 'lifecycle.js'), 'utf8')
	]);

	const stripImportsExports = (code) =>
		code
			.replace(/^import\s+.*?;?\s*$/gmu, '')
			.replace(/^export\s+(const|function|class)\s+/gmu, '$1 ')
			.replace(/^export\s*\{[^}]*\};?\s*$/gmu, '')
			.trim();

	const header = `// dsh-llm-session-header — client half (settings card)
//
// Self-contained module-loader bundle for the Plugins page under dsh 0.1.7 and
// 0.2.0 (session format 4). The settings namespace is the loader entry id
// (\`llm-session-header\`), which is also this bundle's row id, so the card
// registers behind \`configForms.whileServed(["llm-session-header"])\`.
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
`;

	const footer = `
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
`;

	const indent = (code) =>
		code
			.split('\n')
			.map((line) => (line.length > 0 ? `\t\t${line}` : line))
			.join('\n');

	const bundleContent = [
		header,
		indent(stripImportsExports(constants)),
		'',
		indent(stripImportsExports(locales)),
		'',
		indent(stripImportsExports(store)),
		'',
		indent(stripImportsExports(controller)),
		'',
		indent(stripImportsExports(card)),
		'',
		indent(stripImportsExports(lifecycle)),
		footer
	].join('\n');

	await writeFile(OUTPUT_FILE, bundleContent, 'utf8');
	return bundleContent;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	buildClientBundle().then(() => {
		console.log('Successfully built lib/client.js from src/client/');
	});
}
