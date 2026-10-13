/**
 * Preload (`node --import`) that makes any network attempt fail loudly.
 *
 * Blocks fetch, browser-style network globals, HTTP clients, raw sockets,
 * datagrams, TLS, DNS lookups, and spawning network tools or remote git
 * commands. Every attempt is also appended to $NO_NETWORK_LOG, so an attempt
 * the CLI catches and swallows still fails verification.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire, syncBuiltinESMExports } from 'node:module';

const require = createRequire(import.meta.url);
const logFile = process.env.NO_NETWORK_LOG;

const NETWORK_TOOLS = new Set([
	'npm',
	'npx',
	'pnpm',
	'yarn',
	'bun',
	'bunx',
	'gh',
	'curl',
	'wget',
]);
const REMOTE_GIT = new Set([
	'clone',
	'fetch',
	'pull',
	'push',
	'ls-remote',
	'submodule',
]);

function blocked(what) {
	const message = `[no-network] blocked ${what} (pid ${process.pid}: ${process.argv.slice(1).join(' ')})`;
	if (logFile) fs.appendFileSync(logFile, `${message}\n`);
	throw new Error(message);
}

function deny(what) {
	return () => blocked(what);
}

globalThis.fetch = deny('fetch()');
globalThis.WebSocket = class {
	constructor() {
		blocked('WebSocket');
	}
};
globalThis.XMLHttpRequest = class {
	constructor() {
		blocked('XMLHttpRequest');
	}
};
globalThis.EventSource = class {
	constructor() {
		blocked('EventSource');
	}
};
if (!globalThis.navigator) globalThis.navigator = {};
Object.defineProperty(globalThis.navigator, 'sendBeacon', {
	configurable: true,
	value: deny('sendBeacon'),
});

for (const name of ['http', 'https', 'http2']) {
	const mod = require(name);
	if (mod.request) mod.request = deny(`${name}.request`);
	if (mod.get) mod.get = deny(`${name}.get`);
	if (mod.connect) mod.connect = deny(`${name}.connect`);
}

const net = require('net');
net.connect = deny('net.connect');
net.createConnection = deny('net.createConnection');
net.Socket.prototype.connect = deny('net.Socket.connect');

const tls = require('tls');
tls.connect = deny('tls.connect');

const dgram = require('dgram');
dgram.createSocket = deny('dgram.createSocket');

const dns = require('dns');
for (const fn of [
	'lookup',
	'lookupService',
	'resolve',
	'resolve4',
	'resolve6',
	'resolveAny',
	'resolveCaa',
	'resolveCname',
	'resolveMx',
	'resolveNaptr',
	'resolveNs',
	'resolvePtr',
	'resolveSoa',
	'resolveSrv',
	'resolveTxt',
	'reverse',
]) {
	dns[fn] = deny(`dns.${fn}`);
	if (dns.promises?.[fn]) dns.promises[fn] = deny(`dns.promises.${fn}`);
}

function commandName(file) {
	return path
		.basename(String(file))
		.replace(/\.(?:cmd|exe|bat)$/i, '')
		.toLowerCase();
}

function checkCommand(file, args) {
	const name = commandName(file);
	if (NETWORK_TOOLS.has(name)) blocked(`spawning ${name}`);
	if (
		name === 'git' &&
		Array.isArray(args) &&
		args.some(arg => REMOTE_GIT.has(String(arg)))
	) {
		blocked(`git ${args.join(' ')}`);
	}
}

const childProcess = require('child_process');
for (const fn of ['spawn', 'spawnSync', 'execFile', 'execFileSync']) {
	const original = childProcess[fn];
	childProcess[fn] = function guarded(file, args, ...rest) {
		checkCommand(file, Array.isArray(args) ? args : []);
		return original.call(this, file, args, ...rest);
	};
}
for (const fn of ['exec', 'execSync']) {
	const original = childProcess[fn];
	childProcess[fn] = function guarded(command, ...rest) {
		const [file, ...args] = String(command).trim().split(/\s+/);
		checkCommand(file, args);
		return original.call(this, command, ...rest);
	};
}

syncBuiltinESMExports();
