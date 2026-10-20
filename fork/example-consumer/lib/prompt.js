import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

/**
 * @param {string} message
 * @param {boolean} [defaultYes]
 */
export async function confirm(message, defaultYes = true) {
	const rl = createInterface({ input, output });
	try {
		const hint = defaultYes ? 'Y/n' : 'y/N';
		const answer = (
			await rl.question(`${message} (${hint}) `)
		).trim().toLowerCase();
		if (!answer) return defaultYes;
		return answer === 'y' || answer === 'yes';
	} finally {
		rl.close();
	}
}

/**
 * @param {string} message
 * @param {{ name: string, value: string, checked?: boolean }[]} choices
 */
export async function checkbox(message, choices) {
	const rl = createInterface({ input, output });
	try {
		console.log(message);
		for (let i = 0; i < choices.length; i++) {
			const mark = choices[i].checked !== false ? '[x]' : '[ ]';
			console.log(`  ${i + 1}. ${mark} ${choices[i].name}`);
		}
		const raw = (await rl.question('Enter numbers (comma-separated): ')).trim();
		if (!raw) {
			return choices
				.filter(c => c.checked !== false)
				.map(c => c.value);
		}
		const picked = new Set(
			raw
				.split(',')
				.map(part => Number.parseInt(part.trim(), 10) - 1)
				.filter(index => index >= 0 && index < choices.length),
		);
		if (picked.size === 0) {
			throw new Error('Select at least one option.');
		}
		return [...picked].map(index => choices[index].value);
	} finally {
		rl.close();
	}
}
