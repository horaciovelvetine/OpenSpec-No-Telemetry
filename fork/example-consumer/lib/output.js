import { chalk } from '@fission-ai/openspec/cli-kit';

export function fail(error) {
  console.error(chalk.red(`✖ ${error instanceof Error ? error.message : String(error)}`));
  process.exit(1);
}

export function warn(message) {
  console.warn(chalk.yellow(`! ${message}`));
}
