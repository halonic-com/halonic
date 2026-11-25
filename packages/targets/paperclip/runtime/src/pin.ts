import type { SnapshotPin } from "./pinned-snapshot.ts";

/**
 * The plugin settings that pin a workspace snapshot. The board (or another
 * user's Paperclip admin) sets them; they are never read from the workspace,
 * so a workspace can't pin itself. With no pin, the plugin serves the
 * snapshot built into it.
 */

/** Where CI keeps built snapshots when the settings name no ref. */
export const defaultSnapshotRef = "halonic-snapshots";

/** The workspace check that must be green when the settings name none. */
export const defaultWorkspaceCheck = "ci-ok";

const repoPattern = /^[\w.-]+\/[\w.-]+$/;

/**
 * Whether a text names a repository as owner/name. A `.` or `..` part is
 * refused: it would walk the API path elsewhere on api.github.com.
 */
export function isRepoName(text: unknown): text is string {
  return (
    typeof text === "string" &&
    repoPattern.test(text) &&
    !text.split("/").some((part) => /^\.+$/.test(part))
  );
}

/** A full commit id, SHA-1 or SHA-256, as the snapshot names it. */
const commitPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const sha256Pattern = /^[0-9a-f]{64}$/;
const refPattern = /^[\w./-]{1,100}$/;

/**
 * The pin settings' schema, for the manifest the builder writes. The GitHub
 * read token is the separate `githubToken` setting (see register.ts).
 */
export const workspacePinProperties = {
  workspaceRepo: {
    type: "string",
    title: "Workspace repository",
    description:
      "The workspace repository whose snapshots the plugin may load, as owner/name. Empty: the plugin serves only the snapshot built into it.",
    pattern: repoPattern.source,
  },
  snapshotCommit: {
    type: "string",
    title: "Pinned workspace commit",
    description:
      "The full commit whose snapshot the plugin loads. It loads it only if the workspace check on it is green and the file's SHA-256 matches. Empty: the built-in snapshot.",
    pattern: commitPattern.source,
  },
  snapshotSha256: {
    type: "string",
    title: "Pinned snapshot SHA-256",
    description:
      "The SHA-256 of snapshot.json in the plugin file built from the pinned commit: snapshotSha256 in that build's release file.",
    pattern: sha256Pattern.source,
  },
  snapshotRef: {
    type: "string",
    title: "Snapshot branch",
    description: `The branch or tag where the workspace's CI keeps built snapshots. Empty: ${defaultSnapshotRef}.`,
  },
  workspaceCheck: {
    type: "string",
    title: "Workspace check",
    description: `The check that must be green on the pinned commit. Empty: ${defaultWorkspaceCheck}.`,
  },
} as const;

function text(config: Readonly<Record<string, unknown>>, field: string): string {
  const value = config[field];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The pin from the settings: undefined when none is set, an error text when
 * it is set but incomplete or malformed. A half-set pin is an error, so a
 * typo never quietly serves another version.
 */
export function readPin(
  config: Readonly<Record<string, unknown>>,
): SnapshotPin | string | undefined {
  const repo = text(config, "workspaceRepo");
  const commit = text(config, "snapshotCommit").toLowerCase();
  const sha256 = text(config, "snapshotSha256").toLowerCase();
  const ref = text(config, "snapshotRef") || defaultSnapshotRef;
  const check = text(config, "workspaceCheck") || defaultWorkspaceCheck;
  if (repo === "" && commit === "" && sha256 === "") {
    return undefined;
  }
  if (!isRepoName(repo)) {
    return "the workspace repository must be owner/name.";
  }
  if (!commitPattern.test(commit)) {
    return "the pinned commit must be a full commit id in lowercase hex.";
  }
  if (!sha256Pattern.test(sha256)) {
    return "the pinned sha-256 must be 64 hex characters.";
  }
  if (!refPattern.test(ref) || ref.includes("..")) {
    return "the snapshot branch isn't a valid branch or tag name.";
  }
  return { repo, commit, sha256, ref, check };
}
