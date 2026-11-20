// The Secrets line of `halonic doctor`, without the words: the secrets a run
// needs that aren't set, each with what uses it (HAL-14269). It never holds
// a secret's value: the doctor service only learns whether each one is set.

import type { DoctorLine } from "./doctor-checks.ts";

/** A connector, a model provider or a webhook routine of the workspace that reads a secret. */
export interface SecretUser {
  kind: "connector" | "provider" | "routine";
  /** The connector's, provider's or routine's id, such as "files". */
  id: string;
}

/** A secret the workspace uses, by name, with everything that reads it. */
export interface UsedSecret {
  /** The secret's name, such as "files-token". Never its value. */
  secret: string;
  /** What reads it, in the order the host found them. */
  usedBy: SecretUser[];
}

/** What the store said about the secrets the workspace uses. */
export interface SecretsFound {
  /** The secrets the store doesn't hold, in the order given. */
  missing: readonly UsedSecret[];
  /** The secrets the store couldn't be asked about, such as a locked keychain, in the order given. */
  unreadable: readonly UsedSecret[];
}

/** The Secrets line: shown only while a secret the workspace uses isn't set, or couldn't be read. */
export interface SecretsLine extends DoctorLine {
  check: "secrets";
  /**
   * `failed` while a secret isn't set: a run that needs it fails, or loses
   * the connector's tools. `warning` while every secret is either set or
   * couldn't be read: `doctor` can't tell, so it doesn't fail on it.
   */
  status: "failed" | "warning";
  /** Each secret that isn't set, in the order given. */
  missing: UsedSecret[];
  /** Each secret the store couldn't be asked about, in the order given. */
  unreadable: UsedSecret[];
}

/**
 * The Secrets line of `halonic doctor` (requirement `app.doctor-secrets`): ✕
 * with each secret that isn't set, ! with each the store couldn't be asked
 * about, or no line when every one is set.
 *
 * @example
 * secretsLine({ missing: [{ secret: "files-token", usedBy: [{ kind: "connector", id: "files" }] }], unreadable: [] });
 * // { check: "secrets", status: "failed", missing: [{ secret: "files-token", usedBy: [ … ] }], unreadable: [] }
 * secretsLine({ missing: [], unreadable: [] }); // undefined
 */
export function secretsLine({ missing, unreadable }: SecretsFound): SecretsLine | undefined {
  if (missing.length === 0 && unreadable.length === 0) return undefined;
  return {
    check: "secrets",
    status: missing.length > 0 ? "failed" : "warning",
    missing: [...missing],
    unreadable: [...unreadable],
  };
}
