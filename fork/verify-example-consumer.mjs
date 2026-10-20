#!/usr/bin/env node
/**
 * End-to-end check of fork/example-consumer against a built offline tarball, with
 * no registry anywhere:
 * 1. vendors the tarball into a copy of the example (plain-file model; no lockfile)
 * 2. packs the consumer the way its release job does (release.json + vendored files)
 * 3. runs `npx <acme tarball>` like a user: a conflicting global OpenSpec stops
 *    the install, `install --yes` installs the fork tarball globally, and acme lands on PATH
 * 4. runs acme-init and acme update in a project under the no-network preload
 *
 * Usage: node fork/verify-example-consumer.mjs [fork/out/<tarball>] [--keep]
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import spawn from 'cross-spawn';

const forkDir = path.dirname(fileURLToPath(import.meta.url));
const exampleDir = path.join(forkDir, 'example-consumer');
const outDir = path.join(forkDir, 'out');
const preload = path.join(forkDir, 'no-network-preload.mjs');

const FORK_OPENSPEC_VERSION_SUFFIX = /-no-telem\.\d+$/;

const args = process.argv.slice(2);
const keep = args.includes('--keep');
const tarballArg = args.find(arg => !arg.startsWith('--'));

let checks = 0;
function check(condition, message) {
	if (!condition) throw new Error(message);
	checks++;
}

function run(command, commandArgs, options) {
	const result = spawn.sync(command, commandArgs, {
		encoding: 'utf-8',
		stdio: ['ignore', 'pipe', 'pipe'],
		...options,
	});
	if (result.error) throw result.error;
	return result;
}

function describe(result) {
	return `exit ${result.status}\n--- stdout ---\n${result.stdout}\n--- stderr ---\n${result.stderr}`;
}

const servers = [];

/**
 * Serves `dir` over HTTP on 127.0.0.1 from a child process (the checks below
 * block this process with spawnSync) and returns the base URL.
 */
function serveDirectory(dir, tmp) {
	const portFile = path.join(tmp, 'server.port');
	const serverCode = `
    const fs = require('fs'), http = require('http'), path = require('path');
    const [dir, portFile] = process.argv.slice(1);
    const server = http.createServer((req, res) => {
      const file = path.join(dir, path.basename(decodeURIComponent(req.url)));
      if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => fs.writeFileSync(portFile, String(server.address().port)));
  `;
	servers.push(
		spawn(process.execPath, ['-e', serverCode, dir, portFile], {
			stdio: 'ignore',
		}),
	);
	const deadline = Date.now() + 10_000;
	while (!fs.existsSync(portFile)) {
		if (Date.now() > deadline)
			throw new Error('the local release server did not start');
		Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
	}
	return `http://127.0.0.1:${fs.readFileSync(portFile, 'utf-8').trim()}`;
}

function findTarball() {
	if (tarballArg) return path.resolve(tarballArg);
	const tarballs =
		fs.existsSync(outDir) ?
			fs.readdirSync(outDir).filter(file => file.endsWith('.tgz'))
		:	[];
	if (tarballs.length !== 1)
		throw new Error(
			'build the tarball first (node fork/pack-offline.mjs) or pass its path',
		);
	return path.join(outDir, tarballs[0]);
}

function main() {
	if (process.platform === 'win32')
		throw new Error(
			'this check uses POSIX global install paths; run it on Linux or macOS',
		);
	const tarball = findTarball();
	const tmp = fs.mkdtempSync(
		path.join(os.tmpdir(), 'example-consumer-verify-'),
	);
	try {
		verify(tarball, tmp);
	} finally {
		for (const server of servers) server.kill();
		if (keep) console.log(`  kept ${tmp}`);
		else fs.rmSync(tmp, { recursive: true, force: true });
	}
}

