// @vitest-environment jsdom

import { OpenExternalProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import { PluginResult } from "./plugin-result.tsx";

afterEach(unmountAll);

verifies("plugins.plugin-text", () => {
  describe("PluginResult", () => {
    it("shows a text answer as it is, with its line breaks", () => {
      const view = render(<PluginResult show="text" text={"**Sunny**\n<b>21</b>"} />);
      expect(view.textContent).toBe("**Sunny**\n<b>21</b>");
      expect(view.querySelector("strong, b")).toBeNull();
    });

    it("shows HTML in a Markdown answer as its own characters", () => {
      const source = "<b>bold</b> <script>alert(1)</script>";
      const view = render(<PluginResult show="markdown" text={source} />);
      expect(view.textContent).toBe(source);
      expect(view.querySelector("b, script")).toBeNull();
    });

    it("keeps a link to script as text", () => {
      const view = render(<PluginResult show="markdown" text="[link](javascript:alert(1))" />);
      expect(view.textContent).toBe("[link](javascript:alert(1))");
      expect(view.querySelector("a")).toBeNull();
    });

    it("opens a web link through ExternalLink and shows its address on hover", () => {
      const openExternal = vi.fn(async () => {});
      const view = render(
        <OpenExternalProvider openExternal={openExternal}>
          <PluginResult show="markdown" text="See [the map](https://example.com/map)" />
        </OpenExternalProvider>,
      );
      const link = view.querySelector("a");
      expect(link?.getAttribute("href")).toBe("https://example.com/map");
      expect(link?.closest("[title]")?.getAttribute("title")).toBe("https://example.com/map");
      act(() => link?.click());
      expect(openExternal).toHaveBeenCalledWith("https://example.com/map");
    });

    it("draws Markdown with headings as bold lines, not page headings", () => {
      const source = "# Today\n- **Sunny**\n- *calm*\n\n1. `x`\n\n> quoted\n\n```\ncode\n```";
      const view = render(<PluginResult show="markdown" text={source} />);
      expect(view.querySelector("h1, h2, h3, h4, h5, h6")).toBeNull();
      expect(view.querySelector("p")?.textContent).toBe("Today");
      expect([...view.querySelectorAll("ul li")].map((item) => item.textContent)).toEqual([
        "Sunny",
        "calm",
      ]);
      expect(view.querySelector("ul strong")?.textContent).toBe("Sunny");
      expect(view.querySelector("ul em")?.textContent).toBe("calm");
      expect(view.querySelector("ol code")?.textContent).toBe("x");
      expect(view.querySelector("blockquote")?.textContent).toBe("quoted");
      expect(view.querySelector("pre")?.textContent).toBe("code");
    });

    it("draws a table answer as a table with a column for every key", () => {
      const source = '[{"day":"Mon","high":21},{"day":"Tue","rain":true}]';
      const view = render(<PluginResult show="table" text={source} />);
      const heads = [...view.querySelectorAll("th")].map((cell) => cell.textContent);
      expect(heads).toEqual(["day", "high", "rain"]);
      const rows = [...view.querySelectorAll("tbody tr")].map((row) =>
        [...row.querySelectorAll("td")].map((cell) => cell.textContent),
      );
      expect(rows).toEqual([
        ["Mon", "21", ""],
        ["Tue", "", "true"],
      ]);
    });

    it("shows a table answer that isn't a table as plain text", () => {
      const view = render(<PluginResult show="table" text="It's sunny" />);
      expect(view.querySelector("table")).toBeNull();
      expect(view.textContent).toBe("It's sunny");
    });
  });
});
