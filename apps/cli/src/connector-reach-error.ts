// Why a connector couldn't be reached, as a line the CLI can show
// (HAL-13714): nothing answering at an `http` connector's address, or a
// server that stopped before it listed its tools, is the user's to fix, not
// "a problem Halonic can't explain yet". A missing program or secret is
// `connectorStartError`'s (HAL-13670).

import { McpStoppedError } from "@halonicjs/adapter-mcp";
import type { Connector } from "@halonicjs/format";
import { OwnLineError } from "./command.ts";
import { connectorStartMessages } from "./messages/connector-start.ts";
import { printable } from "./output/printable.ts";

/** Node's codes for a server that can't be reached: refused, reset, no route, no such host or timed out. */
const unreachableCodes = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
]);

/** How deep the network code is looked for in an error's `cause` chain. */
const maxCauses = 10;

/**
 * The line and the fix for `error`, read from its type and Node's network
 * code, never the error's own text. Both are `unavailable` (exit 9): they
 * can work once the server runs. `--json` gets the cause as `reason`.
 *
 * - nothing answered at an `http` connector's address is `nothing-answered`,
 *   with the address;
 * - a server that stopped, or didn't answer in time, before it listed its
 *   tools is `stopped`, Studio's reason (`connectorFailureReasonOf`).
 *
 * @param file - the connector's path in the workspace, made safe to print,
 *   or `undefined` when it has none
 * @returns the error to throw instead, or `undefined` for any other failure
 */
export function connectorReachError(
  error: unknown,
  connector: Connector,
  file: string | undefined,
): OwnLineError | undefined {
  const id = printable(connector.id);
  if ("http" in connector.transport && hasUnreachableCode(error)) {
    const address = addressOf(connector.transport.http.url);
    return new OwnLineError(
      "unavailable",
      connectorStartMessages.nothingAnswered(printable(address)),
      connectorStartMessages.nothingAnsweredFix(id, file),
      { reason: "nothing-answered", address },
    );
  }
  if (error instanceof McpStoppedError) {
    return new OwnLineError(
      "unavailable",
      connectorStartMessages.stopped(id),
      connectorStartMessages.stoppedFix(),
      { reason: "stopped" },
    );
  }
  return undefined;
}

/** `url` without a user name, password, query or fragment, which can hold a token. */
function addressOf(url: string): string {
  const { origin, pathname } = new URL(url);
  return `${origin}${pathname}`;
}

/** Whether `error`, or an error in its `cause` chain, has one of Node's {@link unreachableCodes}. */
function hasUnreachableCode(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < maxCauses && current instanceof Error; depth++) {
    const { code } = current as { code?: unknown };
    if (typeof code === "string" && unreachableCodes.has(code)) return true;
    current = current.cause;
  }
  return false;
}
