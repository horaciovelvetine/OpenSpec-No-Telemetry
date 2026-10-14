# Fork review

Review of commit `0b640e3` (2026-10-13) against the intent stated in [`FORK.md`](FORK.md), [`README.md`](README.md), [`fork/INTEGRATION.md`](fork/INTEGRATION.md), and [`fork/example-consumer/README.md`](fork/example-consumer/README.md).

Updated 2026-10-14 with findings from a command-by-command review of the CLI against its upstream base: new verification rows, item 6, an addition to item 5, new entries under "Worth considering" and "Checked and fine", and [Inherited from upstream](#inherited-from-upstream). The per-command reference is [`COMMANDS.md`](COMMANDS.md).

## Summary

The fork meets its stated intent. From a clean checkout, it builds a self-contained tarball that:

- installs with no registry;
- exposes the documented `./cli`, `./cli-kit`, and `./package.json` exports;
- keeps every upstream IDE integration;
- records no network attempts at runtime.

The example consumer vendors the tarball, packs a release with OpenSpec nested inside, and installs that release through `npx`.

Open issues:

- one reproduced bug in the example installer's upgrade path;
- a fork base that breaks the fork's own tag-only sync rule;
- no cleanup path for upstream's Copilot cloud-agent files, which install upstream OpenSpec from the npm registry;
- several documentation and robustness gaps.

## Verification performed

The 2026-10-13 runs used a temporary clone of `0b640e3`, because the main checkout's `node_modules` was installed inside the devcontainer (see item 4). The 2026-10-14 runs used the main checkout's existing `dist/`, built after the last `src/` commit, with `HOME` and `XDG_*` pointed at a temporary directory. They didn't install or build anything.

| Check                                                                | Result                                                                                                                                                                                                                                                                                                                                                |
|----------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `node fork/pack-offline.mjs`                                         | Passed: 205 test files, 6,147 tests. The audit covered 204 src, 204 dist, and 1 bin file, plus 75 production packages. The 75 staged packages matched `fork/allowed-deps.json`. Tarball: 2.40 MB, 2,644 files. Offline verification: 65 checks.                                                                                                       |
| `node fork/verify-example-consumer.mjs`                              | Passed, 35 checks.                                                                                                                                                                                                                                                                                                                                    |
| Second `acme install` over the global install from the previous step | Failed (item 1). Passed after the one-line fix.                                                                                                                                                                                                                                                                                                       |
| Fork base vs upstream tags                                           | Checked with `git ls-remote --tags upstream` and the GitHub compare API (item 2).                                                                                                                                                                                                                                                                     |
| Fork changes by command (2026-10-14)                                 | `git diff --stat 2500d6d HEAD -- src` changes 19 files. Behavior differs only in `init`, `update`, `config`, `version`, and the completion registry, and `feedback` is gone. The removed flags and keys fail as intended: `version --check`, `init --copilot-cloud`, `init --no-copilot-cloud`, `feedback`, and `config set telemetry.enabled false`. |
| Upstream leftovers (2026-10-14)                                      | A `telemetry` block left in `config.json` is kept and ignored, and `openspec config unset telemetry` removes it. A `githubCopilot:` block in `openspec/config.yaml` is ignored without a warning. Copilot cloud-agent files: item 6, from reading the code.                                                                                           |
| `update` over skills stamped by a newer build (2026-10-14)           | Rewrote them without a warning ("Worth considering").                                                                                                                                                                                                                                                                                                 |
| `node fork/audit-network.mjs` on the main checkout (2026-10-14)      | Passed with `COMMANDS.md` added at the repo root.                                                                                                                                                                                                                                                                                                     |

## Needs fixing

### 1. The example installer cannot upgrade over itself

The documented upgrade is to rerun the install with the new release. The second run exits with:

```text
✖ /var/folders/…/global/bin/openspec belongs to another install (for example Homebrew or a manual link). Remove it, then rerun the acme install.
```

`ownedByThisPackage()` in [`fork/example-consumer/lib/install.js`](fork/example-consumer/lib/install.js) resolves the bin through symlinks but compares it against an unresolved package root. Any npm global prefix reached through a symlink therefore fails. In the reproduction:

- `npm prefix -g` was `/var/folders/…/global`;
- the bin resolved to `/private/var/folders/…/global/lib/node_modules/@your-group/acme/bin/openspec.js`.

Fix, verified: after this change the reinstall succeeds and `openspec --version` still reports the vendored build.

```diff
 	try {
-		return fs.realpathSync(bin).startsWith(packageRoot + path.sep);
+		return fs
+			.realpathSync(bin)
+			.startsWith(fs.realpathSync(packageRoot) + path.sep);
 	} catch {
```

[`fork/verify-example-consumer.mjs`](fork/verify-example-consumer.mjs) installs once and never reinstalls, so this path is untested. Add a second install after the `install --yes` check, and assert that it exits 0 and that `openspec --version` still matches.

### 2. The fork base is untagged upstream `main`

[`fork/fork.json`](fork/fork.json) records `upstreamCommit` `2500d6d` with `upstreamTag: null`. The runbook says to merge a release tag, never raw upstream `main`.

- `v1.14.0` is `94ca9c1`. The fork base is `v1.14.0` plus six unreleased commits: #2019, #1791, #1792, #2020, #2025, and #2031.
- The artifact is still labeled `1.14.0-no-telem.1`, and `BUILD-INFO.json` reports `upstreamVersion: 1.14.0`.
- Upstream has since tagged `v1.14.1` (`87c3595`). That tag is 7 commits ahead of the fork base and 0 behind, so it contains everything the fork already carries.

Recommended: follow the runbook with `git merge v1.14.1`, then update `fork/fork.json`:

- `upstreamCommit`: `87c3595ace6a2e22957f39ebe5b74c2f2316e0cb`
- `upstreamTag`: `v1.14.1`
- `build`: `1`

The artifact becomes `1.14.1-no-telem.1`.

Expect during the merge:

- **Conflicts on removed paths:** modify/delete conflicts on `CHANGELOG.md`, `flake.nix`, `docs-lab/`, `skills/`, and `website/`. Keep them deleted.
- **Template changes:** `src/core/templates/workflows/continue-change.ts`, `src/core/templates/workflows/verify-change.ts`, and `schemas/spec-driven/schema.yaml` change upstream. The fork has not edited them, so they should merge cleanly.
- **Parity test:** a possible conflict in `test/core/templates/skill-templates-parity.test.ts`, which both sides edited. Run `pnpm build && pnpm regen:parity-hashes`, then run the parity test.

### 3. The README's consumer instructions dirty the fork

The README's "Consume it in your project" section runs the vendor command inside `fork/example-consumer/`. That command:

- rewrites the tracked `package.json`;
- writes `package-lock.json`;
- writes the tarball, `BUILD-INFO.json`, `SHA256SUMS`, and `THIRD-PARTY-LICENSES` under `vendor/openspec/`.

`git check-ignore` confirms that none of these files are ignored. The example's own `.gitignore` deliberately re-includes `vendor/openspec/*.tgz`, which is right for a real consumer repo. Afterwards, `node fork/pack-offline.mjs` refuses to run on the uncommitted tree.

Fix:

- Have the README say to copy `fork/example-consumer/` out of the fork first, as [`fork/INTEGRATION.md`](fork/INTEGRATION.md) already does.
- Point to `node fork/verify-example-consumer.mjs` for an in-repo check, since it works on a temporary copy.

### 4. `pack-offline.mjs` can stall on a pnpm prompt

The main checkout's `node_modules/.modules.yaml` records the devcontainer store (`/workspaces/OpenSpec-No-Telemetry/.pnpm-store/v10`), while the host uses `~/Library/pnpm/store/v10`. Step 1 (`pnpm install --frozen-lockfile`) then asks:

```text
The modules directory at ".../node_modules" will be removed and reinstalled from scratch. Proceed? (Y/n)
```

Without a TTY the build waits indefinitely. CI starts from a fresh checkout and is unaffected.

Fix, verified against a store mismatch: pnpm reinstalls without prompting.

```diff
-	run('pnpm', ['install', '--frozen-lockfile'], {
+	run('pnpm', ['install', '--frozen-lockfile', '--config.confirm-modules-purge=false'], {
```

Also avoid sharing `node_modules` between the devcontainer and the host, because the devcontainer install contains Linux-native binaries.

### 5. Stale documentation

- [`FORK.md`](FORK.md), under "Repository scope", says to keep a "security policy", but `SECURITY.md` was deleted in `a082c8d`. Either add a fork-specific policy or drop the reference.
- [`.devcontainer/README.md`](.devcontainer/README.md) says Node.js 20, but the image is `typescript-node:1-22-bookworm`.
- [`.devcontainer/devcontainer.json`](.devcontainer/devcontainer.json) has two leftovers:
  - it runs `corepack prepare pnpm@latest --activate`, while `package.json` pins `pnpm@10.34.5`;
  - it installs the GitHub CLI, which only the removed `feedback` command used.
- In [`fork/audit-network.mjs`](fork/audit-network.mjs), the `PROCESS_ALLOWLIST` note for `src/core/store/git.ts` lists init, add, commit, status, rev-parse, and remote get-url. The file also runs `var` (the commit-identity check before `store setup` commits), `rm --cached` (unstaging after a failed initial commit), `remote`, `ls-files`, and `rev-list`. [`fork/NETWORK-AUDIT.md`](fork/NETWORK-AUDIT.md) lists `rev-list` but not `var`, `rm --cached`, `remote`, or `ls-files`.

### 6. Upstream's Copilot cloud-agent files have no cleanup path

Upstream OpenSpec writes two files for GitHub's hosted Copilot coding agent. When the feature landed (#1274), `init` wrote them whenever GitHub Copilot was selected; later releases ask first.

- `.github/workflows/copilot-setup-steps.yml`, whose setup step runs `npm install -g @fission-ai/openspec`;
- `.github/agents/openspec.agent.md`, which tells the agent to install the same package when `openspec` is missing.

Upstream's `update` deletes its own copies of these files once Copilot is no longer configured or the project opts out. The fork removed that code along with the feature (`src/core/github-copilot/`, and `syncCopilotCloudFiles` in `src/core/update.ts`), and nothing else touches those paths. A repo that moves from upstream to the fork keeps both files, so GitHub's cloud agent keeps installing upstream OpenSpec from the public registry instead of the vendored build.

This comes from reading the code; it wasn't reproduced against a migrated repo. A search of `src/` finds `copilot-setup-steps.yml` and `.github/agents` only in the `github-copilot` `detectionPaths` in `src/core/config.ts`, and `openspec.agent.md` nowhere. Upstream added those detection paths in #917, four months before the cloud-agent feature, so they should stay. The leftovers therefore also keep marking the repo as a Copilot project.

Fix, smallest first:

- Add a "Migrating from upstream OpenSpec" section to [`fork/INTEGRATION.md`](fork/INTEGRATION.md) that says to delete both files after checking them for local edits. [`COMMANDS.md`](COMMANDS.md) already lists them under "Leftovers from an upstream install".
- Have `init` and `update` warn when either file contains upstream's marker (`Generated by OpenSpec for GitHub Copilot coding agent support.`) or `@fission-ai/openspec`; older releases wrote the files without the marker. Put the check in a fork-owned module, because `src/core/github-copilot/` is a removed path and a literal `npm install -g` in `src/` trips the audit's `registry-install` rule.

The same migration section can cover the harmless leftovers:

- a `telemetry` block in the global `config.json`, including the old `anonymousId`, which `config list` still shows (`openspec config unset telemetry` removes it);
- a `githubCopilot:` block in `openspec/config.yaml`, which is ignored;
- completion scripts installed by upstream, which keep offering `feedback` until `openspec completion install` is rerun.

## Worth considering

These come from reading the code, not from failures in the runs above, unless an entry says it was reproduced.

- **cli-kit library versions are part of the consumer API but go unrecorded.**
  - Consumers build on OpenSpec's commander 14.0.3, chalk 5.6.2, @inquirer/prompts 8.5.2, and cross-spawn 7.0.6.
  - An upstream sync can bump one of these to a new major version without any signal to consumers.
  - Suggestion: record these versions in `BUILD-INFO.json` from the staged tree. Have `vendor-openspec.mjs` print the old and new versions, and warn on a major change.
- **`exportedSymbols` is hardcoded.**
  - `EXPORTED_SYMBOLS` in `pack-offline.mjs` is a constant, not read from the build.
  - `verify-offline.mjs` asserts the exact cli-kit export set. For `./cli` it only checks that `runCli` exists.
  - `./cli` also exports `program`, `getCommandPath`, `isJsonRun`, `isCompletionRun`, and `shouldDeferCompletionTip`, yet the README calls the field's values "exact symbols".
  - Suggestion: assert the exact `./cli` export set, or describe the field as required symbols.
- **Only one Node/npm version is verified.**
  - CI builds and verifies with Node 20.19.0 only.
  - End users install the consumer release with their own `npx`, so the nested bundle is handled by whatever npm version they have.
  - Suggestion: run `verify-example-consumer.mjs` on a Node 20/22/24 matrix.
- **Vendoring fails on Windows** (from reading the code; not run on Windows).
  - `vendor-openspec.mjs` calls `spawnSync('npm', …)` without a shell.
  - `pack-offline.mjs` already handles the same bootstrap case with `shell: process.platform === 'win32'`, and `lib/install.js` has Windows branches.
  - Suggestion: apply the same handling, or document that the producer and vendoring steps are POSIX-only.
- **Type-only packages ship in the bundle.**
  - `@types/node@20.19.43` and `undici-types@6.21.0` ship as production packages.
  - `pnpm why @types/node --prod` traces them to an optional peer of `@inquirer/*`, which the root devDependency satisfies.
  - They contain only `.d.ts` files. The audit doesn't scan those, and `NETWORK-AUDIT.md` doesn't mention them.
- **Scripts written for upstream fail on the removed flags and keys** (reproduced).
  - Upstream documented `openspec config set telemetry.enabled false` as its telemetry opt-out, and `init --no-copilot-cloud` for unattended setup. Both now exit 1, as do `version --check` and `init --copilot-cloud`.
  - `init --tools github-copilot --no-copilot-cloud` stops before writing anything, and a setup script under `set -e` stops with it.
  - The errors don't say why: `error: unknown option '--no-copilot-cloud'`, or `Unknown top-level key "telemetry"`. Tests pin the rejection of `version --check` (`test/cli-e2e/basic.test.ts`) and of the `telemetry` key (`test/commands/config.test.ts`, `test/core/config-schema.test.ts`).
  - Suggestion: list these in the migration section from item 6. Optionally, reuse the pattern the CLI already applies to retired options (hidden `--store-path`, `--initiative`, and `--areas`): keep them registered but hidden, and fail with a message saying the fork removed the feature. `--no-copilot-cloud` could even succeed as a no-op, since the fork never writes those files. Either way, update the tests above.
- **`update` downgrades skills from a newer build without warning** (reproduced).
  - Skill freshness is the exact string match noted under "Checked and fine", so an older vendored build rewrites skills stamped by a newer one.
  - Skills stamped `1.14.1-no-telem.1` were regenerated as `1.14.0`. The only sign was the plan line `Updating 1 tool(s): claude (1.14.1-no-telem.1 → 1.14.0)`.
  - Upstream's registry check at least said a newer CLI existed. The fork removed that signal, which matters when teammates install different consumer releases.
  - Suggestion: an offline guard that compares the recorded `generatedBy` version with the running one and warns, or requires `--force`, when the files are newer. It changes upstream-owned code (`src/core/update.ts` or `src/core/shared/tool-detection.ts`), so weigh it against the extra merge surface.
- **The CLI still sends users to upstream.**
  - `init` ends with `Feedback: https://github.com/Fission-AI/OpenSpec/issues` (`src/core/init.ts:1296`). `init` and `update` print upstream's "Learn more" link (`src/core/init.ts:1295`, `src/core/update.ts:513`).
  - These are plain text and fetch nothing, but they point fork users at upstream's tracker, and the fork removed `feedback`.
  - Suggestion: point them at the fork, or drop the Feedback line. Each edit is one more upstream-owned line to carry through syncs.
- **`COMMANDS.md` is pinned to the current base.**
  - It names `2500d6d` and lists which commands the fork changes, so the sync in item 2 makes it stale.
  - Suggestion: commit it, link it from the README, and add it to FORK.md's "Repository scope" and "Fork-owned files". Add a runbook step to recheck it with `git diff --stat <base> HEAD -- src`.
  - Keep it at the repo root or under `fork/`: `docs/` is a removed path, so the audit fails if it reappears.

## Inherited from upstream

These come from upstream code that the fork runs unchanged. Reporting them upstream, rather than patching them here, keeps the fork's diff limited to the removed network features. [`COMMANDS.md`](COMMANDS.md) lists them for users under "Upstream quirks".

| Behavior                                                                                                                   | Impact                                                                                      |
|----------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------|
| `change validate --json` exits 0 when the change is invalid; `src/commands/change.ts` sets the exit code only in text mode | CI that uses the deprecated form passes invalid changes. `validate <change> --json` exits 1 |
| `archive` merges a change with no deltas and no `skip_specs` marker                                                        | Archives a change that `validate` rejects                                                   |
| `templates --json` reports failures as text                                                                                | Breaks the one-JSON-document contract the other `--json` commands keep                      |
| `schema init` prints `Use with: openspec new --schema <name>` (`src/commands/schema.ts:1364`)                              | That command fails; the working form is `openspec new change <change> --schema <name>`      |
| `experimental --no-interactive` reads `options.noInteractive`, which Commander never sets                                  | The flag does nothing                                                                       |
| `show --deltas-only` has no effect, and `view`'s help calls it an interactive dashboard                                    | Help text promises behavior that doesn't exist                                              |

The `change validate`, `archive`, and `--deltas-only` behaviors were reproduced in the sandbox. The rest come from the code.

## Checked and fine

- **Version ordering:** skill freshness uses exact string comparison (`generatedByVersion !== currentVersion` in `src/core/shared/tool-detection.ts`). Semver ranks `-no-telem.N` below the upstream release, but that ordering never affects `openspec update`.
- **No registry install instructions:** no template or schema under `src/` or `schemas/` tells users or agents to `npx` or globally install OpenSpec from a registry.
- **Clean `dist/`:** `build.js` deletes `dist/` before compiling, so removed modules cannot reach the artifact.
- **No import side effects:** importing `@fission-ai/openspec/cli` only registers commands. `runCli()` must be called explicitly, and the module runs itself only when executed directly.
- **Old build rejected:** `fork/out/` in the main checkout holds a development build from `79d3cab` (`forkCommitDirty: true`). The vendor command correctly rejects it without `--allow-dirty`.
- **Telemetry and the update check are fully gone:** the audit's `removed-endpoint` rule finds no PostHog or `registry.npmjs.org` reference in `src/` or `dist/`, and nothing reads `OPENSPEC_TELEMETRY`, `DO_NOT_TRACK`, `OPENSPEC_NO_UPDATE_CHECK`, or `npm_config_registry`. The `preAction` and `postAction` hooks only apply `--no-color` and show the local completions tip.
- **`feedback` left nothing behind:** upstream exported the `feedback` skill template but never installed it, so generated skills are unchanged. No template tells agents to run `openspec feedback`.
- **The other commands run upstream's code:** outside `init`, `update`, `config`, `version`, and the completion registry, the fork's `src/` diff removes telemetry and feedback code, edits comments, and adds `src/cli-kit.ts`.

## Suggested order

1. Fix item 1 and add the reinstall check.
2. Fix items 3, 4, 5, and 6.
3. Sync to `v1.14.1` (item 2). Then, from a clean tree, run `node fork/pack-offline.mjs` and `node fork/verify-example-consumer.mjs`, and update `COMMANDS.md` for the new base.
4. Take up the "Worth considering" items as needed, and report the "Inherited from upstream" items upstream.

## Resolution (2026-10-14 implementation)

| Item | Status |
|------|--------|
| 1 Example installer upgrade | Fixed `ownedByThisPackage()` realpath handling; verify script reinstalls over a symlinked global prefix |
| 2 Fork base vs upstream tags | Merged `v1.14.1`; `fork/fork.json` records `87c3595` / `v1.14.1` / build `1` |
| 3 README dirtying the fork | README and example README direct consumers to copy the example out; in-repo check uses `verify-example-consumer.mjs` |
| 4 pnpm prompt on store mismatch | `pack-offline.mjs` passes `--config.confirm-modules-purge=false`; devcontainer docs warn against shared `node_modules` |
| 5 Stale documentation | FORK.md, devcontainer, git allowlist in audit docs, `COMMANDS.md` committed and linked |
| 6 Copilot cloud-agent leftovers | `src/fork/copilot-cloud-leftovers.ts` on `init`/`update`; migration section in INTEGRATION.md |
| Worth considering (selected) | `cliKitLibraries` in BUILD-INFO, vendor major-version warnings, Node 20/22/24 example verify matrix, Windows npm spawn in vendor script, type-only package note in NETWORK-AUDIT.md |
| Worth considering (deferred) | Skill downgrade guard; repoint upstream Learn more/Feedback links |
| Inherited from upstream | Unchanged; report upstream separately |
