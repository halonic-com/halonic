// HAL-19174's Done when: a Build chat about the `notes` integration counts
// its accepted fixes, settles each one by the integration's next failed call,
// and after two failed fixes stops changing the folder and reading its log.
// The integration the chat is about is read from the connector file, as the
// Studio reads it, so a test can show that a changed file resets nothing.

import type { FailedCall, RequestLogLine } from "@halonicjs/app";
import type { SavedFixAttempts } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  notesCode,
  notesConnector,
  notesPaths,
  notesSheet,
} from "../testing/notes-integration.test-helper.ts";
import { digest, testWorkspace } from "../testing/test-workspace.test-helper.ts";
import { buildChatTools } from "./build-tools.ts";
import { FixAttempts, fixStopTexts } from "./fix-attempts.ts";
import { toolTexts } from "./tool-texts.ts";

const said = "My notes integration for api.notes.example.com stopped working. Can you fix it?";

/** The `notes` workspace, its request log and a clock that moves one second per reading. */
function notesWorkspace() {
  const workspace = testWorkspace({
    "workspace.yaml": "id: acme\nname: Acme\n",
    [notesPaths.sheet]: notesSheet,
    [notesPaths.code]: notesCode,
    [notesPaths.connector]: notesConnector,
  });
  const log: RequestLogLine[] = [];
  let second = 0;
  const now = () => new Date(Date.UTC(2026, 10, 26, 8, 0, second++));
  /** One call to `search_notes`: its request got `status`, then it failed as `failure` says. */
  const callFails = (status: number, failure: Omit<FailedCall, "tool"> = {}) => {
    const at = now().toISOString();
    const host = "api.notes.example.com";
    log.push({
      type: "request",
      at,
      method: "GET",
      host,
      path: "/v1/notes",
      status,
      durationMs: 9,
      outcome: "ok",
    });
    log.push({ type: "failure", at, tool: "search_notes", ...failure });
  };
  return { ...workspace, log, now, callFails };
}

type NotesWorkspace = ReturnType<typeof notesWorkspace>;

/** A Build chat about `notes` over `workspace`, with its fix attempts kept in `saved`. */
function notesChat(workspace: NotesWorkspace, chatId = "c1") {
  const saved: { fixes?: SavedFixAttempts } = {};
  const fixes = new FixAttempts({
    chatId,
    kept: {
      read: async () => saved.fixes,
      write: async (kept) => {
        saved.fixes = kept;
      },
    },
    integration: async () => {
      const connector = (await workspace.store.read(notesPaths.connector)) ?? "";
      const folder = /folder: (\S+)/u.exec(connector)?.[1];
      return folder === undefined ? undefined : { id: "notes", folder: `integrations/${folder}` };
    },
    lines: async () => workspace.log,
    now: workspace.now,
  });
  const tools = buildChatTools({
    chatId,
    files: workspace.store,
    review: workspace.review,
    isTrusted: () => true,
    digest,
    personMessages: async () => [said],
    requestLog: { integration: async () => "notes", lines: async () => workspace.log },
    fixes,
  });
  let calls = 0;
  const call = async (name: string, args: Record<string, unknown>) => {
    const tool = tools.find((each) => each.definition.name === name);
    calls += 1;
    const cardId = `${chatId}-call-${calls}`;
    return { cardId, result: (await tool?.call({ id: cardId, name, arguments: args })) ?? "" };
  };
  /** The model proposes new code; the person accepts it or rejects it, as the Studio's card does. */
  const propose = async (decision: "accept" | "reject", path = notesPaths.code) => {
    await call("read_file", { path });
    const content = `${notesCode}// fix ${calls}\n`;
    const { cardId } = await call("propose_file", { path, content, why: "Fix the search." });
    const target = { kind: "card", card: { chatId, cardId } } as const;
    const outcome = await workspace.review[decision](target);
    if (outcome.status === "done") await fixes.reviewed(outcome.step);
  };
  return { fixes, call, propose, saved };
}

/** Two accepted fixes, each followed by a failed call. */
async function twoFailedFixes(workspace: NotesWorkspace, chat: ReturnType<typeof notesChat>) {
  for (const _ of [1, 2]) {
    await chat.propose("accept");
    workspace.callFails(500, { kind: "internal" });
  }
  expect((await chat.fixes.count())?.failed).toBe(2);
}

const stop = fixStopTexts.result("notes");

