# Consuming the fork (example)

[`example-consumer/`](example-consumer/) is a tested reference for how a separate repository can depend on this fork. It stays in this repo so changes to the OpenSpec artifact cannot silently break the documented layout.

## Build and vendor

Build OpenSpec from a clean checkout:

```bash
node fork/pack-offline.mjs
```

In a copy of `fork/example-consumer/` (or your own repo modeled on it), vendor that output:

```bash
node scripts/vendor-openspec.mjs --from /path/to/OpenSpec-No-Telemetry/fork/out
git add vendor/openspec
```

The vendor command:

1. requires `BUILD-INFO.json` schema version 2;
2. rejects a dirty-tree development artifact or one that did not pass network, offline-consumer, and all-tool checks;
3. verifies the tarball against both `BUILD-INFO.json` and `SHA256SUMS`;
4. copies the tarball, build metadata, checksum, and license notices;
5. does not change `package.json` or create a lockfile.

Do not hardcode or rename the artifact. Commit the vendored files under `vendor/openspec/`.

## Required package shape

The example is an ES module package with no registry dependencies:

```json
{
	"name": "@your-group/acme",
	"type": "module",
	"engines": { "node": ">=20.19.0" },
	"bin": {
		"acme": "bin/acme.js",
		"acme-init": "bin/acme-init.js"
	},
	"files": ["bin", "lib", "toolkit", "templates", "vendor/openspec", "release.json"],
	"dependencies": {}
}
```

Ship the vendored tarball inside your release package. At pack time, include `vendor/openspec/` in the tarball. Do not list the fork in `dependencies`.

## Install the fork

The consumer installer puts the fork on PATH with a global offline install of the vendored tarball:

```bash
npm install -g vendor/openspec/<name-from-BUILD-INFO>.tgz --offline --ignore-scripts
```

Generated IDE content invokes bare `openspec ...` commands, so the fork must be a global command after install. The example records the installed entry path in `~/.acme/install.json` as `openspecEntry` and uses it for child processes.

## Optional `./cli` shim

If you embed OpenSpec in-process instead of a global install, import the narrow CLI entry:

```js
import { runCli } from '@fission-ai/openspec/cli';

runCli();
```

Use the `./cli` export, not the broad package root. The offline verification in this fork still tests this path.

## Consumer CLI libraries

The fork does not export third-party CLI libraries. Declare and audit your own dependencies (`commander`, `chalk`, `@inquirer/prompts`, `cross-spawn`, and any others your CLI needs).

Pin exact versions, bundle them in your release tarball when you publish to a private registry, and scan them with the same rules as [`fork/audit-network.mjs`](audit-network.mjs). See **Reviewing a dependency change** in [`NETWORK-AUDIT.md`](NETWORK-AUDIT.md).

The example consumer uses Node built-ins only (`util.parseArgs`, `util.styleText`, `readline/promises`, `child_process`) so it stays registry-free.

## Migrating from upstream OpenSpec

When a project or machine used registry OpenSpec before switching to this fork:

1. Uninstall the global upstream package if it still owns the `openspec` command (`npm uninstall -g @fission-ai/openspec`, or let your consumer installer replace it).
2. Run `openspec update` in each project. This fork removes unmodified upstream Copilot cloud-agent files (`.github/workflows/copilot-setup-steps.yml` and `.github/agents/openspec.agent.md`). If you edited those files, merge your changes elsewhere, then delete them.
3. Remove a leftover `githubCopilot:` block from `openspec/config.yaml` if present (it is ignored but confusing).
4. Run `openspec config unset telemetry` to drop a leftover telemetry block from global config.
5. Run `openspec completion install` so shell completions no longer offer removed commands (`feedback`, `version --check`, `init --copilot-cloud`).
6. Update automation that relied on removed flags:
   - `openspec version --check` — fails with an explanation; upgrade through your consumer release instead.
   - `openspec init --copilot-cloud` — fails with an explanation.
   - `openspec init --no-copilot-cloud` — accepted as a no-op for scripts.
   - `openspec config set telemetry.enabled false` — accepted as a no-op; other `telemetry.*` keys fail with guidance to `config unset telemetry`.

## `acme-init` example

The example maps one IDE (Kiro) to OpenSpec, then starts the globally installed OpenSpec as a child through `openspecEntry` from `install.json`:

```js
spawnSync(process.execPath, [openspecEntry, 'init', projectDir, '--tools', 'kiro', ...], {
  stdio: 'inherit',
  env: { ...process.env, OPEN_SPEC_INTERACTIVE: '0', OPENSPEC_NO_COMPLETIONS: '1' },
});
```

`--tools` makes the call non-interactive, and the child boundary keeps an OpenSpec exit from terminating the parent CLI.

Kiro is only the example's default target. The fork retains all upstream-supported local IDE/tool integrations, listed in [`supported-surface.json`](supported-surface.json). Extend `lib/ides.js` in your product without rebuilding this fork.

## What the example verifies

Run:

```bash
node fork/verify-example-consumer.mjs
```

Against the current artifact it checks:

- vendor metadata and checksum validation (schema 2);
- plain-file vendoring without a lockfile or npm dependency on the fork;
- release packing with vendored OpenSpec files inside the consumer tarball;
- global install of the fork tarball alone (`npm install -g … --offline`);
- the example npx/global-bin flow against a local release server;
- `acme-init`, `acme update`, Kiro output, version stamping, and preservation of customized project files;
- no runtime network attempt during project setup/update.

The fork CI runs this check after building the artifact.

## Adapting the example

When copying `example-consumer/` into your own repository, replace at least:

- **Package identity** — scope and name in `package.json`, and every `acme` token (bins, env vars such as `ACME_HOME`, `~/.acme`, `.acme/project.json`, release tarball names).
- **IDE list** — entries in `lib/ides.js` and default `--ide` behavior.
- **Content** — `toolkit/` and `templates/project/` steering, skills, and hooks.
- **CLI libraries** — the example uses Node built-ins; your product will declare its own pinned dependencies.
- **Release host** — `.gitlab-ci.yml` image, registry URLs, and authentication (the sample uses GitLab Generic Package Registry).
- **CI image** — mirror a Node 20.19+ image into a registry your pipeline can reach offline.

This fork does not implement your product's release policy, credentials, or supported operating systems; the placeholders make those boundaries visible without turning this repository into your application's source tree.
