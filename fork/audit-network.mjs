#!/usr/bin/env node
/**
 * Network and packaging audit for the OpenSpec-No-Telemetry fork.
 *
 * Fails (exit 1) when any of these show up:
 * - network code in src/, dist/, or shipped bin files (http/https/net/tls/dns modules, fetch,
 *   WebSocket, spawning npm/npx/gh/curl/wget, remote git subcommands, the
 *   removed telemetry and registry endpoints, registry install instructions)
 * - a process spawn outside the reviewed local-only files
 * - a production dependency (name@version) missing from fork/allowed-deps.json
 * - network code, install scripts, or native builds inside a production dependency
 * - npm publishing or distribution infrastructure the fork removed
 *
 * Usage:
 *   node fork/audit-network.mjs                 audit (run after `pnpm build`)
 *   node fork/audit-network.mjs --update-deps   pin today's production tree after review
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import spawn from 'cross-spawn';

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'..',
);
const allowedDepsPath = path.join(repoRoot, 'fork', 'allowed-deps.json');

/** Paths the fork deleted. Upstream merges re-add some of them (changesets in most PRs). */
export const REMOVED_PATHS = [
	'.actrc',
	'.agents',
	'.changeset',
	'.coderabbit.yaml',
	'.github/CODEOWNERS',
	'.github/ISSUE_TEMPLATE',
	'.github/workflows/README.md',
	'.github/workflows/release-prepare.yml',
	'.github/dependabot.yml',
	'CHANGELOG.md',
	'MAINTAINERS.md',
	'README_OLD.md',
	'assets',
	'docs',
	'docs-lab',
	'openspec',
	'openspec-parallel-merge-plan.md',
	'website',
	'scripts/pack-version-check.mjs',
	'flake.nix',
	'flake.lock',
	'scripts/update-flake.sh',
	'skills',
	'scripts/generate-skillssh.mjs',
	'scripts/skillssh-shared.mjs',
	'install.md',
	'src/telemetry',
	'src/core/version-check.ts',
	'src/commands/feedback.ts',
	'src/core/templates/workflows/feedback.ts',
	'src/core/github-copilot',
];

const LIFECYCLE_SCRIPTS = [
	'preinstall',
	'install',
	'postinstall',
	'prepare',
	'prepublish',
	'prepublishOnly',
	'prepack',
	'postpack',
	'publish',
	'postpublish',
];

/** The only source files allowed to start processes, all local-only. */
export const PROCESS_ALLOWLIST = new Map([
	['src/commands/config.ts', 'opens the config file in $EDITOR'],
	['src/commands/workset.ts', 'opens a workset in a local editor or agent CLI'],
	[
		'src/core/store/git.ts',
		'local git: init, add, commit, status, rev-parse, remote get-url',
	],
	['src/core/store/operations.ts', 'local git rev-parse --show-toplevel'],
	[
		'src/ui/welcome-screen.ts',
		'reads the OS reduced-motion setting (defaults / gsettings)',
	],
	['src/utils/shell-detection.ts', 'reads the parent process name with ps'],
	[
		'src/cli-kit.ts',
		're-exports cross-spawn for bundled consumers; spawns nothing itself',
	],
]);

/** Production packages known to touch child_process, none of them for network use. */
export const DEPENDENCY_PROCESS_ALLOWLIST = new Map([
	['cross-spawn', 'portable spawn; callers choose the command'],
	[
		'@inquirer/external-editor',
		'opens $VISUAL/$EDITOR on a temp file; OpenSpec never calls it',
	],
	['commander', 'executable subcommands; OpenSpec defines none'],
]);

