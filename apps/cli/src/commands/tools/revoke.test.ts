import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { toolsKit } from "../../test/tools-kit.spec.ts";
import { toolsCommandWith } from "./command.ts";
import type { ToolsMachine } from "./source.ts";

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

  it("says nothing was removed when several tools were named", async () => {
    const run = await kit.expectGolden("revoke-not-approved-several", [
      "tools",
      "revoke",
      "notes-mcp",
      "send",
      "archive",
    ]);
    expect(run.noColour.exit).toBe(exitCode.notFound);
  });

  it("removes none when one of the tools isn't approved", async () => {
    const run = await kit.tools(["revoke", "notes-mcp", "send", "archive", "--json"]);
    expect(run.code).toBe(exitCode.notFound);
    const notes = kit.notes();
    expect(await notes.approvals.get(await notes.key("send"))).not.toBeNull();
  });

  it("says what it was doing when an error it didn't word stops it", async () => {
    // `revoke` reads only the approvals, so the rest of the machine is never used.
    const approvals = { get: () => Promise.reject(new Error("The disk is full.")) };
    const io = captureIo(kit.notes().acme);
    const revoke = toolsCommandWith(() => ({ approvals }) as unknown as ToolsMachine);
    await runCli(["tools", "revoke", "notes-mcp", "send"], io, [revoke]);
    expect(io.stderr[0]).toMatch(/^✕ Couldn't remove your approvals in notes-mcp/u);
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
