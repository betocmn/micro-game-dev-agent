import { createHash } from "node:crypto";
import {
	cp,
	mkdir,
	readdir,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import path from "node:path";
import { artifactBundleSchema, robloxGameSpecSchema } from "@/lib/schemas";
import type { ArtifactBundle, ArtifactFile, RobloxGameSpec } from "@/types";
import {
	ARTIFACT_TYPE,
	EDITABLE_ARTIFACT_FILES,
	HARNESS_VERSION,
	REQUIRED_ARTIFACT_FILES,
} from "./constants";

const TEMPLATE_DIR = path.join(process.cwd(), "src/worker/template");
const RUNS_DIR = path.join(process.cwd(), ".context/runs");

export interface RunWorkspace {
	runDir: string;
	workspaceDir: string;
}

export async function createRunWorkspace(
	generationId: string,
): Promise<RunWorkspace> {
	const runDir = path.join(RUNS_DIR, generationId);
	const workspaceDir = path.join(runDir, "workspace");

	await rm(runDir, { force: true, recursive: true });
	await mkdir(runDir, { recursive: true });
	await cp(TEMPLATE_DIR, workspaceDir, { recursive: true });

	return { runDir, workspaceDir };
}

export async function writeSpecToWorkspace(
	workspaceDir: string,
	spec: RobloxGameSpec,
): Promise<void> {
	const parsedSpec = robloxGameSpecSchema.parse(spec);
	const targetPath = path.join(workspaceDir, "src/shared/GameSpec.json");
	await writeFile(
		targetPath,
		`${JSON.stringify(parsedSpec, null, 2)}\n`,
		"utf8",
	);
}

async function collectFiles(
	rootDir: string,
	currentDir: string,
): Promise<ArtifactFile[]> {
	const entries = await readdir(currentDir, { withFileTypes: true });
	const files: ArtifactFile[] = [];

	for (const entry of entries) {
		const entryPath = path.join(currentDir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await collectFiles(rootDir, entryPath)));
			continue;
		}

		const relativePath = path
			.relative(rootDir, entryPath)
			.replaceAll(path.sep, "/");
		const content = await readFile(entryPath, "utf8");
		const language = relativePath.endsWith(".json")
			? "json"
			: relativePath.endsWith(".luau")
				? "luau"
				: "markdown";

		files.push({
			path: relativePath,
			content,
			editable: EDITABLE_ARTIFACT_FILES.includes(
				relativePath as (typeof EDITABLE_ARTIFACT_FILES)[number],
			),
			language,
		});
	}

	return files.sort((left, right) => left.path.localeCompare(right.path));
}

export async function loadArtifactBundle(
	workspaceDir: string,
): Promise<ArtifactBundle> {
	const files = await collectFiles(workspaceDir, workspaceDir);

	return artifactBundleSchema.parse({
		artifactType: ARTIFACT_TYPE,
		scaffoldVersion: HARNESS_VERSION,
		files,
	});
}

export function getRequiredFileSet(): Set<string> {
	return new Set(REQUIRED_ARTIFACT_FILES);
}

export function getEditableFileSet(): Set<string> {
	return new Set(EDITABLE_ARTIFACT_FILES);
}

export function getFixedScaffoldChecksum(bundle: ArtifactBundle): string {
	const hash = createHash("sha256");
	for (const file of bundle.files) {
		if (file.editable) {
			continue;
		}
		hash.update(file.path);
		hash.update("\n");
		hash.update(file.content);
		hash.update("\n");
	}
	return hash.digest("hex");
}

export async function getTemplateBundle(): Promise<ArtifactBundle> {
	return loadArtifactBundle(TEMPLATE_DIR);
}

export async function assertWorkspaceExists(
	workspaceDir: string,
): Promise<void> {
	const info = await stat(workspaceDir);
	if (!info.isDirectory()) {
		throw new Error(`Workspace not found: ${workspaceDir}`);
	}
}
