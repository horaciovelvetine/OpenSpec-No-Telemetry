import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_PACKAGE, OPENSPEC_PACKAGE } from './environment.js';

const TEMPLATES = fileURLToPath(
	new URL('../templates/project', import.meta.url),
);

function templateFiles(dir = TEMPLATES, out = []) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) templateFiles(full, out);
		else out.push(path.relative(TEMPLATES, full));
	}
	return out;
}

/**
 * Copies per-project template files into the project. Existing files are the
 * user's to customize, so they are kept unless `force` is set.
 */
export function writeProjectFiles(projectDir, { force = false } = {}) {
	const written = [];
	for (const relative of templateFiles()) {
		const target = path.join(projectDir, relative);
		if (fs.existsSync(target) && !force) continue;
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.copyFileSync(path.join(TEMPLATES, relative), target);
		written.push(relative);
	}
	return written;
}

/** Records setup in `.acme/project.json`, keeping any keys the user added. */
export function writeProjectConfig(projectDir, ides) {
	const file = path.join(projectDir, '.acme', 'project.json');
	const existing =
		fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : {};
	const config = {
		...existing,
		acme: TOOL_PACKAGE.version,
		openspec: OPENSPEC_PACKAGE.version,
		ides: ides ?? existing.ides ?? [],
		updatedAt: new Date().toISOString(),
	};
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
	return config;
}

export function readProjectConfig(projectDir) {
	const file = path.join(projectDir, '.acme', 'project.json');
	return fs.existsSync(file) ?
			JSON.parse(fs.readFileSync(file, 'utf-8'))
		:	null;
}
