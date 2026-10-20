# Network and dependency audit

## Enforced guarantee

The OpenSpec-owned runtime contains no outbound network implementation. Its bundled production dependency tree is pinned and scanned for the same network primitives.

This is narrower and more accurate than claiming that every program a user can launch through OpenSpec is offline. `config edit` and `workset open` execute a user-selected local program; that editor or agent CLI can have its own network behavior outside OpenSpec's control.

Run after building:

```bash
pnpm build
node fork/audit-network.mjs
```

CI and `fork/pack-offline.mjs` run the same gate. The pack pipeline also audits the installed artifact and executes it under `fork/no-network-preload.mjs`.

## Removed outbound surfaces

| Surface | Removed behavior |
| --- | --- |
| Telemetry | PostHog events, anonymous id, telemetry config/environment handling |
| Version check | npm registry request from update/version |
| Self-upgrade | `npm install -g @fission-ai/openspec@latest` |
| Feedback | GitHub issue creation through `gh` |
| Copilot cloud agent | Hosted workflow/profile that installed upstream OpenSpec. `init` and `update` remove unmodified upstream copies and warn on customized leftovers |

The normal GitHub Copilot prompt adapter remains. So do all other local IDE/tool integrations in `fork/supported-surface.json`.

## What the static audit rejects

In `src/`, `dist/`, and shipped bin files:

- imports of `http`, `https`, `http2`, `net`, `tls`, `dns`, `dgram`, or `undici`;
- `fetch`, WebSocket, XMLHttpRequest, EventSource, and sendBeacon use;
- spawning npm-family tools, `gh`, `curl`, or `wget`;
- remote git subcommands such as clone, fetch, pull, push, and ls-remote;
- removed telemetry/registry endpoints and public OpenSpec install directions;
- any process-spawning source file not in the reviewed allowlist.

The audit has no inline source-code bypass marker. Reviewed process exceptions are centralized in `PROCESS_ALLOWLIST`.

It also rejects:

- a non-private package manifest, publish metadata, or lifecycle scripts;
- changesets, release, Nix, skills.sh, website/docs/history, or administration paths that this fork intentionally removed;
- an unreviewed production `name@version`;
- network primitives, install scripts, native builds, or unreviewed process use in a production dependency;
- missing compiled output.

## Remaining reviewed process launches

| Source | Purpose |
| --- | --- |
| `src/core/store/git.ts` | Local git init/add/commit/rm --cached/var/status/remote/remote get-url/ls-files/rev-parse/rev-list |
| `src/core/store/operations.ts` | Local git repository discovery |
| `src/commands/config.ts` | Opens `$EDITOR` |
| `src/commands/workset.ts` | Opens the configured local editor or agent CLI |
| `src/ui/welcome-screen.ts` | Reads reduced-motion settings with `defaults`/`gsettings` |
| `src/utils/shell-detection.ts` | Reads the parent process name with `ps` |
OpenSpec can print URLs and local diagnostic suggestions such as `git clone`. Printed text is not a network request.

Libraries that a consumer declares for its own CLI (outside this fork) are outside the OpenSpec runtime audit. The consumer must pin, scan, and license them separately.

## Production dependency result

`fork/allowed-deps.json` currently pins 75 production packages. The audit scans every JavaScript file in each package.

- Network primitives: none
- Install scripts: none
- Native builds: none
- Licenses: MIT 66, ISC 8, BSD-3-Clause 1
- Packages using child processes:
  - `cross-spawn`: caller-selected portable process launch
  - `@inquirer/external-editor`: opens `$VISUAL`/`$EDITOR`; OpenSpec does not invoke this path
  - `commander`: executable-subcommand support; OpenSpec defines none

The direct runtime dependencies are Commander, Inquirer core/prompts, Chalk, Ora, cross-spawn, diff, fast-glob, YAML, and Zod. The bundled tarball carries the exact lockfile-resolved tree.

`@types/node` and `undici-types` also appear in the bundled tree: they satisfy an optional peer of `@inquirer/*` and contain only `.d.ts` files. They have no runtime JavaScript for the static audit to scan.

## Dynamic verification

`fork/no-network-preload.mjs` blocks and records:

- fetch and browser-style network globals;
- HTTP/HTTPS/HTTP2 calls;
- TCP, TLS, UDP/datagram, and DNS operations;
- network command-line tools and remote git commands.

`fork/verify-offline.mjs` installs with an empty cache, npm offline mode, and an unreachable registry. It then runs package-export checks, the dependent shim, a Kiro workflow journey, and `init/update --tools all`. Any attempted network operation is logged and fails the verification even if application code catches the thrown error.

## Reviewing a dependency change

When the audit reports a new package:

1. inspect why it entered the production tree;
2. review its code, scripts, native build metadata, process use, and license;
3. run the full offline artifact verification;
4. only then update the pin set:

   ```bash
   node fork/audit-network.mjs --update-deps
   ```

5. update this report if the count or findings changed.

Build-time `pnpm install`, `pnpm audit`, GitHub actions, and a consumer's own release distribution (for example downloading a private registry tarball) are intentionally outside the OpenSpec runtime boundary.
