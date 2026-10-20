#!/usr/bin/env node
/**
 * Packs a release tarball with the vendored OpenSpec files inside.
 *
 * Usage: node scripts/pack-release.mjs --url <download URL> [--out <dir>]
 * Writes <out>/acme-<version>.tgz and prints its path.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { npm } from '../lib/npm.js';
import { VENDORED_OPENSPEC } from '../lib/environment.js';

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

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
fs.writeFileSync(
	path.join(root, 'release.json'),
	`${JSON.stringify({ version: manifest.version, url }, null, 2)}\n`,
);

fs.mkdirSync(outDir, { recursive: true });
const packOutput = npm(
	['pack', '--json', '--ignore-scripts', '--pack-destination', outDir],
	{ capture: true },
);
const [packed] = JSON.parse(packOutput);

const files = new Set(packed.files.map(file => file.path));
for (const required of [
	'release.json',
	`vendor/openspec/${VENDORED_OPENSPEC.tarball}`,
	'vendor/openspec/BUILD-INFO.json',
	'vendor/openspec/SHA256SUMS',
]) {
	if (!files.has(required)) {
		console.error(`✖ the release tarball is missing ${required}`);
		process.exit(1);
	}
}
if ([...files].some(file => file.startsWith('node_modules/'))) {
	console.error('✖ the release tarball must not contain node_modules/');
	process.exit(1);
}

const tarball = path.join(outDir, `acme-${manifest.version}.tgz`);
fs.renameSync(path.join(outDir, packed.filename), tarball);
console.log(tarball);
