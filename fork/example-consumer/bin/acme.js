#!/usr/bin/env node
import { Command } from '@fission-ai/openspec/cli-kit';
import {
	TOOL_PACKAGE,
	OPENSPEC_PACKAGE,
	runningFromNpx,
} from '../lib/environment.js';
import { installGlobal } from '../lib/install.js';
import { initProject } from '../lib/init.js';
import { updateProject } from '../lib/update.js';
import { fail } from '../lib/output.js';

const program = new Command('acme')
	.description('Guardrails and tools for agentic IDEs')
	.version(`${TOOL_PACKAGE.version} (OpenSpec ${OPENSPEC_PACKAGE.version})`);

program
	.command('install')
	.description(
		'Install acme globally: acme, acme-init, and openspec on your PATH, plus the global toolkit',
	)
	.option(
		'--from <source>',
		'release tarball URL or path (defaults to the URL this release was built for)',
	)
	.option(
		'-y, --yes',
		'remove a conflicting global OpenSpec install without asking',
	)
	.action(options => installGlobal(options));

program
	.command('init [path]')
	.description('Set up acme and OpenSpec in a project (same as acme-init)')
	.option('--ide <ids>', 'comma-separated IDEs to set up (default: kiro)')
	.option('-y, --yes', 'accept the defaults without prompting')
	.option('--force', 'overwrite acme project files that already exist')
	.action((target, options) => initProject(target, options));

program
	.command('update [path]')
	.description(
		"Refresh a project's OpenSpec skills and prompts after upgrading acme",
	)
	.action(target => updateProject(target));

// `npx <release url>` runs this bin with no arguments: that is the install step.
if (process.argv.length <= 2 && runningFromNpx()) {
	process.argv.push('install');
}

program.parseAsync().catch(fail);
