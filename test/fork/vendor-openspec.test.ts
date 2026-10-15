import { describe, expect, it, vi } from 'vitest';

describe('vendor-openspec cli-kit reporting', () => {
	it('warns on a major version change', async () => {
		const { reportCliKitLibraryChanges } =
			await import('../../fork/vendor-cli-kit-report.mjs');
		const warnings: string[] = [];
		vi.spyOn(console, 'warn').mockImplementation((msg?: unknown) => {
			if (typeof msg === 'string') warnings.push(msg);
		});
		vi.spyOn(console, 'log').mockImplementation(() => {});

		reportCliKitLibraryChanges(
			{
				commander: '13.1.0',
				chalk: '5.6.2',
				'@inquirer/prompts': '8.5.2',
				'cross-spawn': '7.0.6',
			},
			{
				commander: '14.0.3',
				chalk: '5.6.2',
				'@inquirer/prompts': '8.5.2',
				'cross-spawn': '7.0.6',
			},
		);

		expect(
			warnings.some(line => /major version change for commander/.test(line)),
		).toBe(true);
		vi.restoreAllMocks();
	});
});
