/**
 * Core types for the Roblox harness pipeline.
 */

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

export interface MaterializeRunResponse {
	spec: RobloxGameSpec;
	artifactBundle: ArtifactBundle;
	agentRun: AgentRunSummary;
	events: AgentEventSummary[];
	resumeSessionId?: string | null;
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
	resumeSessionId?: string | null;
}

export interface EvaluateRunResponse {
	artifactBundle: ArtifactBundle;
	evalSuite: RobloxEvalSuiteResult;
	agentRun?: AgentRunSummary | null;
	events: AgentEventSummary[];
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
