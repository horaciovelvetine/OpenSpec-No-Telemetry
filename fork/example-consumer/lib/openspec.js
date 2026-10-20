import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { toolHome } from './environment.js';

function openspecEntryFromInstallRecord() {
	const recordPath = path.join(toolHome(), 'install.json');
	if (!fs.existsSync(recordPath)) {
		throw new Error('Run acme install first.');
	}
	const { openspecEntry } = JSON.parse(fs.readFileSync(recordPath, 'utf-8'));
	if (!openspecEntry || !fs.existsSync(openspecEntry)) {
		throw new Error(
			'The recorded openspec entry is missing. Run acme install again.',
		);
	}
	return openspecEntry;
}

/**
 * Runs the globally installed OpenSpec CLI as a child process, so its own exit
 * codes and output stay separate from this package's commands.
 */
export function runOpenSpec(
	args,
	{ cwd = process.cwd(), capture = false } = {},
) {
	const entry = openspecEntryFromInstallRecord();
	const result = spawnSync(process.execPath, [entry, ...args], {
		cwd,
		encoding: 'utf-8',
		stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
		env: {
			...process.env,
			OPEN_SPEC_INTERACTIVE: '0',
			OPENSPEC_NO_COMPLETIONS: '1',
		},
	});
	if (result.error) throw result.error;
	return result;
}

/** The user's effective OpenSpec delivery setting (`both` when unset). */
export function openSpecDelivery() {
	const result = runOpenSpec(['config', 'get', 'delivery'], { capture: true });
	return result.status === 0 ? result.stdout.trim() : 'both';
}
