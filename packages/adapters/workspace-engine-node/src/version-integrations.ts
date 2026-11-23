// The local integrations of one version, for its trust check (HAL-16335): a
// run starts from the live version's commit, so trust hashes the
// integrations at that commit too, never the saved files beside them.

import { workspaceIntegrations } from "@halonicjs/adapter-doctor-node";
import { readLocalIntegrations } from "@halonicjs/app";
import type { TrustGrant } from "@halonicjs/ports";
import {
  type LocalIntegrationInput,
  VersionFolder,
  type VersionReader,
} from "@halonicjs/workspace";
import { webCryptoDigest } from "./web-crypto-digest.ts";

/** A workspace folder, as its saved local integrations are read from it. */
export interface IntegrationsFolder {
  /** The full path, for the file system. */
  readonly root: string;
  /** The path as the person typed it, for what a refusal names. */
  readonly shown: string;
}

/**
 * The local integrations at `commit`, read through the history only, so
 * an integration saved but not committed is as the commit has it.
 *
 * @param location - where the workspace lives, as its saved store says
 */
export async function integrationsAtCommit(
  vcs: VersionReader,
  commit: string,
  location: string,
): Promise<LocalIntegrationInput[]> {
  return await readLocalIntegrations(new VersionFolder(vcs, commit, location), webCryptoDigest);
}

/** The local integrations as saved in the workspace folder, read without following links. */
export async function savedIntegrations(dir: IntegrationsFolder): Promise<LocalIntegrationInput[]> {
  return await workspaceIntegrations(dir.root, dir.shown);
}

/**
 * The local integrations whose sheets a run may take declared tools from
 * (requirement `workspace.declared-tools`), or `undefined` when `grant` is
 * `null`: a workspace nobody trusted, or one that can only reach the test
 * model, has no sheet a person approved, so no tool gets a noun from one.
 * `undefined` (not an empty list) is what leaves `declaredTools` out of the
 * run's definitions.
 *
 * With a grant, they are the integrations the trust check read, from the
 * same version, so a sheet that changed since the person approved it no
 * longer matches its trust and its runner doesn't start. Only reads the
 * grant; nothing here makes one.
 *
 * @param grant - the grant of the trust check the run passed, or `null` for none
 * @param integrations - the local integrations of the version the run starts, as its trust check read them
 */
export function approvedIntegrations(
  grant: TrustGrant | null,
  integrations: readonly LocalIntegrationInput[],
): LocalIntegrationInput[] | undefined {
  return grant === null ? undefined : [...integrations];
}
