import { verifies } from "@halonicjs/testing-spec";
import { beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { toolsKit } from "../../test/tools-kit.spec.ts";

const kit = toolsKit();

const integrationLine =
  "notes-mcp is an integration's connector. Its tools need no approval: they come from the integration's permission sheet.";

verifies("cli.commands.tools.integration-connector", () => {
  beforeEach(async () => {
    await kit.notes().rewriteConnector("transport:\n  integration:\n    folder: issues\n");
  });

  it("says an integration connector's tools need no approval, starts nothing and exits 0", async () => {
    const review = await kit.tools(["review", "notes-mcp"]);
    expect(review).toEqual({ code: exitCode.ok, stdout: [integrationLine], stderr: [] });
    const approve = await kit.tools(["approve", "notes-mcp", "--all"]);
    expect(approve).toEqual({ code: exitCode.ok, stdout: [integrationLine], stderr: [] });
    expect(kit.notes().servers.running).toBe(0);
  });

  it("gives --json the reason as needsNoApproval, not as an error", async () => {
    const review = await kit.tools(["review", "notes-mcp", "--json"]);
    expect(review.code).toBe(exitCode.ok);
    expect(JSON.parse(review.stdout.join("\n"))).toMatchObject({
      ok: true,
      source: "notes-mcp",
      needsNoApproval: "integration",
    });
    const approve = await kit.tools(["approve", "notes-mcp", "--all", "--json"]);
    expect(JSON.parse(approve.stdout.join("\n"))).toMatchObject({
      ok: true,
      approved: [],
      needsNoApproval: "integration",
    });
  });
});