verifies("assistant.build.fix-attempts", () => {
  describe("counting", () => {
    it("test 1: an accepted fix followed by a failed call is one failed attempt", async () => {
      const workspace = notesWorkspace();
      const chat = notesChat(workspace);
      await chat.propose("accept");
      workspace.callFails(500, { kind: "internal" });

      expect(await chat.fixes.count()).toEqual({
        integration: "notes",
        folder: "integrations/notes",
        failed: 1,
      });
    });

    it("test 2: a 404, then after a fix a changed reply, is a failed attempt", async () => {
      const workspace = notesWorkspace();
      const chat = notesChat(workspace);
      workspace.callFails(404, { kind: "not_found" });
      await chat.propose("accept");
      expect((await chat.fixes.count())?.failed).toBe(0);

      workspace.callFails(200, { kind: "unavailable", fields: ["fulfillment"] });
      expect((await chat.fixes.count())?.failed).toBe(1);
    });

    it("test 3: a 401 or a 429 after a fix doesn't count", async () => {
      const workspace = notesWorkspace();
      const chat = notesChat(workspace);
      await chat.propose("accept");
      workspace.callFails(401);
      workspace.callFails(429);
      workspace.callFails(200, { kind: "unauthenticated" });
      workspace.callFails(200, { kind: "limit_reached" });

      const fixes = await chat.fixes.count();
      expect(fixes?.failed).toBe(0);
      expect(fixes?.pendingSince).toBeDefined();
    });

    it("test 4: with no call after the fix, the attempt stays pending", async () => {
      const workspace = notesWorkspace();
      const chat = notesChat(workspace);
      await chat.propose("accept");

      const fixes = await chat.fixes.count();
      expect(fixes?.failed).toBe(0);
      expect(fixes?.pendingSince).toBe("2026-11-26T08:00:00.000Z");
    });

    it("test 5: a rejected proposal doesn't count", async () => {
      const workspace = notesWorkspace();
      const chat = notesChat(workspace);
      await chat.propose("reject");
      workspace.callFails(500, { kind: "internal" });

      expect(await chat.fixes.count()).toBeUndefined();
    });
  });

  describe("stopping", () => {
    it("test 6: after two failed fixes, the folder's writes and its log answer the stop result", async () => {
      const workspace = notesWorkspace();
      const chat = notesChat(workspace);
      await twoFailedFixes(workspace, chat);
      const code = await workspace.store.read(notesPaths.code);
      const path = notesPaths.code;

      const write = { path, content: "export default {};\n", why: "Try again." };
      expect((await chat.call("propose_file", write)).result).toBe(stop);
      expect((await chat.call("propose_delete", { path, why: "Start over." })).result).toBe(stop);
      expect((await chat.call("read_request_log", { integration: "notes" })).result).toBe(stop);
      expect(await workspace.store.read(notesPaths.code)).toBe(code);
      expect(await workspace.review.itemsWithChangesToReview()).toEqual([]);
      expect(stop).toContain(
        "I've tried two fixes and notes still fails, so I'll stop here instead of rewriting it again. You can change the code yourself, or start a new chat to try another way.",
      );
    });

    it("test 7: a file outside that folder can still be proposed", async () => {
      const workspace = notesWorkspace();
      const chat = notesChat(workspace);
      await twoFailedFixes(workspace, chat);

      const write = { path: "README.md", content: "# Acme\n", why: "Note the stop." };
      expect((await chat.call("propose_file", write)).result).toBe(toolTexts.changed("README.md"));
      const sibling = { ...write, path: "integrations/notes-two/README.md" };
      expect((await chat.call("propose_file", sibling)).result).toBe(
        toolTexts.changed(sibling.path),
      );
    });

    it("test 8: a new chat starts at zero", async () => {
      const workspace = notesWorkspace();
      await twoFailedFixes(workspace, notesChat(workspace));
      const fresh = notesChat(workspace, "c2");

      expect(await fresh.fixes.count()).toBeUndefined();
      await fresh.call("read_file", { path: notesPaths.code });
      const write = { path: notesPaths.code, content: notesCode, why: "Another way." };
      expect((await fresh.call("propose_file", write)).result).toBe(
        toolTexts.changed(notesPaths.code),
      );
    });

    it("test 9: a workspace file can't reset the count", async () => {
      const workspace = notesWorkspace();
      const chat = notesChat(workspace);
      await twoFailedFixes(workspace, chat);
      const moved = notesConnector.replace("folder: notes", "folder: notes-two");
      workspace.store.files.set(notesPaths.connector, moved);
      workspace.store.files.set("integrations/notes/fixes.json", '{"failed":0}\n');
      workspace.store.files.set(".halonic/fixes.json", '{"failed":0}\n');

      expect(chat.saved.fixes?.failed).toBe(2);
      const write = { path: notesPaths.code, content: notesCode, why: "Try again." };
      expect((await chat.call("propose_file", write)).result).toBe(stop);
    });
  });
});
