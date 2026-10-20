import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

export const TOOL_PACKAGE = require('../package.json');

const buildInfoPath = fileURLToPath(
	new URL('../vendor/openspec/BUILD-INFO.json', import.meta.url),
);

function loadVendoredOpenSpec() {
	if (!fs.existsSync(buildInfoPath)) {
		throw new Error(
			'vendor/openspec is empty. Run scripts/vendor-openspec.mjs --from <fork/out> first.',
		);
	}
	const buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, 'utf-8'));
	return {
		version: buildInfo.version,
		tarball: buildInfo.tarball,
		package: buildInfo.package,
		sha256: buildInfo.sha256,
		bin: buildInfo.bin,
	};
}

export const VENDORED_OPENSPEC = loadVendoredOpenSpec();

/** Matches fork artifact versions from pack-offline.mjs (e.g. 1.14.0-no-telem.1). */
export const FORK_OPENSPEC_VERSION_SUFFIX = /-no-telem\.\d+$/;

const MIN_NODE = [20, 19, 0];

export function assertNodeVersion() {
	const current = process.versions.node.split('.').map(Number);
	for (let i = 0; i < MIN_NODE.length; i++) {
		if (current[i] > MIN_NODE[i]) return;
		if (current[i] < MIN_NODE[i]) {
			throw new Error(
				`acme needs Node.js ${MIN_NODE.join('.')} or later; this is ${process.versions.node}.`,
			);
		}
	}
}

/** Global toolkit home: $ACME_HOME, or ~/.acme. */
export function toolHome() {
	return process.env.ACME_HOME || path.join(os.homedir(), '.acme');
}

/** True when this package was unpacked into npx's temporary cache. */
export function runningFromNpx() {
	return fileURLToPath(import.meta.url)
		.split(path.sep)
		.includes('_npx');
}
