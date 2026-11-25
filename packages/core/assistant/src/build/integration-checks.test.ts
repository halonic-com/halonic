import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { chatTools } from "../testing/call-tool.test-helper.ts";
import { notesCode, notesPaths, notesSheet } from "../testing/notes-integration.test-helper.ts";
import { testWorkspace } from "../testing/test-workspace.test-helper.ts";

const saved = { "workspace.yaml": "id: acme\nname: Acme\n" };
/** The person's request: it names the sheet's host and sign-in (`assistant.build.named-hosts-secrets`). */
const request =
  "Build an integration for my notes service at api.notes.example.com. I have an API key.";

/** What `validate` says after the model proposes this sheet and code. */
async function validated(sheet: string, code: string): Promise<string> {
  const call = chatTools(testWorkspace(saved), [request]);
  await call("propose_file", { path: notesPaths.sheet, content: sheet, why: "Notes" });
  await call("propose_file", { path: notesPaths.code, content: code, why: "Notes" });
  return call("validate");
}

/** `notesCode` with one more line in `connect`, such as a call the kit doesn't allow. */
function codeWith(line: string): string {
  return notesCode.replace("    return {\n", `    ${line}\n    return {\n`);
}

verifies("assistant.build.validate-integrations", () => {
  it("finds no problem in an integration that keeps the rules", async () => {
    expect(await validated(notesSheet, notesCode)).toBe("No problems.");
  });

  it("reports a sheet that doesn't parse, as halonic validate does", async () => {
    // The person's own file: `propose_file` refuses a sheet that doesn't parse
    // (`assistant.build.named-hosts-secrets`), with the same problem.
    const sheet = notesSheet.replace("    untrusted: false\n", "");
    const workspace = testWorkspace({ ...saved, [notesPaths.sheet]: sheet });
    expect(await chatTools(workspace)("validate")).toMatch(
      /^error integrations\/notes\/integration\.yaml: [^\n]*untrusted/u,
    );
    expect(
      await chatTools(testWorkspace(saved), [request])("propose_file", {
        path: notesPaths.sheet,
        content: sheet,
        why: "Notes",
      }),
    ).toMatch(
      /^Couldn't change integrations\/notes\/integration\.yaml: it isn't valid \(line \d+: [^)]*untrusted/u,
    );
  });

  describe("the code against its sheet", () => {
    it("reports a tool whose risk in the code is lower than on the sheet", async () => {
      const code = notesCode.replace('risk: "write"', 'risk: "read"');
      expect(await validated(notesSheet, code)).toBe(
        `error ${notesPaths.code}: "add_note" has risk read in the code, but write on the sheet`,
      );
    });

    it("reports a tool whose untrusted differs or is missing", async () => {
      const code = notesCode.replace("untrusted: true,\n", "");
      expect(await validated(notesSheet, code)).toBe(
        `error ${notesPaths.code}: "search_notes": the code doesn't say for untrusted, but the sheet says true`,
      );
    });

    it("reports a tool only the sheet or only the code declares", async () => {
      const code = notesCode.replace('name: "add_note"', 'name: "add_notes"');
      expect((await validated(notesSheet, code)).split("\n")).toEqual([
        `error ${notesPaths.sheet}: the sheet declares the tool "add_note", but the code doesn't`,
        `error ${notesPaths.code}: the code declares the tool "add_notes", but the sheet doesn't`,
      ]);
    });
  });

  describe("the static rules on the code, as hints", () => {
    it.each([
      ["eval", 'eval("1");', "uses eval"],
      ["new Function", 'new Function("return 1");', "uses Function"],
      ["a dynamic import", 'await import("./more.js");', "uses a dynamic import()"],
      ["fetch", 'fetch("https://other.example.com");', "uses fetch; send requests through"],
      ["globalThis.fetch", 'globalThis.fetch("https://other.example.com");', "uses fetch"],
      ["a node: module", 'const fs = require("node:fs");', "uses a Node built-in module"],
      ["a Node module by its bare name", 'const net = require("net");', "uses a Node built-in"],
      ["process", "const key = process.env.KEY;", "uses Node's process"],
    ])("reports %s", async (_what, line, message) => {
      const result = await validated(notesSheet, codeWith(line));
      expect(result).toMatch(new RegExp(`^error ${notesPaths.code}: `, "u"));
      expect(result).toContain(message);
    });

    it("reports a static import of a Node module", async () => {
      const code = `import { readFile } from "node:fs/promises";\n${notesCode}`;
      expect(await validated(notesSheet, code)).toContain("uses a Node built-in module");
    });

    it("leaves the kit's host.http.fetch alone", async () => {
      expect(notesCode).toContain("host.http.fetch(");
      expect(await validated(notesSheet, notesCode)).toBe("No problems.");
    });
  });

  it("names nothing of an integration while the workspace is untrusted", async () => {
    const workspace = testWorkspace(
      { ...saved, [notesPaths.sheet]: "id: [\n", [notesPaths.code]: 'eval("1");\n' },
      false,
    );
    expect(await chatTools(workspace)("validate")).toBe("No problems.");
  });
});
