#!/usr/bin/env node
import { runCli } from '../lib/cli.js';
import {
	TOOL_PACKAGE,
	VENDORED_OPENSPEC,
	runningFromNpx,
} from '../lib/environment.js';
import { installGlobal } from '../lib/install.js';
import { initProject } from '../lib/init.js';
import { updateProject } from '../lib/update.js';
import { fail } from '../lib/output.js';

const version = `${TOOL_PACKAGE.version} (OpenSpec ${VENDORED_OPENSPEC.version})`;

const argv = process.argv.slice(2);
if (argv.length === 0 && runningFromNpx()) {
	argv.push('install');
}

runCli(argv, {
	name: 'acme',
	version,
	description: 'Guardrails and tools for agentic IDEs',
	commands: {
		install: {
			description:
				'Install acme globally: acme, acme-init, and openspec on PATH, plus the global toolkit',
			action: async ({ options }) => installGlobal(options),
		},
		init: {
			description: 'Set up acme and OpenSpec in a project (same as acme-init)',
			argument: { name: 'path', default: '.' },
			action: async ({ target, options }) => initProject(target, options),
		},
		update: {
			description:
				"Refresh a project's OpenSpec skills and prompts after upgrading acme",
			argument: { name: 'path', default: '.' },
			action: async ({ target }) => updateProject(target),
		},
	},
}).catch(fail);
