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
	| "compiling"
	| "evaluating"
	| "done"
	| "failed";

export type GenerationFailureStage =
	| "setup"
	| "expanding"
	| "building"
	| "compiling"
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
