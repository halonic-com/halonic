// Where this computer's local integrations keep their request logs
// (HAL-18391 plan, section 2.2): `integration-logs/<workspace key>/<id>.jsonl`
// in the profile, never in the workspace. The store keeps each file's waiting
// lines and running write, so this process has one store per profile, which
// every engine and every load of an integration shares (Julian, HAL-19169):
// two stores on one profile would write the same file at once.

import { realpath } from "node:fs/promises";
import { requestLogFilesIn } from "@halonicjs/adapter-fs-node";
import type { LocalRequestLog } from "@halonicjs/adapter-integration-runner";
import { RequestLogStore } from "@halonicjs/app";
import { type ProfileFolder, workspaceFolders } from "@halonicjs/profile";
import { webCryptoDigest } from "./workspace-runs.ts";

/** This process's store for each profile, by the profile's root. */
const stores = new Map<string, RequestLogStore>();

/** The request log store of `profile`: the same one at every call in this process. */
export function profileRequestLogs(profile: ProfileFolder): RequestLogStore {
  let store = stores.get(profile.root);
  if (store === undefined) {
    store = new RequestLogStore(requestLogFilesIn(profile.root));
    stores.set(profile.root, store);
  }
  return store;
}

/**
 * Where the local integrations of the workspace in `workspaceRoot` keep their
 * request logs: the profile's store, under the key `workspaceFolders` names
 * after the workspace's real path, as Studio's agent host reads it.
 *
 * @param workspaceRoot - the workspace folder, as the command opened it; never a copy of a commit
 */
export async function workspaceRequestLog(
  profile: ProfileFolder,
  workspaceRoot: string,
): Promise<LocalRequestLog> {
  const { key } = await workspaceFolders(profile, await realpath(workspaceRoot), webCryptoDigest);
  return { store: profileRequestLogs(profile), workspace: key };
}
