import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getAvailableTools } from '../../src/core/available-tools.js';
import {
	MANAGED_COPILOT_CONTENT_SHA256,
	removeCopilotCloudLeftovers,
} from '../../src/fork/copilot-cloud-leftovers.js';

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'..',
	'..',
);
const fixtureDir = path.join(
	repoRoot,
	'test',
	'fixtures',
	'upstream-copilot-cloud',
);

function hashFile(filePath: string): string {
	const content = fs.readFileSync(filePath, 'utf-8');
	return crypto
		.createHash('sha256')
		.update(content.replace(/\r\n/g, '\n'))
		.digest('hex');
}

describe('copilot cloud leftovers', () => {
	const tempDirs: string[] = [];
	afterEach(() => {
		for (const dir of tempDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
		vi.restoreAllMocks();
	});

	it('locks fixture hashes to the managed set', () => {
		const fixtureHashes = fs
			.readdirSync(fixtureDir)
			.filter(file => file !== 'README.md')
			.map(file => hashFile(path.join(fixtureDir, file)));
		expect(fixtureHashes.sort()).toEqual(
			[...MANAGED_COPILOT_CONTENT_SHA256].sort(),
		);
	});

	it.each([
		['setup-current.yml', '.github/workflows/copilot-setup-steps.yml'],
		['agent-current.md', '.github/agents/openspec.agent.md'],
	])('removes an unmodified upstream %s', async (fixture, relPath) => {
		const project = fs.mkdtempSync(
			path.join(os.tmpdir(), 'copilot-leftover-'),
		);
		tempDirs.push(project);
		const target = path.join(project, relPath);
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.copyFileSync(path.join(fixtureDir, fixture), target);

		const log: string[] = [];
		vi.spyOn(console, 'log').mockImplementation((msg?: unknown) => {
			if (typeof msg === 'string') log.push(msg);
		});

		await removeCopilotCloudLeftovers(project);

		expect(fs.existsSync(target)).toBe(false);
		expect(log.some(line => line.includes('Removed upstream'))).toBe(true);
	});

	it('removes setup file with CRLF line endings', async () => {
		const project = fs.mkdtempSync(
			path.join(os.tmpdir(), 'copilot-leftover-'),
		);
		tempDirs.push(project);
		const rel = '.github/workflows/copilot-setup-steps.yml';
		const target = path.join(project, rel);
		fs.mkdirSync(path.dirname(target), { recursive: true });
		const content = fs
			.readFileSync(path.join(fixtureDir, 'setup-current.yml'), 'utf-8')
			.replace(/\n/g, '\r\n');
		fs.writeFileSync(target, content);

		await removeCopilotCloudLeftovers(project);
		expect(fs.existsSync(target)).toBe(false);
	});

	it('warns and keeps a customized agent file', async () => {
		const project = fs.mkdtempSync(
			path.join(os.tmpdir(), 'copilot-leftover-'),
		);
		tempDirs.push(project);
		const rel = '.github/agents/openspec.agent.md';
		const target = path.join(project, rel);
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.writeFileSync(
			target,
			`${fs.readFileSync(path.join(fixtureDir, 'agent-current.md'), 'utf-8')}\n# Local edits\n`,
		);

		const warnings: string[] = [];
		vi.spyOn(console, 'log').mockImplementation((msg?: unknown) => {
			if (typeof msg === 'string') warnings.push(msg);
		});

		await removeCopilotCloudLeftovers(project);

		expect(fs.existsSync(target)).toBe(true);
		expect(warnings.some(line => /Warning:/.test(line))).toBe(true);
	});

	it('leaves unrelated workflow files alone', async () => {
		const project = fs.mkdtempSync(
			path.join(os.tmpdir(), 'copilot-leftover-'),
		);
		tempDirs.push(project);
		const rel = '.github/workflows/ci.yml';
		const target = path.join(project, rel);
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.writeFileSync(target, 'name: CI\non: push\n');

		await removeCopilotCloudLeftovers(project);
		expect(fs.readFileSync(target, 'utf-8')).toContain('name: CI');
	});

	it('removes an empty .github/agents directory after deleting the agent file', async () => {
		const project = fs.mkdtempSync(
			path.join(os.tmpdir(), 'copilot-leftover-'),
		);
		tempDirs.push(project);
		const rel = '.github/agents/openspec.agent.md';
		const target = path.join(project, rel);
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.copyFileSync(path.join(fixtureDir, 'agent-current.md'), target);

		await removeCopilotCloudLeftovers(project);

		expect(fs.existsSync(target)).toBe(false);
		expect(fs.existsSync(path.join(project, '.github', 'agents'))).toBe(
			false,
		);
	});

	it('stops treating the repo as a Copilot project after removing setup steps', async () => {
		const project = fs.mkdtempSync(
			path.join(os.tmpdir(), 'copilot-leftover-'),
		);
		tempDirs.push(project);
		const rel = '.github/workflows/copilot-setup-steps.yml';
		const target = path.join(project, rel);
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.copyFileSync(path.join(fixtureDir, 'setup-current.yml'), target);

		expect(getAvailableTools(project).map(tool => tool.value)).toContain(
			'github-copilot',
		);

		await removeCopilotCloudLeftovers(project);

		expect(getAvailableTools(project).map(tool => tool.value)).not.toContain(
			'github-copilot',
		);
	});
});
