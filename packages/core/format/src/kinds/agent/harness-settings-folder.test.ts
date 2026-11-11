// Each agent keeps its harness settings in a profile folder named after its
// id, so the agent file and `@halonicjs/profile` must agree on which ids
// exist. Both keep their own rule (the format's is also its JSON Schema), and
// this test holds the two together, as the deployments file's does for
// deployment ids.
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
  "clerk",
  "a-b_c",
  "a".repeat(63),
  "a".repeat(64),
  "a".repeat(65),
  "a".repeat(128),
  "",
  "-a",
  "_a",
  "Clerk",
  "a.b",
  "a/b",
  "a\\b",
  "c:",
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

/** Whether an agent file accepts this id. */
function formatAccepts(agentId: string): boolean {
  const text = yaml(`id: ${JSON.stringify(agentId)}`, "name: A");
  return parseFile("agent", text, {}).ok;
}

/** Whether the profile gives an agent with this id a harness settings folder. */
async function profileAccepts(agentId: string): Promise<boolean> {
  const folders = await workspaceFolders(profile, "/srv/acme/workspace", digest);
  try {
    folders.harnessSettingsFolder(agentId, "claude-code");
    return true;
  } catch (error) {
    if (error instanceof RangeError) {
      return false;
    }
    throw error;
  }
}

verifies("format.agent-file", () => {
  describe("the profile's harness settings folders", () => {
    it.each(candidateIds)("agree with the format on %j", async (agentId) => {
      expect(await profileAccepts(agentId)).toBe(formatAccepts(agentId));
    });

    it("are tried with ids each rule accepts and refuses", () => {
      const accepted = candidateIds.filter(formatAccepts);
      expect(accepted).toContain("a".repeat(64));
      expect(accepted).not.toContain("a".repeat(65));
      expect(accepted).not.toContain("aux");
    });
  });
});
