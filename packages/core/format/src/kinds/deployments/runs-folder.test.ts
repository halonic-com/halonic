// Each deployment keeps its runs in a profile folder named after its id, so
// `deployments.yaml` and `@halonicjs/profile` must agree on which ids exist.
// Both keep their own rule (the format's is also its JSON Schema), and this
// test holds the two together.
import { type ProfileFolder, workspaceFolders } from "@halonicjs/profile";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { parseFile } from "../../index.ts";
import { yaml } from "../../test/parse.spec.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest = {
  async sha256(data: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

const profile: ProfileFolder = { platform: "linux", root: "/srv/acme/.local/share/halonic" };

/** Ids at and around each edge of both rules: length, characters and device names. */
const candidateIds = [
  "a",
  "0",
  "staging",
  "a-b_c",
  "a".repeat(63),
  "a".repeat(64),
  "a".repeat(65),
  "a".repeat(128),
  "a".repeat(129),
  "",
  "-a",
  "_a",
  "Staging",
  "a.b",
  "a/b",
  "a\\b",
  "../a",
  "café",
  "con",
  "prn",
  "aux",
  "nul",
  "com0",
  "com9",
  "lpt0",
  "lpt9",
  "console",
  "auxiliary",
  "com10",
  "lpt",
  "nul-1",
];

/** Whether `deployments.yaml` accepts a deployment with this id. */
function formatAccepts(deploymentId: string): boolean {
  const text = yaml("deployments:", `  ${JSON.stringify(deploymentId)}:`, "    name: D");
  return parseFile("deployments", text, {}).ok;
}

/** Whether the profile gives a deployment with this id a runs folder. */
async function profileAccepts(deploymentId: string): Promise<boolean> {
  const folders = await workspaceFolders(profile, "/srv/acme/workspace", digest);
  try {
    folders.runsFolder(deploymentId);
    return true;
  } catch (error) {
    if (error instanceof RangeError) {
      return false;
    }
    throw error;
  }
}

verifies("format.deployments-file", () => {
  describe("the profile's runs folders", () => {
    it.each(candidateIds)("agree with the format on %j", async (deploymentId) => {
      expect(await profileAccepts(deploymentId)).toBe(formatAccepts(deploymentId));
    });

    it("are tried with ids each rule accepts and refuses", () => {
      const accepted = candidateIds.filter(formatAccepts);
      expect(accepted).toContain("a".repeat(64));
      expect(accepted).not.toContain("a".repeat(65));
      expect(accepted).not.toContain("aux");
    });
  });
});
