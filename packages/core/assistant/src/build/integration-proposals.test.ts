// HAL-1309's Done when, tests 1 and 3: an integration the Build chat writes
// is changes to review like any other file, and the risk on its sheet is
// the one the run-time check reads. Each test plays one scripted turn: the
// person's request, then the tool calls a model would make for it.

import { checkToolCall, readIntegrationSheets, readToolListing } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { chatTools } from "../testing/call-tool.test-helper.ts";
import {
  notesCode,
  notesConnector,
  notesPaths,
  notesSheet,
} from "../testing/notes-integration.test-helper.ts";
import { testWorkspace } from "../testing/test-workspace.test-helper.ts";

const saved = { "workspace.yaml": "id: acme\nname: Acme\n" };
const paths = Object.values(notesPaths);

/** The person's message that starts the turn; the calls below are what a model answers it with. */
const request =
  "Build an integration for my notes service at api.notes.example.com. I have an API key.";

/** The scripted turn: the three files proposed, then `validate`. */
async function buildNotes(workspace: ReturnType<typeof testWorkspace>): Promise<string> {
  const call = chatTools(workspace, [request]);
  await call("propose_file", { path: notesPaths.sheet, content: notesSheet, why: request });
  await call("propose_file", { path: notesPaths.code, content: notesCode, why: request });
  await call("propose_file", { path: notesPaths.connector, content: notesConnector, why: request });
  return call("validate");
}

/** The offered tool for `name` as a run sees it: the sheet's declaration over what the code lists. */
async function offeredFromSheet(workspace: ReturnType<typeof testWorkspace>, name: string) {
  const [notes] = await readIntegrationSheets(workspace.store);
  const declared = notes?.sheet.tools.find((tool) => tool.name === name);
  if (declared === undefined) throw new Error(`the sheet doesn't declare ${name}`);
  const parameters = { type: "object", additionalProperties: true };
  const { tools } = readToolListing({
    source: "notes",
    // The code's listing says `read`; the sheet the person accepted decides.
    listed: [{ name, description: declared.description, parameters, risk: "read" }],
    declared: [{ name, description: declared.description, parameters, risk: declared.risk }],
    otherNames: new Set(),
    trust: null,
  });
  const [offered] = tools;
  if (offered === undefined) throw new Error(`${name} isn't offered`);
  return offered;
}

verifies("assistant.build.integration-proposals", () => {
  describe("test 1: the sheet, the code and the connector are changes to review", () => {
    it("writes all three as changes to review, valid, and none reaches a run before Accept", async () => {
      const workspace = testWorkspace(saved);
      expect(await buildNotes(workspace)).toBe("No problems.");

      for (const path of paths) {
        expect((await workspace.review.changesIn(path))?.baseline).toBeNull();
      }
      const { source } = await workspace.review.tryItSource();
      for (const path of paths) {
        expect(await source.read(path)).toBeNull();
      }
    });

    it("leaves the workspace as it was after Reject", async () => {
      const workspace = testWorkspace(saved);
      await buildNotes(workspace);
      const before = new Map(Object.entries(saved));

      await workspace.review.reject({ kind: "chat", chatId: "c1" });
      expect(workspace.store.files).toEqual(before);
      for (const path of paths) {
        expect(await workspace.review.changesIn(path)).toBeNull();
      }
    });

    it("keeps the files after Accept, with nothing left to review", async () => {
      const workspace = testWorkspace(saved);
      await buildNotes(workspace);

      await workspace.review.accept({ kind: "chat", chatId: "c1" });
      expect(workspace.store.files.get(notesPaths.sheet)).toBe(notesSheet);
      expect(await workspace.review.itemsWithChangesToReview()).toEqual([]);
      const { source } = await workspace.review.tryItSource();
      expect(await source.read(notesPaths.code)).toBe(notesCode);
    });
  });

  describe("test 3: a tool's risk on the sheet is the one the run-time check reads", () => {
    it("keeps add_note's write risk in the sheet and the code it proposes", async () => {
      const workspace = testWorkspace(saved);
      // `validate` compares the code's risk with the sheet's, so "No problems." means they agree.
      expect(await buildNotes(workspace)).toBe("No problems.");
      expect(await workspace.review.changesIn(notesPaths.sheet)).not.toBeNull();
      const [notes] = await readIntegrationSheets(workspace.store);
      expect(notes?.sheet.tools.map(({ name, risk }) => ({ name, risk }))).toEqual([
        { name: "search_notes", risk: "read" },
        { name: "add_note", risk: "write" },
      ]);
    });

    it("asks first for add_note after Accept, and runs search_notes", async () => {
      const workspace = testWorkspace(saved);
      await buildNotes(workspace);
      await workspace.review.accept({ kind: "chat", chatId: "c1" });

      expect(checkToolCall(await offeredFromSheet(workspace, "add_note"), {})).toEqual({
        kind: "ask",
      });
      expect(checkToolCall(await offeredFromSheet(workspace, "search_notes"), {})).toEqual({
        kind: "run",
      });
    });

    it("asks first for a send tool too", async () => {
      const workspace = testWorkspace(saved);
      const call = chatTools(workspace, [request]);
      const sending = notesSheet.replace(
        "    risk: write\n",
        "    risk: send\n    noun: { one: note, many: notes }\n",
      );
      await call("propose_file", { path: notesPaths.sheet, content: sending, why: request });
      await workspace.review.accept({ kind: "chat", chatId: "c1" });
      expect(checkToolCall(await offeredFromSheet(workspace, "add_note"), {})).toEqual({
        kind: "ask",
      });
    });
  });
});
