import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'..',
	'..',
);

// Imported from the build, the way consumers load it through the package exports.
async function loadCliKit() {
	return import(pathToFileURL(path.join(repoRoot, 'dist', 'cli-kit.js')).href);
}

describe('cli-kit export for bundled consumers', () => {
	it('maps the subpath exports to built files', () => {
		const pkg = JSON.parse(
			fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8'),
		);

		expect(pkg.exports['./cli']).toEqual({
			types: './dist/cli/index.d.ts',
			default: './dist/cli/index.js',
		});
		expect(pkg.exports['./cli-kit']).toEqual({
			types: './dist/cli-kit.d.ts',
			default: './dist/cli-kit.js',
		});
		expect(pkg.exports['./package.json']).toBe('./package.json');
		expect(fs.existsSync(path.join(repoRoot, 'dist', 'cli-kit.js'))).toBe(true);
		expect(fs.existsSync(path.join(repoRoot, 'dist', 'cli-kit.d.ts'))).toBe(
			true,
		);
	});

	it('exposes the openspec shim entry without loading the broad package root', async () => {
		const cli = await import(
			pathToFileURL(path.join(repoRoot, 'dist', 'cli', 'index.js')).href
		);

		expect(typeof cli.runCli).toBe('function');
	});

	it('exposes every library a consumer CLI can build with', async () => {
		const kit = await loadCliKit();

		expect(Object.keys(kit).sort()).toEqual([
			'Command',
			'chalk',
			'crossSpawn',
			'loadPrompts',
		]);
		expect(new kit.Command('acme-init').name()).toBe('acme-init');
		expect(typeof kit.chalk.bold).toBe('function');
		const prompts = await kit.loadPrompts();
		for (const prompt of ['checkbox', 'confirm', 'input', 'select', 'search']) {
			expect(typeof prompts[prompt], prompt).toBe('function');
		}
	});

	it('spawns local commands through cross-spawn', async () => {
		const kit = await loadCliKit();
		const result = kit.crossSpawn.sync(
			process.execPath,
			['-e', 'process.stdout.write("ok")'],
			{
				encoding: 'utf-8',
			},
		);

		expect(result.status).toBe(0);
		expect(result.stdout).toBe('ok');
	});
});
