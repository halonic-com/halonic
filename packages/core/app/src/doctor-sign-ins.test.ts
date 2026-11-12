import type { HarnessDetection, HarnessSignIn } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { DetectedHarness } from "./doctor-checks.ts";
import { type DoctorHarness, signedOutAgents } from "./doctor-sign-ins.ts";

const signIn: HarnessSignIn = { program: "codex", args: ["login"], folderVariable: "CODEX_HOME" };
const writerFolder = "/data/harness-settings/writer/codex";
const reviewerFolder = "/data/harness-settings/reviewer/codex";

/** Codex as installed, signed in only in the folders given; `asked` records each folder it was asked about. */
function codex(signedIn: readonly string[], plain: HarnessDetection) {
  const asked: (string | undefined)[] = [];
  const harness: DoctorHarness = {
    id: "codex",
    name: "Codex",
    signIn,
    detect: async (options) => {
      asked.push(options?.settingsFolder);
      if (options?.settingsFolder === undefined) return plain;
      return signedIn.includes(options.settingsFolder)
        ? { status: "ready", version: "0.9.2" }
        : { status: "signed-out", version: "0.9.2" };
    },
  };
  const detected: DetectedHarness[] = [{ id: "codex", name: "Codex", detection: plain }];
  return { harness, detected, asked };
}

const agents = [
  { agent: "Writer", harness: "codex", settingsFolder: writerFolder },
  { agent: "Reviewer", harness: "codex", settingsFolder: reviewerFolder },
];

verifies("app.doctor-agent-sign-in", () => {
  it("names each agent that isn't signed in in its own folder, with the sign-in for that folder", async () => {
    const { harness, detected } = codex([reviewerFolder], { status: "ready", version: "0.9.2" });

    expect(await signedOutAgents([harness], detected, agents)).toEqual([
      { agent: "Writer", harness: "codex", name: "Codex", signIn, settingsFolder: writerFolder },
    ]);
  });

  it("asks about the agent's folder even when the person isn't signed in in their own", async () => {
    const plain: HarnessDetection = { status: "signed-out", version: "0.9.2" };
    const { harness, detected } = codex([writerFolder, reviewerFolder], plain);

    expect(await signedOutAgents([harness], detected, agents)).toEqual([]);
  });

  it.each<HarnessDetection>([
    { status: "missing" },
    { status: "unsupported", version: "0.1.0", supported: ">=0.9.0" },
    { status: "failed", error: "It stopped." },
  ])("doesn't ask a harness that can't run ($status)", async (plain) => {
    const { harness, detected, asked } = codex([], plain);

    expect(await signedOutAgents([harness], detected, agents)).toEqual([]);
    expect(asked).toEqual([]);
  });

  it("doesn't ask a harness without a sign-in of its own", async () => {
    const { harness, detected, asked } = codex([], { status: "ready", version: "0.9.2" });
    const { signIn: _none, ...withoutSignIn } = harness;

    expect(await signedOutAgents([withoutSignIn], detected, agents)).toEqual([]);
    expect(asked).toEqual([]);
  });
});
