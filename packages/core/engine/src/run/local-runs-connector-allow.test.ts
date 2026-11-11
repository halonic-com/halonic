// Attack tests for `engine.run-connector-allow` (HAL-4629): a run's model
// tries to reach a connector tool its file's `allow` leaves out. Every such
// call must reach no connector, write no `tool.called` (`engine.turn-logs-events`),
// ask no person and record no effect, and the model gets the refusal.

import type { RunEvent } from "@halonicjs/events";
import type { Connector } from "@halonicjs/format";
import type { ChatResponse, ConnectorTool, ToolRisk } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { KernelRuns } from "../kernel/kernel-test-kit.test-helper.ts";
import { call, callAnswer, ScriptedConnector, textAnswer } from "../testing/scripted-model.ts";
import type { RunConnectorCalls } from "./connector-calls.ts";
import { agentsUsing, replyStart, runsOn, typesOf } from "./local-runs-test-kit.test-helper.ts";

const unoffered = "Refused: no tool of that name was offered";

function tool(name: string, risk: ToolRisk = "read"): ConnectorTool {
  return {
    name,
    description: `Does ${name}`,
    parameters: { type: "object", properties: {} },
    risk,
  };
}

const connectorCalls: RunConnectorCalls = {
  location: "/workspaces/acme",
  sending: { checkSending: async () => ({ allowed: true }) },
  reportSettingsError: () => {},
};

type Lists = Readonly<Record<string, Connector["tools"]>>;

/** One step of the reply workflow's `writer`, whose file lists `using`. */
async function runOf(
  connectors: readonly ScriptedConnector[],
  connectorTools: Lists,
  answers: ChatResponse[],
  using: readonly string[] = connectors.map(({ id }) => id),
) {
  const setup = runsOn(answers, new KernelRuns(), {
    agents: agentsUsing(using, "writer"),
    connectors,
    connectorTools,
    connectorCalls,
  });
  await setup.executor.start(replyStart);
  await setup.scheduler.runDue();
  return setup;
}

function offeredIn(model: { requests: { tools?: readonly { name: string }[] }[] }, request = 0) {
  return model.requests[request]?.tools?.map(({ name }) => name);
}

/** The tool messages the model got, by call id. */
function resultsIn(model: { requests: { messages: { role: string; content: string }[] }[] }) {
  return (model.requests.at(-1)?.messages ?? [])
    .filter((message) => message.role === "tool")
    .map((message) => message.content);
}

/** That the run logged nothing of a call it refused, and went on. */
async function expectNothingLogged(runs: KernelRuns) {
  const types = typesOf(runs.logs.get("run_1") as readonly RunEvent[] | undefined);
  for (const type of ["tool.called", "tool.result", "approval.requested", "effect.requested"]) {
    expect(types).not.toContain(type);
  }
  expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
}

// Built from code points: the formatter writes an escape back as the character itself.
const char = (code: number) => String.fromCharCode(code);

const onlySearch: Lists = { mail: { allow: ["search"], approve: [] } };

