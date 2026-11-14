/**
 * The connector a Google account's setup belongs to: the workspace and the
 * connector's id in it. Both are local to this computer and neither is
 * secret or personal.
 *
 * The workspace is part of the link because a connector id alone isn't
 * unique: two workspaces in one profile can each have a connector `gmail`.
 * The link sits in the record, not in the connector file, because the
 * connector file is in git and an account ref exists on one machine only.
 */
export interface ConnectorLink {
  /** The workspace's key in the profile: 32 lower-case hex characters. */
  readonly workspace: string;
  /** The connector's id in that workspace, such as `gmail`. */
  readonly id: string;
}

/**
 * A workspace key, as the profile makes it (`@halonicjs/profile` keeps 32
 * hex characters of the path's SHA-256). Core packages share no pattern for
 * it, so the shape is repeated here.
 */
export const workspaceKeyPattern = /^[0-9a-f]{32}$/;

/**
 * A connector id: the format's folder-id rule (lower-case letters, digits,
 * `-` and `_`, at most 64 characters), so it can never hold a separator or `..`.
 */
export const connectorIdPattern = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** Whether the link follows the name rules of the store. */
export function isConnectorLink(link: ConnectorLink): boolean {
  return workspaceKeyPattern.test(link.workspace) && connectorIdPattern.test(link.id);
}
