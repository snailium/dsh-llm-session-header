/**
 * The minimal zustand-shaped store the slot renderer reads through its
 * `use<Name>` hook: `getSnapshot()` for the current value plus
 * `subscribe(listener)` for change notification. React 18 consumes it
 * via `useSyncExternalStore`, so `subscribe` must return an unsubscribe
 * function and `getSnapshot` must be referentially stable between
 * notifications.
 */
export function createLocalStore(initial) {
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
