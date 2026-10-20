import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
	TOOL_PACKAGE,
	VENDORED_OPENSPEC,
	assertNodeVersion,
	toolHome,
	FORK_OPENSPEC_VERSION_SUFFIX,
} from './environment.js';
import { npm } from './npm.js';
import { confirm } from './prompt.js';
import { bold, cyan, green, warn } from './output.js';

const isWindows = process.platform === 'win32';
const OPENSPEC_PACKAGE_NAME = '@fission-ai/openspec';
const NPM_OFFLINE_FLAGS = [
	'--no-audit',
	'--no-fund',
	'--no-update-notifier',
	'--ignore-scripts',
];

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

function openSpecPackageRoot(modulesDir) {
	return path.join(modulesDir, OPENSPEC_PACKAGE_NAME);
}

function isUnderDir(candidate, root) {
	try {
		const resolved = fs.realpathSync(candidate);
		const resolvedRoot = fs.realpathSync(root);
		return (
			resolved === resolvedRoot ||
			resolved.startsWith(resolvedRoot + path.sep)
		);
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
		const isFork = FORK_OPENSPEC_VERSION_SUFFIX.test(version);
		if (isFork) {
			npm(['uninstall', '-g', OPENSPEC_PACKAGE_NAME, ...NPM_OFFLINE_FLAGS]);
		} else {
			const problem =
				`A global ${OPENSPEC_PACKAGE_NAME}@${version} owns the openspec command` +
				' (upstream OpenSpec, which sends telemetry)' +
				'. This package installs its own openspec in its place.';
			const interactive = process.stdin.isTTY && process.stdout.isTTY;
			let remove = yes;
			if (!remove && interactive) {
				remove = await confirm(`${problem}\nUninstall it now?`, true);
			}
			if (!remove) {
				throw new Error(
					`${problem}\nRun "npm uninstall -g ${OPENSPEC_PACKAGE_NAME}", or rerun with --yes.`,
				);
			}
			npm(['uninstall', '-g', OPENSPEC_PACKAGE_NAME, ...NPM_OFFLINE_FLAGS]);
		}
	}

	const bin = openSpecBin(binDir);
	if (
		fs.existsSync(bin) &&
		!isUnderDir(bin, openSpecPackageRoot(modulesDir))
	) {
		throw new Error(
			`${bin} belongs to another install (for example Homebrew or a manual link). Remove it, then rerun the acme install.`,
		);
	}
}

function verifyVendorTarball(vendorDir) {
	const tarballPath = path.join(vendorDir, VENDORED_OPENSPEC.tarball);
	if (!fs.existsSync(tarballPath)) {
		throw new Error(`Vendored tarball is missing: ${VENDORED_OPENSPEC.tarball}`);
	}
	const actualHash = crypto
		.createHash('sha256')
		.update(fs.readFileSync(tarballPath))
		.digest('hex');
	if (actualHash !== VENDORED_OPENSPEC.sha256) {
		throw new Error('Vendored OpenSpec checksum does not match BUILD-INFO.json');
	}
	const sums = fs.readFileSync(path.join(vendorDir, 'SHA256SUMS'), 'utf-8');
	if (
		!sums.split('\n').includes(`${actualHash}  ${VENDORED_OPENSPEC.tarball}`)
	) {
		throw new Error('Vendored OpenSpec checksum does not match SHA256SUMS');
	}
	return tarballPath;
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

	console.log(bold(`Installing acme from ${source}`));
	npm(['install', '-g', source, '--prefer-offline', ...NPM_OFFLINE_FLAGS]);

	const installedRoot = path.join(layout.modulesDir, TOOL_PACKAGE.name);
	const vendorDir = path.join(installedRoot, 'vendor', 'openspec');
	const forkTarball = verifyVendorTarball(vendorDir);
	npm(['install', '-g', forkTarball, '--offline', ...NPM_OFFLINE_FLAGS]);

	const openspecEntry = path.join(
		openSpecPackageRoot(layout.modulesDir),
		'bin',
		'openspec.js',
	);
	const check = spawnSync(process.execPath, [openspecEntry, '--version'], {
		encoding: 'utf-8',
	});
	const version = check.stdout?.trim() ?? '';
	if (check.status !== 0 || !FORK_OPENSPEC_VERSION_SUFFIX.test(version)) {
		throw new Error(
			`${openspecEntry} --version printed "${version}"; expected the vendored -no-telem build.`,
		);
	}

	const toolkit = copyToolkit(layout.modulesDir);

	const bin = openSpecBin(layout.binDir);
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
		`${JSON.stringify(
			{
				acme: TOOL_PACKAGE.version,
				openspec: version,
				openspecEntry,
				source,
				installedAt: new Date().toISOString(),
			},
			null,
			2,
		)}\n`,
	);

	console.log(
		[
			'',
			green(`✔ acme ${TOOL_PACKAGE.version} installed with OpenSpec ${version}`),
			`  Toolkit: ${toolkit}`,
			'',
			'Next, in each project:',
			`  ${cyan('acme-init')}`,
		].join('\n'),
	);
}
