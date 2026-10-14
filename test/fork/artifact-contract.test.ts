import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'..',
	'..',
);

describe('artifact contract copies', () => {
	it('keeps the example consumer copy aligned with the fork canonical file', () => {
		const canonical = fs.readFileSync(
			path.join(repoRoot, 'fork', 'artifact-contract.mjs'),
			'utf-8',
		);
		const consumerCopy = fs.readFileSync(
			path.join(
				repoRoot,
				'fork',
				'example-consumer',
				'scripts',
				'artifact-contract.mjs',
			),
			'utf-8',
		);
		const strip = (text: string) =>
			text.replace(/^\/\*[\s\S]*?\*\/\n\n/m, '').trim();
		expect(strip(consumerCopy)).toBe(strip(canonical));
	});
});
