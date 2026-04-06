import { robloxGameSpecSchema } from "@/lib/schemas";
import type { ArtifactBundle, ArtifactEvalResult } from "@/types";
import { REQUIRED_ARTIFACT_FILES } from "@/worker/constants";
import {
	getEditableFileSet,
	getFixedScaffoldChecksum,
} from "@/worker/workspace";

export async function runArtifactEval(
	artifactBundle: ArtifactBundle,
	expectedScaffoldChecksum: string,
): Promise<ArtifactEvalResult> {
	const presentFiles = new Set(artifactBundle.files.map((file) => file.path));
	const missingFiles = REQUIRED_ARTIFACT_FILES.filter(
		(filePath) => !presentFiles.has(filePath),
	);
	const editableFileSet = getEditableFileSet();
	const changedBoundary = artifactBundle.files.some(
		(file) => file.editable !== editableFileSet.has(file.path),
	);

	const notes: string[] = [];
	const specFile = artifactBundle.files.find(
		(file) => file.path === "src/shared/GameSpec.json",
	);

	let schemaValid = false;
	if (specFile) {
		try {
			robloxGameSpecSchema.parse(JSON.parse(specFile.content));
			schemaValid = true;
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Invalid spec JSON";
			notes.push(message);
		}
	}

	const scaffoldChecksumMatch =
		getFixedScaffoldChecksum(artifactBundle) === expectedScaffoldChecksum;
	const editableBoundaryRespected = !changedBoundary;

	if (missingFiles.length > 0) {
		notes.push(`Missing required files: ${missingFiles.join(", ")}`);
	}
	if (!scaffoldChecksumMatch) {
		notes.push("Fixed scaffold files differ from the template.");
	}
	if (!editableBoundaryRespected) {
		notes.push("Editable boundary changed from the expected scaffold.");
	}

	const requiredFilesPresent = missingFiles.length === 0;

	return {
		pass:
			requiredFilesPresent &&
			schemaValid &&
			scaffoldChecksumMatch &&
			editableBoundaryRespected,
		requiredFilesPresent,
		schemaValid,
		scaffoldChecksumMatch,
		editableBoundaryRespected,
		missingFiles,
		notes,
	};
}
