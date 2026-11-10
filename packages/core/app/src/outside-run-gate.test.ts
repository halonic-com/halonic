import type { ConnectionKey, ToolRisk } from "@halonicjs/ports";
import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import { ConnectionSettings, type SendingSettings } from "./connection-settings.ts";
import { checkOutsideRunCall, type OutsideRunCall } from "./outside-run-gate.ts";
import { TestConnectionSettingsStore } from "./testing/test-connection-settings-store.ts";
import { type OfferedDeclaredTool, type OfferedTool, readToolListing } from "./tool-listing.ts";

const mail: ConnectionKey = { location: "/workspaces/acme", connector: "mail" };

/** A tool the connector declares, with one `query` parameter and nothing else. */
function declared(name: string, risk: ToolRisk): OfferedDeclaredTool {
  return {
    kind: "declared",
    name,
    description: `Runs ${name}.`,
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      additionalProperties: false,
    },
    risk,
    untrusted: false,
  };
}

function setup() {
  const store = new TestConnectionSettingsStore();
  const clock = { now: () => new Date("2026-11-09T10:00:00.000Z") };
  const settings = new ConnectionSettings({ store, clock });
  const check = (tool: OfferedTool, overrides: Partial<OutsideRunCall> = {}) =>
    checkOutsideRunCall(
      { connection: mail, lists: { approve: [] }, tool, args: { query: "invoices" }, ...overrides },
      settings,
    );
  return { store, settings, check };
}

verifies("app.outside-run-connector-gate", () => {
  it("runs a read tool that both lists allow, with declared arguments", async () => {
    const { check } = setup();
    const search = declared("search", "read");

    expect(await check(search)).toEqual({ kind: "run" });
    expect(await check(search, { lists: { allow: ["search"], approve: [] } })).toEqual({
      kind: "run",
    });
  });

  it("refuses a tool the allow list leaves out", async () => {
    const { check } = setup();

    expect(await check(declared("search", "read"), { lists: { allow: [], approve: [] } })).toEqual({
      kind: "refused",
      reason: "search isn't in the connector's allow list",
    });
  });

  it("refuses an approve-listed tool, even one that only reads", async () => {
    const { check } = setup();

    expect(await check(declared("archive", "read"), { lists: { approve: ["archive"] } })).toEqual({
      kind: "refused",
      reason: "archive needs a person's approval, so it runs only in a run",
    });
  });

  it("refuses every tool of a connector whose approve is all, even one that only reads", async () => {
    const { check } = setup();

    expect(await check(declared("search", "read"), { lists: { approve: "all" } })).toEqual({
      kind: "refused",
      reason: "search needs a person's approval, so it runs only in a run",
    });
  });

  it("checks the sending setting before checkToolCall, so the reason names the switch", async () => {
    const { check } = setup();

    // checkToolCall would ask about a send tool (rule 4), but rule 3 answers first.

    expect(await check(declared("send_draft", "send"))).toEqual({
      kind: "refused",
      reason: 'sending is off for the connector "mail"',
    });
  });

  it("hands the host the store's error when the settings can't be read, apart from the reason", async () => {
    const { store, settings, check } = setup();
    await settings.setAllowSending(mail, true);
    store.breakSettings(mail);

    const result = await check(declared("send_draft", "send"));

    expect(result).toEqual({
      kind: "refused",
      reason: 'the settings of the connector "mail" can\'t be read, so sending is off',
      // The store's own error, word for word, not just any error.
      error: new Error(`the settings of ["/workspaces/acme","mail"] can't be read`),
    });
    if (result.kind === "refused") {
      expect(result.reason).not.toContain("/workspaces/acme");
    }
  });

  it("still refuses a send tool when sending is on, because only a run can ask", async () => {
    const { settings, check } = setup();
    await settings.setAllowSending(mail, true);

    expect(await check(declared("send_draft", "send"))).toEqual({
      kind: "refused",
      reason:
        "send_draft can change things (risk send), so it runs only in a run, where a person can approve it",
    });
  });

  it("refuses a write tool that isn't approve-listed, because checkToolCall would ask", async () => {
    const { check } = setup();

    const result = await check(declared("label", "write"));

    expect(result).toEqual({
      kind: "refused",
      reason:
        "label can change things (risk write), so it runs only in a run, where a person can approve it",
    });
  });

  it("passes on checkToolCall's refusal of an undeclared argument", async () => {
    const { check } = setup();

    expect(await check(declared("search", "read"), { args: { query: "a", folder: "b" } })).toEqual({
      kind: "refused",
      reason: 'search has no parameter "folder"',
    });
  });

  it("matches a listed tool against the lists by the name its server lists it under", async () => {
    const { check } = setup();
    const { tools } = readToolListing({
      source: "notes",
      listed: [{ name: "lookup", description: "Finds a note.", parameters: { type: "object" } }],
      declared: [],
      otherNames: new Set(),
      trust: { location: mail.location, fingerprint: "hfp1:0000" },
      workspaceRisks: new Map([["lookup", "read"]]),
    });
    const [lookup] = tools;
    if (lookup === undefined) {
      throw new Error("lookup isn't offered");
    }

    expect(lookup.name).toBe("notes__lookup");
    expect(await check(lookup, { args: {}, lists: { allow: ["lookup"], approve: [] } })).toEqual({
      kind: "run",
    });
    expect(await check(lookup, { args: {}, lists: { approve: ["lookup"] } })).toMatchObject({
      kind: "refused",
    });
  });

  typeTest(
    "gets only the read side of the settings, so a tool call can't switch sending on",
    () => {
      expectTypeOf<keyof SendingSettings>().toEqualTypeOf<"checkSending">();
      expectTypeOf<Parameters<typeof checkOutsideRunCall>[1]>().toEqualTypeOf<SendingSettings>();
    },
  );
});
