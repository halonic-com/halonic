// Cases of HAL-2579 (J6, J7, H2, G1) that `halonic tools revoke` answers
// without `review` or `approve`: it removes the one approval it names, and
// prints what a server or a workspace file wrote as escaped text.

import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { toolsKit } from "../../test/tools-kit.spec.ts";

const kit = toolsKit();

/** `send`'s approval as seeded, moved to another key. */
async function approvedAt(key: { location: string; source: string; name: string }) {
  const notes = kit.notes();
  const seeded = await notes.approvals.get(await notes.key("send"));
  if (seeded === null) throw new Error("Acme starts with send approved.");
  await notes.approvals.approve({ ...seeded, ...key });
  return key;
}

verifies("cli.commands.tools.revoke", () => {
  it("leaves the other approvals of the connector alone", async () => {
    const notes = kit.notes();
    const archive = await approvedAt({ ...(await notes.key("archive")) });
    expect((await kit.tools(["revoke", "notes-mcp", "send"])).code).toBe(exitCode.ok);
    expect(await notes.approvals.get(await notes.key("send"))).toBeNull();
    expect(await notes.approvals.get(archive)).not.toBeNull();
  });

  it("leaves the same tool approved in another workspace", async () => {
    const notes = kit.notes();
    const elsewhere = await approvedAt({ ...(await notes.key("send")), location: "/other/acme" });
    expect((await kit.tools(["revoke", "notes-mcp", "send"])).code).toBe(exitCode.ok);
    expect(await notes.approvals.get(await notes.key("send"))).toBeNull();
    expect(await notes.approvals.get(elsewhere)).not.toBeNull();
  });

  it("doesn't count an approval in another workspace as this one's", async () => {
    const notes = kit.notes();
    const elsewhere = await approvedAt({
      ...(await notes.key("archive")),
      location: "/other/acme",
    });
    const run = await kit.tools(["revoke", "notes-mcp", "archive"]);
    expect(run.code).toBe(exitCode.notFound);
    expect(await notes.approvals.get(elsewhere)).not.toBeNull();
  });

  it("leaves the same tool approved under another connector of the workspace", async () => {
    const notes = kit.notes();
    const other = await approvedAt({ ...(await notes.key("send")), source: "other-mcp" });
    expect((await kit.tools(["revoke", "notes-mcp", "send"])).code).toBe(exitCode.ok);
    expect(await notes.approvals.get(other)).not.toBeNull();
  });

  it("doesn't fail when the same tool is named twice", async () => {
    const run = await kit.tools(["revoke", "notes-mcp", "send", "send", "--json"]);
    expect(run.code).toBe(exitCode.ok);
    const notes = kit.notes();
    expect(await notes.approvals.get(await notes.key("send"))).toBeNull();
  });

  it("prints a tool name with terminal controls escaped", async () => {
    const run = await kit.tools(["revoke", "notes-mcp", "\u001b[2Jsend\u202e\r"]);
    expect(run.code).toBe(exitCode.notFound);
    const printed = run.stderr.join("\n");
    expect(printed).toContain("\\u001b[2Jsend\\u202e\\u000d");
    for (const raw of ["\u001b", "\u202e", "\r"]) expect(printed).not.toContain(raw);
  });

  it("prints a connector id with terminal controls escaped", async () => {
    const run = await kit.tools(["revoke", "\u001b[31mnotes-mcp", "send"]);
    expect(run.code).toBe(exitCode.notFound);
    expect(run.stderr.join("\n")).not.toContain("\u001b");
  });
});
