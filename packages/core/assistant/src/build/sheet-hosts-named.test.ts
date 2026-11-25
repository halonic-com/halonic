// The "added by the assistant" mark reads what the person named the way the
// Build chat's gate does (HAL-18397, Done when test 5): a host the person
// typed in the chat isn't marked when they accept the sheet that adds it.

import { assistantAddedIn } from "@halonicjs/app";
import { describe, expect, it } from "vitest";
import { chatTools } from "../testing/call-tool.test-helper.ts";
import { notesPaths, notesSheet } from "../testing/notes-integration.test-helper.ts";
import { testWorkspace } from "../testing/test-workspace.test-helper.ts";
import { sheetHostsNamedIn } from "./sheet-hosts-named.ts";

describe("sheetHostsNamedIn", () => {
  it("matches a sheet's host as the gate does: normalised, exact, no subdomains", () => {
    const named = sheetHostsNamedIn(["My notes are at https://API.Notes.Example.com:443/v1."]);

    expect(named("api.notes.example.com")).toBe(true);
    expect(named("api.notes.example.com:443")).toBe(true);
    expect(named("api.notes.example.com:8443")).toBe(false);
    expect(named("notes.example.com")).toBe(false);
    expect(named("cdn.api.notes.example.com")).toBe(false);
  });

  it("names nothing from no messages", () => {
    expect(sheetHostsNamedIn([])("api.notes.example.com")).toBe(false);
  });

  it("leaves a host the person typed unmarked when they accept the new sheet that adds it", async () => {
    const said = [
      "Build an integration for my notes service at api.notes.example.com. I have an API key.",
    ];
    const workspace = testWorkspace({ "workspace.yaml": "id: acme\nname: Acme\n" });
    workspace.review.readHostsNamedWith(async () => sheetHostsNamedIn(said));
    const call = chatTools(workspace, said);
    const proposed = await call("propose_file", {
      path: notesPaths.sheet,
      content: notesSheet,
      why: said[0],
    });
    expect(proposed).not.toMatch(/^Couldn't/u);

    await workspace.review.accept({ kind: "chat", chatId: "c1" });

    const marks = await workspace.review.assistantAddedHosts();
    expect([...assistantAddedIn(marks, "integrations/notes", ["api.notes.example.com"])]).toEqual(
      [],
    );
    // The same sheet, accepted with nothing named, is marked: the test above isn't empty by accident.
    const unnamed = testWorkspace({ "workspace.yaml": "id: acme\nname: Acme\n" });
    await chatTools(unnamed, said)("propose_file", {
      path: notesPaths.sheet,
      content: notesSheet,
      why: said[0],
    });
    await unnamed.review.accept({ kind: "chat", chatId: "c1" });
    const unnamedMarks = await unnamed.review.assistantAddedHosts();
    expect([...(unnamedMarks.get("integrations/notes") ?? [])]).toEqual(["api.notes.example.com"]);
  });
});
