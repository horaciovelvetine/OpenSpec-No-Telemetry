#!/usr/bin/env node
import { Command } from '@fission-ai/openspec/cli-kit';
import { initProject } from '../lib/init.js';
import { fail } from '../lib/output.js';

new Command('acme-init')
	.description('Set up acme and OpenSpec in a project')
	.argument('[path]', 'project directory', '.')
	.option('--ide <ids>', 'comma-separated IDEs to set up (default: kiro)')
	.option('-y, --yes', 'accept the defaults without prompting')
	.option('--force', 'overwrite acme project files that already exist')
	.action((target, options) => initProject(target, options))
	.parseAsync()
	.catch(fail);
