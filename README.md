# OpenSpec No-Telemetry Runtime

This private fork packages OpenSpec as a self-contained dependency for offline consumers. It is never published to or resolved from an npm registry.

The artifact is an npm-format tarball because consumers use Node's package layout and module resolution. `npm pack`, `npm install --offline`, and a local `file:` dependency are packaging mechanics; they do not publish or fetch this fork.

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

`BUILD-INFO.json` is the machine-readable handoff contract. It records the artifact name and checksum, source revision, package entry points and exact symbols, complete supported IDE surface, and verification status.

## Consume it in your project

[`fork/example-consumer/`](fork/example-consumer/) is the tested reference layout. Its vendor command reads the build metadata instead of hardcoding the tarball name:

```bash
cd fork/example-consumer
node scripts/vendor-openspec.mjs --from ../out
npm ci --offline
```

A consumer typically imports:

```js
import { runCli } from '@fission-ai/openspec/cli';
import {
	Command,
	chalk,
	crossSpawn,
	loadPrompts,
} from '@fission-ai/openspec/cli-kit';
```

The consumer owns the globally exposed `openspec` shim. The vendored package provides the CLI implementation, schemas, and exact bundled dependency versions. Detailed instructions are in [`fork/INTEGRATION.md`](fork/INTEGRATION.md).

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
