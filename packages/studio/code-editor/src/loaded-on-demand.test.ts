// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { openCodeEditor } from "./index.ts";
import { cleanup, stubLayout } from "./test-support.ts";

afterEach(cleanup);

describe("loaded on demand", () => {
  verifies("code-editor.loaded-on-demand", () => {
    it("holds no static import of CodeMirror or of the editor module in the entry point", () => {
      const source = readFileSync(join(import.meta.dirname, "index.ts"), "utf8");
      const staticImports = source
        .split("\n")
        .filter(
          (line) =>
            /^(import|export)\b.*\bfrom\b/.test(line) &&
            !/\btype\b/.test(line.split("from")[0] ?? ""),
        );
      expect(
        staticImports.filter((line) =>
          /codemirror|editor\.ts/.test(line.replace(/export type .*|import type .*/, "")),
        ),
      ).toEqual([]);
      expect(source).toContain('await import("./editor.ts")');
    });

    it("makes an editor that shows the text when a file is opened", async () => {
      stubLayout();
      const parent = document.createElement("div");
      document.body.append(parent);
      const editor = await openCodeEditor({
        parent,
        text: "name: x",
        language: "yaml",
        label: "hub.yaml",
      });
      expect(editor.text()).toBe("name: x");
      expect(parent.textContent).toContain("name: x");
      editor.destroy();
      parent.remove();
    });
  });
});
