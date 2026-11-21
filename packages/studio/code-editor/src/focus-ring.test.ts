// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, createCodeEditorForTest } from "./test-support.ts";

/** Every CSS rule the editor's theme put in the page, as text. */
function pageCss(): string {
  return [...document.querySelectorAll("style")].map((style) => style.textContent).join("\n");
}

describe("focus ring", () => {
  afterEach(() => {
    cleanup();
  });

  verifies("code-editor.focus-ring", () => {
    it("draws the inset ring as a shadow over a transparent outline", () => {
      const editor = createCodeEditorForTest("");
      const css = pageCss();
      expect(css).toMatch(/\.cm-focused\s*\{[^}]*outline:\s*2px solid transparent/);
      expect(css).toMatch(/\.cm-focused\s*\{[^}]*outline-offset:\s*-2px/);
      expect(css).toMatch(/\.cm-focused\s*\{[^}]*box-shadow:\s*var\(--focus-ring-inset\)/);
      editor.destroy();
    });

    it("draws a Highlight ring inside the editor in high contrast", () => {
      const editor = createCodeEditorForTest("");
      expect(pageCss()).toMatch(
        /@media \(forced-colors: active\)\s*\{\s*\.\S+ \.cm-scroller:focus-within\s*\{outline: 2px solid Highlight; outline-offset: -2px;\}/,
      );
      editor.destroy();
    });
  });
});
