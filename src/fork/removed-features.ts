/** Plain-text messages for upstream features this fork removed. No imports. */

export const VERSION_CHECK_REMOVED =
	'This fork removed the npm registry version check. Use your consumer release to upgrade OpenSpec.';

export const COPILOT_CLOUD_REMOVED =
	'This fork removed GitHub Copilot hosted cloud-agent setup files. Local Copilot prompts and skills remain supported.';

export const TELEMETRY_REMOVED =
	'This fork removed telemetry. There is nothing to configure; run "openspec config unset telemetry" to remove a leftover block from upstream.';

export const TELEMETRY_ENABLED_NOOP =
	'telemetry.enabled is ignored in this fork (telemetry was removed).';
