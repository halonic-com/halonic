import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { FakeHost, ok, refused } from "./fake-host.test-helper.ts";
import { AgentHostInstructions, type InstructionsAgent } from "./run-instructions.ts";
import { AgentHostError } from "./transport.ts";

const workspace = "/work/acme";
const a = `sha256:${"a".repeat(64)}`;
const b = `sha256:${"b".repeat(64)}`;
const all = `sha256:${"c".repeat(64)}`;

const agent = (file: Partial<InstructionsAgent["file"]> = {}): InstructionsAgent => ({
  hubId: "support",
  file: { instructions: "Be brief.\n", skills: ["review"], ...file },
});

function instructionsOf(host: FakeHost): AgentHostInstructions {
  return new AgentHostInstructions(host, {
    workspace,
    skillTextOf: async (_agent, id) => `Skill ${id}.\n`,
  });
}

const opened = ok({
  folder: "/data/instructions/instructions-1",
  pin: { digest: all, files: { "AGENTS.md": a, "skills/review/SKILL.md": b } },
});

verifies("agent-host-client.run-instructions", () => {
  it("sends the agent's AGENTS.md and skills, and gives the engine's pin and the folder", async () => {
    const host = new FakeHost().answer("POST /v1/harnesses/instructions", opened);
    const open = await instructionsOf(host).open(agent());
    expect(host.calls).toEqual([
      {
        route: "POST /v1/harnesses/instructions",
        body: {
          workspace,
          files: [
            { name: "AGENTS.md", text: "Be brief.\n" },
            { name: "skills/review/SKILL.md", text: "Skill review.\n" },
          ],
        },
      },
    ]);
    expect(open?.folder).toBe("/data/instructions/instructions-1");
    expect(open?.pin).toEqual({
      files: [
        { path: "AGENTS.md", sha256: a },
        { path: "skills/review/SKILL.md", sha256: b },
      ],
      sha256: all,
    });
  });

  it("asks nothing and answers null for an agent with no instructions and no skills", async () => {
    const host = new FakeHost();
    expect(await instructionsOf(host).open(agent({ instructions: "  \n", skills: [] }))).toBeNull();
    expect(host.calls).toEqual([]);
  });

  it("releases the folder by its path, and doesn't throw when the host can't", async () => {
    const host = new FakeHost()
      .answer("POST /v1/harnesses/instructions", opened)
      .answer(
        "POST /v1/harnesses/instructions/release",
        refused(500, "internal", "The host failed."),
      );
    const open = await instructionsOf(host).open(agent());
    await expect(open?.release()).resolves.toBeUndefined();
    expect(host.calls.at(-1)).toEqual({
      route: "POST /v1/harnesses/instructions/release",
      body: { folder: "/data/instructions/instructions-1" },
    });
  });

  it("fails with the host's kind and reason when it refuses the files", async () => {
    const reason = "Instruction file 'x' is not a harness instruction.";
    const host = new FakeHost().answer(
      "POST /v1/harnesses/instructions",
      refused(422, "instructions_refused", reason),
    );
    const failure = await instructionsOf(host)
      .open(agent())
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AgentHostError);
    expect(failure).toMatchObject({ kind: "instructions_refused", message: reason });
  });

  it("fails on a pin that isn't digests", async () => {
    const host = new FakeHost().answer(
      "POST /v1/harnesses/instructions",
      ok({ folder: "/data/i", pin: { digest: "nope", files: {} } }),
    );
    await expect(instructionsOf(host).open(agent())).rejects.toThrow();
  });
});
