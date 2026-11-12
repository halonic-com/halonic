import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { notesConnector, notesTools } from "../../test/acme-notes.ts";
import { toolsKit } from "../../test/tools-kit.spec.ts";

const kit = toolsKit();

verifies("cli.commands.tools.approve", () => {
  it("approves one tool as it is now, and shows its fingerprint", async () => {
    await kit.expectGolden("approve-one", ["tools", "approve", "notes-mcp", "archive"]);
  });

  it("approves every waiting tool with --all, leaving out the one that keeps changing", async () => {
    await kit.expectGolden("approve-all", ["tools", "approve", "notes-mcp", "--all"]);
  });

  it("approves with --all only the version it printed, so a later change asks again", async () => {
    await kit.tools(["approve", "notes-mcp", "--all"]);
    kit.notes().servers.tools = [
      notesTools.send,
      { ...notesTools.lookup, description: "Finds and mails a note." },
    ];

    const document = await kit.listedNow();

    expect(document.waiting).toEqual([
      expect.objectContaining({ name: "lookup", state: "changed" }),
    ]);
  });

  it("approves a tool its server keeps changing when it is named", async () => {
    const { code } = await kit.tools(["approve", "notes-mcp", "search"]);
    expect(code).toBe(exitCode.ok);
    expect((await kit.listedNow()).on).toContain("search");
  });

  it("approves at the fingerprint given, and refuses one the tool changed since", async () => {
    const shown = (await kit.listedNow()).waiting.find((tool) => tool.name === "lookup");
    if (shown === undefined) throw new Error("lookup waits");
    await kit.expectGolden("approve-changed", [
      "tools",
      "approve",
      "notes-mcp",
      "lookup",
      "--fingerprint",
      `htl1:${"0".repeat(64)}`,
    ]);
    const { code } = await kit.tools([
      "approve",
      "notes-mcp",
      "lookup",
      "--fingerprint",
      shown.fingerprint,
    ]);
    expect(code).toBe(exitCode.ok);
  });

  it("says a tool is approved already", async () => {
    await kit.expectGolden("approve-already", ["tools", "approve", "notes-mcp", "send"]);
  });

  it("refuses a tool Halonic refused, with why", async () => {
    await kit.expectGolden("approve-refused", ["tools", "approve", "notes-mcp", "look.up"]);
  });

  it("says when the source lists no such tool, with the close name", async () => {
    await kit.expectGolden("approve-not-listed", ["tools", "approve", "notes-mcp", "lokup"]);
    const far = await kit.tools(["approve", "notes-mcp", "delete"]);
    expect(far.code).toBe(exitCode.notFound);
    expect(far.stderr.slice(0, 2)).toEqual([
      "✕ Couldn't approve delete: notes-mcp doesn't list a tool called delete.",
      "  See its tools: halonic tools review notes-mcp",
    ]);
  });

  it("approves several tools one line each, and stops at the first that fails", async () => {
    const { code, stdout, stderr } = await kit.tools([
      "approve",
      "notes-mcp",
      "archive",
      "lokup",
      "lookup",
    ]);
    expect(code).toBe(exitCode.notFound);
    expect(stdout).toEqual([
      "✓ Approved archive from notes-mcp, as it is now.",
      expect.stringMatching(/^ {2}htl1:/u),
    ]);
    expect(stderr[0]).toBe("✕ Couldn't approve lokup: notes-mcp doesn't list a tool called lokup.");
    expect((await kit.listedNow()).on).toEqual(["send", "archive"]);
  });

  describe("a wrong command line approves nothing and starts nothing", () => {
    it.each([
      ["names-and-all", ["lookup", "--all"]],
      ["fingerprint-many", ["lookup", "send", "--fingerprint", "htl1:0"]],
      ["fingerprint-all", ["--all", "--fingerprint", "htl1:0"]],
    ])("%s", async (name, rest) => {
      const run = await kit.expectGolden(`usage-${name}`, [
        "tools",
        "approve",
        "notes-mcp",
        ...rest,
      ]);
      expect(run.noColour.exit).toBe(exitCode.usage);
      expect(kit.notes().servers.started).toEqual([]);
    });

    it("needs tools, or --all, and a connector", async () => {
      expect((await kit.tools(["approve", "notes-mcp"])).stderr[0]).toBe(
        "✕ halonic tools approve needs tool names, or --all.",
      );
      expect((await kit.tools(["approve"])).stderr[0]).toBe(
        "✕ halonic tools approve needs a connector's id.",
      );
    });
  });

  describe("the errors the three share", () => {
    it("points to the connectors when none is close to the one typed", async () => {
      const far = await kit.tools(["approve", "calendar", "lookup"]);
      expect(far.stderr.slice(0, 2)).toEqual([
        `✕ There's no connector called "calendar" in acme.`,
        "  Use the connector's file name, without .connector.yaml.",
      ]);
    });

    it("starts nothing in a workspace that isn't trusted as it is now", async () => {
      await writeFile(
        join(kit.notes().acme, "library", "connectors", "notes-mcp.connector.yaml"),
        notesConnector(["--changed"]),
      );
      const { code, stderr } = await kit.tools(["approve", "notes-mcp", "archive"]);
      expect(code).toBe(exitCode.notTrusted);
      expect(stderr).toContain(
        "✕ Couldn't list the tools from notes-mcp: Acme changed since you trusted it. Nothing started.",
      );
      expect(kit.notes().servers.started).toEqual([]);
    });

    it("says which approval can't be read, and revoke removes it", async () => {
      await kit.notes().damageApprovals();
      await kit.expectGolden("unreadable", ["tools", "approve", "notes-mcp", "archive"]);
      const revoked = await kit.tools(["revoke", "notes-mcp", "send"]);
      expect(revoked.code).toBe(exitCode.ok);
      const { stderr } = await kit.tools(["approve", "notes-mcp", "archive"]);
      expect(stderr[0]).toBe(
        "✕ Couldn't read your approval for lookup in notes-mcp, so none of its listed tools are on.",
      );
    });

    it("says when Halonic refused the whole listing", async () => {
      kit.notes().servers.tools = Array.from({ length: 129 }, (_, index) => ({
        name: `tool_${index}`,
        description: "A tool.",
        inputSchema: { type: "object" },
      }));
      const { code, stderr } = await kit.tools(["approve", "notes-mcp", "tool_1"]);
      expect(code).toBe(exitCode.denied);
      expect(stderr[0]).toBe(
        "✕ Couldn't use the tool list from notes-mcp: the listing returns 129 tools, more than 128, so none of its listed tools is offered. None of its listed tools are on.",
      );
    });
  });
});
