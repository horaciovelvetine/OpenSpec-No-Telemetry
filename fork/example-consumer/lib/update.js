import fs from 'node:fs';
import path from 'node:path';
import { chalk } from '@fission-ai/openspec/cli-kit';
import { OPENSPEC_PACKAGE, assertNodeVersion } from './environment.js';
import { runOpenSpec } from './openspec.js';
import {
	readProjectConfig,
	writeProjectConfig,
	writeProjectFiles,
} from './project.js';

/**
 * After upgrading to a release with a new vendored OpenSpec, refreshes the
 * project's version-stamped skills and prompts and adds any new project files.
 */
export async function updateProject(target = '.') {
	assertNodeVersion();
	const projectDir = path.resolve(target);
	if (!fs.existsSync(path.join(projectDir, 'openspec'))) {
		throw new Error(
			`${projectDir} has no openspec/ directory. Run acme-init there first.`,
		);
	}

	const result = runOpenSpec(['update', '--force'], { cwd: projectDir });
	if (result.status !== 0) {
		throw new Error(`openspec update failed (exit ${result.status}).`);
	}

	const written = writeProjectFiles(projectDir);
	writeProjectConfig(projectDir, readProjectConfig(projectDir)?.ides);

	console.log(
		[
			'',
			chalk.green(
				`✔ Project refreshed for OpenSpec ${OPENSPEC_PACKAGE.version}`,
			),
			...written.map(file => `  added ${file}`),
		].join('\n'),
	);
}
