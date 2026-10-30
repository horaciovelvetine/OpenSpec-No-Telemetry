import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runCLI } from '../helpers/run-cli.js';

describe('removed upstream features', () => {
	const tempDirs: string[] = [];
	afterEach(() => {
		for (const dir of tempDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it('rejects init --copilot-cloud with an explanation', async () => {
		const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'openspec-init-flag-'));
		tempDirs.push(cwd);
		const result = await runCLI(
			['init', '--copilot-cloud', '--tools', 'none'],
			{
				cwd,
			},
		);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toMatch(/Copilot hosted cloud-agent/i);
	});

	it('accepts init --no-copilot-cloud as a no-op', async () => {
		const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'openspec-init-flag-'));
		tempDirs.push(cwd);
		const result = await runCLI(
			['init', '--no-copilot-cloud', '--tools', 'none', '--no-animation'],
			{ cwd },
		);
		expect(result.exitCode).toBe(0);
	});

	it('lists --no-copilot-cloud in init --help and keeps --copilot-cloud hidden', async () => {
		const result = await runCLI(['init', '--help']);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain('--no-copilot-cloud');
		expect(result.stdout).not.toMatch(/(^|\s)--copilot-cloud\b/);
	});
});
