import * as assert from 'node:assert';

export interface ExtensionTestCase {
	name: string;
	run: () => Promise<void> | void;
}

export const tests: ExtensionTestCase[] = [
	{
		name: 'sample array lookup behaves as expected',
		run: () => {
			assert.strictEqual(-1, [1, 2, 3].indexOf(5));
			assert.strictEqual(-1, [1, 2, 3].indexOf(0));
		}
	}
];
