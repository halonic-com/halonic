import type { ConnectorClient, ConnectorTool } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { ScriptedConnector, textAnswer } from "../testing/scripted-model.ts";
import { ApprovalDesk, reviewedTools } from "./listed-tool-approval.test-helper.ts";
import { noListedToolApproval } from "./listed-tool-approval.ts";
import { runTestTurn } from "./turn-test-kit.test-helper.ts";

function tool(name: string, description = `Runs ${name}.`): ConnectorTool {
  return { name, description, parameters: { type: "object" } };
}

/** A connector whose listing a test changes between turns. */
class ChangingConnector implements ConnectorClient {
  readonly id = "notes";
  tools: ConnectorTool[];

  constructor(tools: ConnectorTool[]) {
    this.tools = tools;
  }

  async listTools(): Promise<ConnectorTool[]> {
    return this.tools;
  }
  async callTool(name: string): Promise<string> {
    return `${name} done`;
  }
  async close(): Promise<void> {}
}

/** One turn on `connector`, and the names of the tools the model was offered. */
async function turnOn(connector: ConnectorClient, desk: ApprovalDesk) {
  const { model, result } = await runTestTurn({
    answers: [textAnswer("ok")],
    connectors: [connector],
    listedToolApproval: desk.gate,
  });
  const offered = (model.requests[0]?.tools ?? []).map((offer) => offer.name);
  return { model, result, offered };
}

verifies("engine.listed-tool-approval", () => {
  describe("which listed tools go on to the model", () => {
    it("offers an approved tool and reports the others as waiting, apart from the refusals", async () => {
      const desk = new ApprovalDesk();
      const notes = new ScriptedConnector("notes", [tool("lookup")]);
      await desk.approveAll(notes);
      const both = new ScriptedConnector("notes", [tool("lookup"), tool("search")]);

      const { result, offered } = await turnOn(both, desk);

      expect(offered).toEqual(["lookup"]);
      expect(result.waiting).toEqual([{ source: "notes", name: "search" }]);
      expect(result.refusals).toEqual([]);
    });

    it("offers none when nothing is approved, and the model's input holds no waiting name", async () => {
      const desk = new ApprovalDesk();
      const notes = new ScriptedConnector("notes", [tool("lookup"), tool("search")]);

      const { model, result, offered } = await turnOn(notes, desk);

      expect(offered).toEqual([]);
      expect(result.waiting.map((waiting) => waiting.name)).toEqual(["lookup", "search"]);
      const sent = JSON.stringify(model.requests);
      expect(sent).not.toContain("lookup");
      expect(sent).not.toContain("search");
    });
  });

  describe("every turn checks again", () => {
    it("leaves out a tool the server changed, in either version", async () => {
      const desk = new ApprovalDesk();
      const notes = new ChangingConnector([tool("lookup", "Looks a note up.")]);
      await desk.approveAll(notes);
      expect((await turnOn(notes, desk)).offered).toEqual(["lookup"]);

      notes.tools = [tool("lookup", "Looks a note up, and anything else it likes.")];
      const changed = await turnOn(notes, desk);
      expect(changed.offered).toEqual([]);
      expect(changed.result.waiting).toEqual([{ source: "notes", name: "lookup" }]);

      notes.tools = [tool("lookup", "Looks a note up.")];
      expect((await turnOn(notes, desk)).offered).toEqual(["lookup"]);
    });

    it("stops offering a tool whose approval was revoked since the last turn", async () => {
      const desk = new ApprovalDesk();
      const notes = new ChangingConnector([tool("lookup")]);
      await desk.approveAll(notes);
      expect((await turnOn(notes, desk)).offered).toEqual(["lookup"]);

      await desk.store.revoke({ location: desk.gate.location, source: "notes", name: "lookup" });

      const next = await turnOn(notes, desk);
      expect(next.offered).toEqual([]);
      expect(next.result.waiting).toEqual([{ source: "notes", name: "lookup" }]);
    });
  });

  describe("the caller chooses", () => {
    it("puts every listed tool on waiting for a caller with no approvals", async () => {
      const notes = new ScriptedConnector("notes", [tool("lookup")]);

      const { model, result } = await runTestTurn({
        answers: [textAnswer("ok")],
        connectors: [notes],
        listedToolApproval: noListedToolApproval,
      });

      expect(model.requests[0]?.tools).toEqual([]);
      expect(result.waiting).toEqual([{ source: "notes", name: "lookup" }]);
    });

    it("offers the tools of a connector Halonic reviewed with no approvals at all", async () => {
      const notes = new ScriptedConnector("notes", [tool("lookup")]);

      const { model, result } = await runTestTurn({
        answers: [textAnswer("ok")],
        connectors: [notes],
        listedToolApproval: reviewedTools,
      });

      expect(model.requests[0]?.tools?.map((offer) => offer.name)).toEqual(["lookup"]);
      expect(result.waiting).toEqual([]);
    });

    it("passes the tools of a connector the gate calls reviewed, with no approvals", async () => {
      const desk = new ApprovalDesk();
      const notes = new ScriptedConnector("notes", [tool("lookup")]);
      const gate = { ...desk.gate, addressOf: async () => ({ kind: "reviewed" as const }) };

      const { model, result } = await runTestTurn({
        answers: [textAnswer("ok")],
        connectors: [notes],
        listedToolApproval: gate,
      });

      expect(model.requests[0]?.tools?.map((offer) => offer.name)).toEqual(["lookup"]);
      expect(result.waiting).toEqual([]);
    });

    it("refuses the listing when it has no address to approve at", async () => {
      const desk = new ApprovalDesk();
      const notes = new ScriptedConnector("notes", [tool("lookup")]);
      const gate = {
        ...desk.gate,
        addressOf: async () => ({
          kind: "unaddressable" as const,
          reason: "its URL has a password",
        }),
      };

      const { result } = await runTestTurn({
        answers: [textAnswer("ok")],
        connectors: [notes],
        listedToolApproval: gate,
      });

      expect(result.refusals).toEqual([
        { source: "notes", refused: "listing", reason: "its URL has a password" },
      ]);
      expect(result.waiting).toEqual([{ source: "notes", name: "lookup" }]);
    });

    it("offers none of a source's tools when its approvals can't be read", async () => {
      const desk = new ApprovalDesk();
      const notes = new ScriptedConnector("notes", [tool("lookup")]);
      desk.store.list = async () => {
        throw new Error("the file is damaged");
      };

      const { offered, result } = await turnOn(notes, desk);

      expect(offered).toEqual([]);
      expect(result.refusals).toEqual([
        {
          source: "notes",
          refused: "listing",
          reason: "couldn't read its tool approvals, so none of its listed tools is offered",
        },
      ]);
    });
  });

  it("tells the host which tools wait, and not when none do", async () => {
    const desk = new ApprovalDesk();
    const notes = new ScriptedConnector("notes", [tool("lookup")]);
    await turnOn(notes, desk);
    await desk.approveAll(notes);
    await turnOn(notes, desk);

    expect(desk.heard).toEqual([
      { connector: "notes", waiting: [{ source: "notes", name: "lookup" }] },
    ]);
  });
});
