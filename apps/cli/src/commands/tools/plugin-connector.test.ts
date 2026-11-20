import { verifies } from "@halonicjs/testing-spec";
import { beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { toolsKit } from "../../test/tools-kit.spec.ts";

const kit = toolsKit();

const pluginLine =
  "notes-mcp is a plugin's connector. Its tools need no approval: trusting the plugin covers them.";

verifies("cli.commands.tools.plugin-connector", () => {
  beforeEach(async () => {
    await kit.notes().rewriteConnector("transport:\n  plugin:\n    id: files\n");
    kit.notes().setPlugins([{ id: "files", state: "on" }]);
  });

  it("says a plugin connector's tools need no approval, starts nothing and exits 0", async () => {
    const review = await kit.tools(["review", "notes-mcp"]);
    expect(review).toEqual({ code: exitCode.ok, stdout: [pluginLine], stderr: [] });
    const approve = await kit.tools(["approve", "notes-mcp", "--all"]);
    expect(approve).toEqual({ code: exitCode.ok, stdout: [pluginLine], stderr: [] });
    expect(kit.notes().servers.running).toBe(0);
  });

  it("gives --json the reason as needsNoApproval, not as an error", async () => {
    const review = await kit.tools(["review", "notes-mcp", "--json"]);
    expect(review.code).toBe(exitCode.ok);
    expect(JSON.parse(review.stdout.join("\n"))).toMatchObject({
      ok: true,
      source: "notes-mcp",
      needsNoApproval: "plugin",
      pluginState: "on",
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

  it("names a plugin that isn't added, with how to add it, and exits 4", async () => {
    kit.notes().setPlugins([]);

    for (const args of [
      ["review", "notes-mcp"],
      ["approve", "notes-mcp", "--all"],
    ]) {
      const { code, stdout, stderr } = await kit.tools(args);
      expect(code).toBe(exitCode.notFound);
      expect(stdout).toEqual([]);
      expect(stderr).toEqual([
        "✕ notes-mcp uses the plugin files, which isn't added.",
        "  Add it with halonic plugin add <folder>.",
      ]);
    }
  });

  it("names the added plugin a typo is close to", async () => {
    kit.notes().setPlugins([{ id: "filez", state: "on" }]);

    const { code, stderr } = await kit.tools(["review", "notes-mcp"]);
    expect(code).toBe(exitCode.notFound);
    expect(stderr).toEqual([
      "✕ notes-mcp uses the plugin files, which isn't added.",
      "  Did you mean filez?",
    ]);
  });

  it("warns that a plugin changed since it was trusted is off, with the command that trusts it", async () => {
    kit.notes().setPlugins([{ id: "files", state: "changed" }]);

    const review = await kit.tools(["review", "notes-mcp"]);
    expect(review).toEqual({
      code: exitCode.ok,
      stdout: [pluginLine],
      stderr: ["! files is off: changed since you trusted it · halonic trust --plugin files"],
    });
    const json = await kit.tools(["review", "notes-mcp", "--json"]);
    expect(JSON.parse(json.stdout.join("\n"))).toMatchObject({ ok: true, pluginState: "off" });
  });

  it("warns that a plugin not trusted yet, or one that can't be read, is off", async () => {
    kit.notes().setPlugins([{ id: "files", state: "notTrusted" }]);
    expect((await kit.tools(["approve", "notes-mcp", "--all"])).stderr).toEqual([
      "! files is off: not trusted yet · halonic trust --plugin files",
    ]);

    kit.notes().setPlugins([{ id: "files", state: "broken" }]);
    expect((await kit.tools(["review", "notes-mcp"])).stderr).toEqual([
      "! files can't be read or checked, so it's off. See halonic plugin list.",
    ]);
  });
});
