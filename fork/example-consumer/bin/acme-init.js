#!/usr/bin/env node
import { runCli } from '../lib/cli.js';
import { TOOL_PACKAGE, VENDORED_OPENSPEC } from '../lib/environment.js';
import { initProject } from '../lib/init.js';
import { fail } from '../lib/output.js';

const version = `${TOOL_PACKAGE.version} (OpenSpec ${VENDORED_OPENSPEC.version})`;

runCli(process.argv.slice(2), {
	name: 'acme-init',
	version,
	description: 'Set up acme and OpenSpec in a project',
	defaultCommand: 'init',
	commands: {
		init: {
			description: 'Set up acme and OpenSpec in a project',
			argument: { name: 'path', default: '.' },
			action: async ({ target, options }) => initProject(target, options),
		},
	},
}).catch(fail);
