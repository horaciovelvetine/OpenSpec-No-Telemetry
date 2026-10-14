# Fork policy and maintenance

## Purpose

This fork supplies OpenSpec to downstream consumers without publishing or resolving it through an npm registry. A producer machine builds one self-contained tarball; a consuming project vendors that artifact through a local `file:` dependency and bundles it into its own private release (for example a GitLab Generic Package Registry tarball).

The npm-format archive is intentional. It preserves Node module resolution, package-relative schemas, package metadata, and bundled production dependencies. It is not an npm registry distribution.

## Invariants

1. OpenSpec-owned runtime code contains no outbound HTTP, socket, registry, telemetry, feedback, or self-upgrade implementation.
2. `package.json` remains `"private": true`; publishing and alternate public distribution infrastructure stay deleted.
3. Every production dependency is pinned, scanned, bundled, and installed without lifecycle scripts or native builds.
4. Every upstream-supported local IDE/tool integration remains functional. GitHub Copilot prompts are supported; only its hosted cloud-agent setup is removed.
5. Consumers should install only an artifact whose `BUILD-INFO.json` reports successful network, offline-consumer, and all-supported-tools verification.

The remaining local process launches and the exact audit boundary are documented in [`fork/NETWORK-AUDIT.md`](fork/NETWORK-AUDIT.md).

## Dependency surface

Consuming projects use these package exports:

- `@fission-ai/openspec/cli`: `runCli()` for a global `openspec` shim
- `@fission-ai/openspec/cli-kit`: the reviewed CLI libraries already carried by the bundle
- `@fission-ai/openspec/package.json`: the vendored fork version

The broad package root remains for upstream compatibility but is not the recommended CLI entry. [`fork/supported-surface.json`](fork/supported-surface.json) pins every supported tool id, owned skill/command path, command adapter, profile, delivery mode, and intentionally excluded feature.

## Build

From a clean checkout on a registry-capable producer:

```bash
node fork/pack-offline.mjs
```

The command always:

1. restores `pnpm-lock.yaml` with `--frozen-lockfile`;
2. builds and runs the complete test suite;
3. audits source, built output, bins, package policy, and production packages;
4. stages a hoisted, copied production tree with scripts disabled;
5. verifies that the staged packages exactly match `fork/allowed-deps.json`;
6. packs and inspects the exact artifact file list;
7. installs the tarball with an empty cache, offline mode, and a dead registry;
8. exercises a consumer-style shim, Kiro journey, and `--tools all` init/update under the no-network preload.

`--allow-dirty` is only for local development. `--keep-stage` retains the temporary staging tree for inspection. There are no release paths that skip tests or offline verification.

Output in `fork/out/`:

| File                   | Purpose                                      |
| ---------------------- | -------------------------------------------- |
| `*.tgz`                | Bundled dependency artifact                  |
| `SHA256SUMS`           | Copy/integrity check                         |
| `BUILD-INFO.json`      | Versioned artifact and verification contract |
| `THIRD-PARTY-LICENSES` | OpenSpec and bundled dependency notices      |

The artifact version is `<upstream>-no-telem.<build>`. Update [`fork/fork.json`](fork/fork.json) for each artifact. After an upstream sync, record the exact merged upstream commit and tag (or `null` when no tag ref is available), then reset `build` to `1` when the upstream version changes.

## Repository scope

Keep:

- `src/`, `schemas/`, and `bin/`
- functional and fork contract tests under `test/`
- build, typecheck, lint, lockfile, audit, and artifact tooling
- `fork/example-consumer/` as a tested reference layout
- this runbook, the network report, integration guide, [`COMMANDS.md`](COMMANDS.md), and license

Do not restore upstream website/docs/history/release surfaces listed in `REMOVED_PATHS` inside [`fork/audit-network.mjs`](fork/audit-network.mjs). The audit turns this reduced repository shape into a checked policy.

## Upstream sync runbook

1. Fetch and merge a release tag, never raw upstream `main`:

   ```bash
   git fetch upstream --tags
   git merge v<version>
   ```

2. Preserve the fork deletions:
   - `src/telemetry/`
   - `src/core/version-check.ts`
   - `src/commands/feedback.ts`
   - `src/core/templates/workflows/feedback.ts`
   - `src/core/github-copilot/cloud-agent.ts`
   - publishing, changesets, Nix, skills.sh, website/docs, upstream planning history, and repository administration paths enforced by the audit

   Keep `src/core/command-generation/adapters/github-copilot.ts` and every other local IDE adapter.

   If `src/core/github-copilot/cloud-agent.ts` reappears during the merge, delete it again and update the hash list in [`src/fork/copilot-cloud-leftovers.ts`](src/fork/copilot-cloud-leftovers.ts) plus the fixtures under `test/fixtures/upstream-copilot-cloud/` when upstream changes those templates.

3. Prefer upstream's lockfile during conflict resolution, then regenerate it after removing upstream-only dev dependencies:

   ```bash
   pnpm install
   ```

4. Build and run the policy gate:

   ```bash
   pnpm build
   node fork/audit-network.mjs
   ```

   Review every new production package before running:

   ```bash
   node fork/audit-network.mjs --update-deps
   ```

   Update `fork/NETWORK-AUDIT.md` when the dependency set changes.

5. If workflow templates changed:

   ```bash
   pnpm regen:parity-hashes
   ```

6. Run the full checks:

   ```bash
   pnpm test
   pnpm exec tsc --noEmit
   pnpm lint
   ```

7. Compare `src/core/config.ts` and the command adapter/profile registries with `fork/supported-surface.json`. A new upstream integration is retained and added to the manifest, not pruned.

8. Recheck [`COMMANDS.md`](COMMANDS.md) against the new base:

   ```bash
   git diff --stat <upstreamCommit> HEAD -- src
   ```

   Update the upstream base commit, fork-changed commands, and version examples as needed.

9. Update `fork/fork.json`, create the verified artifact, and run the example:

   ```bash
   node fork/pack-offline.mjs
   node fork/verify-example-consumer.mjs
   ```

## Fork-owned files

| Path | Role |
| --- | --- |
| `fork/audit-network.mjs` | Runtime, dependency, package, and repository policy |
| `fork/allowed-deps.json` | Reviewed production dependency tree |
| `fork/supported-surface.json` | Preserved IDE/workflow contract |
| `fork/pack-offline.mjs` | Mandatory release artifact pipeline |
| `fork/verify-offline.mjs` | Offline dependency and all-tool runtime proof |
| `fork/no-network-preload.mjs` | Dynamic no-network guard |
| `fork/fork.json` | Artifact build counter |
| `fork/NETWORK-AUDIT.md` | Reviewed network/dependency report |
| `fork/INTEGRATION.md` | Example consumer usage |
| `fork/example-consumer/` | Tested, non-production reference layout |
| `fork/verify-example-consumer.mjs` | Example drift/pack/install verification |
| `fork/artifact-contract.mjs` | Shared BUILD-INFO export and cli-kit library contract |
| `fork/vendor-cli-kit-report.mjs` | cli-kit version reporting for example vendoring |
| `COMMANDS.md` | Per-command fork vs upstream reference |
| `src/fork/copilot-cloud-leftovers.ts` | Removes upstream Copilot cloud-agent leftovers on init/update |
| `src/fork/removed-features.ts` | Messages for retired upstream flags and config keys |
| `src/cli-kit.ts` | Registry-free CLI building blocks for bundled consumers |
