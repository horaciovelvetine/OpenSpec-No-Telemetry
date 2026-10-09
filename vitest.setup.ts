import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { ensureCliBuilt, terminateActiveCliChildren } from './test/helpers/run-cli.js';

async function cleanRootTestArtifacts(): Promise<void> {
  const root = process.cwd();
  const names = await readdir(root);
  await Promise.all(
    names
      .filter((name) => /^(?:test-.+-tmp|_tmp_)/.test(name))
      .map((name) => rm(path.join(root, name), { recursive: true, force: true }))
  );
}

// Ensure the CLI bundle exists before tests execute
export async function setup() {
  await cleanRootTestArtifacts();
  await ensureCliBuilt();
}

export async function teardown(): Promise<void> {
  terminateActiveCliChildren();
  await cleanRootTestArtifacts();
}
