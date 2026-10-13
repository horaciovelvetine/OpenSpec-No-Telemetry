import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  NETWORK_RULES,
  PROCESS_ALLOWLIST,
  SOURCE_ONLY_RULES,
  auditPackagedTree,
  checkManifest,
  findReappearedPaths,
  scanText,
} from '../../fork/audit-network.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ALL_RULES = [...NETWORK_RULES, ...SOURCE_ONLY_RULES];

// Text samples only: the audit reads source as text, so these never run.
const FLAGGED: Array<[string, string]> = [
  ['network-module', "import https from 'node:https';"],
  ['network-module', 'const net = require("net");'],
  ['network-module', "const { request } = await import('undici');"],
  ['fetch', 'const response = await fetch(url);'],
  ['web-api', 'const socket = new WebSocket(url);'],
  ['network-tool-spawn', "spawn('npm', ['view', name]);"],
  ['network-tool-spawn', "spawn.sync('gh', ['issue', 'create']);"],
  ['git-remote', "execFile('git', ['push', 'origin']);"],
  ['removed-endpoint', "const host = 'https://edge.openspec.dev';"],
  ['removed-endpoint', "const registry = 'https://registry.npmjs.org';"],
  ['registry-install', 'Install it with `npm install -g @fission-ai/openspec`.'],
  ['registry-install', 'Run `npx openspec@latest init`.'],
];

const CLEAN = [
  "import fs from 'node:fs';",
  "import { Command } from 'commander';",
  'const record = await store.fetch(id);',
  '// entries carry no `specs`/`fetch` keys at all',
  "execFile('git', ['status', '--porcelain']);",
  "execFile('git', ['-C', root, 'rev-parse', '--show-toplevel']);",
  'This hint used to be an npm `postinstall` script.',
  "console.log('Learn more: https://github.com/Fission-AI/OpenSpec');",
];

describe('fork network audit rules', () => {
  it.each(FLAGGED)('flags %s in: %s', (id, sample) => {
    expect(scanText(sample, ALL_RULES).map((hit: { id: string }) => hit.id)).toContain(id);
  });

  it.each(CLEAN)('passes local-only code: %s', (sample) => {
    expect(scanText(sample, ALL_RULES)).toEqual([]);
  });

  it('does not allow source lines to bypass the audit inline', () => {
    expect(scanText('await fetch(url); // audit-network: allow', ALL_RULES)).toEqual([
      expect.objectContaining({ id: 'fetch' }),
    ]);
  });

  it('reports the line of each finding', () => {
    const [hit] = scanText("const a = 1;\n\nimport http from 'http';\n", ALL_RULES);
    expect(hit).toMatchObject({ id: 'network-module', line: 3 });
  });
});

describe('fork packaging audit', () => {
  const tempDirs: string[] = [];
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('accepts a private manifest without lifecycle scripts', () => {
    expect(checkManifest({ private: true, scripts: { build: 'node build.js' } })).toEqual([]);
  });

  it('rejects a publishable manifest', () => {
    const findings = checkManifest({
      scripts: { prepare: 'node build.js', prepublishOnly: 'pnpm build' },
      publishConfig: { access: 'public' },
      devDependencies: { '@changesets/cli': '^3.0.0' },
    });
    expect(findings).toHaveLength(5);
    expect(findings.join('\n')).toContain('"private": true');
  });

  it('notices removed paths that an upstream merge brought back', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openspec-audit-'));
    tempDirs.push(root);
    fs.mkdirSync(path.join(root, '.changeset'));
    fs.writeFileSync(path.join(root, 'flake.nix'), '{}\n');

    expect(findReappearedPaths(root)).toEqual(['.changeset', 'flake.nix']);
  });

  it('audits the installed package surface, not only source files', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openspec-package-audit-'));
    tempDirs.push(root);
    fs.mkdirSync(path.join(root, 'bin'));
    fs.mkdirSync(path.join(root, 'dist'));
    fs.writeFileSync(path.join(root, 'package.json'), '{"private":true}\n');
    fs.writeFileSync(path.join(root, 'bin', 'openspec.js'), '#!/usr/bin/env node\n');
    fs.writeFileSync(path.join(root, 'dist', 'index.js'), "fetch('https://example.test');\n");

    expect(auditPackagedTree(root)).toMatchObject({
      files: 2,
      findings: [expect.objectContaining({ check: 'fetch' })],
    });
  });

  it('passes on this repository', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8'));
    expect(checkManifest(pkg)).toEqual([]);
    expect(findReappearedPaths(repoRoot)).toEqual([]);
  });

  it('allowlists only process-spawning files that exist', () => {
    for (const file of PROCESS_ALLOWLIST.keys()) {
      expect(fs.existsSync(path.join(repoRoot, file)), file).toBe(true);
    }
  });
});
