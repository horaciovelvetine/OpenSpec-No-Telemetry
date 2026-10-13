import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { CommandAdapterRegistry } from '../../src/core/command-generation/registry.js';
import { AI_TOOLS } from '../../src/core/config.js';
import {
	CORE_WORKFLOWS,
	getProfileWorkflows,
} from '../../src/core/profiles.js';

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'..',
	'..',
);
const surface = JSON.parse(
	fs.readFileSync(
		path.join(repoRoot, 'fork', 'supported-surface.json'),
		'utf-8',
	),
) as {
	schemaVersion: number;
	tools: string[];
	commandAdapters: string[];
	generatedPaths: {
		skillRoots: Record<string, string>;
		commandFiles: Record<string, string>;
	};
	profiles: string[];
	deliveryModes: string[];
	excludedFeatures: string[];
};

const sorted = (values: string[]) =>
	[...values].sort((left, right) => left.localeCompare(right));

describe('fork supported surface', () => {
	it('locks every upstream-supported IDE/tool into the fork contract', () => {
		expect(surface.schemaVersion).toBe(1);
		expect(surface.tools).toEqual(
			sorted(AI_TOOLS.filter(tool => tool.available).map(tool => tool.value)),
		);
		expect(surface.commandAdapters).toEqual(
			sorted(CommandAdapterRegistry.getAll().map(adapter => adapter.toolId)),
		);
		expect(surface.tools).toContain('github-copilot');
		expect(surface.commandAdapters).toContain('github-copilot');
	});

	it('locks the generated path owned by every supported tool and command adapter', () => {
		const tools = AI_TOOLS.filter(tool => tool.available).sort((left, right) =>
			left.value.localeCompare(right.value),
		);
		const expectedSkillRoots = Object.fromEntries(
			tools.map(tool => {
				const root =
					tool.globalSkillsDir ?
						`$HOME/${tool.globalSkillsDir}/skills`
					:	path.posix.join(tool.skillsDir!, 'skills');
				return [tool.value, root];
			}),
		);
		const expectedCommandFiles = Object.fromEntries(
			CommandAdapterRegistry.getAll()
				.sort((left, right) => left.toolId.localeCompare(right.toolId))
				.map(adapter => [
					adapter.toolId,
					adapter.getFilePath('{workflow}').split(path.sep).join('/'),
				]),
		);

		expect(surface.generatedPaths.skillRoots).toEqual(expectedSkillRoots);
		expect(surface.generatedPaths.commandFiles).toEqual(expectedCommandFiles);
	});

	it('preserves every profile and delivery mode', () => {
		expect(surface.profiles).toEqual(['core', 'custom']);
		expect(surface.deliveryModes).toEqual(['both', 'commands', 'skills']);
		expect(getProfileWorkflows('core')).toEqual(CORE_WORKFLOWS);
		expect(getProfileWorkflows('custom', ['new', 'archive'])).toEqual([
			'new',
			'sync',
			'archive',
		]);
	});

	it('keeps only the hosted Copilot feature excluded', () => {
		expect(surface.excludedFeatures).toContain('github-copilot-cloud-agent');
		expect(
			fs.existsSync(
				path.join(repoRoot, 'src', 'core', 'github-copilot', 'cloud-agent.ts'),
			),
		).toBe(false);
		expect(
			fs.existsSync(
				path.join(
					repoRoot,
					'src',
					'core',
					'command-generation',
					'adapters',
					'github-copilot.ts',
				),
			),
		).toBe(true);
	});
});
