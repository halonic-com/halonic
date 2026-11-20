import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { toolsKit } from "../../test/tools-kit.spec.ts";

const kit = toolsKit();

const pluginLine =
  "notes-mcp is a plugin's connector. Its tools need no approval: trusting the plugin covers them.";
const notAddedLine =
  "The plugin files isn't added, so it has no tools yet. Add it with halonic plugin add <folder or git address>.";

verifies("cli.commands.tools.plugin-connector", () => {
  it("says a plugin connector's tools need no approval, starts nothing and exits 0", async () => {
    await kit.notes().rewriteConnector("transport:\n  plugin:\n    id: files\n");
    kit.notes().addPlugin("files");

    const review = await kit.tools(["review", "notes-mcp"]);
    expect(review).toEqual({ code: exitCode.ok, stdout: [pluginLine], stderr: [] });
    const approve = await kit.tools(["approve", "notes-mcp", "--all"]);
    expect(approve).toEqual({ code: exitCode.ok, stdout: [pluginLine], stderr: [] });
    expect(kit.notes().servers.running).toBe(0);
  });

  it("says when the connector's plugin isn't added, and still exits 0", async () => {
    await kit.notes().rewriteConnector("transport:\n  plugin:\n    id: files\n");

    const review = await kit.tools(["review", "notes-mcp"]);
    expect(review).toEqual({ code: exitCode.ok, stdout: [pluginLine, notAddedLine], stderr: [] });
    const approve = await kit.tools(["approve", "notes-mcp", "--all"]);
    expect(approve).toEqual({ code: exitCode.ok, stdout: [pluginLine, notAddedLine], stderr: [] });
  });

  it("gives --json the reason as needsNoApproval, not as an error", async () => {
    await kit.notes().rewriteConnector("transport:\n  plugin:\n    id: files\n");

    const review = await kit.tools(["review", "notes-mcp", "--json"]);
    expect(review.code).toBe(exitCode.ok);
    expect(JSON.parse(review.stdout.join("\n"))).toMatchObject({
      ok: true,
      source: "notes-mcp",
      needsNoApproval: "plugin",
    });
    const approve = await kit.tools(["approve", "notes-mcp", "--all", "--json"]);
    expect(JSON.parse(approve.stdout.join("\n"))).toMatchObject({
      ok: true,
      approved: [],
      needsNoApproval: "plugin",
    });
  });

  it("gives a connector with built-in tools needsNoApproval: built_in", async () => {
    await kit.notes().rewriteConnector("transport:\n  google:\n    account: fin@example.com\n");

    const { stdout } = await kit.tools(["review", "notes-mcp", "--json"]);
    expect(JSON.parse(stdout.join("\n"))).toMatchObject({ ok: true, needsNoApproval: "built_in" });
  });
});
