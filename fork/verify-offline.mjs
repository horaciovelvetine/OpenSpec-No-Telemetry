#!/usr/bin/env node
/**
 * Proves an offline OpenSpec tarball works as local dependency:
 * 1. installs it into a minimal consumer from an empty npm cache with
 *    --offline and an unreachable registry, so any fetch fails the install
 * 2. imports the supported package subpaths and runs a local `openspec`
 *    shim under fork/no-network-preload.mjs
 * 3. exercises Kiro and the complete upstream tool set, checks generated
 *    files/version stamps, and asserts that no network attempt was recorded
 *
 * Usage: node fork/verify-offline.mjs <tarball> [--keep]
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import spawn from 'cross-spawn';
import { auditPackagedTree } from './audit-network.mjs';
import { REQUIRED_EXPORTS } from './artifact-contract.mjs';

const forkDir = path.dirname(fileURLToPath(import.meta.url));
const preload = path.join(forkDir, 'no-network-preload.mjs');

const KIRO_SKILLS = [
	'openspec-propose',
	'openspec-explore',
	'openspec-apply-change',
	'openspec-update-change',
	'openspec-sync-specs',
	'openspec-archive-change',
];
const KIRO_PROMPTS = [
	'propose',
	'explore',
	'apply',
	'update',
	'sync',
	'archive',
].map(id => `opsx-${id}.prompt.md`);

const args = process.argv.slice(2);
const keep = args.includes('--keep');
const tarballArg = args.find(arg => !arg.startsWith('--'));

let checks = 0;
function check(condition, message) {
	if (!condition) throw new Error(message);
	checks++;
}

function withoutNpmConfig(env) {
	return Object.fromEntries(
		Object.entries(env).filter(
			([key]) => !/^npm_(?:config|package|lifecycle)_/i.test(key),
		),
	);
}

function run(command, commandArgs, options) {
	const result = spawn.sync(command, commandArgs, {
		encoding: 'utf-8',
		...options,
	});
	if (result.error) throw result.error;
	return result;
}

function describe(result) {
	return `exit ${result.status}\n--- stdout ---\n${result.stdout}\n--- stderr ---\n${result.stderr}`;
}

function main() {
	if (!tarballArg)
		throw new Error('usage: node fork/verify-offline.mjs <tarball> [--keep]');
	const tarball = path.resolve(tarballArg);
	check(fs.existsSync(tarball), `tarball not found: ${tarball}`);

	const tmp = fs.mkdtempSync(
		path.join(os.tmpdir(), 'openspec-offline-verify-'),
	);
	try {
		verify(tarball, tmp);
	} finally {
		if (keep) console.log(`  kept ${tmp}`);
		else fs.rmSync(tmp, { recursive: true, force: true });
	}
}

function verify(tarball, tmp) {
	const networkLog = path.join(tmp, 'network.log');
	const nodeOptions = `--import=${pathToFileURL(preload).href}`;

	// 0. The preload must actually block, or every later check passes vacuously.
	const armLog = path.join(tmp, 'arm.log');
	const armScript = `
    const attempts = [
      () => fetch('http://127.0.0.1:9/'),
      () => new WebSocket('ws://127.0.0.1:9/'),
      () => new XMLHttpRequest(),
      () => new EventSource('http://127.0.0.1:9/'),
      () => navigator.sendBeacon('http://127.0.0.1:9/'),
      () => require('http').get('http://127.0.0.1:9/'),
      () => require('https').get('https://127.0.0.1:9/'),
      () => require('http2').connect('http://127.0.0.1:9/'),
      () => require('net').connect(9, '127.0.0.1'),
      () => require('tls').connect(9, '127.0.0.1'),
      () => require('dgram').createSocket('udp4'),
      () => require('dns').lookup('localhost', () => {}),
      () => require('dns').promises.lookup('localhost'),
      () => require('child_process').spawnSync('npm', ['view', 'openspec']),
      () => require('child_process').spawnSync('git', ['fetch', 'origin']),
    ];
    for (const attempt of attempts) {
      try { attempt(); } catch {}
    }
  `;
	run(process.execPath, ['-e', armScript], {
		env: { ...process.env, NODE_OPTIONS: nodeOptions, NO_NETWORK_LOG: armLog },
	});
	const armed = fs.existsSync(armLog) ? fs.readFileSync(armLog, 'utf-8') : '';
	for (const primitive of [
		'fetch()',
		'WebSocket',
		'XMLHttpRequest',
		'EventSource',
		'sendBeacon',
		'http.get',
		'https.get',
		'http2.connect',
		'net.connect',
		'tls.connect',
		'dgram.createSocket',
		'dns.lookup',
		'dns.promises.lookup',
		'spawning npm',
		'git fetch origin',
	]) {
		check(
			armed.includes(`blocked ${primitive}`),
			`the no-network preload did not block ${primitive}`,
		);
	}
	console.log('  ✓ no-network preload is armed');

	// 1. Offline installs.
	const emptyCache = path.join(tmp, 'empty-npm-cache');
	const userNpmrc = path.join(tmp, 'user.npmrc');
	const globalNpmrc = path.join(tmp, 'global.npmrc');
	fs.mkdirSync(emptyCache);
	fs.writeFileSync(userNpmrc, '');
	fs.writeFileSync(globalNpmrc, '');
	const npmEnv = {
		...withoutNpmConfig(process.env),
		npm_config_cache: emptyCache,
		npm_config_userconfig: userNpmrc,
		npm_config_globalconfig: globalNpmrc,
		npm_config_offline: 'true',
		npm_config_registry: 'http://127.0.0.1:9/',
		npm_config_audit: 'false',
		npm_config_fund: 'false',
		npm_config_update_notifier: 'false',
	};

	const consumer = path.join(tmp, 'consumer');
	fs.mkdirSync(consumer);
	fs.writeFileSync(
		path.join(consumer, 'package.json'),
		'{ "name": "offline-consumer", "private": true }\n',
	);
	const localInstall = run('npm', ['install', tarball, '--no-package-lock'], {
		cwd: consumer,
		env: npmEnv,
	});
	check(
		localInstall.status === 0,
		`offline local install failed\n${describe(localInstall)}`,
	);
	const installedRoot = path.join(
		consumer,
		'node_modules',
		'@fission-ai',
		'openspec',
	);
	const installed = JSON.parse(
		fs.readFileSync(path.join(installedRoot, 'package.json'), 'utf-8'),
	);
	const version = installed.version;
	const packagedAudit = auditPackagedTree(installedRoot);
	check(
		packagedAudit.findings.length === 0,
		`installed artifact failed its package audit:\n${packagedAudit.findings
			.map(({ check: id, detail }) => `  [${id}] ${detail}`)
			.join('\n')}`,
	);
	check(
		packagedAudit.files > 0,
		'installed artifact contains no executable package files',
	);
	check(
		fs.existsSync(
			path.join(installedRoot, 'node_modules', 'commander', 'package.json'),
		),
		'bundled dependencies were not installed inside the package',
	);
	const contractScript = path.join(consumer, 'contract.mjs');
	const cliChecks = REQUIRED_EXPORTS['./cli']
		.map(
			symbol =>
				`if (typeof cli.${symbol} !== 'function') throw new Error('missing cli export ${symbol}');`,
		)
		.join('\n');
	const expectedKit = JSON.stringify(REQUIRED_EXPORTS['./cli-kit']);
	fs.writeFileSync(
		contractScript,
		[
			"import * as cli from '@fission-ai/openspec/cli';",
			"import * as kit from '@fission-ai/openspec/cli-kit';",
			cliChecks,
			`const expectedKit = ${expectedKit};`,
			'const actualKit = Object.keys(kit).sort();',
			'if (JSON.stringify(actualKit) !== JSON.stringify(expectedKit)) {',
			"  throw new Error(`unexpected cli-kit exports: ${actualKit.join(', ')}`);",
			'}',
			'',
		].join('\n'),
	);
	const contract = run(process.execPath, [contractScript], {
		cwd: consumer,
		env: npmEnv,
	});
	check(
		contract.status === 0,
		`package export contract failed\n${describe(contract)}`,
	);

	const shim = path.join(consumer, 'openspec-shim.mjs');
	fs.writeFileSync(
		shim,
		"#!/usr/bin/env node\nimport { runCli } from '@fission-ai/openspec/cli';\nrunCli();\n",
	);
	console.log(
		`  ✓ offline dependency install and package exports (${version})`,
	);

	// 2. A Kiro journey through shim exposure, with no opt-outs.
	const home = path.join(tmp, 'home');
	const project = path.join(tmp, 'project');
	fs.mkdirSync(home);
	fs.mkdirSync(project);
	const journeyEnv = {
		...withoutNpmConfig(process.env),
		HOME: home,
		USERPROFILE: home,
		XDG_CONFIG_HOME: path.join(home, '.config'),
		XDG_DATA_HOME: path.join(home, '.local', 'share'),
		APPDATA: path.join(home, 'AppData', 'Roaming'),
		LOCALAPPDATA: path.join(home, 'AppData', 'Local'),
		NODE_OPTIONS: nodeOptions,
		NO_NETWORK_LOG: networkLog,
		OPEN_SPEC_INTERACTIVE: '0',
		OPENSPEC_NO_COMPLETIONS: '1',
	};
	for (const optOut of [
		'OPENSPEC_TELEMETRY',
		'DO_NOT_TRACK',
		'OPENSPEC_NO_UPDATE_CHECK',
		'CI',
	]) {
		delete journeyEnv[optOut];
	}

	const openspec = (commandArgs, { cwd = project, allow = [0] } = {}) => {
		const result = run(process.execPath, [shim, ...commandArgs], {
			cwd,
			env: journeyEnv,
		});
		check(
			allow.includes(result.status),
			`openspec ${commandArgs.join(' ')} failed\n${describe(result)}`,
		);
		return result;
	};
	const json = (result, label) => {
		try {
			return JSON.parse(result.stdout);
		} catch {
			throw new Error(
				`${label} did not print one JSON document\n${describe(result)}`,
			);
		}
	};

	check(
		openspec(['--version']).stdout.trim() === version,
		'openspec --version does not report the fork build',
	);
	openspec(
		[
			'init',
			project,
			'--tools',
			'kiro',
			'--profile',
			'core',
			'--force',
			'--no-animation',
		],
		{ cwd: tmp },
	);
	openspec(['new', 'change', 'demo']);
	check(
		json(openspec(['status', '--change', 'demo', '--json']), 'status')
			.changeName === 'demo',
		'status --json did not report the demo change',
	);
	json(
		openspec(['instructions', 'proposal', '--change', 'demo', '--json']),
		'instructions',
	);
	// A freshly scaffolded change has no proposal yet, so validation may report it.
	json(
		openspec(['validate', '--all', '--json'], { allow: [0, 1] }),
		'validate',
	);
	json(openspec(['list', '--json']), 'list');
	check(
		openspec(['config', 'get', 'delivery']).stdout.trim() === 'both',
		'default delivery is not "both"',
	);
	openspec(['update', '--force']);
	check(
		/up to date/i.test(openspec(['update']).stdout),
		'update did not report the refreshed skills as up to date',
	);
	check(
		json(openspec(['version', '--json']), 'version').version === version,
		'version --json does not report the fork build',
	);
	const feedback = openspec(['feedback', 'hello'], { allow: [1] });
	check(
		/unknown command/i.test(feedback.stderr),
		'the removed feedback command is still registered',
	);
	console.log(
		'  ✓ Kiro journey: init, new change, status, instructions, validate, list, config, update, version',
	);

	// 3. What the journey left behind.
	check(
		fs.existsSync(path.join(project, 'openspec', 'config.yaml')),
		'init wrote no openspec/config.yaml',
	);
	for (const skill of KIRO_SKILLS) {
		const file = path.join(project, '.kiro', 'skills', skill, 'SKILL.md');
		check(fs.existsSync(file), `missing .kiro/skills/${skill}/SKILL.md`);
		check(
			fs.readFileSync(file, 'utf-8').includes(`generatedBy: "${version}"`),
			`.kiro/skills/${skill}/SKILL.md is not stamped with ${version}`,
		);
	}
	for (const prompt of KIRO_PROMPTS) {
		check(
			fs.existsSync(path.join(project, '.kiro', 'prompts', prompt)),
			`missing .kiro/prompts/${prompt}`,
		);
	}
	check(
		!fs.existsSync(
			path.join(project, '.github', 'workflows', 'copilot-setup-steps.yml'),
		),
		'Copilot cloud-agent files were generated',
	);
	const globalConfig = path.join(home, '.config', 'openspec', 'config.json');
	if (fs.existsSync(globalConfig)) {
		check(
			!/telemetry|anonymousId/.test(fs.readFileSync(globalConfig, 'utf-8')),
			'the global config gained telemetry state',
		);
	}
	console.log(
		`  ✓ ${KIRO_SKILLS.length} Kiro skills stamped ${version} and ${KIRO_PROMPTS.length} prompts`,
	);

	// 4. Every upstream-supported local integration must still initialize and
	// update. Unit tests lock each adapter's exact files; this packed journey
	// proves the complete registry remains reachable in the shipped build.
	const allToolsProject = path.join(tmp, 'all-tools-project');
	fs.mkdirSync(allToolsProject);
	openspec(
		[
			'init',
			allToolsProject,
			'--tools',
			'all',
			'--profile',
			'core',
			'--force',
			'--no-animation',
		],
		{ cwd: tmp },
	);
	openspec(['update', '--force'], { cwd: allToolsProject });
	check(
		!fs.existsSync(
			path.join(
				allToolsProject,
				'.github',
				'workflows',
				'copilot-setup-steps.yml',
			),
		),
		'all-tools init regenerated the removed Copilot cloud-agent workflow',
	);
	check(
		fs.existsSync(
			path.join(
				allToolsProject,
				'.github',
				'prompts',
				'opsx-propose.prompt.md',
			),
		),
		'the ordinary GitHub Copilot prompt integration is missing',
	);
	console.log(
		'  ✓ all supported IDE/tool integrations initialize and update offline',
	);

	const attempts =
		fs.existsSync(networkLog) ?
			fs.readFileSync(networkLog, 'utf-8').trim()
		:	'';
	check(attempts === '', `network attempts were recorded:\n${attempts}`);
	console.log('  ✓ no network attempts recorded');
}

try {
	main();
	console.log(`\n✔ offline verification passed (${checks} checks)`);
} catch (error) {
	console.error(
		`\n✖ offline verification failed: ${error instanceof Error ? error.message : String(error)}`,
	);
	process.exit(1);
}