/** Applied to src/, dist/, and every production dependency. */
export const NETWORK_RULES = [
	{
		id: 'network-module',
		message: 'imports a network module',
		pattern:
			/(?:\bfrom\s+|\brequire\s*\(\s*|\bimport\s*\(\s*|\bimport\s+)['"](?:node:)?(?:http|https|http2|net|tls|dns|dgram|undici)(?:\/[\w/]*)?['"]/g,
	},
	{
		id: 'fetch',
		message: 'calls fetch()',
		pattern: /(?:^|[^.\w$])fetch\s*\(/g,
	},
	{
		id: 'web-api',
		message: 'uses a browser network API',
		pattern: /\b(?:WebSocket|XMLHttpRequest|EventSource|sendBeacon)\b/g,
	},
];

/** Applied to src/ and dist/ only: too broad for third-party code. */
export const SOURCE_ONLY_RULES = [
	{
		id: 'network-tool-spawn',
		message: 'spawns a network tool',
		pattern:
			/\b(?:spawn|spawnSync|execFile|execFileSync|exec|execSync|sync)\s*\(\s*['"`](?:npm|npx|pnpm|yarn|bun|bunx|gh|curl|wget)['"`]/g,
	},
	{
		id: 'git-remote',
		message: 'passes a remote git subcommand',
		pattern: /['"](?:clone|fetch|pull|push|ls-remote|submodule)['"]/g,
	},
	{
		id: 'removed-endpoint',
		message: 'references a removed network endpoint',
		pattern:
			/edge\.openspec\.dev|registry\.npmjs\.org|posthog|\bphc_[A-Za-z0-9]{10,}/gi,
	},
	{
		id: 'registry-install',
		message: 'tells someone to install from a package registry',
		pattern:
			/\b(?:npm|pnpm|yarn|bun)\s+(?:i|install|add)\s+(?:-g|--global)\b|\byarn\s+global\s+add\b|\bnpx\s+(?:-y\s+|--yes\s+)?(?:@fission-ai\/)?openspec@/g,
	},
];

export const PROCESS_PATTERN =
	/['"](?:node:)?child_process['"]|['"]cross-spawn['"]/;

function lineOf(text, index) {
	let line = 1;
	for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
	return line;
}

/** Every rule match in `text`. Exceptions belong in the reviewed maps above. */
export function scanText(text, rules) {
	const hits = [];
	for (const rule of rules) {
		rule.pattern.lastIndex = 0;
		for (const match of text.matchAll(rule.pattern)) {
			hits.push({
				id: rule.id,
				message: rule.message,
				line: lineOf(text, match.index),
				match: match[0].trim(),
			});
		}
	}
	return hits;
}

/** Packaging problems in a parsed package.json. */
export function checkManifest(pkg) {
	const findings = [];
	if (pkg.private !== true) {
		findings.push(
			'package.json must keep "private": true so npm refuses to publish the fork',
		);
	}
	if (pkg.publishConfig !== undefined) {
		findings.push(
			'package.json has publishConfig; the fork is never published',
		);
	}
	for (const script of LIFECYCLE_SCRIPTS) {
		if (pkg.scripts?.[script] !== undefined) {
			findings.push(`package.json defines the "${script}" lifecycle script`);
		}
	}
	for (const name of Object.keys(pkg.devDependencies ?? {})) {
		if (name.startsWith('@changesets/')) {
			findings.push(
				`devDependencies includes ${name}; release tooling was removed`,
			);
		}
	}
	return findings;
}

/** Removed paths that exist again under `root`. */
export function findReappearedPaths(root) {
	return REMOVED_PATHS.filter(removed =>
		fs.existsSync(path.join(root, removed)),
	);
}

function relative(file) {
	return path.relative(repoRoot, file).split(path.sep).join('/');
}

function walk(dir, include, out = []) {
	if (!fs.existsSync(dir)) return out;
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === 'node_modules') continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) walk(full, include, out);
		else if (entry.isFile() && include(entry.name)) out.push(full);
	}
	return out;
}

function allowedProcessFiles() {
	const allowed = new Set();
	for (const sourcePath of PROCESS_ALLOWLIST.keys()) {
		allowed.add(sourcePath);
		allowed.add(sourcePath.replace(/^src\//, 'dist/').replace(/\.ts$/, '.js'));
	}
	return allowed;
}

/**
 * Audits the OpenSpec-owned executable code and manifest in an extracted or
 * installed package. Production dependencies are audited separately against
 * the lockfile before packing.
 */
export function auditPackagedTree(packageRoot) {
	const findings = checkManifest(
		JSON.parse(
			fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf-8'),
		),
	).map(detail => ({ check: 'packaging', detail }));
	const processFiles = allowedProcessFiles();
	const files = [
		...walk(path.join(packageRoot, 'bin'), name => /\.(?:c|m)?js$/.test(name)),
		...walk(path.join(packageRoot, 'dist'), name => /\.(?:c|m)?js$/.test(name)),
	];

	for (const file of files) {
		const rel = path.relative(packageRoot, file).split(path.sep).join('/');
		const text = fs.readFileSync(file, 'utf-8');
		for (const hit of scanText(text, [
			...NETWORK_RULES,
			...SOURCE_ONLY_RULES,
		])) {
			findings.push({
				check: hit.id,
				detail: `${rel}:${hit.line} ${hit.message}: ${hit.match}`,
			});
		}
		if (PROCESS_PATTERN.test(text) && !processFiles.has(rel)) {
			findings.push({
				check: 'process-spawn',
				detail: `${rel} starts processes but is not in the reviewed allowlist`,
			});
		}
	}

	return { files: files.length, findings };
}

function auditSource(fail, notes) {
	const sourceFiles = walk(path.join(repoRoot, 'src'), name =>
		name.endsWith('.ts'),
	);
	const distFiles = walk(path.join(repoRoot, 'dist'), name =>
		/\.(?:c|m)?js$/.test(name),
	);
	const binFiles = walk(path.join(repoRoot, 'bin'), name =>
		/\.(?:c|m)?js$/.test(name),
	);
	if (distFiles.length === 0) {
		fail(
			'compiled-output',
			'dist/ is missing or empty; run `pnpm build` so the shipped output is audited',
		);
	}

	const processFiles = allowedProcessFiles();

	for (const file of [...sourceFiles, ...distFiles, ...binFiles]) {
		const rel = relative(file);
		const text = fs.readFileSync(file, 'utf-8');
		for (const hit of scanText(text, [
			...NETWORK_RULES,
			...SOURCE_ONLY_RULES,
		])) {
			fail(hit.id, `${rel}:${hit.line} ${hit.message}: ${hit.match}`);
		}
		if (PROCESS_PATTERN.test(text) && !processFiles.has(rel)) {
			fail(
				'process-spawn',
				`${rel} starts processes but is not in the reviewed allowlist`,
			);
		}
	}

	return {
		sourceFiles: sourceFiles.length,
		distFiles: distFiles.length,
		binFiles: binFiles.length,
	};
}

function listProductionPackages() {
	const result = spawn.sync(
		'pnpm',
		['list', '--prod', '--depth', 'Infinity', '--json'],
		{
			cwd: repoRoot,
			encoding: 'utf-8',
		},
	);
	if (result.error || result.status !== 0) {
		throw new Error(
			`pnpm list failed: ${result.error?.message ?? result.stderr?.trim() ?? `exit ${result.status}`}`,
		);
	}
	const [project] = JSON.parse(result.stdout);
	const packages = new Map();
	// pnpm prints a repeated package's subtree at only one of its occurrences,
	// and not always the first, so every occurrence is walked.
	const visit = dependencies => {
		for (const [name, info] of Object.entries(dependencies ?? {})) {
			const key = `${name}@${info.version}`;
			if (!packages.has(key)) {
				packages.set(key, { name, version: info.version, dir: info.path });
			}
			visit(info.dependencies);
		}
	};
	visit(project.dependencies);
	return packages;
}

function auditDependencies(fail, notes, { updateDeps }) {
	const packages = listProductionPackages();
	const current = [...packages.keys()].sort();

	if (updateDeps) {
		const pinned = {
			description:
				'Production dependency tree (name@version) reviewed for network behavior. Regenerate with `node fork/audit-network.mjs --update-deps` only after reviewing the change.',
			packages: current,
		};
		fs.writeFileSync(allowedDepsPath, `${JSON.stringify(pinned, null, 2)}\n`);
		notes.push(
			`wrote ${current.length} packages to ${relative(allowedDepsPath)}`,
		);
	}

	const allowed = new Set(
		fs.existsSync(allowedDepsPath) ?
			JSON.parse(fs.readFileSync(allowedDepsPath, 'utf-8')).packages
		:	[],
	);
	for (const key of current) {
		if (!allowed.has(key)) {
			fail(
				'dependency',
				`${key} is not in fork/allowed-deps.json; review it, then run with --update-deps`,
			);
		}
	}
	const gone = [...allowed].filter(key => !packages.has(key));
	if (gone.length > 0) {
		notes.push(
			`no longer in the tree (run --update-deps to prune): ${gone.join(', ')}`,
		);
	}

	const licenses = new Map();
	const spawning = [];
	for (const [key, { name, dir }] of packages) {
		const manifest = JSON.parse(
			fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'),
		);
		const license =
			typeof manifest.license === 'string' ? manifest.license : 'UNKNOWN';
		licenses.set(license, (licenses.get(license) ?? 0) + 1);

		for (const script of ['preinstall', 'install', 'postinstall']) {
			if (manifest.scripts?.[script] !== undefined) {
				fail(
					'dependency-install-script',
					`${key} declares a "${script}" script`,
				);
			}
		}
		if (
			manifest.gypfile === true ||
			fs.existsSync(path.join(dir, 'binding.gyp'))
		) {
			fail('dependency-native', `${key} builds a native addon`);
		}

		let usesProcesses = false;
		for (const file of walk(dir, fileName => /\.(?:c|m)?js$/.test(fileName))) {
			const text = fs.readFileSync(file, 'utf-8');
			for (const hit of scanText(text, NETWORK_RULES)) {
				fail(
					'dependency-network',
					`${key} ${path.relative(dir, file)}:${hit.line} ${hit.message}`,
				);
			}
			if (PROCESS_PATTERN.test(text)) usesProcesses = true;
		}
		if (usesProcesses) {
			spawning.push(key);
			if (!DEPENDENCY_PROCESS_ALLOWLIST.has(name)) {
				fail(
					'dependency-process',
					`${key} uses child_process; review it before allowing it`,
				);
			}
		}
	}

	return { count: packages.size, licenses, spawning };
}

function main() {
	const failures = [];
	const notes = [];
	const fail = (check, detail) => failures.push({ check, detail });

	const pkg = JSON.parse(
		fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8'),
	);
	for (const finding of checkManifest(pkg)) fail('packaging', finding);
	for (const removed of findReappearedPaths(repoRoot)) {
		fail(
			'removed-path',
			`${removed} reappeared; delete it (see the sync runbook in FORK.md)`,
		);
	}
	const source = auditSource(fail, notes);
	const deps = auditDependencies(fail, notes, {
		updateDeps: process.argv.includes('--update-deps'),
	});

	for (const note of notes) console.log(`note: ${note}`);

	if (failures.length > 0) {
		console.error(
			`\nNetwork and packaging audit FAILED (${failures.length} finding(s)):\n`,
		);
		for (const { check, detail } of failures)
			console.error(`  [${check}] ${detail}`);
		process.exit(1);
	}

	const licenseSummary = [...deps.licenses]
		.sort((a, b) => b[1] - a[1])
		.map(([license, count]) => `${license} ${count}`)
		.join(', ');
	console.log(
		[
			'Network and packaging audit passed.',
			`  source: ${source.sourceFiles} src, ${source.distFiles} dist, and ${source.binFiles} bin files, no network code`,
			`  dependencies: ${deps.count} production packages, all pinned, no network code, install scripts, or native builds`,
			`  child_process in dependencies: ${deps.spawning.join(', ') || 'none'}`,
			`  licenses: ${licenseSummary}`,
		].join('\n'),
	);
}

if (
	process.argv[1] &&
	pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
	main();
}
