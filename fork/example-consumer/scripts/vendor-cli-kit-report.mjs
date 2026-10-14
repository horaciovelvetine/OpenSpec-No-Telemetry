import { CLI_KIT_LIBRARIES } from './artifact-contract.mjs';

/** @param {string | undefined} version */
function majorOf(version) {
	if (!version) return undefined;
	const [major] = String(version).split('.');
	const parsed = Number.parseInt(major, 10);
	return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * @param {Record<string, string> | null | undefined} previous
 * @param {Record<string, string> | null | undefined} next
 */
export function reportCliKitLibraryChanges(previous, next) {
	if (!next) return;
	for (const name of CLI_KIT_LIBRARIES) {
		const oldVersion = previous?.[name];
		const newVersion = next[name];
		if (!newVersion) {
			throw new Error(`BUILD-INFO.json is missing cliKitLibraries.${name}`);
		}
		if (oldVersion && oldVersion !== newVersion) {
			console.log(`  ${name}: ${oldVersion} → ${newVersion}`);
			const oldMajor = majorOf(oldVersion);
			const newMajor = majorOf(newVersion);
			if (
				oldMajor !== undefined &&
				newMajor !== undefined &&
				oldMajor !== newMajor
			) {
				console.warn(
					`Warning: major version change for ${name} (${oldVersion} → ${newVersion}). Review consumer code before committing.`,
				);
			}
		} else if (!oldVersion) {
			console.log(`  ${name}: ${newVersion}`);
		}
	}
}
