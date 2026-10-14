import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chalk, crossSpawn, loadPrompts } from '@fission-ai/openspec/cli-kit';
import {
	TOOL_PACKAGE,
	assertNodeVersion,
	toolHome,
	FORK_OPENSPEC_VERSION_SUFFIX,
} from './environment.js';
import { warn } from './output.js';

const isWindows = process.platform === 'win32';
const OPENSPEC_PACKAGE_NAME = '@fission-ai/openspec';
const NPM_OFFLINE_FLAGS = ['--no-audit', '--no-fund', '--no-update-notifier'];

function npm(args, { capture = false } = {}) {
	const result = crossSpawn.sync('npm', args, {
		encoding: 'utf-8',
		stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(
			`npm ${args.join(' ')} failed (exit ${result.status})${capture ? `\n${result.stderr}` : ''}`,
		);
	}
	return capture ? result.stdout.trim() : '';
}

/**
 * The release to install: --from, then $ACME_RELEASE_URL, then the URL the
 * release job wrote into release.json.
 */
function resolveSource(from) {
	if (from) return from;
	if (process.env.ACME_RELEASE_URL) return process.env.ACME_RELEASE_URL;
	const releaseFile = fileURLToPath(
		new URL('../release.json', import.meta.url),
	);
	if (fs.existsSync(releaseFile)) {
		const { url } = JSON.parse(fs.readFileSync(releaseFile, 'utf-8'));
		if (url) return url;
	}
	throw new Error(
		'This build has no release.json. Pass --from <release tarball URL or path>.',
	);
}

function globalLayout() {
	const prefix = npm(['prefix', '-g'], { capture: true });
	return {
		binDir: isWindows ? prefix : path.join(prefix, 'bin'),
		modulesDir:
			isWindows ?
				path.join(prefix, 'node_modules')
			:	path.join(prefix, 'lib', 'node_modules'),
	};
}

function openSpecBin(binDir) {
	return path.join(binDir, isWindows ? 'openspec.cmd' : 'openspec');
}

function ownedByThisPackage(bin, modulesDir) {
	const packageRoot = path.join(modulesDir, TOOL_PACKAGE.name);
	if (isWindows)
		return fs
			.readFileSync(bin, 'utf-8')
			.includes(TOOL_PACKAGE.name.replace('/', '\\'));
	try {
		return fs
			.realpathSync(bin)
			.startsWith(fs.realpathSync(packageRoot) + path.sep);
	} catch {
		return false;
	}
}

/**
 * npm refuses to overwrite an `openspec` command another package owns, so a
 * global OpenSpec install has to go first. Upstream OpenSpec also sends
 * telemetry, which is the other reason not to leave it on PATH.
 */
async function resolveConflicts({ binDir, modulesDir }, { yes }) {
	const existing = path.join(modulesDir, OPENSPEC_PACKAGE_NAME, 'package.json');
	if (fs.existsSync(existing)) {
		const { version } = JSON.parse(fs.readFileSync(existing, 'utf-8'));
		const upstream = !FORK_OPENSPEC_VERSION_SUFFIX.test(version);
		const problem =
			`A global ${OPENSPEC_PACKAGE_NAME}@${version} owns the openspec command` +
			(upstream ? ' (upstream OpenSpec, which sends telemetry)' : '') +
			'. This package installs its own openspec in its place.';
		const interactive = process.stdin.isTTY && process.stdout.isTTY;
		let remove = yes;
		if (!remove && interactive) {
			const { confirm } = await loadPrompts();
			remove = await confirm({
				message: `${problem}\nUninstall it now?`,
				default: true,
			});
		}
		if (!remove) {
			throw new Error(
				`${problem}\nRun "npm uninstall -g ${OPENSPEC_PACKAGE_NAME}", or rerun with --yes.`,
			);
		}
		npm(['uninstall', '-g', OPENSPEC_PACKAGE_NAME, ...NPM_OFFLINE_FLAGS]);
	}

	const bin = openSpecBin(binDir);
	if (fs.existsSync(bin) && !ownedByThisPackage(bin, modulesDir)) {
		throw new Error(
			`${bin} belongs to another install (for example Homebrew or a manual link). Remove it, then rerun the acme install.`,
		);
	}
}

/** The first `openspec` on the user's own PATH, ignoring npx's temporary bins. */
function firstOpenSpecOnPath() {
	const names =
		isWindows ? ['openspec.cmd', 'openspec.exe', 'openspec'] : ['openspec'];
	for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
		if (
			!dir ||
			dir.split(path.sep).includes('_npx') ||
			dir.endsWith(path.join('node_modules', '.bin'))
		)
			continue;
		for (const name of names) {
			const candidate = path.join(dir, name);
			if (fs.existsSync(candidate)) return candidate;
		}
	}
	return null;
}

function copyToolkit(modulesDir) {
	const installedToolkit = path.join(modulesDir, TOOL_PACKAGE.name, 'toolkit');
	const home = toolHome();
	const destination = path.join(home, 'toolkit');
	fs.rmSync(destination, { recursive: true, force: true });
	fs.mkdirSync(home, { recursive: true });
	fs.cpSync(installedToolkit, destination, { recursive: true });
	return destination;
}

export async function installGlobal(options = {}) {
	assertNodeVersion();
	const source = resolveSource(options.from);
	const layout = globalLayout();

	await resolveConflicts(layout, options);

	console.log(chalk.bold(`Installing acme from ${source}`));
	// --prefer-offline reuses the tarball npx already downloaded.
	npm(['install', '-g', source, '--prefer-offline', ...NPM_OFFLINE_FLAGS]);

	const toolkit = copyToolkit(layout.modulesDir);

	const bin = openSpecBin(layout.binDir);
	const check = crossSpawn.sync(bin, ['--version'], { encoding: 'utf-8' });
	const version = check.stdout?.trim() ?? '';
	if (check.status !== 0 || !FORK_OPENSPEC_VERSION_SUFFIX.test(version)) {
		throw new Error(
			`${bin} --version printed "${version}"; expected the vendored -no-telem build.`,
		);
	}

	const onPath = firstOpenSpecOnPath();
	if (!onPath) {
		warn(
			`${layout.binDir} is not on your PATH. Add it so your shell and Kiro can find acme-init and openspec.`,
		);
	} else {
		let same = false;
		try {
			same = fs.realpathSync(onPath) === fs.realpathSync(bin);
		} catch {
			same = path.resolve(onPath) === path.resolve(bin);
		}
		if (!same) {
			warn(
				`${onPath} comes before ${bin} on your PATH, so Kiro would run it. Remove it or reorder PATH.`,
			);
		}
	}

	fs.writeFileSync(
		path.join(toolHome(), 'install.json'),
		`${JSON.stringify({ acme: TOOL_PACKAGE.version, openspec: version, source, installedAt: new Date().toISOString() }, null, 2)}\n`,
	);

	console.log(
		[
			'',
			chalk.green(
				`✔ acme ${TOOL_PACKAGE.version} installed with OpenSpec ${version}`,
			),
			`  Toolkit: ${toolkit}`,
			'',
			'Next, in each project:',
			`  ${chalk.cyan('acme-init')}`,
		].join('\n'),
	);
}
