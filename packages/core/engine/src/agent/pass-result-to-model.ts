// Step three of three the HAL-803 rules plug into (HAL-998): a tool's
// result becomes the text the model gets. A server wrote what its tools
// return, so every result of a server's tool, and the error one threw,
// reaches the model only inside the untrusted fence
// (`ports.untrusted-tool-listings`), whatever the listing says about it.

import { fenceUntrusted } from "@halonicjs/app";
import type { TurnTool } from "./turn-tools.ts";

/**
 * The text the model gets for a tool's result, or for the error it threw.
 * Halonic's own tools fence what they read from outside themselves, as the
 * knowledge tools do, so their results go as they are.
 */
export function passResultToModel(tool: TurnTool, result: string): string {
  return tool.kind === "server" ? fenceUntrusted(result) : result;
}
