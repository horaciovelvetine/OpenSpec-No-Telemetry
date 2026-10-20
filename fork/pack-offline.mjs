#!/usr/bin/env node
/**
 * Builds the offline OpenSpec tarball.
 *
 * Every production dependency is bundled inside the tarball, at the exact
 * versions in pnpm-lock.yaml, so installing it never contacts a registry.
 * Building needs registry access only for `pnpm install` on this machine.
 *
 * Usage:
 *   node fork/pack-offline.mjs [--allow-dirty] [--keep-stage]
 *
 * Output (fork/out/):
 *   fission-ai-openspec-<version>-no-telem.<build>.tgz
 *   SHA256SUMS, BUILD-INFO.json, THIRD-PARTY-LICENSES
 */

import crypto from 'node:crypto';
import { spawnSync as nodeSpawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUIRED_EXPORTS } from './artifact-contract.mjs';

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'..',
);
const forkDir = path.join(repoRoot, 'fork');
const stageDir = path.join(forkDir, '.stage');
const outDir = path.join(forkDir, 'out');
const require = createRequire(import.meta.url);
let spawnSync = nodeSpawnSync;

const args = new Set(process.argv.slice(2));
const allowDirty = args.has('--allow-dirty');
const keepStage = args.has('--keep-stage');
const unknownArgs = [...args].filter(
	arg => !['--allow-dirty', '--keep-stage'].includes(arg),
);
if (unknownArgs.length > 0) {
	throw new Error(`unknown option(s): ${unknownArgs.join(', ')}`);
}

const STAGED_FILES = [
	'package.json',
	'pnpm-lock.yaml',
	'pnpm-workspace.yaml',
	'README.md',
	'LICENSE',
	'bin',
	'schemas',
	'dist',
];

const LICENSE_FILE = /^(?:licen[cs]e|copying|notice)(?:[.-].*)?$/i;

function step(message) {
	console.log(`\n▶ ${message}`);
}

function run(command, commandArgs, options = {}) {
	const result = spawnSync(command, commandArgs, {
		cwd: repoRoot,
		stdio: 'inherit',
		...options,
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(
			`${command} ${commandArgs.join(' ')} exited with ${result.status}`,
		);
	}
}

function capture(command, commandArgs, options = {}) {
	const result = spawnSync(command, commandArgs, {
		cwd: repoRoot,
		encoding: 'utf-8',
		...options,
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(
			`${command} ${commandArgs.join(' ')} exited with ${result.status}: ${result.stderr}`,
		);
	}
	return result.stdout.trim();
}

function git(gitArgs) {
	try {
		return capture('git', ['-c', `safe.directory=${repoRoot}`, ...gitArgs]);
	} catch {
		return null;
	}
}

function readJson(file) {
	return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

/** Every installed package (name@version → directory), nested copies included. */
function installedPackages(nodeModules, found = new Map()) {
	if (!fs.existsSync(nodeModules)) return found;
	for (const entry of fs.readdirSync(nodeModules, { withFileTypes: true })) {
		if (entry.name.startsWith('.') || !entry.isDirectory()) continue;
		const dirs =
			entry.name.startsWith('@') ?
				fs
					.readdirSync(path.join(nodeModules, entry.name), {
						withFileTypes: true,
					})
					.filter(scoped => scoped.isDirectory())
					.map(scoped => path.join(nodeModules, entry.name, scoped.name))
			:	[path.join(nodeModules, entry.name)];
		for (const dir of dirs) {
			const manifestPath = path.join(dir, 'package.json');
			if (!fs.existsSync(manifestPath)) continue;
			const { name, version } = readJson(manifestPath);
			const key = `${name}@${version}`;
			if (!found.has(key)) found.set(key, dir);
			installedPackages(path.join(dir, 'node_modules'), found);
		}
	}
	return found;
}

/**
 * npm pack stores a symlink or a second hard link to a file as a link entry,
 * and npm skips link entries when it installs a tarball, so every staged file
 * must be a plain file. `.bin` links are left out of bundles anyway.
 */
function assertPlainFiles(dir) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === '.bin') continue;
		const full = path.join(dir, entry.name);
		const where = path.relative(stageDir, full);
		if (entry.isSymbolicLink()) {
			throw new Error(
				`staged node_modules contains a symlink (${where}); it would not survive npm install`,
			);
		}
		if (entry.isDirectory()) {
			assertPlainFiles(full);
		} else if (fs.statSync(full).nlink > 1) {
			throw new Error(
				`staged file ${where} is hard-linked; it would not survive npm install`,
			);
		}
	}
}

