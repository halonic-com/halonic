// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { languageFor } from "./language.ts";
import { cleanup, createCodeEditorForTest } from "./test-support.ts";

afterEach(cleanup);

describe("language and read-only", () => {
  verifies("code-editor.language-and-read-only", () => {
    it("chooses the language from the file name", () => {
      expect(languageFor("hubs/p/hub.yaml")).toBe("yaml");
      expect(languageFor("x.YML")).toBe("yaml");
      expect(languageFor("skills/tone.md")).toBe("markdown");
      expect(languageFor("notes.txt")).toBe("plain");
      expect(languageFor("dir.md/readme")).toBe("plain");
    });

    it("refuses edits while read-only and takes them again after", () => {
      const editor = createCodeEditorForTest("keep", { readOnly: true });
      editor.view.dispatch({ selection: { anchor: 4 } });
      editor.pressKey("Backspace");
      editor.pressKey("Tab");
      expect(editor.text()).toBe("keep");
      editor.setReadOnly(false);
      editor.pressKey("Backspace");
      expect(editor.text()).toBe("kee");
      editor.destroy();
    });

    it("names the text area after the file", () => {
      const editor = createCodeEditorForTest("", { label: "models.yaml" });
      expect(editor.view.contentDOM.getAttribute("aria-label")).toBe("models.yaml");
      editor.destroy();
    });
  });
});
