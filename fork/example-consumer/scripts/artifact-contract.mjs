/**
 * Copy of ../../artifact-contract.mjs for standalone consumer repos.
 * Keep identical to the fork canonical file when vendoring from this repository.
 */

export const REQUIRED_EXPORTS = {
	'./cli': ['runCli'],
	'./cli-kit': ['Command', 'chalk', 'crossSpawn', 'loadPrompts'],
};

export const CLI_KIT_LIBRARIES = [
	'commander',
	'chalk',
	'@inquirer/prompts',
	'cross-spawn',
];
