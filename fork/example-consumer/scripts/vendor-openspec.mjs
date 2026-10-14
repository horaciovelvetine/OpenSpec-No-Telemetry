#!/usr/bin/env node
/**
 * Vendors a verified OpenSpec-No-Telemetry build into this example and
 * creates the lockfile that the sample GitLab pipeline consumes.
 *
 * Usage:
 *   node scripts/vendor-openspec.mjs --from /path/to/OpenSpec-No-Telemetry/fork/out
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { REQUIRED_EXPORTS } from '../../artifact-contract.mjs';
import { reportCliKitLibraryChanges } from '../../vendor-cli-kit-report.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vendorDir = path.join(root, 'vendor', 'openspec');
const manifestPath = path.join(root, 'package.json');

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

const previousBuildInfoPath = path.join(vendorDir, 'BUILD-INFO.json');
const previousBuildInfo =
	fs.existsSync(previousBuildInfoPath) ?
		JSON.parse(fs.readFileSync(previousBuildInfoPath, 'utf-8'))
	:	null;

const buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, 'utf-8'));
if (buildInfo.schemaVersion !== 1)
	fail(`unsupported BUILD-INFO schema ${buildInfo.schemaVersion}`);
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
for (const [subpath, symbols] of Object.entries(REQUIRED_EXPORTS)) {
	if (
		JSON.stringify(buildInfo.exportedSymbols?.[subpath]) !==
		JSON.stringify(symbols)
	) {
		fail(`unsupported ${subpath} API in BUILD-INFO.json`);
	}
	if (
		!buildInfo.exports?.[subpath]?.default ||
		!buildInfo.exports?.[subpath]?.types
	) {
		fail(`BUILD-INFO.json has no complete ${subpath} package export`);
	}
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

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
manifest.dependencies[buildInfo.package] =
	`file:vendor/openspec/${tarballName}`;
for (const name of Object.keys(manifest.dependencies)) {
	if (name !== buildInfo.package) delete manifest.dependencies[name];
}
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const install = spawnSync(
	'npm',
	[
		'install',
		'--package-lock-only',
		'--ignore-scripts',
		'--offline',
		'--no-audit',
		'--no-fund',
		'--no-update-notifier',
	],
	{
		cwd: root,
		stdio: 'inherit',
		env: process.env,
		shell: process.platform === 'win32',
	},
);
if (install.error) throw install.error;
if (install.status !== 0)
	fail(`npm lockfile generation exited with ${install.status}`);

console.log(
	`Vendored ${buildInfo.package}@${buildInfo.version} (${tarballName})`,
);
if (buildInfo.cliKitLibraries) {
	console.log('Bundled CLI libraries:');
	reportCliKitLibraryChanges(
		previousBuildInfo?.cliKitLibraries,
		buildInfo.cliKitLibraries,
	);
}
