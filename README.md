# OpenSpec No-Telemetry Runtime

This private fork packages OpenSpec as a self-contained dependency for offline consumers. It is never published to or resolved from an npm registry.

The artifact is an npm-format tarball because consumers use Node's package layout and module resolution. `npm pack` and `npm install -g {tarball} --offline` are packaging mechanics; they do not publish or fetch this fork from a registry.

## Runtime boundary

OpenSpec-owned outbound features are removed:

- PostHog telemetry and telemetry configuration
- npm registry version checks and self-upgrade
- `openspec feedback` and its `gh` integration
- GitHub Copilot hosted cloud-agent setup

The ordinary GitHub Copilot prompts remain supported, along with every other local IDE/tool integration inherited from upstream OpenSpec. The supported surface is pinned in [`fork/supported-surface.json`](fork/supported-surface.json).

The CLI still starts reviewed local programs for local git operations, editor launches, OS reduced-motion detection, and shell detection. A user-configured editor or workset opener can perform its own network activity; that program is outside OpenSpec's guarantee. See [`fork/NETWORK-AUDIT.md`](fork/NETWORK-AUDIT.md) for the exact boundary.

## Build the dependency

Requirements:

- Node.js 20.19.0 or later
- pnpm 10.34.5
- registry access on the producer machine to restore the locked build toolchain

From a clean checkout:

```bash
node fork/pack-offline.mjs
```

For an explicitly non-releasable development build from a dirty checkout:

```bash
node fork/pack-offline.mjs --allow-dirty
```

The command installs from `pnpm-lock.yaml`, builds, runs all tests, audits the source/build/dependencies, creates the bundled tarball, and verifies it with an empty npm cache and a blocked registry. Output is written to `fork/out/`:

- `fission-ai-openspec-<version>-no-telem.<build>.tgz`
- `SHA256SUMS`
- `BUILD-INFO.json`
- `THIRD-PARTY-LICENSES`

`BUILD-INFO.json` is the machine-readable handoff contract. It records the artifact name and checksum, source revision, package entry points and required symbols, complete supported IDE surface, and verification status.

## Consume it in your project

[`fork/example-consumer/`](fork/example-consumer/) is the tested reference layout. Copy it out of this fork into your own repository (or model your repo on it), then vendor a build from `fork/out/` as described in [`fork/INTEGRATION.md`](fork/INTEGRATION.md). Do not run the vendor command inside `fork/example-consumer/` in this checkout: it rewrites tracked files and `pack-offline.mjs` refuses a dirty tree.

To verify the example flow without dirtying the fork, run:

```bash
node fork/verify-example-consumer.mjs
```

Per-command fork behavior is documented in [`COMMANDS.md`](COMMANDS.md).

A consumer vendors the tarball as a plain file, installs it globally with `npm install -g vendor/openspec/{artifact}.tgz --offline`, and puts `openspec` on PATH. For an in-process shim, import `runCli` from `@fission-ai/openspec/cli` after a local install. The consumer declares its own CLI libraries; the fork does not export them. Detailed instructions are in [`fork/INTEGRATION.md`](fork/INTEGRATION.md).

## Development checks

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm exec tsc --noEmit
pnpm lint
node fork/audit-network.mjs
```

The complete offline artifact and example consumer verification are required CI results.

## Fork maintenance

[`FORK.md`](FORK.md) documents the policy, upstream-tag sync procedure, removed repository surfaces, and build counter. This branch intentionally retains all upstream runtime IDE adapters and workflows while removing upstream publishing, website, historical planning, and release infrastructure.

OpenSpec is derived from [Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec) and remains licensed under the MIT License. See [`LICENSE`](LICENSE).
