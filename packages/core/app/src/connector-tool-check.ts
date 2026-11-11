// One connector's listed tools checked against what a person approved,
// outside a run: what `halonic tools` (HAL-2827) reviews, approves and
// revokes. Studio's review screen (HAL-2213) can use the same steps.

import type { Connector } from "@halonicjs/format";
import {
  type Clock,
  type ConnectorTool,
  type Digest,
  isUnreadableToolApprovalError,
  type ToolApprovalKey,
  type ToolApprovalStore,
  type ToolServer,
  type TrustGrant,
} from "@halonicjs/ports";
import { err, ok, type Result } from "@halonicjs/std";
import { approveListedTools, type ListedToolApprovalCheck } from "./approve-listed-tools.ts";
import { httpToolServer, stdioToolServer } from "./listed-tool-fingerprint.ts";
import { readToolListing } from "./tool-listing.ts";

/** What {@link checkConnectorTools} reads. */
export interface ConnectorToolCheckInput {
  /** The workspace's resolved real path, as in a `TrustRecord`. */
  readonly location: string;
  /** The connector, as the workspace loaded it. */
  readonly connector: Connector;
  /** What the connector's `listTools` returned, unchecked. */
  readonly listed: readonly ConnectorTool[];
  /** The grant the connector was started with. */
  readonly trust: TrustGrant;
  readonly store: ToolApprovalStore;
  readonly digest: Digest;
  readonly clock: Clock;
}

/**
 * Reads a connector's listing and checks it against its approvals, as a run
 * would. Outside a run there are no other tools to clash with, so a name
 * only another source uses isn't refused here.
 *
 * @returns the check, or why the connector has no server address its tools
 *   could be approved at, such as an `http` URL with user info in it
 *
 * @example
 * const check = await checkConnectorTools({ location, connector, listed, trust, store, digest, clock });
 * if (check.ok) review(reviewListedTools(check.value));
 */
export async function checkConnectorTools(
  input: ConnectorToolCheckInput,
): Promise<Result<ListedToolApprovalCheck, string>> {
  const server = await connectorToolServer(input.connector, input.digest);
  if (!server.ok) {
    return server;
  }
  const listing = readToolListing({
    source: input.connector.id,
    listed: input.listed,
    declared: [],
    otherNames: new Set(),
    trust: input.trust,
  });
  return ok(
    await approveListedTools({
      location: input.location,
      source: input.connector.id,
      server: server.value,
      listing,
      store: input.store,
      digest: input.digest,
      clock: input.clock,
    }),
  );
}

/** The address a connector's tools are approved at, or why it has none. */
async function connectorToolServer(
  connector: Connector,
  digest: Digest,
): Promise<Result<ToolServer, string>> {
  const { transport } = connector;
  if ("http" in transport) {
    return await httpToolServer(transport.http.url, transport.http.headers ?? {}, digest);
  }
  if ("stdio" in transport) {
    const { command, args, env, cwd, secretEnv } = transport.stdio;
    return ok(
      await stdioToolServer(
        {
          command,
          args,
          env: env ?? {},
          ...(cwd === undefined ? {} : { cwd }),
          ...(secretEnv === undefined ? {} : { secretEnv }),
        },
        digest,
      ),
    );
  }
  return err("its tools are built into Halonic, so it lists none to approve");
}

/** What {@link revokeNamedTool} did. */
export type NamedToolRevoke = "revoked" | "not_approved";

/**
 * Removes the approval of one listed tool, as `halonic tools revoke <source>
 * <tool>` does, so the tool is off until a person approves it again. An
 * approval that can't be read is removed too: that is how a person gets
 * past it.
 *
 * @returns `not_approved`, with nothing changed, when the tool has no approval
 *
 * @example
 * await revokeNamedTool(store, { location: "/work/acme", source: "notes-mcp", name: "lookup" });
 * // => "revoked"
 */
export async function revokeNamedTool(
  store: ToolApprovalStore,
  key: ToolApprovalKey,
): Promise<NamedToolRevoke> {
  const approved = await store.get(key).then(
    (approval) => approval !== null,
    (error: unknown) => {
      if (isUnreadableToolApprovalError(error)) {
        return true;
      }
      throw error;
    },
  );
  if (!approved) {
    return "not_approved";
  }
  await store.revoke(key);
  return "revoked";
}
