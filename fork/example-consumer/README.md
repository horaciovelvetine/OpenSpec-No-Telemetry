# Example consumer (`acme`)

A tested reference layout for a project that vendors the offline OpenSpec build from this fork and distributes its own CLI plus steering content. Copy the structure and replace the `acme` placeholder (package name, bins, env vars, and on-disk folders) with your product's names.

The main CLI command name must match the unscoped package name (`acme` here), because `npx <release-url>` runs that bin with no arguments.

This example provides:

- `acme` (installer, plus `acme init` and `acme update`), `acme-init`, and an `openspec` command that runs the vendored OpenSpec
- CLI libraries through `@fission-ai/openspec/cli-kit`, so the consumer needs no other npm dependencies
- a sample GitLab CI pipeline that publishes release tarballs to the Generic Package Registry

It documents compatibility with the fork; it is not a production deployment template.

## Layout

| Path | Role |
| --- | --- |
| `bin/acme.js` | `acme install`, `acme init`, `acme update`; with no arguments under npx it runs `install` |
| `bin/acme-init.js` | `acme-init [path] [--ide kiro] [--yes] [--force]` |
| `bin/openspec.js` | Runs the vendored OpenSpec; generated IDE skills call bare `openspec` |
| `lib/install.js` | Global install, conflict handling, toolkit copy, PATH checks |
| `lib/init.js`, `lib/update.js`, `lib/project.js` | Project setup and refresh |
| `lib/ides.js` | Example IDE choices mapped to OpenSpec tool ids (Kiro by default) |
| `toolkit/` | Copied to `~/.acme/toolkit/` on install |
| `templates/project/` | Copied into each project by `acme-init`; existing files are kept |
| `vendor/openspec/` | The vendored OpenSpec tarball, checksum, build info, and notices |
| `scripts/pack-release.mjs` | Packs a release with OpenSpec bundled and `release.json` written |
| `.gitlab-ci.yml` | Sample: check on every push; release on `vX.Y.Z` tags |

## Developing

Use a **copy** of this folder outside the OpenSpec-No-Telemetry fork (or your own repo modeled on it). Vendoring inside `fork/example-consumer/` in the fork repo rewrites tracked files and breaks `node fork/pack-offline.mjs` on an uncommitted tree. To check the flow from the fork without dirtying it, run `node fork/verify-example-consumer.mjs` at the fork root.

In your consumer copy:

```bash
node scripts/vendor-openspec.mjs --from /path/to/OpenSpec-No-Telemetry/fork/out
git add package.json package-lock.json vendor/openspec
npm ci --offline
node bin/acme.js --help
```

The vendor command accepts only a fully verified `BUILD-INFO.json`, checks both recorded checksums, copies the tarball and license sidecars, updates the local `file:` dependency, and generates `package-lock.json` without a registry. It rejects development artifacts built from a dirty OpenSpec tree unless you pass `--allow-dirty`. Commit the lockfile; the sample CI uses `npm ci --offline`.

Use the libraries through cli-kit:

```js
import {
	Command,
	chalk,
	crossSpawn,
	loadPrompts,
} from '@fission-ai/openspec/cli-kit';

const { checkbox } = await loadPrompts(); // @inquirer loads on first use
```

## Releasing (sample GitLab host)

Bump `version` in `package.json`, commit, and push a matching `vX.Y.Z` tag. The sample `release` job writes `release.json` (the package URL), packs the consumer with OpenSpec bundled, checks the bundle, and uploads `acme-X.Y.Z.tgz` to:

```text
https://<gitlab-host>/api/v4/projects/<project-id>/packages/generic/acme/X.Y.Z/acme-X.Y.Z.tgz
```

Adapt the URL pattern and authentication for your registry.

## Installing (users)

Needs Node.js 20.19 or later. Turn off npm's own background registry calls once, in `~/.npmrc`:

```ini
audit=false
fund=false
update-notifier=false
```

Then authenticate with one of these. npm cannot send GitLab's `PRIVATE-TOKEN` header, so pick the first that works on your instance:

1. **Token in `~/.npmrc`** (read-only personal or deploy token, `read_package_registry` scope):

   ```ini
   //<gitlab-host>/api/v4/projects/<project-id>/packages/generic/:_authToken=${ACME_GITLAB_TOKEN}
   ```

   If GitLab rejects the bearer token, use basic auth instead: `//<gitlab-host>/api/v4/projects/<project-id>/packages/generic/:_auth=<base64 of username:token>`.

   ```bash
   npx --yes https://<gitlab-host>/api/v4/projects/<project-id>/packages/generic/acme/X.Y.Z/acme-X.Y.Z.tgz
   ```

2. **Anonymous download** inside your network, if your GitLab allows it for this project: the same `npx` command with no token.
3. **Download first**, then install from the file:

   ```bash
   curl --fail --header "PRIVATE-TOKEN: $ACME_GITLAB_TOKEN" -o acme.tgz <package URL>
   npx --yes --package="$PWD/acme.tgz" acme install --from "$PWD/acme.tgz"
   ```

The installer puts `acme`, `acme-init`, and `openspec` on your PATH and copies the toolkit to `~/.acme/`. It stops if another OpenSpec owns the `openspec` command (rerun with `--yes` to uninstall a global `@fission-ai/openspec`). Upgrading means running the same command with the new release URL; `npm update -g` cannot discover new URLs.

Then, in each project:

```bash
acme-init
```
