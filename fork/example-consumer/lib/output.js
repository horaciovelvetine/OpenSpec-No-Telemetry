import { styleText } from 'node:util';

function styled(kind, text) {
	if (process.env.NO_COLOR || !process.stderr.isTTY) return text;
	try {
		return styleText(kind, text);
	} catch {
		return text;
	}
}

export const bold = text => styled('bold', text);
export const green = text => styled('green', text);
export const red = text => styled('red', text);
export const yellow = text => styled('yellow', text);
export const cyan = text => styled('cyan', text);

export function fail(error) {
	console.error(
		red(`✖ ${error instanceof Error ? error.message : String(error)}`),
	);
	process.exit(1);
}

export function warn(message) {
	console.warn(yellow(`! ${message}`));
}
