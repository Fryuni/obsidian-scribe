import * as assert from "node:assert";

export function keyedMemoized<T>(
	name: string,
	gen: (key: string) => T,
): (key: string) => T {
	let lastKey: string | null = null;
	let lastValue: T | null = null;

	return (key: string) => {
		if (!lastValue || lastKey !== key) {
			assert.ok(key, `${name} is required for this operation`);
			lastValue = gen(key);
			lastKey = key;
		}

		return lastValue;
	};
}
