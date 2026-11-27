// The fake lives in @halonicjs/testing-contracts, whose code is measured in
// this package's run (its "measuredIn"), so its tests run here.
import {
  type ToolScriptArtifact,
  type ToolScriptAudience,
  type ToolScriptRunRequest,
  toolScriptDefaultLimits,
} from "@halonicjs/ports";
import {
  FakeToolScriptHost,
  sha256Hex,
  type ToolScriptFixture,
  toolScriptHostContract,
} from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

const pinned = (fixtures: readonly ToolScriptFixture[]) =>
  new Map(fixtures.map((fixture) => [fixture.codeHash, fixture.simulate]));

for (const audience of ["user", "agent"] as const) {
  toolScriptHostContract(`fake, ${audience}`, async (fixtures) => ({
    host: new FakeToolScriptHost({ audience, scripts: pinned(fixtures) }),
  }));
}

const code = "export async function run(ctx) { return ctx.now(); }";

async function request(audience: ToolScriptAudience): Promise<ToolScriptRunRequest> {
  const artifact: ToolScriptArtifact = {
    header: { format: "halonic.toolscript/1", id: "acme.clock", version: 1, audience, uses: [] },
    code,
    sourceHash: await sha256Hex(code),
    codeHash: await sha256Hex(code),
    profileVersion: 1,
  };
  return {
    runId: "run-1",
    artifact,
    registry: { audience, capabilities: new Map() },
    input: {},
    confirm: async () => true,
  };
}

verifies("contracts.fake-tool-script-host", () => {
  describe("FakeToolScriptHost", () => {
    it("has its audience's default limits unless it is given its own", () => {
      expect(new FakeToolScriptHost({ audience: "user", scripts: new Map() }).limits).toEqual(
        toolScriptDefaultLimits.user,
      );
      const limits = { ...toolScriptDefaultLimits.agent, memoryBytes: 128 * 1024 * 1024 };
      expect(new FakeToolScriptHost({ audience: "agent", scripts: new Map(), limits }).limits).toBe(
        limits,
      );
    });

    it("runs only the scripts it was given, by codeHash", async () => {
      const host = new FakeToolScriptHost({ audience: "agent", scripts: new Map() });
      expect(await host.run(await request("agent"))).toEqual({
        ok: false,
        reason: "toolscript.unpinned",
        calls: [],
        log: [],
      });
    });

    it("rejects a request limit that isn't a positive whole number, the caller's bug", async () => {
      const scripts = new Map([[await sha256Hex(code), async () => null]]);
      const host = new FakeToolScriptHost({ audience: "agent", scripts });
      const bad = { ...(await request("agent")), limits: { calls: 0 } };
      await expect(host.run(bad)).rejects.toThrow(RangeError);
    });

    it("answers ctx.now from the given clock", async () => {
      const scripts = new Map([
        [await sha256Hex(code), async (ctx: { now(): Promise<string> }) => ctx.now()],
      ]);
      const now = () => "2026-11-24T16:00:00.000Z";
      const host = new FakeToolScriptHost({ audience: "user", scripts, now });
      expect(await host.run(await request("user"))).toMatchObject({
        ok: true,
        output: "2026-11-24T16:00:00.000Z",
      });
    });
  });
});
