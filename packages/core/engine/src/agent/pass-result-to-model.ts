// Step three of three the HAL-803 rules plug into (HAL-998): a tool's
// result becomes the text the model gets. It passes through unchanged for
// now; HAL-998 calls `toolResultForModel` from `@halonicjs/app` here, which
// fences off what a server wrote.

import type { TurnTool } from "./turn-tools.ts";

/** The text the model gets for a tool's result, or for the error it threw. */
export function passResultToModel(_tool: TurnTool, result: string): string {
  return result;
}
