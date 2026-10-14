import { describe, expect, it } from 'vitest';

describe('artifact contract copies', () => {
	it('keeps the example consumer copy aligned with the fork canonical file', async () => {
		const canonical = await import('../../fork/artifact-contract.mjs');
		const consumerCopy = await import(
			'../../fork/example-consumer/scripts/artifact-contract.mjs'
		);
		expect(consumerCopy.REQUIRED_EXPORTS).toEqual(canonical.REQUIRED_EXPORTS);
		expect(consumerCopy.CLI_KIT_LIBRARIES).toEqual(
			canonical.CLI_KIT_LIBRARIES,
		);
	});
});
