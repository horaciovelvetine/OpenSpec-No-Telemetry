/**
 * Minimal CLI parser on util.parseArgs (Node 20.19+). Replaces commander for the
 * example consumer so it needs no registry dependencies.
 */

const HELP = Symbol('help');
const VERSION = Symbol('version');

function takeFlag(argv, name, aliases = []) {
	const keys = new Set([name, ...aliases]);
	const out = [];
	let value = undefined;
	let saw = false;
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (keys.has(arg)) {
			saw = true;
			if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
				value = argv[++i];
			} else {
				value = true;
			}
			continue;
		}
		if (arg.startsWith(`${name}=`)) {
			saw = true;
			value = arg.slice(name.length + 1);
			continue;
		}
		for (const alias of aliases) {
			if (arg.startsWith(`${alias}=`)) {
				saw = true;
				value = arg.slice(alias.length + 1);
				break;
			}
		}
		if (!saw) out.push(arg);
	}
	return { rest: out, value: saw ? value : undefined };
}

/**
 * @param {string[]} argv process.argv slice(2)
 * @param {{
 *   name: string,
 *   version: string,
 *   description: string,
 *   commands: Record<string, {
 *     description: string,
 *     argument?: { name: string, default?: string },
 *     options?: { name: string, flags: string[], description: string }[],
 *     action: (ctx: { target?: string, options: Record<string, unknown> }) => Promise<void> | void,
 *   }>,
 *   defaultCommand?: string,
 * }} spec
 */
export async function runCli(argv, spec) {
	let rest = [...argv];
	if (rest.length === 0 && spec.defaultCommand) {
		rest = [spec.defaultCommand];
	}

	if (rest.includes('--help') || rest.includes('-h')) {
		printHelp(spec);
		return;
	}
	if (rest.includes('--version') || rest.includes('-V')) {
		console.log(spec.version);
		return;
	}

	let commandName = rest[0];
	if (commandName && spec.commands[commandName] && !commandName.startsWith('-')) {
		rest.shift();
	} else if (spec.defaultCommand) {
		commandName = spec.defaultCommand;
	}
	if (!commandName || !spec.commands[commandName]) {
		throw new Error(
			commandName ?
				`Unknown command "${commandName}". Run with --help.`
			:	'Give a command. Run with --help.',
		);
	}

	const command = spec.commands[commandName];
	let target = command.argument?.default ?? '.';
	const options = {};

	if (command.options) {
		for (const opt of command.options) {
			const { rest: next, value } = takeFlag(rest, opt.name, opt.flags);
			rest = next;
			if (value !== undefined) options[opt.name] = value;
		}
	}

	const yesFlag = takeFlag(rest, '--yes', ['-y']);
	rest = yesFlag.rest;
	if (yesFlag.value !== undefined) options.yes = true;

	const forceFlag = takeFlag(rest, '--force');
	rest = forceFlag.rest;
	if (forceFlag.value !== undefined) options.force = true;

	const fromFlag = takeFlag(rest, '--from');
	rest = fromFlag.rest;
	if (fromFlag.value !== undefined && typeof fromFlag.value === 'string') {
		options.from = fromFlag.value;
	}

	const ideFlag = takeFlag(rest, '--ide');
	rest = ideFlag.rest;
	if (ideFlag.value !== undefined && typeof ideFlag.value === 'string') {
		options.ide = ideFlag.value;
	}

	if (rest.length > 0 && !rest[0].startsWith('-')) {
		target = rest.shift();
	}
	if (rest.some(arg => arg.startsWith('-'))) {
		throw new Error(`Unknown option for ${commandName}: ${rest.join(' ')}`);
	}

	await command.action({ target, options });
}

function printHelp(spec) {
	console.log(`${spec.name} — ${spec.description}\n`);
	console.log(`Usage: ${spec.name} [command] [options]\n`);
	console.log('Commands:');
	for (const [name, cmd] of Object.entries(spec.commands)) {
		const arg = cmd.argument ? ` [${cmd.argument.name}]` : '';
		console.log(`  ${name}${arg}  ${cmd.description}`);
	}
	console.log('\nOptions:');
	console.log('  -h, --help     Show help');
	console.log('  -V, --version  Show version');
}
