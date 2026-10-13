#!/usr/bin/env node
/**
 * Packs a release tarball with the vendored OpenSpec bundled inside.
 *
 * `bundleDependencies` is added only for the pack: in the committed manifest
 * it makes `npm install` fetch the packages inside OpenSpec's own bundle from
 * the registry instead of taking them from its tarball.
 *
 * Usage: node scripts/pack-release.mjs --url <download URL> [--out <dir>]
 * Writes <out>/acme-<version>.tgz and prints its path.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crossSpawn } from '@fission-ai/openspec/cli-kit';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'package.json');

function option(name) {
	const index = process.argv.indexOf(name);
	return index === -1 ? undefined : process.argv[index + 1];
}

const url = option('--url');
const outDir = path.resolve(option('--out') ?? root);
if (!url) {
	console.error(
		'usage: node scripts/pack-release.mjs --url <download URL> [--out <dir>]',
	);
	process.exit(1);
}

const original = fs.readFileSync(manifestPath, 'utf-8');
const manifest = JSON.parse(original);
fs.writeFileSync(
	path.join(root, 'release.json'),
	`${JSON.stringify({ version: manifest.version, url }, null, 2)}\n`,
);

let packed;
try {
	fs.writeFileSync(
		manifestPath,
		`${JSON.stringify({ ...manifest, bundleDependencies: ['@fission-ai/openspec'] }, null, 2)}\n`,
	);
	fs.mkdirSync(outDir, { recursive: true });
	const result = crossSpawn.sync(
		'npm',
		['pack', '--json', '--ignore-scripts', '--pack-destination', outDir],
		{
			cwd: root,
			encoding: 'utf-8',
		},
	);
	if (result.error) throw result.error;
	if (result.status !== 0)
		throw new Error(
			`npm pack failed (exit ${result.status})\n${result.stderr}`,
		);
	[packed] = JSON.parse(result.stdout);
} finally {
	fs.writeFileSync(manifestPath, original);
}

const files = new Set(packed.files.map(file => file.path));
for (const required of [
	'release.json',
	'node_modules/@fission-ai/openspec/package.json',
	'node_modules/@fission-ai/openspec/node_modules/commander/package.json',
]) {
	if (!files.has(required)) {
		console.error(`✖ the release tarball is missing ${required}`);
		process.exit(1);
	}
}

const tarball = path.join(outDir, `acme-${manifest.version}.tgz`);
fs.renameSync(path.join(outDir, packed.filename), tarball);
console.log(tarball);
