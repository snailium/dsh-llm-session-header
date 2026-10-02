import test from 'node:test';
import assert from 'node:assert/strict';
import { CardController } from '../src/client/controller.js';

function createMockScope(initialValue = {}) {
	let value = { ...initialValue };
	let listeners = new Set();
	return {
		getSnapshot: () => ({
			status: 'ready',
			writable: true,
			revision: 1,
			value: { ...value },
			base: {}
		}),
		subscribe: (fn) => {
			listeners.add(fn);
			return () => listeners.delete(fn);
		},
		mutate: async (ops) => {
			for (const op of ops) {
				if (op.op === 'set') {
					value[op.path[0]] = op.value;
				} else if (op.op === 'unset') {
					delete value[op.path[0]];
				}
			}
			for (const fn of listeners) fn();
			return true;
		}
	};
}

test('CardController discovers available provider routes from ctx.configForms', () => {
	const mockCtx = {
		configForms: {
			describe: () => ({
				getSnapshot: () => ({
					view: {
						namespaces: [
							{
								ns: 'llm-pi-ai',
								value: {
									providers: {
										'b70-smg': {},
										'b70-sycl': {},
										'ovms': {}
									}
								}
							},
							{
								ns: 'agent-default-model',
								value: { provider: 'xtx-vulkan' }
							},
							{
								ns: 'llm-custom-endpoint',
								value: {}
							}
						]
					}
				}),
				subscribe: () => () => {}
			}),
			get: (ns) => {
				if (ns === 'llm-pi-ai') {
					return {
						getSnapshot: () => ({
							value: {
								providers: {
									'b70-smg': {},
									'b70-sycl': {},
									'ovms': {}
								}
							}
						})
					};
				}
				return null;
			}
		}
	};

	const scope = createMockScope();
	const controller = new CardController(scope, mockCtx);
	const snap = controller.snapshot();

	assert.ok(Array.isArray(snap.availableRoutes));
	assert.ok(snap.availableRoutes.includes('b70-smg'));
	assert.ok(snap.availableRoutes.includes('b70-sycl'));
	assert.ok(snap.availableRoutes.includes('ovms'));
	assert.ok(snap.availableRoutes.includes('xtx-vulkan'));
	assert.ok(snap.availableRoutes.includes('custom-endpoint'));
	assert.ok(snap.availableRoutes.includes('opencode'));
	assert.ok(snap.availableRoutes.includes('opencode-go'));
});

test('CardController handles custom route toggling and adding/removing providers', () => {
	const scope = createMockScope({
		providers: ['opencode']
	});
	const controller = new CardController(scope, {});
	let snap = controller.snapshot();
	assert.equal(snap.providers.length, 1);
	assert.equal(snap.providers[0].route, 'opencode');
	assert.equal(snap.providers[0].isCustom, false);

	// Toggle row 0 to custom
	controller.setCustomRoute(0, true);
	snap = controller.snapshot();
	assert.equal(snap.providers[0].isCustom, true);

	// Edit custom route
	controller.editProvider(0, 'route', 'my-custom-provider');
	snap = controller.snapshot();
	assert.equal(snap.providers[0].route, 'my-custom-provider');

	// Add a new provider
	controller.addProvider();
	snap = controller.snapshot();
	assert.equal(snap.providers.length, 2);
	assert.equal(snap.providers[1].route, '');
	assert.equal(snap.providers[1].isCustom, false);

	// Select a route for provider 1
	controller.editProvider(1, 'route', 'b70-smg');
	snap = controller.snapshot();
	assert.equal(snap.providers[1].route, 'b70-smg');

	// Toggle row 0 back to list
	controller.setCustomRoute(0, false);
	snap = controller.snapshot();
	assert.equal(snap.providers[0].isCustom, false);

	// Remove row 0
	controller.removeProvider(0);
	snap = controller.snapshot();
	assert.equal(snap.providers.length, 1);
	assert.equal(snap.providers[0].route, 'b70-smg');
});
