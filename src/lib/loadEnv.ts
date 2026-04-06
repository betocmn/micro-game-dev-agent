import { loadEnvConfig } from "@next/env";

let loaded = false;

export function ensureLocalEnvLoaded() {
	if (loaded) {
		return;
	}

	loadEnvConfig(process.cwd());
	loaded = true;
}
