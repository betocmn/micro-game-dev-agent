/**
 * Compile step — deterministic, no LLM involved.
 *
 * Takes the mechanic code from Agent B and stitches it into the
 * fixed engine shell. This is a simple string replacement.
 *
 * Why separate this from the LLM? Because not every improvement
 * needs to come from the model. If the engine shell needs a bug fix
 * or a new feature (like touch controls), we change it here once
 * and every future generation benefits.
 */

import { ENGINE_SHELL } from "./engineShell";

export function compileGame(mechanicCode: string): string {
  return ENGINE_SHELL.replace("__MECHANIC_CODE__", mechanicCode);
}
