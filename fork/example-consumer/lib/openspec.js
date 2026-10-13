import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** This package's `openspec` bin, which runs the vendored OpenSpec. */
export const OPENSPEC_SHIM = fileURLToPath(
	new URL('../bin/openspec.js', import.meta.url),
);

/**
 * Runs the vendored OpenSpec CLI as a child process, so its own exit codes and
 * output stay separate from this package's commands.
 */
export function runOpenSpec(
	args,
	{ cwd = process.cwd(), capture = false } = {},
) {
	const result = spawnSync(process.execPath, [OPENSPEC_SHIM, ...args], {
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
