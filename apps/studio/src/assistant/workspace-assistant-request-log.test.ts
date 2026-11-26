import type { AgentHostTransport } from "@halonicjs/adapter-agent-host-client";
import { fenceStart, type RequestLogLine } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { engineRequestLogs } from "./chat-request-log.ts";
import { answered, device, setup } from "./workspace-assistant.test-helper.ts";

/** A local integration, `notes`, and the connector in the support hub that runs it. */
const notes = {
  "integrations/notes/integration.yaml": [
    "id: notes",
    "version: 1.0.0",
    "kit: 1",
    "provides: [connector]",
    "hosts: [api.notes.example.com]",
    "tools:",
    "  - name: search_notes",
    "    description: Searches the notes.",
    "    arguments: {}",
    "    risk: read",
    "    untrusted: true",
  ].join("\n"),
  "hubs/support/library/connectors/notes.connector.yaml":
    "id: notes\nname: Notes\ntransport:\n  integration:\n    folder: notes\n",
  "hubs/support/library/connectors/mail.connector.yaml":
    "id: mail\nname: Mail\ntransport:\n  http:\n    url: https://mail.example.com/mcp\n",
};

const line: RequestLogLine = {
  type: "request",
  at: "2026-11-26T08:00:00.000Z",
  method: "GET",
  host: "api.notes.example.com",
  path: "/v1/notes/{…}",
  status: 404,
  durationMs: 30,
  outcome: "ok",
};

/** The tools each model turn was offered, by name. */
const offered = (requests: { tools?: { name: string }[] }[]) =>
  requests.map((request) => (request.tools ?? []).map((tool) => tool.name));

/** A chat about the connector `id` in the support hub, answered once. */
async function chatAbout(id: string | undefined, options: Parameters<typeof setup>[0] = {}) {
  const read: string[] = [];
  const requestLogs = async (integration: string) => {
    read.push(integration);
    return [line];
  };
  const { assistant, turnRequests } = setup({ files: notes, requestLogs, ...options });
  const about = id === undefined ? undefined : ({ kind: "connector", hub: "support", id } as const);
  const chat = await assistant.newChat("build", about);
  await assistant.answer({ chatId: chat.id, message: "It stopped working." });
  return { offered: offered(turnRequests), read };
}

verifies("assistant.build.read-request-log", () => {
  it("offers read_request_log only in a trusted chat about a local integration", async () => {
    expect((await chatAbout("notes")).offered[0]).toContain("read_request_log");
    expect((await chatAbout("mail")).offered[0]).not.toContain("read_request_log");
    expect((await chatAbout(undefined)).offered[0]).not.toContain("read_request_log");
    const untrusted = await chatAbout("notes", { trusted: false, settings: device });
    expect(untrusted.offered.flat()).not.toContain("read_request_log");
  });

  it("reads the log of the integration the chat's connector runs, by its sheet's id", async () => {
    const call = { id: "r1", name: "read_request_log", arguments: { integration: "notes" } };
    const { read } = await chatAbout("notes", { turns: [answered("", [call])] });
    expect(read).toEqual(["notes"]);
  });

  it("reads the line the engine kept through the agent host, inside the fence", async () => {
    const asked: unknown[] = [];
    const transport = {
      request: async (route: string, body: unknown) => {
        asked.push({ route, body });
        return { status: 200, body: { lines: [line] } };
      },
    } as unknown as AgentHostTransport;
    const call = { id: "r1", name: "read_request_log", arguments: { integration: "notes" } };
    const { assistant, turnRequests } = setup({
      files: notes,
      requestLogs: engineRequestLogs(transport, "/work/acme"),
      turns: [answered("", [call])],
    });
    const chat = await assistant.newChat("build", {
      kind: "connector",
      hub: "support",
      id: "notes",
    });
    await assistant.answer({ chatId: chat.id, message: "It stopped working." });

    expect(asked).toEqual([
      {
        route: "POST /v1/integration-logs/read",
        body: { location: "/work/acme", integration: "notes" },
      },
    ]);
    const result = turnRequests[1]?.messages.find((message) => message.role === "tool");
    const [outside = "", inside = ""] = (result?.content ?? "").split(fenceStart);
    expect(inside).toContain("api.notes.example.com/v1/notes/{…}: status 404");
    expect(outside).not.toContain("/v1/notes/{…}");
  });
});
