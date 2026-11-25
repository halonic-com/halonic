// The hosts the Studio's assistant added to a workspace's local integrations
// that the person didn't name (HAL-525), as the trust check marks them. They
// are read from the workspace's review folder in the profile, never from the
// workspace, so a workspace file can't set or hide a mark.

import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { type AssistantAddedHosts, AssistantHosts } from "@halonicjs/app";
import { profileFolder, workspaceFolders } from "@halonicjs/profile";
import { nodeProfileEnvironment, webCryptoDigest } from "./workspace-runs.ts";

/**
 * The assistant-added hosts of the workspace at `location`, from the profile
 * (`HALONIC_HOME`, or the system's data folder). Reads only; none when the
 * record isn't there or can't be read.
 *
 * @param location - the workspace folder's real path, as its trust subject has it
 */
export async function profileAssistantAdded(location: string): Promise<AssistantAddedHosts> {
  try {
    const profile = profileFolder(nodeProfileEnvironment());
    const folders = await workspaceFolders(profile, location, webCryptoDigest);
    return await new AssistantHosts(new FolderDefinitionStore(folders.reviewFolder())).read();
  } catch {
    return new Map();
  }
}