verifies("engine.run-connector-allow", () => {
  describe("a call to a tool `allow` leaves out, under a name close to it", () => {
    // The server lists each look-alike as a tool of its own, so a lookup that
    // folded case, trimmed or normalised the name would find one and call it.
    const lookAlikes: readonly [string, string][] = [
      ["its exact name", "delete_all"],
      ["upper case", "DELETE_ALL"],
      ["mixed case", "Delete_All"],
      ["the connector's id with a dot", "mail.delete_all"],
      ["the connector's id with two underscores", "mail__delete_all"],
      ["the connector's id with a slash", "mail/delete_all"],
      ["another connector's id", "tracker.delete_all"],
      ["a space before it", " delete_all"],
      ["a space after it", "delete_all "],
      ["a newline after it", "delete_all\n"],
      ["a zero-width space in it", `delete${char(0x200b)}_all`],
      ["a Cyrillic e", `d${char(0x435)}lete_all`],
      ["a full-width low line", `delete${char(0xff3f)}all`],
      ["a look-alike of the allowed name: a Cyrillic s", `${char(0x455)}earch`],
      ["a look-alike of the allowed name: upper case", "SEARCH"],
      ["a look-alike of the allowed name: a space after it", "search "],
      ["a look-alike of the allowed name: a full-width s", `${char(0xff53)}earch`],
    ];

    it.each(lookAlikes)("is refused by %s, and reaches no connector", async (_, name) => {
      const mail = new ScriptedConnector("mail", [tool("search"), tool("delete_all"), tool(name)]);
      const answers = [callAnswer(call("x-1", name, {})), textAnswer("Done")];
      const { model, runs } = await runOf([mail], onlySearch, answers);

      expect(offeredIn(model)).toEqual(["search"]);
      expect(mail.calls).toEqual([]);
      expect(resultsIn(model)).toEqual([unoffered]);
      await expectNothingLogged(runs);
    });

    it("is refused next to an allowed call in the same answer, which still goes through", async () => {
      const mail = new ScriptedConnector("mail", [tool("search"), tool("delete_all")]);
      const both = callAnswer(call("s-1", "search", {}), call("d-1", "delete_all", {}));
      const { model } = await runOf([mail], onlySearch, [both, textAnswer("Done")]);

      expect(mail.calls).toEqual([{ name: "search", args: {} }]);
      expect(resultsIn(model)).toEqual(["search done", unoffered]);
    });

    it("is refused when it can change things, before any person is asked or effect recorded", async () => {
      const mail = new ScriptedConnector("mail", [tool("search"), tool("send_mail", "send")]);
      const answers = [callAnswer(call("m-1", "send_mail", {})), textAnswer("Done")];
      const { model, runs } = await runOf([mail], onlySearch, answers);

      expect(mail.calls).toEqual([]);
      expect(resultsIn(model)).toEqual([unoffered]);
      await expectNothingLogged(runs);
    });
  });

  describe("a tool the server lists only after the run started", () => {
    it("isn't called when it appears during the turn", async () => {
      const listing = [tool("search")];
      const mail = new ScriptedConnector("mail", listing, (name) => {
        listing.push(tool("delete_all"));
        return `${name} done`;
      });
      const answers = [
        callAnswer(call("s-1", "search", {})),
        callAnswer(call("d-1", "delete_all", {})),
        textAnswer("Done"),
      ];
      const { model } = await runOf([mail], onlySearch, answers);

      expect(mail.calls.map(({ name }) => name)).toEqual(["search"]);
      expect(resultsIn(model).at(-1)).toBe(unoffered);
    });

    it("isn't offered or called on the model call after a person's OK", async () => {
      const listing = [tool("send_mail", "send")];
      const mail = new ScriptedConnector("mail", listing);
      const lists: Lists = { mail: { allow: ["send_mail"], approve: [] } };
      const answers = [
        callAnswer(call("m-1", "send_mail", {})),
        callAnswer(call("d-1", "delete_all", {})),
        textAnswer("Done"),
      ];
      const { executor, scheduler, model, runs } = await runOf([mail], lists, answers);
      expect(await runs.get("run_1")).toMatchObject({ status: "waiting" });

      listing.push(tool("delete_all"));
      await executor.send("run_1", "approve");
      await scheduler.runDue();

      expect(mail.calls.map(({ name }) => name)).toEqual(["send_mail"]);
      for (const request of model.requests.keys()) {
        expect(offeredIn(model, request)).toEqual(["send_mail"]);
      }
      expect(resultsIn(model).at(-1)).toBe(unoffered);
      expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
    });
  });

  describe("two connectors that list the same tool name", () => {
    it.each([
      ["the first", "mail", "tracker"],
      ["the second", "tracker", "mail"],
    ])("calls it on the one that allows it when that is %s", async (_, allows, leavesOut) => {
      const mail = new ScriptedConnector("mail", [tool("search"), tool("archive")]);
      const tracker = new ScriptedConnector("tracker", [tool("search_issues"), tool("archive")]);
      const lists: Lists = {
        [allows]: { allow: ["archive"], approve: [] },
        [leavesOut]: { allow: [allows === "mail" ? "search_issues" : "search"], approve: [] },
      };
      const byId = { mail, tracker };
      const answers = [callAnswer(call("a-1", "archive", {})), textAnswer("Done")];
      const { model } = await runOf([mail, tracker], lists, answers);

      expect(offeredIn(model)?.filter((name) => name === "archive")).toHaveLength(1);
      expect(byId[allows as "mail" | "tracker"].calls).toEqual([{ name: "archive", args: {} }]);
      expect(byId[leavesOut as "mail" | "tracker"].calls).toEqual([]);
    });

    it("calls neither when both leave it out", async () => {
      const mail = new ScriptedConnector("mail", [tool("search"), tool("archive")]);
      const tracker = new ScriptedConnector("tracker", [tool("search_issues"), tool("archive")]);
      const lists: Lists = {
        mail: { allow: ["search"], approve: [] },
        tracker: { allow: ["search_issues"], approve: [] },
      };
      const answers = [callAnswer(call("a-1", "archive", {})), textAnswer("Done")];
      const { model, runs } = await runOf([mail, tracker], lists, answers);

      expect(offeredIn(model)).toEqual(["search", "search_issues"]);
      expect([...mail.calls, ...tracker.calls]).toEqual([]);
      await expectNothingLogged(runs);
    });

    it("doesn't take one connector's `allow` for another's", async () => {
      const mail = new ScriptedConnector("mail", [tool("search")]);
      const tracker = new ScriptedConnector("tracker", [tool("search"), tool("delete_all")]);
      const answers = [callAnswer(call("d-1", "delete_all", {})), textAnswer("Done")];
      const lists: Lists = { mail: { allow: ["search", "delete_all"], approve: [] } };
      const { model } = await runOf([mail, tracker], lists, answers);

      expect(offeredIn(model)).toEqual(["search"]);
      expect([...mail.calls, ...tracker.calls]).toEqual([]);
    });
  });

  describe("an empty, a missing and an absent `allow`", () => {
    it("offers and calls nothing with an empty `allow`", async () => {
      const mail = new ScriptedConnector("mail", [tool("search"), tool("delete_all")]);
      const answers = [callAnswer(call("s-1", "search", {})), textAnswer("Done")];
      const { model, runs } = await runOf([mail], { mail: { allow: [], approve: [] } }, answers);

      expect(model.requests[0]?.tools).toEqual([]);
      expect(mail.calls).toEqual([]);
      await expectNothingLogged(runs);
    });

    it("offers and calls every tool the server lists when the file has no `allow`", async () => {
      const mail = new ScriptedConnector("mail", [tool("search"), tool("delete_all")]);
      const answers = [callAnswer(call("d-1", "delete_all", {})), textAnswer("Done")];
      const { model } = await runOf([mail], { mail: { approve: [] } }, answers);

      expect(offeredIn(model)).toEqual(["search", "delete_all"]);
      expect(mail.calls).toEqual([{ name: "delete_all", args: {} }]);
    });

    // A run's definitions are plain objects, so an id that is also a key of
    // every object mustn't find a list there.
    it.each(["toString", "constructor", "hasOwnProperty", "__proto__"])(
      "offers and calls nothing of a connector named %s that the definitions have no file for",
      async (id) => {
        const server = new ScriptedConnector(id, [tool("search")]);
        const answers = [callAnswer(call("s-1", "search", {})), textAnswer("Done")];
        const { model, runs } = await runOf([server], {}, answers);

        expect(model.requests[0]?.tools).toEqual([]);
        expect(server.calls).toEqual([]);
        await expectNothingLogged(runs);
      },
    );

    it("keeps the `allow` of a connector named __proto__ through the run's kept definitions", async () => {
      const server = new ScriptedConnector("__proto__", [tool("search"), tool("delete_all")]);
      const lists: Lists = Object.fromEntries([["__proto__", { allow: ["search"], approve: [] }]]);
      const answers = [callAnswer(call("d-1", "delete_all", {})), textAnswer("Done")];
      const { model } = await runOf([server], lists, answers);

      expect(offeredIn(model)).toEqual(["search"]);
      expect(server.calls).toEqual([]);
    });
  });
});
