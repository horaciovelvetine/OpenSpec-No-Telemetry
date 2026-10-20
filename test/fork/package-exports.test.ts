import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { REQUIRED_EXPORTS } from '../../fork/artifact-contract.mjs';

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'..',
	'..',
);

describe('package exports for consumers', () => {
	it('declares only the supported subpath exports', () => {
		const pkg = JSON.parse(
			fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8'),
		);

		expect(Object.keys(pkg.exports).sort()).toEqual([
			'.',
			'./cli',
			'./package.json',
		]);
		expect(pkg.exports['./cli']).toEqual({
			types: './dist/cli/index.d.ts',
			default: './dist/cli/index.js',
		});
		expect(pkg.exports['./package.json']).toBe('./package.json');
		expect(pkg.bin).toEqual({ openspec: './bin/openspec.js' });
		expect(fs.existsSync(path.join(repoRoot, 'bin', 'openspec.js'))).toBe(true);
	});

	it('exposes runCli through ./cli without loading the broad package root', async () => {
		const cli = await import(
			pathToFileURL(path.join(repoRoot, 'dist', 'cli', 'index.js')).href
		);

		expect(typeof cli.runCli).toBe('function');
	});

	it('matches the artifact contract', () => {
		expect(Object.keys(REQUIRED_EXPORTS).sort()).toEqual(['./cli']);
		expect(REQUIRED_EXPORTS['./cli']).toEqual(['runCli']);
	});
});
