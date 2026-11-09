import type { Digest } from "@halonicjs/ports";
import { profileFolder, workspaceFolders } from "../src/index.ts";

/** Finds where one workspace's runs, and one deployment's runs, are kept on a Linux machine. */
export async function runExample(
  digest: Digest,
): Promise<{ profile: string; runs: string; stagingRuns: string }> {
  // The adapter fills these in from the system: `process` in Node, a shell command in the Studio.
  const profile = profileFolder({
    platform: "linux",
    homeFolder: "/srv/acme",
    variables: { XDG_DATA_HOME: "/srv/acme/data" },
  });
  // Pass the workspace's real path, with every link resolved.
  const folders = await workspaceFolders(profile, "/srv/acme/workspace", digest);
  return {
    profile: profile.root, // "/srv/acme/data/halonic"
    runs: folders.runsFolder(), // ".../workspaces/<key>/runs"
    stagingRuns: folders.runsFolder("staging"), // ".../workspaces/<key>/deployments/staging/runs"
  };
}
