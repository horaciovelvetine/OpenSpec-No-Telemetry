/**
 * IDEs this example can set up, mapped to OpenSpec tool ids (`openspec init --help`
 * lists them). Add an entry when your product supports another IDE.
 */
export const IDES = [
	{
		value: 'kiro',
		name: 'Kiro',
		openspecTool: 'kiro',
		restartHint: 'Restart Kiro so it loads the new skills and prompts.',
	},
];

export function resolveIdes(ids) {
	return ids.map(id => {
		const ide = IDES.find(
			candidate => candidate.value === id.trim().toLowerCase(),
		);
		if (!ide) {
			throw new Error(
				`Unknown IDE "${id}". Supported: ${IDES.map(candidate => candidate.value).join(', ')}`,
			);
		}
		return ide;
	});
}
