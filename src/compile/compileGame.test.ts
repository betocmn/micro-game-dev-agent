import { describe, expect, it } from "vitest";
import { compileGame } from "./compileGame";
import { ENGINE_SHELL } from "./engineShell";

describe("compileGame", () => {
	it("replaces __MECHANIC_CODE__ with provided code", () => {
		const mechanic = "function initMechanic(state) { state.player.x = 0; }";
		const result = compileGame(mechanic);
		expect(result).toContain(mechanic);
		expect(result).not.toContain("__MECHANIC_CODE__");
	});

	it("preserves the engine shell structure", () => {
		const result = compileGame("// test");
		expect(result).toContain("<!DOCTYPE html>");
		expect(result).toContain("window.__gameEval");
		expect(result).toContain("requestAnimationFrame(loop)");
	});

	it("produces valid HTML with canvas element", () => {
		const result = compileGame("// noop");
		expect(result).toContain('<canvas id="game" width="800" height="600">');
		expect(result).toContain("</html>");
	});
});

describe("ENGINE_SHELL", () => {
	it("contains the mechanic code placeholder", () => {
		expect(ENGINE_SHELL).toContain("__MECHANIC_CODE__");
	});

	it("has eval instrumentation", () => {
		expect(ENGINE_SHELL).toContain("window.__gameEval");
		expect(ENGINE_SHELL).toContain("snapshot()");
		expect(ENGINE_SHELL).toContain("metrics");
	});

	it("has input tracking for arrow keys", () => {
		expect(ENGINE_SHELL).toContain("keydown");
		expect(ENGINE_SHELL).toContain("keyup");
		expect(ENGINE_SHELL).toContain("input.keys");
	});

	it("has a game loop with requestAnimationFrame", () => {
		expect(ENGINE_SHELL).toContain("function loop(timestamp)");
		expect(ENGINE_SHELL).toContain("requestAnimationFrame(loop)");
	});

	it("handles init errors gracefully", () => {
		expect(ENGINE_SHELL).toContain("INIT_ERROR:");
		expect(ENGINE_SHELL).toContain("LOOP_ERROR:");
	});
});
