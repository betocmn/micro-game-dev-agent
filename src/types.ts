/**
 * Core types for the "3 Words to Game" pipeline.
 *
 * GameSpec is the structured output from Agent A (Intent Expander).
 * The mechanic builder (Agent B) consumes it and produces JS code
 * that plugs into the fixed engine shell.
 */

export interface GameEntity {
	name: string;
	role: "player" | "enemy" | "pickup" | "hazard";
}

export type RobloxExperienceType =
	| "hangout"
	| "social-sim"
	| "obby"
	| "minigame"
	| "tycoon-lite";

export interface RobloxWorldObject {
	name: string;
	purpose: string;
	placement: string;
}

export interface RobloxGameSpec {
	title: string;
	experienceType: RobloxExperienceType;
	fantasy: string;
	coreLoop: string;
	socialLoop: string;
	progressionHook: string;
	serverAuthoritativeRules: string[];
	clientFeedback: string[];
	worldObjects: RobloxWorldObject[];
	acceptanceTests: string[];
}

export interface ArtifactFile {
	path: string;
	content: string;
	editable: boolean;
	language: "json" | "luau" | "markdown";
}

export interface ArtifactBundle {
	artifactType: "roblox-rojo";
	scaffoldVersion: string;
	files: ArtifactFile[];
}

export interface AgentRunSummary {
	sessionId: string;
	model: string;
	numTurns: number;
	totalCostUsd: number;
	stopReason: string | null;
	permissionDenials: string[];
}

export interface AgentEventSummary {
	type: string;
	summary: string;
	payload?: string;
}

export interface ArtifactEvalResult {
	pass: boolean;
	requiredFilesPresent: boolean;
	schemaValid: boolean;
	scaffoldChecksumMatch: boolean;
	editableBoundaryRespected: boolean;
	missingFiles: string[];
	notes: string[];
}

export interface RobloxEvalResult {
	pass: boolean;
	serverClientSplit: boolean;
	bannedApis: string[];
	contractExportsPresent: boolean;
	remoteSignals: string[];
	socialSignals: string[];
	notes: string[];
}

export interface RobloxJudgeEvalResult {
	robloxFit: number;
	promptFidelity: number;
	socialLoopQuality: number;
	clarity: number;
	summary: string;
	criticalMisses: string[];
}

export interface RobloxEvalSuiteResult {
	artifact: ArtifactEvalResult;
	roblox: RobloxEvalResult;
	judge: RobloxJudgeEvalResult;
	summaryScore: number;
}

export interface GenerateRunRequest {
	generationId: string;
	prompt: string;
	referenceImageUrl?: string | null;
}

export interface GenerateRunResponse {
	spec: RobloxGameSpec;
	artifactBundle: ArtifactBundle;
	agentRun: AgentRunSummary;
	evalSuite: RobloxEvalSuiteResult;
	events: AgentEventSummary[];
}

export interface EvaluateRunRequest {
	generationId: string;
	prompt: string;
	spec: RobloxGameSpec;
	artifactBundle: ArtifactBundle;
}

export interface EvaluateRunResponse {
	evalSuite: RobloxEvalSuiteResult;
}

export interface GameSpec {
	title: string;
	genre: "dodge" | "collect" | "survive" | "platform";
	theme: string;
	playerGoal: string;
	controls: string[];
	entities: GameEntity[];
	coreLoop: string;
	winCondition: string;
	loseCondition: string;
	scoreRule: string;
	visualStyle: string;
	acceptanceTests: string[];
}

export type GenerationStatus =
	| "queued"
	| "expanding"
	| "building"
	| "evaluating"
	| "done"
	| "failed";

export type GenerationFailureStage =
	| "setup"
	| "expanding"
	| "building"
	| "evaluating";

export interface RuntimeEvalResult {
	pass: boolean;
	errors: string[];
	readySeen: boolean;
	snapshot: Record<string, unknown> | null;
}

export interface InteractionEvalResult {
	pass: boolean;
	durationMs: number;
	framesObserved: number;
	stateChanged: boolean;
	scoreChanged: boolean;
	crashed: boolean;
}

export interface JudgeEvalResult {
	genreMatch: number; // 1-5
	mechanicMatch: number;
	goalMatch: number;
	controlsMatch: number;
	coherence: number;
	summary: string;
	criticalMisses: string[];
}

export interface EvalSuiteResult {
	runtime: RuntimeEvalResult;
	interaction: InteractionEvalResult;
	judge: JudgeEvalResult;
	summaryScore: number; // 0-100
}

export interface PipelineResult {
	spec: GameSpec;
	mechanicCode: string;
	html: string;
}
