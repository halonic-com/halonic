import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { toolsKit } from "../../test/tools-kit.spec.ts";

const kit = toolsKit();

verifies("cli.commands.tools.revoke", () => {
  it("removes an approval, and starts no connector", async () => {
    await kit.expectGolden("revoke", ["tools", "revoke", "notes-mcp", "send"]);
    expect((await kit.tools(["revoke", "notes-mcp", "send"])).code).toBe(exitCode.ok);
    const notes = kit.notes();
    expect(await notes.approvals.get(await notes.key("send"))).toBeNull();
    expect(notes.started).toEqual([]);
  });

  it("removes an approval that can't be read", async () => {
    const notes = kit.notes();
    await notes.damageApprovals();
    expect((await kit.tools(["revoke", "notes-mcp", "send"])).code).toBe(exitCode.ok);
    expect(await notes.approvals.get(await notes.key("send"))).toBeNull();
  });

  it("says when a tool isn't approved", async () => {
    const run = await kit.expectGolden("revoke-not-approved", [
      "tools",
      "revoke",
      "notes-mcp",
      "archive",
    ]);
    expect(run.noColour.exit).toBe(exitCode.notFound);
  });

  it("needs the tools to remove", async () => {
    expect((await kit.tools(["revoke", "notes-mcp"])).stderr[0]).toBe(
      "✕ halonic tools revoke needs tool names.",
    );
  });

  it("needs a connector, and shows the usage line under it", async () => {
    const run = await kit.tools(["revoke"]);
    expect(run.stderr[0]).toBe("✕ halonic tools revoke needs a connector's id.");
    expect(run.stderr.join("\n")).toContain("halonic tools revoke <source> <tool>...");
  });

  it("names a connector close to the one typed", async () => {
    const run = await kit.expectGolden("unknown-source", ["tools", "revoke", "notes-mpc", "send"]);
    expect(run.noColour.exit).toBe(exitCode.notFound);
  });
});
