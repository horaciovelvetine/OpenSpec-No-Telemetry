/**
 * Shared consumer contract for BUILD-INFO.json and offline verification.
 * Keep in sync with fork/example-consumer/scripts/vendor-openspec.mjs expectations.
 */

export const REQUIRED_EXPORTS = {
	'./cli': ['runCli'],
	'./cli-kit': ['Command', 'chalk', 'crossSpawn', 'loadPrompts'],
};

/** Bundled libraries consumers build on; versions are recorded at pack time. */
export const CLI_KIT_LIBRARIES = [
	'commander',
	'chalk',
	'@inquirer/prompts',
	'cross-spawn',
];
