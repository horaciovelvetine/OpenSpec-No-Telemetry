import { spawnSync } from 'node:child_process';

const isWindows = process.platform === 'win32';

/**
 * Runs npm with spawnSync. On Windows, uses shell mode so `.cmd` shims work.
 */
export function npm(args, { capture = false } = {}) {
	const result = spawnSync('npm', args, {
		encoding: 'utf-8',
		stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
		shell: isWindows,
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(
			`npm ${args.join(' ')} failed (exit ${result.status})${capture ? `\n${result.stderr}` : ''}`,
		);
	}
	return capture ? result.stdout.trim() : '';
}
