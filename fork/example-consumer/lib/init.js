import fs from 'node:fs';
import path from 'node:path';
import { chalk, loadPrompts } from '@fission-ai/openspec/cli-kit';
import { assertNodeVersion } from './environment.js';
import { IDES, resolveIdes } from './ides.js';
import { openSpecDelivery, runOpenSpec } from './openspec.js';
import { writeProjectConfig, writeProjectFiles } from './project.js';
import { warn } from './output.js';

async function chooseIdes(ideOption, interactive) {
	if (ideOption) return resolveIdes(ideOption.split(','));
	if (!interactive || IDES.length === 1) return IDES;
	const { checkbox } = await loadPrompts();
	const picked = await checkbox({
		message: 'Which agentic IDEs should acme set up?',
		choices: IDES.map(ide => ({
			name: ide.name,
			value: ide.value,
			checked: true,
		})),
		required: true,
	});
	return resolveIdes(picked);
}

export async function initProject(target = '.', options = {}) {
	assertNodeVersion();
	const projectDir = path.resolve(target);
	if (!fs.existsSync(projectDir) || !fs.statSync(projectDir).isDirectory()) {
		throw new Error(`${projectDir} is not a directory.`);
	}

	const interactive =
		Boolean(process.stdin.isTTY && process.stdout.isTTY) && !options.yes;
	const ides = await chooseIdes(options.ide, interactive);

	// init's skills and /opsx-* prompts depend on the user's global delivery
	// setting, which no init flag overrides.
	const delivery = openSpecDelivery();
	if (delivery !== 'both') {
		warn(
			`OpenSpec delivery is "${delivery}", so ${delivery === 'skills' ? 'no /opsx-* prompts' : 'no skills'} will be installed. ` +
				'Run "openspec config set delivery both" and rerun acme-init to get both.',
		);
	}

	console.log(
		chalk.bold(
			`Setting up OpenSpec for ${ides.map(ide => ide.name).join(', ')}`,
		),
	);
	const tools = ides.map(ide => ide.openspecTool).join(',');
	const result = runOpenSpec(
		[
			'init',
			projectDir,
			'--tools',
			tools,
			'--profile',
			'core',
			'--force',
			'--no-animation',
		],
		{ cwd: projectDir },
	);
	if (result.status !== 0) {
		throw new Error(
			`openspec init failed (exit ${result.status}); acme project files were not written.`,
		);
	}

	const written = writeProjectFiles(projectDir, { force: options.force });
	writeProjectConfig(
		projectDir,
		ides.map(ide => ide.value),
	);

	console.log(
		[
			'',
			chalk.green('✔ acme is set up in this project'),
			...written.map(file => `  ${file}`),
			'  .acme/project.json',
			'',
			...ides.map(ide => ide.restartHint),
		].join('\n'),
	);
}
