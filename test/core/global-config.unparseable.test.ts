import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Command } from 'commander';
import { runCLI } from '../helpers/run-cli.js';

/**
 * A global config file with a typo is still the user's file. Reads fall back
 * to defaults with a warning, but nothing may write those defaults back over
 * it.
 */

const SETTINGS = {
  featureFlags: {},
  profile: 'custom',
  delivery: 'both',
  telemetry: { noticeSeen: true, anonymousId: '0e249867-af5d-445b-92c7-722fbec024f1', enabled: false },
  workflows: ['propose', 'apply', 'verify'],
};
const VALID = `${JSON.stringify(SETTINGS, null, 2)}\n`;
// The trailing comma a hand edit leaves behind.
const TYPO = VALID.replace(/\n}\n$/, ',\n}\n');

describe('an unparseable global config', () => {
  let tempDir: string;
  let configPath: string;
  let originalEnv: NodeJS.ProcessEnv;
  let originalExitCode: typeof process.exitCode;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openspec-unparseable-config-'));
    originalEnv = { ...process.env };
    originalExitCode = process.exitCode;

    process.env.XDG_CONFIG_HOME = tempDir;
    process.env.HOME = tempDir;
    process.env.USERPROFILE = tempDir;
    process.env.APPDATA = path.join(tempDir, 'appdata');
    // As in a user's shell, not a CI job.
    delete process.env.CI;

    configPath = path.join(tempDir, 'openspec', 'config.json');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });

    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const read = () => fs.readFileSync(configPath, 'utf-8');

  it('is detected as unreadable, while a missing or valid file is not', async () => {
    const { isGlobalConfigUnreadable } = await import('../../src/core/global-config.js');

    expect(isGlobalConfigUnreadable()).toBe(false);
    fs.writeFileSync(configPath, VALID);
    expect(isGlobalConfigUnreadable()).toBe(false);
    fs.writeFileSync(configPath, TYPO);
    expect(isGlobalConfigUnreadable()).toBe(true);
  });

  it('warns about it once, however many times it is read', async () => {
    const { getGlobalConfig } = await import('../../src/core/global-config.js');
    fs.writeFileSync(configPath, TYPO);

    getGlobalConfig();
    getGlobalConfig();
    getGlobalConfig();

    const warnings = consoleErrorSpy.mock.calls.filter((call) => String(call[0]).includes('Invalid JSON'));
    expect(warnings).toHaveLength(1);
  });

  it.each(['null\n', '[]\n', '"core"\n'])('treats valid JSON that is not an object (%j) as unreadable', async (content) => {
    const { isGlobalConfigUnreadable, saveGlobalConfig } = await import('../../src/core/global-config.js');
    fs.writeFileSync(configPath, content);

    expect(isGlobalConfigUnreadable()).toBe(true);
    expect(() => saveGlobalConfig({ profile: 'core' })).toThrow(/Refusing to overwrite/);
    expect(read()).toBe(content);
  });

  // Reads must answer with plain defaults, not with the shape of the root: a
  // string used to spread into numeric character keys that reached callers.
  it.each(['null\n', '[]\n', '["core"]\n', '"abc"\n', '42\n', 'true\n'])(
    'reads a non-object root (%j) as plain defaults',
    async (content) => {
      const { getGlobalConfig } = await import('../../src/core/global-config.js');
      fs.writeFileSync(configPath, content);

      expect(getGlobalConfig()).toEqual({ featureFlags: {}, profile: 'core', delivery: 'both' });
    },
  );

  describe('saveGlobalConfig', () => {
    it('refuses to overwrite it, names the file and the fix, and leaves it byte-identical', async () => {
      const { saveGlobalConfig } = await import('../../src/core/global-config.js');
      fs.writeFileSync(configPath, TYPO);

      let message = '';
      try {
        saveGlobalConfig({ profile: 'core' });
      } catch (error) {
        message = (error as Error).message;
      }

      expect(message).toContain(configPath);
      expect(message).toContain('openspec config edit');
      expect(read()).toBe(TYPO);
    });

    it('replaces it when asked to, as a reset does', async () => {
      const { saveGlobalConfig } = await import('../../src/core/global-config.js');
      fs.writeFileSync(configPath, TYPO);

      saveGlobalConfig({ profile: 'core' }, { replaceUnreadable: true });

      expect(JSON.parse(read())).toEqual({ profile: 'core' });
    });

    it('still creates a missing file and overwrites a valid one', async () => {
      const { saveGlobalConfig } = await import('../../src/core/global-config.js');

      saveGlobalConfig({ profile: 'custom' });
      expect(JSON.parse(read())).toEqual({ profile: 'custom' });
      saveGlobalConfig({ profile: 'core' });
      expect(JSON.parse(read())).toEqual({ profile: 'core' });
    });
  });

  describe('openspec config', () => {
    let registerConfigCommand: typeof import('../../src/cli/commands/config.js').registerConfigCommand;

    // Imported once: the command module pulls in most of the CLI.
    beforeAll(async () => {
      ({ registerConfigCommand } = await import('../../src/cli/commands/config.js'));
    }, 60_000);

    async function runConfig(args: string[]): Promise<void> {
      const program = new Command();
      registerConfigCommand(program);
      await program.parseAsync(['node', 'openspec', 'config', ...args]);
    }

    const errorOutput = () => consoleErrorSpy.mock.calls.map((call) => call.join(' ')).join('\n');

    it.each([
      [['set', 'profile', 'core']],
      [['unset', 'profile']],
      [['profile', 'core']],
    ])('refuses `config %s` and leaves the file unchanged', async (args) => {
      fs.writeFileSync(configPath, TYPO);

      await runConfig(args);

      expect(read()).toBe(TYPO);
      expect(process.exitCode).toBe(1);
      expect(errorOutput()).toContain(configPath);
      expect(errorOutput()).toContain('openspec config edit');
    });

    // `config list` reads the raw file to mark values explicit vs default. A
    // `null` root used to crash it with a TypeError stack trace.
    it.each(['null\n', '[]\n', '"core"\n', '42\n', 'true\n', TYPO])(
      'lists defaults without crashing for %j and leaves the file unchanged',
      async (content) => {
        fs.writeFileSync(configPath, content);

        await expect(runConfig(['list'])).resolves.toBeUndefined();

        expect(read()).toBe(content);
        expect(process.exitCode).not.toBe(1);
      },
    );

    it('lets `config reset --all` replace the file with defaults', async () => {
      fs.writeFileSync(configPath, TYPO);

      await runConfig(['reset', '--all', '--yes']);

      const saved = JSON.parse(read());
      expect(saved.profile).toBe('core');
      expect(saved.telemetry).toBeUndefined();
    });

    it('still sets a value in a valid file', async () => {
      fs.writeFileSync(configPath, VALID);

      await runConfig(['set', 'profile', 'core']);

      const saved = JSON.parse(read());
      expect(saved.profile).toBe('core');
      expect(saved.telemetry).toEqual(SETTINGS.telemetry);
    });
  });

  it('is left byte-identical by a read-only CLI command', async () => {
    const project = path.join(tempDir, 'project');
    fs.mkdirSync(path.join(project, 'openspec', 'specs'), { recursive: true });
    fs.mkdirSync(path.join(project, 'openspec', 'changes'), { recursive: true });
    fs.writeFileSync(path.join(project, 'openspec', 'config.yaml'), 'schema: spec-driven\n');
    fs.writeFileSync(configPath, TYPO);

    const result = await runCLI(['list'], {
      cwd: project,
      env: {
        XDG_CONFIG_HOME: tempDir,
        HOME: tempDir,
        USERPROFILE: tempDir,
        CI: 'false',
      },
      timeoutMs: 60_000,
    });

    expect(read()).toBe(TYPO);
    // However many times the command reads the config, it warns at most once.
    expect((result.stderr.match(/Invalid JSON/g) ?? []).length).toBeLessThanOrEqual(1);
  }, 120_000);
});
