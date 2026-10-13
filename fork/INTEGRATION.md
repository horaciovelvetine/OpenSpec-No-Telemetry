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
git add package.json package-lock.json vendor/openspec
npm ci --offline
```

The vendor command:

1. requires `BUILD-INFO.json` schema version 1;
2. rejects a dirty-tree development artifact or one that did not pass network, offline-consumer, and all-tool checks or expose the expected package API;
3. verifies the tarball against both `BUILD-INFO.json` and `SHA256SUMS`;
4. copies the tarball, build metadata, checksum, and license notices;
5. writes the exact local `file:` dependency into `package.json`;
6. creates `package-lock.json` in npm offline mode.

Do not hardcode or rename the artifact. Commit the generated lockfile; the sample GitLab pipeline deliberately runs `npm ci --offline`.

## Required package shape

The example is an ES module package with no registry dependencies of its own:

```json
{
	"name": "@your-group/acme",
	"type": "module",
	"engines": { "node": ">=20.19.0" },
	"bin": {
		"acme": "bin/acme.js",
		"acme-init": "bin/acme-init.js",
		"openspec": "bin/openspec.js"
	},
	"dependencies": {
		"@fission-ai/openspec": "file:vendor/openspec/<name-from-BUILD-INFO>.tgz"
	}
}
```

The vendor command writes the dependency entry. Do not add `bundleDependencies` to the committed manifest: the release pack script adds it only while packing, after the local dependency is installed.

## OpenSpec shim

The consumer owns the global `openspec` command because generated agent content invokes bare `openspec ...` commands:

```js
#!/usr/bin/env node
import { runCli } from '@fission-ai/openspec/cli';

runCli();
```

Use the narrow `./cli` export, not the broad package root.

## Shared CLI libraries

Build your CLI with the exact libraries already inside the OpenSpec bundle:

```js
import {
	Command,
	chalk,
	crossSpawn,
	loadPrompts,
} from '@fission-ai/openspec/cli-kit';

const { checkbox, confirm, select } = await loadPrompts();
```

Inquirer is loaded lazily because eager imports can keep the event loop alive when stdin is piped. `@fission-ai/openspec/package.json` is also exported for the vendored version.

## `acme-init` example

The example maps one IDE (Kiro) to OpenSpec, then starts OpenSpec as a child:

```js
spawnSync(
	process.execPath,
	[
		openspecShim,
		'init',
		projectDir,
		'--tools',
		'kiro',
		'--profile',
		'core',
		'--force',
		'--no-animation',
	],
	{
		stdio: 'inherit',
		env: {
			...process.env,
			OPEN_SPEC_INTERACTIVE: '0',
			OPENSPEC_NO_COMPLETIONS: '1',
		},
	},
);
```

`--tools` makes the call non-interactive, and the child boundary keeps an OpenSpec exit from terminating the parent CLI. Do not pass `--no-copilot-cloud`; that removed option is intentionally rejected.

Kiro is only the example's default target. The OpenSpec dependency retains all upstream-supported local IDE/tool integrations, listed in [`supported-surface.json`](supported-surface.json). Extend `lib/ides.js` in your product without rebuilding this fork.

## What the example verifies

Run:

```bash
node fork/verify-example-consumer.mjs
```

Against the current artifact it checks:

- vendor metadata and checksum validation;
- offline lockfile generation and `npm ci --offline`;
- release packing with nested OpenSpec dependencies;
- the example npx/global-bin flow against a local release server;
- `acme-init`, `acme update`, Kiro output, version stamping, and preservation of customized project files;
- no runtime network attempt during project setup/update.

The fork CI runs this check after building the artifact.

## Adapting the example

When copying `example-consumer/` into your own repository, replace at least:

- **Package identity** — scope and name in `package.json`, and every `acme` token (bins, env vars such as `ACME_HOME`, `~/.acme`, `.acme/project.json`, release tarball names).
- **IDE list** — entries in `lib/ides.js` and default `--ide` behavior.
- **Content** — `toolkit/` and `templates/project/` steering, skills, and hooks.
- **Release host** — `.gitlab-ci.yml` image, registry URLs, and authentication (the sample uses GitLab Generic Package Registry).
- **CI image** — mirror a Node 20.19+ image into a registry your pipeline can reach offline.

This fork does not implement your product's release policy, credentials, or supported operating systems; the placeholders make those boundaries visible without turning this repository into your application's source tree.
