import { MemoryChatSessions } from "@halonicjs/adapter-memory";
import { requestLogTexts } from "@halonicjs/assistant";
import type { ToolCall } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import type { RequestLogs } from "./chat-request-log.ts";
import { answered, setup } from "./workspace-assistant.test-helper.ts";

/**
 * A local integration, `notes`, in a folder named `Notes`, and the connector in the support hub
 * that runs it as `folder: notes`, as a file system that ignores case opens it.
 */
const notes = {
  "integrations/Notes/integration.yaml": [
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
};

const fixCode: ToolCall = {
  id: "call-1",
  name: "propose_file",
  arguments: {
    path: "integrations/Notes/backend/index.js",
    content: "export default { fixed: true };\n",
    why: "Fix the notes path.",
  },
};

/** A clock the test moves on. */
function clock() {
  let now = new Date("2026-11-26T09:00:00.000Z");
  return { now: () => now, set: (at: string) => (now = new Date(at)) };
}

/** A chat about `notes` whose fix the model proposed, and the store its chat is saved in. */
async function proposedFix(
  requestLogs: RequestLogs,
  turns = [answered("", [fixCode])],
  files: Record<string, string> = {},
) {
  const sessions = new MemoryChatSessions();
  const time = clock();
  const setUp = setup({
    files: { ...notes, ...files },
    requestLogs,
    sessions,
    now: time.now,
    turns,
  });
  const about = { kind: "connector", hub: "support", id: "notes" } as const;
  const chat = await setUp.assistant.newChat("build", about);
  await setUp.assistant.answer({ chatId: chat.id, message: "Search stopped working." });
  const fixes = async () => {
    await setUp.assistant.saved();
    return (await sessions.load("memory:acme", chat.id))?.fixes;
  };
  return { ...setUp, chat, time, fixes };
}

const noLines: RequestLogs = async () => [];

verifies("assistant.build.fix-attempts", () => {
  it("counts an Accept of the chat's fix to its integration's folder, kept with the chat", async () => {
    const { assistant, chat, fixes } = await proposedFix(noLines);
    expect(await fixes()).toBeUndefined();

    await assistant.accept({ kind: "card", card: { chatId: chat.id, cardId: "call-1" } });

    expect(await fixes()).toEqual({
      integration: "notes",
      folder: "integrations/Notes",
      failed: 0,
      pendingSince: "2026-11-26T09:00:00.000Z",
    });
  });

  it("counts nothing for an Undo of a part Accept, whose step has an Accept's shape", async () => {
    const path = "integrations/Notes/backend/index.js";
    const tenLines = (changed: Record<number, string> = {}) =>
      Array.from({ length: 10 }, (_, at) => `${changed[at + 1] ?? `line ${at + 1}`}\n`).join("");
    const read: ToolCall = { id: "read-1", name: "read_file", arguments: { path } };
    const twoParts: ToolCall = {
      ...fixCode,
      arguments: { path, content: tenLines({ 3: "fixed 3", 8: "fixed 8" }), why: "Fix two calls." },
    };
    const turns = [answered("", [read]), answered("", [twoParts])];
    const { assistant, time, fixes } = await proposedFix(noLines, turns, { [path]: tenLines() });
    const seen = (await assistant.changesIn(path))?.seen ?? "absent";
    const accepted = await assistant.accept({ kind: "part", path, part: 0, seen });
    if (accepted.status !== "done") throw new Error("The Accept didn't go through.");
    const afterAccept = await fixes();
    expect(afterAccept?.pendingSince).toBe("2026-11-26T09:00:00.000Z");

    time.set("2026-11-26T09:30:00.000Z");
    expect((await assistant.undo(accepted.step)).status).toBe("done");

    expect(await fixes()).toEqual(afterAccept);
  });

  it("answers fixed sentences, not the error, when the log can't be read", async () => {
    const secret = "Error: notes log at /profile/logs/notes.jsonl holds token-1234";
    let reading: RequestLogs = noLines;
    const readLog: ToolCall = {
      id: "r1",
      name: "read_request_log",
      arguments: { integration: "notes" },
    };
    const again: ToolCall = {
      ...fixCode,
      id: "call-2",
      arguments: { ...fixCode.arguments, content: "export default { again: true };\n" },
    };
    const turns = [
      answered("", [fixCode]),
      answered("Proposed."),
      answered("", [readLog, again]),
      answered("Done."),
    ];
    const { assistant, chat, turnRequests, fixes } = await proposedFix(
      (integration) => reading(integration),
      turns,
    );
    await assistant.accept({ kind: "card", card: { chatId: chat.id, cardId: "call-1" } });
    reading = async () => {
      throw new Error(secret);
    };
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await assistant.answer({ chatId: chat.id, message: "Still broken." });

    const results = (turnRequests.at(-1)?.messages ?? []).filter((each) => each.role === "tool");
    expect(results.map((each) => each.content)).toContain(requestLogTexts.unreadable("notes"));
    expect(results.map((each) => each.content).join("\n")).not.toContain("token-1234");
    expect(results.map((each) => each.content).join("\n")).not.toContain("Error:");
    // The read failed, so the attempt stays pending rather than counting the failure it hid.
    expect((await fixes())?.failed).toBe(0);
    logged.mockRestore();
  });
});
