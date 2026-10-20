#!/usr/bin/env node
/**
 * Vendors a verified OpenSpec-No-Telemetry build into this example.
 *
 * Usage:
 *   node scripts/vendor-openspec.mjs --from /path/to/OpenSpec-No-Telemetry/fork/out
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vendorDir = path.join(root, 'vendor', 'openspec');

function option(name) {
	const index = process.argv.indexOf(name);
	return index === -1 ? undefined : process.argv[index + 1];
}

function fail(message) {
	throw new Error(message);
}

const sourceDir = option('--from');
const allowDirty = process.argv.includes('--allow-dirty');
if (!sourceDir) {
	fail('usage: node scripts/vendor-openspec.mjs --from <fork/out>');
}

const source = path.resolve(sourceDir);
const buildInfoPath = path.join(source, 'BUILD-INFO.json');
if (!fs.existsSync(buildInfoPath)) fail(`${buildInfoPath} does not exist`);

const buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, 'utf-8'));
if (buildInfo.schemaVersion !== 2)
	fail(`unsupported BUILD-INFO schema ${buildInfo.schemaVersion}; need schema 2`);
if (buildInfo.package !== '@fission-ai/openspec')
	fail(`unexpected package ${buildInfo.package}`);
if (typeof buildInfo.forkCommitDirty !== 'boolean') {
	fail('BUILD-INFO.json has no valid forkCommitDirty state');
}
if (buildInfo.forkCommitDirty && !allowDirty) {
	fail(
		'refusing a development artifact from a dirty OpenSpec tree; use a clean build for production vendoring',
	);
}
if (buildInfo.artifactFormat !== 'bundled-npm-tarball') {
	fail(`unsupported artifact format ${buildInfo.artifactFormat}`);
}
if (
	buildInfo.verification?.networkAudit !== true ||
	buildInfo.verification?.offlineConsumer !== true ||
	buildInfo.verification?.allSupportedTools !== true
) {
	fail('BUILD-INFO does not describe a fully verified offline artifact');
}
if (!buildInfo.bin?.openspec) {
	fail('BUILD-INFO.json has no bin.openspec entry');
}

const tarballName = buildInfo.tarball;
if (
	typeof tarballName !== 'string' ||
	path.basename(tarballName) !== tarballName ||
	!tarballName.endsWith('.tgz')
) {
	fail(`invalid artifact tarball name: ${tarballName}`);
}
const tarballPath = path.join(source, tarballName);
if (!fs.existsSync(tarballPath))
	fail(`artifact tarball is missing: ${tarballName}`);
const actualHash = crypto
	.createHash('sha256')
	.update(fs.readFileSync(tarballPath))
	.digest('hex');
if (actualHash !== buildInfo.sha256)
	fail('artifact checksum does not match BUILD-INFO.json');

const sums = fs.readFileSync(path.join(source, 'SHA256SUMS'), 'utf-8');
if (!sums.split('\n').includes(`${actualHash}  ${tarballName}`)) {
	fail('artifact checksum does not match SHA256SUMS');
}

fs.mkdirSync(vendorDir, { recursive: true });
for (const entry of fs.readdirSync(vendorDir)) {
	if (entry !== 'README.md')
		fs.rmSync(path.join(vendorDir, entry), { recursive: true, force: true });
}
for (const entry of [
	tarballName,
	'SHA256SUMS',
	'BUILD-INFO.json',
	'THIRD-PARTY-LICENSES',
]) {
	fs.copyFileSync(path.join(source, entry), path.join(vendorDir, entry));
}

console.log(
	`Vendored ${buildInfo.package}@${buildInfo.version} (${tarballName})`,
);
