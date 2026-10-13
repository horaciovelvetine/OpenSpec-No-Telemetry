/**
 * CLI building blocks for programs that bundle this package, exposed as
 * `@fission-ai/openspec/cli-kit`. They are the exact versions OpenSpec ships,
 * so a bundle that carries OpenSpec needs no registry access to build a CLI.
 */
import { createRequire } from 'node:module';
import type {
	spawn as nodeSpawn,
	spawnSync as nodeSpawnSync,
} from 'node:child_process';

export { Command } from 'commander';
export { default as chalk } from 'chalk';

// @inquirer modules keep the event loop alive when stdin is piped (#367), so
// they load on first use instead of whenever cli-kit is imported.
export function loadPrompts(): Promise<typeof import('@inquirer/prompts')> {
	return import('@inquirer/prompts');
}

// cross-spawn is CommonJS and ships no types.
export const crossSpawn = createRequire(import.meta.url)(
	'cross-spawn',
) as typeof nodeSpawn & {
	sync: typeof nodeSpawnSync;
};