function licenseNotice(key, dir) {
	const manifest = readJson(path.join(dir, 'package.json'));
	const license =
		typeof manifest.license === 'string' ? manifest.license : 'UNKNOWN';
	const texts = fs
		.readdirSync(dir)
		.filter(
			file =>
				LICENSE_FILE.test(file) && fs.statSync(path.join(dir, file)).isFile(),
		)
		.sort()
		.map(file => fs.readFileSync(path.join(dir, file), 'utf-8').trim());
	return [
		'-'.repeat(78),
		`${key}`,
		`License: ${license}`,
		manifest.repository ?
			`Repository: ${typeof manifest.repository === 'string' ? manifest.repository : manifest.repository.url}`
		:	null,
		'',
		texts.length > 0 ?
			texts.join('\n\n')
		:	'(no license file shipped with this package)',
		'',
	]
		.filter(line => line !== null)
		.join('\n');
}

function main() {
	const rootPackage = readJson(path.join(repoRoot, 'package.json'));
	const { build, upstreamCommit, upstreamTag } = readJson(
		path.join(forkDir, 'fork.json'),
	);
	if (!Number.isInteger(build) || build < 1) {
		throw new Error('fork/fork.json "build" must be a positive integer');
	}
	if (
		typeof upstreamCommit !== 'string' ||
		!/^[0-9a-f]{40}$/.test(upstreamCommit)
	) {
		throw new Error(
			'fork/fork.json "upstreamCommit" must be a full lowercase commit hash',
		);
	}
	if (
		upstreamTag !== null &&
		(typeof upstreamTag !== 'string' || upstreamTag.length === 0)
	) {
		throw new Error(
			'fork/fork.json "upstreamTag" must be a non-empty string or null',
		);
	}
	if (git(['merge-base', '--is-ancestor', upstreamCommit, 'HEAD']) === null) {
		throw new Error(
			`recorded upstream commit ${upstreamCommit} is not an ancestor of HEAD`,
		);
	}
	const version = `${rootPackage.version}-no-telem.${build}`;
	const status = git(['status', '--porcelain']);
	const dirty = status !== null && status.length > 0;
	if (dirty && !allowDirty) {
		throw new Error(
			'refusing to create a release artifact from an uncommitted tree; commit the fork or use --allow-dirty for a development-only build',
		);
	}

	step('Installing dependencies from the lockfile');
	run(
		'pnpm',
		['install', '--frozen-lockfile', '--config.confirm-modules-purge=false'],
		{
			// Before dependencies exist there is no cross-spawn to resolve Windows
			// command shims. This is the one dependency-free bootstrap call.
			shell: process.platform === 'win32',
		},
	);
	spawnSync = require('cross-spawn').sync;

	step('Building');
	run('pnpm', ['run', 'build']);

	step('Running the test suite');
	run('pnpm', ['test']);

	step('Running the network and packaging audit');
	run(process.execPath, [path.join(forkDir, 'audit-network.mjs')]);

	step('Staging a hoisted production install');
	fs.rmSync(stageDir, { recursive: true, force: true });
	fs.mkdirSync(stageDir, { recursive: true });
	for (const entry of STAGED_FILES) {
		fs.cpSync(path.join(repoRoot, entry), path.join(stageDir, entry), {
			recursive: true,
		});
	}
	// Hoisted: real directories instead of pnpm's symlinked layout. Copy: no
	// hard links into pnpm's store.
	fs.writeFileSync(
		path.join(stageDir, '.npmrc'),
		'node-linker=hoisted\npackage-import-method=copy\n',
	);
	run(
		'pnpm',
		[
			'install',
			'--prod',
			'--frozen-lockfile',
			'--ignore-scripts',
			'--prefer-offline',
		],
		{
			cwd: stageDir,
		},
	);
	assertPlainFiles(path.join(stageDir, 'node_modules'));

	// The staged tree must be exactly the audited one: same packages, same versions.
	const staged = installedPackages(path.join(stageDir, 'node_modules'));
	const pinned = new Set(
		readJson(path.join(forkDir, 'allowed-deps.json')).packages,
	);
	const extra = [...staged.keys()].filter(key => !pinned.has(key));
	const missing = [...pinned].filter(key => !staged.has(key));
	if (extra.length > 0 || missing.length > 0) {
		throw new Error(
			`staged dependencies differ from fork/allowed-deps.json\n  extra: ${extra.join(', ') || 'none'}\n  missing: ${missing.join(', ') || 'none'}`,
		);
	}
	console.log(
		`  ${staged.size} production packages staged, matching fork/allowed-deps.json`,
	);

	step(`Writing the staged manifest (${version})`);
	const stagedManifest = readJson(path.join(stageDir, 'package.json'));
	delete stagedManifest.scripts;
	delete stagedManifest.devDependencies;
	delete stagedManifest.packageManager;
	stagedManifest.version = version;
	stagedManifest.private = true;
	stagedManifest.bundleDependencies = true;
	fs.writeFileSync(
		path.join(stageDir, 'package.json'),
		`${JSON.stringify(stagedManifest, null, 2)}\n`,
	);
	for (const buildInput of [
		'pnpm-lock.yaml',
		'pnpm-workspace.yaml',
		'.npmrc',
	]) {
		fs.rmSync(path.join(stageDir, buildInput), { force: true });
	}

	step('Packing');
	fs.rmSync(outDir, { recursive: true, force: true });
	fs.mkdirSync(outDir, { recursive: true });
	const packOutput = capture(
		'npm',
		['pack', '--json', '--ignore-scripts', '--pack-destination', outDir],
		{
			cwd: stageDir,
		},
	);
	const [packed] = JSON.parse(packOutput);
	const tarballPath = path.join(outDir, packed.filename);
	const bundledCount = packed.bundled?.length ?? 0;
	if (bundledCount === 0) {
		throw new Error(
			'npm pack bundled no dependencies; the tarball would need a registry to install',
		);
	}
	const packedFiles = new Set(packed.files.map(file => file.path));
	for (const required of [
		'package.json',
		'dist/cli/index.js',
		'bin/openspec.js',
		'schemas/spec-driven/schema.yaml',
	]) {
		if (!packedFiles.has(required)) {
			throw new Error(`packed artifact is missing ${required}`);
		}
	}
	for (const forbidden of ['pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc']) {
		if (packedFiles.has(forbidden)) {
			throw new Error(`packed artifact contains build-only file ${forbidden}`);
		}
	}
	const allowedRoots = new Set([
		'LICENSE',
		'README.md',
		'bin',
		'dist',
		'node_modules',
		'package.json',
		'schemas',
	]);
	const unexpected = [...packedFiles].filter(
		file => !allowedRoots.has(file.split('/')[0]),
	);
	if (unexpected.length > 0) {
		throw new Error(
			`packed artifact contains unexpected files: ${unexpected.join(', ')}`,
		);
	}

	const tarball = fs.readFileSync(tarballPath);
	const sha256 = crypto.createHash('sha256').update(tarball).digest('hex');
	fs.writeFileSync(
		path.join(outDir, 'SHA256SUMS'),
		`${sha256}  ${packed.filename}\n`,
	);

	const buildInfo = {
		schemaVersion: 2,
		package: stagedManifest.name,
		version,
		upstreamVersion: rootPackage.version,
		forkBuild: build,
		upstreamCommit,
		upstreamTag,
		forkCommit: git(['rev-parse', 'HEAD']),
		forkCommitDirty: dirty,
		builtAt: new Date().toISOString(),
		node: process.version,
		pnpm: capture('pnpm', ['--version']),
		npm: capture('npm', ['--version']),
		tarball: packed.filename,
		artifactFormat: 'bundled-npm-tarball',
		sha256,
		sizeBytes: tarball.length,
		bundledPackages: staged.size,
		engines: stagedManifest.engines,
		exports: stagedManifest.exports,
		exportedSymbols: REQUIRED_EXPORTS,
		bin: stagedManifest.bin,
		supportedSurface: readJson(path.join(forkDir, 'supported-surface.json')),
		verification: {
			networkAudit: true,
			offlineConsumer: false,
			allSupportedTools: false,
		},
	};
	const buildInfoPath = path.join(outDir, 'BUILD-INFO.json');
	const writeBuildInfo = () =>
		fs.writeFileSync(buildInfoPath, `${JSON.stringify(buildInfo, null, 2)}\n`);
	writeBuildInfo();

	const notices = [
		`Third-party notices for ${stagedManifest.name}@${version}`,
		'',
		'OpenSpec itself:',
		'',
		fs.readFileSync(path.join(repoRoot, 'LICENSE'), 'utf-8').trim(),
		'',
		`Bundled production dependencies (${staged.size}):`,
		'',
		...[...staged.keys()]
			.sort()
			.map(key => licenseNotice(key, staged.get(key))),
	].join('\n');
	fs.writeFileSync(path.join(outDir, 'THIRD-PARTY-LICENSES'), `${notices}\n`);

	if (!keepStage) fs.rmSync(stageDir, { recursive: true, force: true });

	console.log(
		[
			'',
			`✔ ${path.relative(repoRoot, tarballPath)}`,
			`  ${(tarball.length / 1024 / 1024).toFixed(2)} MB packed, ${packed.entryCount} files, ${staged.size} bundled packages`,
			`  sha256 ${sha256}`,
			dirty ?
				'  development build: working tree has uncommitted changes'
			:	null,
		]
			.filter(Boolean)
			.join('\n'),
	);

	step('Verifying the tarball offline');
	run(process.execPath, [
		path.join(forkDir, 'verify-offline.mjs'),
		tarballPath,
	]);
	buildInfo.verification.offlineConsumer = true;
	buildInfo.verification.allSupportedTools = true;
	buildInfo.verifiedAt = new Date().toISOString();
	writeBuildInfo();
}

try {
	main();
} catch (error) {
	console.error(
		`\n✖ pack-offline: ${error instanceof Error ? error.message : String(error)}`,
	);
	process.exit(1);
}