function verify(tarball, tmp) {
	// 1. Follow the example's documented vendor + lock + CI install sequence.
	const consumerDir = path.join(tmp, 'consumer');
	fs.cpSync(exampleDir, consumerDir, {
		recursive: true,
		filter: source => !source.split(path.sep).includes('node_modules'),
	});
	// Prefix through a symlink so ownedByThisPackage must realpath both sides.
	const globalPrefixReal = path.join(tmp, 'global-real');
	const globalPrefix = path.join(tmp, 'global');
	fs.mkdirSync(globalPrefixReal, { recursive: true });
	fs.symlinkSync(globalPrefixReal, globalPrefix);
	const globalBin = path.join(globalPrefix, 'bin');
	const home = path.join(tmp, 'home');
	fs.mkdirSync(path.join(tmp, 'npm-cache'), { recursive: true });
	fs.mkdirSync(home);
	fs.writeFileSync(path.join(tmp, 'user.npmrc'), '');
	fs.writeFileSync(path.join(tmp, 'global.npmrc'), '');
	const env = {
		...Object.fromEntries(
			Object.entries(process.env).filter(([key]) => !/^npm_/i.test(key)),
		),
		npm_config_cache: path.join(tmp, 'npm-cache'),
		npm_config_userconfig: path.join(tmp, 'user.npmrc'),
		npm_config_globalconfig: path.join(tmp, 'global.npmrc'),
		npm_config_prefix: globalPrefix,
		npm_config_offline: 'true',
		npm_config_registry: 'http://127.0.0.1:9/',
		npm_config_audit: 'false',
		npm_config_fund: 'false',
		npm_config_update_notifier: 'false',
		HOME: home,
		XDG_CONFIG_HOME: path.join(home, '.config'),
		XDG_DATA_HOME: path.join(home, '.local', 'share'),
		ACME_HOME: path.join(home, '.acme'),
		PATH: `${globalBin}${path.delimiter}${process.env.PATH ?? ''}`,
	};
	for (const optOut of [
		'OPENSPEC_TELEMETRY',
		'DO_NOT_TRACK',
		'CI',
		'NODE_OPTIONS',
	])
		delete env[optOut];

	const buildInfo = JSON.parse(
		fs.readFileSync(
			path.join(path.dirname(tarball), 'BUILD-INFO.json'),
			'utf-8',
		),
	);
	const manifestPath = path.join(consumerDir, 'package.json');
	const manifestBefore = fs.readFileSync(manifestPath, 'utf-8');

	const staleOut = path.join(tmp, 'stale-out');
	fs.cpSync(path.dirname(tarball), staleOut, { recursive: true });
	const staleInfo = JSON.parse(
		fs.readFileSync(path.join(staleOut, 'BUILD-INFO.json'), 'utf-8'),
	);
	staleInfo.schemaVersion = 1;
	fs.writeFileSync(
		path.join(staleOut, 'BUILD-INFO.json'),
		`${JSON.stringify(staleInfo, null, 2)}\n`,
	);
	const rejectedSchema = run(
		process.execPath,
		['scripts/vendor-openspec.mjs', '--from', staleOut],
		{ cwd: consumerDir, env },
	);
	check(
		rejectedSchema.status !== 0 &&
			/unsupported BUILD-INFO schema 1/.test(rejectedSchema.stderr),
		`the vendor command accepted BUILD-INFO schema 1\n${describe(rejectedSchema)}`,
	);

	const vendorArgs = [
		'scripts/vendor-openspec.mjs',
		'--from',
		path.dirname(tarball),
	];
	if (buildInfo.forkCommitDirty === true) {
		const rejected = run(process.execPath, vendorArgs, {
			cwd: consumerDir,
			env,
		});
		check(
			rejected.status !== 0 &&
				/refusing a development artifact/.test(rejected.stderr),
			`the vendor command accepted a dirty artifact without an explicit override\n${describe(rejected)}`,
		);
		vendorArgs.push('--allow-dirty');
	}
	const vendor = run(process.execPath, vendorArgs, { cwd: consumerDir, env });
	check(
		vendor.status === 0,
		`the documented vendor command failed\n${describe(vendor)}`,
	);
	const vendorDir = path.join(consumerDir, 'vendor', 'openspec');
	const tarballName = path.basename(tarball);
	check(
		fs.existsSync(path.join(vendorDir, tarballName)),
		'the vendor command did not copy the artifact',
	);
	check(
		manifestBefore === fs.readFileSync(manifestPath, 'utf-8'),
		'the vendor command changed package.json',
	);
	check(
		!fs.existsSync(path.join(consumerDir, 'package-lock.json')),
		'the vendor command created a lockfile',
	);
	const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
	const acmeVersion = run(process.execPath, ['bin/acme.js', '--version'], {
		cwd: consumerDir,
		env,
	});
	check(
		acmeVersion.status === 0 &&
			/OpenSpec .*-no-telem\.\d+/.test(acmeVersion.stdout),
		`acme --version failed\n${describe(acmeVersion)}`,
	);
	console.log(
		'  ✓ example vendor command copies the artifact without npm dependencies',
	);

	// 2. Pack it with the release job's script, for a URL served from this machine.
	const distDir = path.join(tmp, 'dist');
	fs.mkdirSync(distDir);
	const releaseUrl = `${serveDirectory(distDir, tmp)}/acme-${manifest.version}.tgz`;
	const acmeTarball = path.join(distDir, `acme-${manifest.version}.tgz`);
	const pack = run(
		process.execPath,
		['scripts/pack-release.mjs', '--url', releaseUrl, '--out', distDir],
		{
			cwd: consumerDir,
			env,
		},
	);
	check(
		pack.status === 0 && pack.stdout.trim() === acmeTarball,
		`scripts/pack-release.mjs failed\n${describe(pack)}`,
	);
	const listed = run('tar', ['-tzf', acmeTarball], { cwd: tmp, env });
	check(listed.status === 0, `could not list the release tarball\n${describe(listed)}`);
	const entries = listed.stdout.trim().split('\n');
	check(
		entries.some(line => line.includes(`vendor/openspec/${tarballName}`)),
		'the release tarball is missing the vendored OpenSpec artifact',
	);
	check(
		!entries.some(line => line.startsWith('package/node_modules/')),
		'the release tarball contains node_modules',
	);
	console.log(
		'  ✓ pack-release.mjs ships vendored OpenSpec files and writes release.json',
	);

	// 3. A conflicting global OpenSpec stops the install; --yes removes it.
	const fakeUpstream = path.join(
		globalPrefix,
		'lib',
		'node_modules',
		'@fission-ai',
		'openspec',
	);
	fs.mkdirSync(path.join(fakeUpstream, 'bin'), { recursive: true });
	fs.writeFileSync(
		path.join(fakeUpstream, 'package.json'),
		JSON.stringify({
			name: '@fission-ai/openspec',
			version: '1.14.0',
			bin: { openspec: 'bin/openspec.js' },
		}),
	);
	fs.writeFileSync(
		path.join(fakeUpstream, 'bin', 'openspec.js'),
		'#!/usr/bin/env node\nconsole.log("1.14.0");\n',
		{ mode: 0o755 },
	);
	fs.mkdirSync(globalBin, { recursive: true });
	fs.symlinkSync(
		'../lib/node_modules/@fission-ai/openspec/bin/openspec.js',
		path.join(globalBin, 'openspec'),
	);

	// As a user would: npx with the release URL. The registry stays unreachable
	// and never retried, so any registry request fails the run.
	const online = {
		...env,
		npm_config_offline: 'false',
		npm_config_fetch_retries: '0',
	};
	const blocked = run('npx', ['--yes', releaseUrl], { cwd: tmp, env: online });
	check(
		blocked.status === 1,
		`the installer did not stop for a conflicting global OpenSpec\n${describe(blocked)}`,
	);
	check(
		/@fission-ai\/openspec@1\.14\.0/.test(blocked.stderr) &&
			/telemetry/.test(blocked.stderr),
		`the conflict message does not name upstream OpenSpec\n${describe(blocked)}`,
	);
	console.log('  ✓ npx <release URL> stops for an upstream global OpenSpec');

	const installed = run('npx', ['--yes', releaseUrl, 'install', '--yes'], {
		cwd: tmp,
		env: online,
	});
	check(
		installed.status === 0,
		`npx <release URL> install --yes failed\n${describe(installed)}`,
	);
	const globalSpecPkg = path.join(
		globalPrefix,
		'lib',
		'node_modules',
		'@fission-ai',
		'openspec',
		'package.json',
	);
	check(
		fs.existsSync(globalSpecPkg),
		'the fork OpenSpec package was not installed globally',
	);
	const installedSpecVersion = JSON.parse(
		fs.readFileSync(globalSpecPkg, 'utf-8'),
	).version;
	check(
		FORK_OPENSPEC_VERSION_SUFFIX.test(installedSpecVersion),
		`global OpenSpec is ${installedSpecVersion}, not the vendored build`,
	);
	for (const bin of ['acme', 'acme-init', 'openspec']) {
		check(
			fs.existsSync(path.join(globalBin, bin)),
			`global install created no ${bin} command`,
		);
	}
	const openspecVersion = run('openspec', ['--version'], {
		cwd: tmp,
		env,
	}).stdout.trim();
	check(
		FORK_OPENSPEC_VERSION_SUFFIX.test(openspecVersion),
		`openspec on PATH reports ${openspecVersion}, not the vendored build`,
	);
	check(
		fs.existsSync(path.join(home, '.acme', 'toolkit', 'README.md')),
		'the toolkit was not copied to ACME_HOME',
	);
	const installRecordPath = path.join(home, '.acme', 'install.json');
	check(fs.existsSync(installRecordPath), 'install.json was not written');
	const installRecord = JSON.parse(
		fs.readFileSync(installRecordPath, 'utf-8'),
	);
	check(
		typeof installRecord.openspecEntry === 'string' &&
			fs.existsSync(installRecord.openspecEntry),
		'install.json did not record a valid openspecEntry',
	);
	console.log(
		`  ✓ npx install --yes puts acme, acme-init, and openspec ${openspecVersion} on PATH`,
	);

	const reinstall = run('npx', ['--yes', releaseUrl, 'install'], {
		cwd: tmp,
		env: online,
	});
	check(
		reinstall.status === 0,
		`upgrade reinstall over the same global install failed\n${describe(reinstall)}`,
	);
	const openspecVersionAfter = run('openspec', ['--version'], {
		cwd: tmp,
		env,
	}).stdout.trim();
	check(
		openspecVersionAfter === openspecVersion,
		`reinstall changed openspec --version (${openspecVersion} → ${openspecVersionAfter})`,
	);
	console.log(
		'  ✓ npx install upgrades over itself when prefix is reached via symlink',
	);

	// 4. acme-init and acme update under the no-network preload.
	const project = path.join(tmp, 'project');
	fs.mkdirSync(project);
	const networkLog = path.join(tmp, 'network.log');
	const guarded = {
		...env,
		NODE_OPTIONS: `--import=${pathToFileURL(preload).href}`,
		NO_NETWORK_LOG: networkLog,
	};

	const init = run('acme-init', ['--yes'], { cwd: project, env: guarded });
	check(init.status === 0, `acme-init failed\n${describe(init)}`);
	check(
		fs.existsSync(path.join(project, 'openspec', 'config.yaml')),
		'acme-init left no openspec/config.yaml',
	);
	const skills = fs
		.readdirSync(path.join(project, '.kiro', 'skills'))
		.filter(dir => dir.startsWith('openspec-'));
	check(
		skills.length === 6,
		`expected 6 OpenSpec skills for Kiro, found ${skills.length}`,
	);
	for (const skill of skills) {
		const body = fs.readFileSync(
			path.join(project, '.kiro', 'skills', skill, 'SKILL.md'),
			'utf-8',
		);
		check(
			body.includes(`generatedBy: "${openspecVersion}"`),
			`${skill} is not stamped with ${openspecVersion}`,
		);
	}
	const prompts = fs
		.readdirSync(path.join(project, '.kiro', 'prompts'))
		.filter(file => file.startsWith('opsx-'));
	check(
		prompts.length === 6,
		`expected 6 /opsx-* prompts for Kiro, found ${prompts.length}`,
	);
	const steering = path.join(project, '.kiro', 'steering', 'acme-project.md');
	check(fs.existsSync(steering), 'acme-init wrote no example project steering');
	const projectConfig = JSON.parse(
		fs.readFileSync(path.join(project, '.acme', 'project.json'), 'utf-8'),
	);
	check(
		JSON.stringify(projectConfig.ides) === '["kiro"]',
		'.acme/project.json does not record the Kiro choice',
	);
	console.log(
		'  ✓ acme-init sets up OpenSpec for Kiro plus example project files',
	);

	fs.appendFileSync(steering, '\nProject-specific note.\n');
	const update = run('acme', ['update'], { cwd: project, env: guarded });
	check(update.status === 0, `acme update failed\n${describe(update)}`);
	check(
		fs.readFileSync(steering, 'utf-8').includes('Project-specific note.'),
		'acme update overwrote customized steering',
	);
	const list = run('openspec', ['list', '--json'], {
		cwd: project,
		env: guarded,
	});
	check(
		list.status === 0 && JSON.parse(list.stdout).changes !== undefined,
		`openspec list --json failed\n${describe(list)}`,
	);
	console.log('  ✓ acme update refreshes OpenSpec and keeps customized files');

	const attempts =
		fs.existsSync(networkLog) ?
			fs.readFileSync(networkLog, 'utf-8').trim()
		:	'';
	check(attempts === '', `network attempts were recorded:\n${attempts}`);
	console.log('  ✓ no network attempts recorded');
}

try {
	main();
	console.log(`\n✔ Example consumer verification passed (${checks} checks)`);
} catch (error) {
	console.error(
		`\n✖ Example consumer verification failed: ${error instanceof Error ? error.message : String(error)}`,
	);
	process.exit(1);
}
