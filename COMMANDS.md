# CLI commands

This file covers what each `openspec` command does in this fork and how it differs from upstream OpenSpec.

It describes the current fork on `main` after the `v1.14.1` sync. The upstream base is `87c3595` (`v1.14.1`; see [`fork/fork.json`](fork/fork.json)). The fork's runtime edits are the files listed by `git diff --stat 87c3595 HEAD -- src`, plus fork-owned modules under `src/fork/`. Any command not covered under [Fork changes](#fork-changes) runs the same code as upstream at that base. Recheck this file after each upstream sync.

Upstream marks stores, references, and worksets as beta, so their flags, file formats, and JSON output may change between releases.

## Summary

| Command | Status | Purpose |
| --- | --- | --- |
| [`init`](#init) | Changed | Create `openspec/` and install skills and commands for AI tools |
| [`update`](#update) | Changed | Regenerate the installed skills and commands |
| [`config`](#config) | Changed | View and edit the global config |
| [`list`](#list) | Unchanged | List changes or specs |
| [`show`](#show) | Unchanged | Print a change or spec |
| [`view`](#view) | Unchanged | Print a dashboard of changes and specs |
| [`validate`](#validate) | Unchanged | Validate changes and specs |
| [`archive`](#archive) | Unchanged | Merge a finished change into the specs and archive it |
| [`new change`](#new-change) | Unchanged | Scaffold a change |
| [`status`](#status) | Unchanged | Show artifact progress for a change |
| [`instructions`](#instructions) | Unchanged | Print agent instructions for an artifact, apply, or archive |
| [`templates`](#templates) | Unchanged | Show a schema's template paths |
| [`schemas`](#schemas) | Unchanged | List workflow schemas |
| [`schema`](#schema) | Unchanged | Create, copy, validate, and locate schemas (experimental) |
| [`store`](#store) | Unchanged | Create and register stores |
| [`doctor`](#doctor) | Unchanged | Report root, store, and reference health |
| [`context`](#context) | Unchanged | Print the working set: the root plus referenced stores |
| [`workset`](#workset) | Unchanged | Save and open personal sets of folders |
| [`version`](#version) | Changed | Print the installed version |
| [`completion`](#completion) | Changed (completion data only) | Install shell completions |
| [`change`](#change-deprecated) | Unchanged, deprecated | Noun-first `show`, `list`, `validate` for changes |
| [`spec`](#spec-deprecated) | Unchanged, deprecated | Noun-first `show`, `list`, `validate` for specs |
| [`feedback`](#feedback-removed) | Removed | Filed an issue on the upstream GitHub repo through `gh` |

Every command, changed or not, also lost upstream's telemetry.

## Fork changes

### All commands

- Telemetry is gone: no PostHog events, no anonymous id, and no first-run telemetry notice. Upstream tracked every command from a `preAction` hook. The fork's hooks only apply `--no-color` and show the local completions tip.
- These environment variables are no longer read, so setting them does nothing: `OPENSPEC_TELEMETRY`, `DO_NOT_TRACK`, `OPENSPEC_NO_UPDATE_CHECK`, `npm_config_registry`.

### Changes to `version`

|  | Upstream | Fork |
| --- | --- | --- |
| Text output | Version plus the detected package manager and install scope, for example `OpenSpec 1.14.0 (npm, global)` | `OpenSpec <version>` |
| `--check` | Asked the npm registry for a newer release | Removed: fails with a message that the fork removed the registry check |
| `--json` | `schemaVersion`, `version`, `install`, and `update` when `--check` was passed | `{"schemaVersion": 1, "version": "<version>"}` |

### Changes to `update`

- No registry lookup, no "newer CLI available" note, and no offer to upgrade through `npm install -g` and rerun. `update` always regenerates files from the installed build. To get newer workflows, vendor a newer fork artifact first, then run `openspec update`.
- It no longer creates or refreshes GitHub Copilot cloud-agent files. It removes unmodified upstream copies and warns on customized leftovers (same as `init`).

### Changes to `init`

- `--copilot-cloud` fails before writing anything, with a message that the fork removed hosted cloud-agent setup. `--no-copilot-cloud` is accepted as a no-op for legacy scripts and is listed in `init --help`. The interactive question about cloud-agent files is gone.
- Before tool detection, `init` removes unmodified upstream Copilot cloud-agent files and warns on customized copies (see [Leftovers from an upstream install](#leftovers-from-an-upstream-install)).
- GitHub Copilot in the editor is still supported: `.github/skills/openspec-*/SKILL.md` and `.github/prompts/opsx-*.prompt.md`.
- `githubCopilot.cloudAgent` in `openspec/config.yaml` is no longer read. A leftover `githubCopilot:` block is ignored without a warning.

### Changes to `config`

- `telemetry` is no longer a known key. `openspec config set telemetry.enabled false` is a no-op with a note. Other `telemetry.*` keys fail with guidance to run `openspec config unset telemetry`.
- A `telemetry` block written by upstream stays in `config.json`, because unknown keys are preserved. `config list` and `config get` still show it, but nothing reads it. Remove it with `openspec config unset telemetry`.

### Changes to `feedback`

Removed, along with its implementation and the unused `feedback` skill template. `openspec feedback ...` fails with `error: unknown command 'feedback'`. Upstream never installed that skill into projects, so generated skills are the same as upstream's.

### Shell completions

Generated completion scripts no longer offer `feedback`, `version --check`, or `init --copilot-cloud`. They offer `init --no-copilot-cloud` as a no-op flag for legacy scripts. Rerun `openspec completion install` to replace a script that upstream generated.

### Leftovers from an upstream install

| Leftover | Effect in the fork | Cleanup |
| --- | --- | --- |
| `telemetry` block in the global `config.json` | Ignored | `openspec config unset telemetry` |
| `githubCopilot:` block in `openspec/config.yaml` | Ignored | Delete the block |
| `.github/workflows/copilot-setup-steps.yml` and `.github/agents/openspec.agent.md` | Removed on `init`/`update` when content matches a known upstream template; customized copies are kept with a warning | Delete or adapt customized copies by hand; rerun `init`/`update` after edits |

### Text that still points upstream

`init` and `update` still print upstream's "Learn more" GitHub link, and the `init` summary also prints upstream's "Feedback" issues link. These are plain text; nothing is fetched.

## Shared behavior

### Global options

| Option            | Effect                                  |
| ----------------- | --------------------------------------- |
| `-V`, `--version` | Print the bare version                  |
| `--no-color`      | Disable color (sets `NO_COLOR=1`)       |
| `-h`, `--help`    | Show help for any command or subcommand |

### Choosing the OpenSpec root

`list`, `show`, `view`, `validate`, `archive`, `new change`, `status`, `instructions`, `schemas`, `doctor`, and `context` accept `--store <id>` and pick a root in this order:

1. `--store <id>`: a store registered on this machine.
2. The nearest `openspec/` folder at or above the current directory that has `specs/`, `changes/`, or a config file. If that folder holds only a config declaring `store: <id>`, the declared store is used.
3. The global `defaultStore` setting.
4. If nothing resolves and any store is registered, the command fails. With no stores registered, it uses the current directory, except that `doctor`, `context`, and bulk `validate` fail, and `list` requires `./openspec/project.md`.

With `--json`, the result appears as `root: {path, source, store_id?}`, where `source` is `store`, `nearest`, `declared`, `global_default`, or `implicit`. When a store is selected, human output starts with `Using OpenSpec root: <id> (<path>)` on stderr. The hidden `--store-path` option is rejected with instructions to register the path instead.

`init`, `update`, `templates`, `schema`, `change`, and `spec` use the current directory (or the path you pass) and don't accept `--store`.

### JSON output and exit codes

- On failure with `--json`, a command prints one JSON document on stdout with a `status` array of `{severity, code, message, target?, fix?}` and exits 1. The exceptions are listed under [Upstream quirks](#upstream-quirks).
- Human-mode errors print `Error: ...`, often followed by a `Fix: ...` line, on stderr and exit 1.
- The health reports (`doctor`, `store doctor`, `context`) exit 0 even when they find problems.

### Prompts

Most commands prompt only when stdin is a terminal, `--no-interactive` isn't passed, no `CI` variable is set, and `OPEN_SPEC_INTERACTIVE` isn't `0`. Without prompts, a command that needs an answer fails and names the flag to pass, such as `--yes`, `--change`, or `--path`.

### Files on your machine

| What | Location |
| --- | --- |
| Global config | `$XDG_CONFIG_HOME/openspec/config.json`, else `~/.config/openspec/config.json` (Windows: `%APPDATA%\openspec\config.json`) |
| Data dir | `$XDG_DATA_HOME/openspec`, else `~/.local/share/openspec` (Windows: `%LOCALAPPDATA%\openspec`) |
| User schemas | `<data dir>/schemas/` |
| Store registry | `<data dir>/stores/registry.yaml` |
| Worksets | `<data dir>/worksets/` |

## Setup

### `init`

```text
openspec init [path] [--tools <ids>] [--language <lang>] [--force] [--profile <name>] [--no-animation]
```

Creates the planning tree in `path` (default: the current directory) and installs OpenSpec skills and commands for the AI tools you pick. In an existing project it keeps your config and refreshes the selected tools.

| Option | Effect |
| --- | --- |
| `--tools <ids>` | `all`, `none`, or a comma-separated list of tool ids (`openspec init --help` lists them; `windsurf` maps to `devin`). Skips every prompt |
| `--language <lang>` | Write a language instruction into the `context` of a new `openspec/config.yaml`. Refuses to edit an existing config |
| `--force` | Clean up legacy OpenSpec files without asking. Non-interactive runs already do |
| `--profile <name>` | `core` or `custom`, for this run only. Not saved |
| `--no-animation` | Show the welcome screen without animation |

- Creates `openspec/specs/`, `openspec/changes/`, `openspec/changes/archive/`, and, unless a config exists, `openspec/config.yaml` with `schema: spec-driven` and commented examples.
- Writes skills to each tool's skills folder and, for tools that support them, `opsx` command files, depending on the delivery mode. Every path is pinned in [`fork/supported-surface.json`](fork/supported-surface.json).
- Without `--tools`, an interactive run shows a searchable tool picker. A non-interactive run uses the tools it detects in the project and fails if it finds none.
- The global config decides what is installed. Profile `core` gives propose, explore, apply, update, sync, and archive; `custom` gives the `workflows` list. Delivery is `both` (default), `skills`, or `commands`. Change these with `openspec config profile`.
- If `openspec/config.yaml` only declares `store: <id>`, the repo's planning lives in that store. `init` then installs tool integrations and leaves planning files alone. Run it from the repo root; `--language` is rejected there.
- The animation is skipped when stdout isn't a terminal, `NO_COLOR` or `OPENSPEC_NO_ANIMATION` is set, the terminal is narrower than 60 columns, or the OS asks for reduced motion.
- `openspec experimental [--tool <id>]` is a hidden, deprecated alias that runs `init` in the current directory.

Changed in this fork: see [Changes to `init`](#changes-to-init).

### `update`

```text
openspec update [path] [--force]
```

Regenerates OpenSpec skills and command files for the tools already configured in `path`, using the installed build and the current global profile and delivery. Requires `path/openspec/`.

- A tool is refreshed when its skills were generated by a different version, its generated files no longer match this build, or its installed workflows or delivery no longer match the global config. Otherwise `update` reports that every tool is up to date.
- Removes skills and commands for deselected workflows, and whichever of the two a delivery change no longer uses.
- Moves OpenSpec files out of renamed tool folders, for example `.kimi/` to `.kimi-code/`. For `.windsurf/` to `.devin/` it asks first in a terminal.
- Offers to clean up legacy OpenSpec files. `--force` cleans without asking; a non-interactive run without `--force` warns and continues.
- Names tool folders it detects that aren't configured. Add them with `openspec init`.
- `--force` refreshes every configured tool, even when it is up to date.
- If the global config has no explicit `profile`, the first run records a `custom` profile that matches what is installed.

Changed in this fork: see [Changes to `update`](#changes-to-update).

## Configuration

### `config`

```text
openspec config [--scope global] <subcommand>
```

| Subcommand | Effect |
| --- | --- |
| `path` | Print the config file path |
| `list [--json]` | Print the settings merged with defaults, plus the effective profile, delivery, and workflows |
| `get <key>` | Print one value by dot path, defaults included. Exits 1 when the key has no value |
| `set <key> <value> [--string] [--allow-unknown]` | Set a value. `true`, `false`, numbers, and JSON arrays or objects are converted unless `--string` is passed |
| `unset <key>` | Remove a key |
| `reset --all [-y]` | Replace the file with defaults. Asks first unless `-y` |
| `edit` | Open the file in `$EDITOR` (or `$VISUAL`), then validate it |
| `profile [core]` | Interactive wizard for delivery and workflows. `core` applies the core workflows without prompting |

- `set` accepts `profile` (`core` or `custom`), `delivery` (`both`, `skills`, or `commands`), `workflows` (a JSON array), `featureFlags.<name>` (a boolean), and `defaultStore` (a store id). Other keys need `--allow-unknown`. Workset `openers` are easiest to edit with `config edit`.
- After a change inside a project, the profile wizard offers to run `update` immediately. Elsewhere, run `openspec update` in each project.
- `--scope` accepts only `global`.

Changed in this fork: see [Changes to `config`](#changes-to-config).

## Browsing

### `list`

```text
openspec list [--specs] [--archived | --all] [--sort recent|name] [--json] [--store <id>]
```

- By default, lists active changes with task progress (`No tasks`, `2/5 tasks`, `✓ Complete`) and the time since the last edit.
- `--specs` lists specs with their requirement counts. `--changes` selects the default.
- `--archived` lists only archived changes, and `--all` lists active and archived. Neither works with `--specs`.
- `--sort recent` (the default) orders changes by their newest file; `name` sorts alphabetically. Specs are always sorted by id.
- JSON is `{changes: [{name, completedTasks, totalTasks, lastModified, status}], root}` or `{specs: [{id, requirementCount}], root}`.

### `show`

```text
openspec show [item] [--type change|spec] [--json] [--no-interactive] [options] [--store <id>]
```

Prints an active change's `proposal.md` or a spec's `spec.md`. The type is detected; pass `--type` when a change and a spec share a name. With no item, a terminal session prompts; otherwise the command prints suggestions and exits 1. Archived changes can't be shown.

| Option | Applies to | Effect |
| --- | --- | --- |
| `--json` | Both | Change: `{id, title, deltaCount, deltas, root}`. Spec: `{id, title, overview, requirementCount, requirements, metadata, root}` |
| `--diff` | Change | Append per-requirement diffs of the delta specs against the main specs. In JSON, add `diff` or `warning` to MODIFIED deltas |
| `--deltas-only`, `--requirements-only` | Change | Accepted but have no effect; the JSON is the same either way. `--requirements-only` is a deprecated alias |
| `--requirements`, `--no-scenarios` | Spec, JSON only | Omit scenarios |
| `-r, --requirement <n>` | Spec, JSON only | Show only requirement `n` (1-based) |

Flags meant for the other type print a warning and are ignored.

### `view`

```text
openspec view [--store <id>]
```

Prints a one-screen summary: spec and requirement counts, draft changes (no tasks yet), active changes with a progress bar and each artifact's state, completed changes, and specs ranked by requirement count. The output is static, despite the help text calling it interactive, and there is no `--json`.

## Validation and lifecycle

### `validate`

```text
openspec validate [item] [--all | --changes | --specs | --archived] [options] [--store <id>]
```

| Option | Effect |
| --- | --- |
| `[item]` | Validate one change or spec. `--type change` or `--type spec` resolves a name used by both |
| `--all`, `--changes`, `--specs` | Validate everything in scope, in parallel. Needs an existing OpenSpec root |
| `--archived` | Check that every archived change has all its tasks ticked, without rechecking deltas. Useful in a pre-commit hook |
| `--strict` | Fail on warnings as well as errors |
| `--report <full\|findings>` | Bulk scopes only. `findings` returns just the items that have issues |
| `--concurrency <n>` | Number of parallel validations. Defaults to `OPENSPEC_CONCURRENCY`, then 6 |
| `--json` | `{items: [{id, type, valid, issues, durationMs}], summary, version, root}` |
| `--no-interactive` | Don't prompt when no item is given |

- Each change delta spec needs `## ADDED`, `## MODIFIED`, `## REMOVED`, or `## RENAMED Requirements` sections, and each requirement needs a `#### Scenario:`. MODIFIED requirements are compared with the main specs, and dropping an existing scenario is an error. A change with no deltas fails unless its `.openspec.yaml` sets `skip_specs: true` next to a valid `schema:`.
- Each spec needs `## Purpose` and `## Requirements` with at least one requirement. A requirement without a scenario or without SHALL or MUST wording is a warning, so it fails only with `--strict`.
- With no item and no scope, a terminal session shows a menu; otherwise the command prints suggestions and exits 1.
- Exits 0 when everything passes and 1 otherwise.

### `archive`

```text
openspec archive [change] [-y | --yes] [--skip-specs] [--no-validate] [--json] [--store <id>]
```

Finalizes a change in five steps:

1. Validates its delta specs. `--no-validate` skips this after a confirmation (or with `--yes`) and also disables capability retirement.
2. Checks tasks. Unfinished tasks need a confirmation or `--yes`.
3. Reserves `openspec/changes/archive/YYYY-MM-DD-<name>/`, keeping the name as is if it already starts with a date, and stops if that folder exists.
4. Previews the spec updates and, after confirmation, merges the deltas into `openspec/specs/`. Each rebuilt spec is validated before any file is written. Declining the merge still archives the change, and `--skip-specs` skips the merge for this run.
5. Moves the change folder into the archive. If a step fails, the specs are restored and the change stays active.

- Deleting a spec whose last requirement the change removes requires `retire_capabilities: true` in the change's `.openspec.yaml`.
- A change that never touches specs should set `skip_specs: true` in `.openspec.yaml` rather than relying on `--skip-specs`.
- `--json` never prompts. A step that needs confirmation fails with a diagnostic naming the command to rerun. Without a terminal, human mode does the same.

## Workflow

### `new change`

```text
openspec new change <name> [--description <text>] [--goal <text>] [--schema <name>] [--json] [--store <id>]
```

Creates `openspec/changes/<name>/` with an `.openspec.yaml` that holds `schema`, `created`, and the optional `goal`. No artifact files are written; `status` and `instructions` take it from there.

- Names are lowercase kebab-case, may start with a digit (`100-add-auth`), and are at most 200 characters.
- `--description` also writes a `README.md` in the change folder.
- `--schema` overrides the project default, which is `schema` in `openspec/config.yaml`, else `spec-driven`. If the schema has no specs artifact, `skip_specs: true` is added.
- Also creates `openspec/specs/`, `openspec/changes/archive/`, and a minimal `openspec/config.yaml` when they are missing. When no root resolves, it creates `openspec/` in the current directory and says so.
- JSON is `{change: {id, path, metadataPath, schema}, root}`.
- The hidden `--initiative` and `--areas` options were retired upstream and are rejected with an explanation.

### `status`

```text
openspec status (--change <id> | --all) [--schema <name>] [--json] [--store <id>]
```

Shows each artifact in the change's schema as done `[x]`, ready `[ ]`, blocked `[-]` (with what it waits on), or skipped `[~]`, followed by the next command to run.

- `--all` reports every active change. A change that fails to load sets exit 1 while the others still print.
- Without `--change` or `--all`, it prints `No active changes` when there are none; otherwise it exits 1 with the list of changes. It never prompts.
- The schema comes from `--schema`, then the change's `.openspec.yaml`, then `openspec/config.yaml`, then `spec-driven`.
- JSON includes `artifacts`, `isPlanningComplete`, `applyRequires`, `nextSteps`, and `root`.

### `instructions`

```text
openspec instructions <artifact|apply|archive> --change <id> [--schema <name>] [--json] [--store <id>]
```

Prints what an agent needs for the next step. `--change` is always required.

| Target | Output |
| --- | --- |
| `<artifact>`, for example `proposal` | The task, project `context` and the artifact's `rules` from `openspec/config.yaml`, an index of referenced stores' specs, dependency files to read first, the output path, schema guidance, and the template. Text mode wraps this in XML-style tags. Missing dependencies produce a warning, not an error |
| `apply` | State (`ready`, `blocked`, or `all_done`), context files, tasks with progress, the schema's apply guidance, and `operations.apply.guidance` from the config |
| `archive` | Read-only archive inputs: project `context` and `operations.archive.guidance`. Nothing is archived |

For an artifact skipped through `skip_specs`, the output is only a warning not to create it.

### `templates`

```text
openspec templates [--schema <name>] [--json]
```

Lists the absolute template path for every artifact in a schema (default `spec-driven`) and whether the schema came from the project, the user data dir, or the package. It reads project schemas from `./openspec/schemas/`, ignores the project's default schema, and has no `--store`. JSON is `{<artifact>: {path, source}}`.

### `schemas`

```text
openspec schemas [--json] [--store <id>]
```

Lists every schema the root can use, with its description, artifact sequence, and source. Project schemas override user schemas, which override built-in ones. The only built-in schema is `spec-driven`: proposal, then specs and design, then tasks, then apply. JSON is an array of `{name, description, artifacts, source}`.

### `schema`

```text
openspec schema <which|validate|fork|init> [...]
```

Prints `Note: Schema commands are experimental and may change.` to stderr. Every subcommand works from the current directory and has no `--store`.

| Subcommand | Effect |
| --- | --- |
| `which [name] [--all] [--json]` | Show where a schema resolves from and which copies it shadows |
| `validate [name] [--verbose] [--json]` | Check `schema.yaml`, its dependency graph, and its templates. Without a name, checks every project schema |
| `fork <source> [name] [--force] [--json]` | Copy a schema to `openspec/schemas/<name>/`. The default name is `<source>-custom` |
| `init <name> [--description <text>] [--artifacts <ids>] [--default \| --no-default] [--force] [--json]` | Create a project schema from `proposal`, `specs`, `design`, and `tasks` (all four by default). `--default` sets it as `schema` in `openspec/config.yaml` |

Schemas resolve from `openspec/schemas/<name>/`, then `<data dir>/schemas/<name>/`, then the package's `schemas/`.

## Stores and relationships

### `store`

A store is a standalone OpenSpec repo registered on this machine, so other commands can act on it from anywhere with `--store <id>`.

```text
openspec store <setup|register|unregister|remove|list|ls|doctor> [...]
```

| Subcommand | Effect |
| --- | --- |
| `setup [id] [--path <dir>] [--init-git \| --no-init-git] [--remote <url>] [--json]` | Create a store: scaffold `openspec/`, write `.openspec-store/store.yaml` (`version`, `id`, and optional `remote`), run `git init` and an initial commit (the default for new stores), and register it. Without a terminal, `id` and `--path` are required |
| `register [path] [--id <id>] [--yes] [--json]` | Register an existing OpenSpec root. Creating a missing `store.yaml` needs `--yes` or a yes at the prompt. Never commits |
| `unregister <id> [--json]` | Forget the registration and keep the files |
| `remove <id> [--yes] [--json]` | Forget the registration and delete the folder. Refuses a folder without a matching `store.yaml` or one that contains another registered store. It doesn't check for uncommitted or unpushed work |
| `list`, `ls [--json]` | List registered stores |
| `doctor [id] [--json]` | Check each store's folder, OpenSpec root, metadata, and local Git state. Findings exit 0 |

- `setup` refuses a path inside another Git repository unless `--no-init-git` is passed, and needs a Git commit identity when Git is enabled.
- Registrations live in `<data dir>/stores/registry.yaml`. Store ids are lowercase kebab-case.
- `--remote` only records a clone URL. OpenSpec never clones, fetches, pulls, or pushes.
- `openspec store` with a missing or unknown subcommand lists the subcommands and suggests the `--store` form of the normal command.

### `doctor`

```text
openspec doctor [--store <id>] [--json]
```

A read-only health check of the resolved root:

- Root: whether `openspec/` and its config are present and well formed.
- Store, for store-backed roots: the metadata, whether the recorded `remote` matches the checkout's `origin`, and how far the checkout is behind its upstream branch as of the last fetch.
- References: each `references:` entry in `openspec/config.yaml`, with a fix (such as a `git clone ... && openspec store register ...` command) for any that don't resolve.

It needs an existing root. Findings of any severity exit 0; only failures to run, such as no root or an unknown store, exit 1. Nothing is repaired, cloned, or synced.

### `context`

```text
openspec context [--store <id>] [--json] [--code-workspace <path> [--force]]
```

Prints the working set: the resolved root plus every store listed in `references:`. Each available store comes with a fetch command (`openspec show <spec-id> --type spec --store <id>`), and each unavailable one with a fix. `--code-workspace <path>` also writes a VS Code workspace containing the root and the available stores as `ref:<id>` folders; it won't overwrite an existing file without `--force`. Requires an existing root.

### `workset`

```text
openspec workset <create|list|ls|open|remove> [...]
```

A workset is a named set of folders you open together. Worksets are personal: they live in `<data dir>/worksets/worksets.yaml` and are never committed.

| Subcommand | Effect |
| --- | --- |
| `create [name] [--member <path> \| --member <name>=<path>]... [--tool <id>] [--json]` | Save a workset. Interactive runs use a short wizard; otherwise pass a name and at least one `--member`. The first member is the primary |
| `list`, `ls [--json]` | Show worksets and their members |
| `open <name> [--tool <id>]` | Regenerate `<data dir>/worksets/<name>.code-workspace` and launch the tool. Missing member folders are skipped. No `--json` |
| `remove <name> [--yes] [--json]` | Delete the workset. Member folders are untouched |

- Built-in tools: `code` (VS Code) and `cursor` open the generated workspace file. `claude` and `codex` attach each member with `--add-dir`, but they are disabled unless `OPENSPEC_ENABLE_CLI_AGENT_OPENERS=1`.
- Add or adjust tools under `openers` in the global `config.json`. Rows take `style`, `label`, `command`, `args`, and `attach_flag`; a new tool must set `style` to `workspace-file` or `attach-dirs`.
- `open` runs the tool without a shell, attached to your terminal, and waits for it to exit. Whatever that tool does on the network is outside this fork's guarantee.

## Utility

### `version`

```text
openspec version [--json]
```

Prints `OpenSpec <version>`, or `{"schemaVersion": 1, "version": "<version>"}` with `--json`. A vendored artifact reports `<upstream>-no-telem.<build>`, for example `1.14.1-no-telem.1`. A source checkout reports the `package.json` version (`1.14.1` after the `v1.14.1` sync).

Changed in this fork: see [Changes to `version`](#changes-to-version).

### `completion`

```text
openspec completion <generate|install|uninstall> [zsh|bash|fish|powershell]
```

| Subcommand | Effect |
| --- | --- |
| `generate [shell]` | Print the completion script to stdout |
| `install [shell] [--verbose]` | Install the script and, for zsh, bash, and PowerShell, add a managed block to the shell profile |
| `uninstall [shell] [-y]` | Remove the script and the managed block. Asks first unless `-y` |

| Shell | Script | Profile edit |
| --- | --- | --- |
| zsh | `~/.zsh/completions/_openspec`, or `$ZSH_CUSTOM/completions/_openspec` with Oh My Zsh | Block in `~/.zshrc` (none with Oh My Zsh) |
| bash | `~/.local/share/bash-completion/completions/openspec` | Block in `~/.bashrc` |
| fish | `~/.config/fish/completions/openspec.fish` | None |
| PowerShell | `OpenSpecCompletion.ps1` next to `$PROFILE` | Block in `$PROFILE` |

- Without a shell argument, the shell is detected from the parent process (through `ps`) and then `$SHELL`. On macOS and Linux, pass `powershell` explicitly.
- `OPENSPEC_NO_AUTO_CONFIG=1` skips the `.zshrc` and `.bashrc` edits.
- Once, after a command run in a terminal, the CLI prints a tip suggesting `completion install`, unless completions are already installed. `OPENSPEC_NO_COMPLETIONS=1` or a CI environment turns the tip off, and `--json` runs postpone it.
- A hidden `__complete <type>` command supplies change, spec, and schema names to the scripts.

Changed in this fork: see [Shell completions](#shell-completions).

## Deprecated and removed

### `change` (deprecated)

```text
openspec change <show|list|validate> [...]
```

Older noun-first forms of `show`, `list`, and `validate` for changes. Each run prints a deprecation warning to stderr. They read `./openspec/` in the current directory only: no ancestor search, no `--store`, and no default store.

| Subcommand | Effect |
| --- | --- |
| `show [name] [--json] [--deltas-only] [--diff] [--no-interactive]` | Same output as `openspec show <change>`, without the `root` field |
| `list [--json] [--long]` | Change ids. `--long` adds the title, delta count, and task progress. JSON is a bare array |
| `validate [name] [--strict] [--json] [--no-interactive]` | Same checks as `openspec validate <change>`. JSON is the bare report |

Use `openspec list`, `openspec show`, and `openspec validate --changes` instead.

### `spec` (deprecated)

```text
openspec spec <show|list|validate> [...]
```

The same deprecated forms for specs, with the same current-directory-only behavior.

| Subcommand | Effect |
| --- | --- |
| `show [id] [--json] [--requirements] [--no-scenarios] [-r <n>] [--no-interactive]` | Same output as `openspec show <spec>`, without the `root` field |
| `list [--json] [--long]` | Spec ids. `--long` adds the title and requirement count |
| `validate [id] [--strict] [--json] [--no-interactive]` | Same checks as `openspec validate <spec>` |

Use `openspec list --specs`, `openspec show`, and `openspec validate --specs` instead.

### `feedback` (removed)

Upstream's `openspec feedback <message> [--body <text>]` filed an issue on the upstream GitHub repo through the `gh` CLI. This fork removed it; see [Changes to `feedback`](#changes-to-feedback).

## Local programs the CLI starts

The fork's audit allows only these process launches, all of them local. See [`fork/NETWORK-AUDIT.md`](fork/NETWORK-AUDIT.md) for the enforced boundary.

| Command | Program | Purpose |
| --- | --- | --- |
| `init`, interactive runs | `defaults` (macOS) or `gsettings` (GNOME) | Read the reduced-motion setting |
| `completion` and the first-run tip | `ps` | Detect the current shell |
| `config edit` | `$EDITOR` or `$VISUAL` | Edit `config.json` |
| `workset open`, and `workset create` when you choose to open right away | The configured tool, such as `code` or `cursor` | Open the workset |
| `store setup` | `git rev-parse`, `git var`, `git init`, `git add`, `git commit`, `git rm --cached` (rollback only), `git remote get-url` | Create and commit a store |
| `store register` | `git remote get-url origin`, and `git rev-parse` when the root is unhealthy | Record the checkout's origin, or explain an empty clone |
| `store doctor` | `git rev-parse`, `git status`, `git remote`, `git remote get-url`, `git ls-files` | Report local Git state |
| `doctor`, store-backed roots | `git remote get-url origin`, `git rev-list` | Compare the origin and drift against local refs |

Suggested commands the CLI prints, such as `git clone ...` or `git checkout ...`, are text only.

## Environment variables

| Variable | Effect |
| --- | --- |
| `NO_COLOR` | Disable color. `--no-color` sets it |
| `OPENSPEC_NO_ANIMATION` | Static `init` welcome screen |
| `OPENSPEC_NO_COMPLETIONS=1` | Never show the completions tip |
| `OPENSPEC_NO_AUTO_CONFIG=1` | `completion install` leaves `.zshrc` and `.bashrc` alone |
| `OPENSPEC_CONCURRENCY` | Default `validate` concurrency (6 when unset) |
| `OPENSPEC_ENABLE_CLI_AGENT_OPENERS=1` | Allow `claude` and `codex` as workset tools |
| `OPEN_SPEC_INTERACTIVE=0` | Disable prompts (note the spelling) |
| `CI` | Any value disables prompts. Any value other than empty, `false`, `0`, `no`, or `off` also hides the completions tip |
| `EDITOR`, `VISUAL` | Editor for `config edit`. `EDITOR` wins when both are set |
| `XDG_CONFIG_HOME`, `XDG_DATA_HOME` | Config and data locations (`APPDATA` and `LOCALAPPDATA` on Windows) |
| `CODEX_HOME` | Where legacy Codex prompts are cleaned up (default `~/.codex`) |
| `SHELL`, `ZSH`, `ZSH_CUSTOM`, `PROFILE` | Shell detection and completion install paths |

No longer read in this fork: `OPENSPEC_TELEMETRY`, `DO_NOT_TRACK`, `OPENSPEC_NO_UPDATE_CHECK`, `npm_config_registry`.

## Upstream quirks

These come from upstream and are unchanged here:

- `view` is described as interactive but prints a static summary.
- `show --deltas-only` changes nothing, and `--requirements` behaves the same as `--no-scenarios`.
- `change validate --json` exits 0 even when the change is invalid; `validate <change> --json` exits 1.
- `spec list --json` prints plain `No items found` when `openspec/specs/` is missing.
- `templates --json` and the `schema` subcommands don't use the single-JSON `status` failure shape: `templates` prints a text error, and `schema` prints `{error, ...}` objects.
- `archive` accepts a change with no deltas and no `skip_specs` marker, which `validate` rejects.
- `schema init` suggests `openspec new --schema <name>`. The working form is `openspec new change <change> --schema <name>`.
- `openspec experimental --no-interactive` has no effect.
