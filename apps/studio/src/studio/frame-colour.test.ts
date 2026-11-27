// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import { appFrameColour, followFrameColour, hexOfColour } from "./frame-colour.ts";

/** The app frame's colour as the kit's stylesheet gives it, light or dark. */
function frameStyles(theme: "light" | "dark"): HTMLStyleElement {
  const style = document.createElement("style");
  style.textContent =
    theme === "light"
      ? ".bg-app-frame { background-color: rgb(244, 247, 250); }"
      : ".bg-app-frame { background-color: rgb(2, 6, 23); }";
  document.head.append(style);
  return style;
}

/** A shell that records each `set_frame_colour` it is sent. */
function recordingShell(answer: () => Promise<unknown> = async () => null) {
  const sent: unknown[] = [];
  const ipc = {
    invoke: (command: string, args?: unknown) => {
      if (command === "set_frame_colour") sent.push(args);
      return answer();
    },
  };
  return { ipc: ipc as never, sent };
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  document.head.replaceChildren();
  document.documentElement.removeAttribute("data-theme");
  vi.restoreAllMocks();
});

verifies("studio.window-title-bar-colour", () => {
  it("reads the colours the browser computes as #rrggbb", () => {
    expect(hexOfColour("rgb(244, 247, 250)")).toBe("#f4f7fa");
    expect(hexOfColour("rgb(244 247 250)")).toBe("#f4f7fa");
    expect(hexOfColour("rgba(2, 6, 23, 1)")).toBe("#020617");
    expect(hexOfColour("color(srgb 0.957 0.969 0.98)")).toBe("#f4f7fa");
    expect(hexOfColour("color(srgb 0.957 0.969 0.98 / 1)")).toBe("#f4f7fa");
    expect(hexOfColour("#F4F7FA")).toBe("#f4f7fa");
  });

  it("reads no colour from a see-through one or anything else", () => {
    expect(hexOfColour("rgba(0, 0, 0, 0)")).toBeUndefined();
    expect(hexOfColour("rgb(244 247 250 / 50%)")).toBeUndefined();
    expect(hexOfColour("color(srgb 1 1 1 / 0.5)")).toBeUndefined();
    expect(hexOfColour("rgb(300, 0, 0)")).toBeUndefined();
    expect(hexOfColour("")).toBeUndefined();
    expect(hexOfColour("transparent")).toBeUndefined();
    expect(hexOfColour("linear-gradient(red, blue)")).toBeUndefined();
  });

  it("gives the app frame colour Studio and a focused app share, light and dark", () => {
    const light = frameStyles("light");
    expect(appFrameColour(document)).toBe("#f4f7fa");
    light.remove();
    frameStyles("dark");
    expect(appFrameColour(document)).toBe("#020617");
    expect(document.body.children).toHaveLength(0);
  });

  it("sends the colour once at start, again after a theme switch, and not when it stayed", async () => {
    const { ipc, sent } = recordingShell();
    let colour = "#f4f7fa";
    const stop = followFrameColour(ipc, document, () => colour);
    expect(sent).toEqual([{ colour: "#f4f7fa" }]);

    colour = "#020617";
    document.documentElement.setAttribute("data-theme", "dark");
    await settled();
    document.documentElement.style.setProperty("--panel-opacity", "0.6");
    await settled();
    expect(sent).toEqual([{ colour: "#f4f7fa" }, { colour: "#020617" }]);

    stop();
    colour = "#ffffff";
    document.documentElement.setAttribute("data-theme", "light");
    await settled();
    expect(sent).toHaveLength(2);
  });

  it("sends nothing while the frame has no colour", () => {
    const { ipc, sent } = recordingShell();
    followFrameColour(ipc, document, () => undefined)();
    expect(sent).toEqual([]);
  });

  it("says in the console when the shell refuses the colour", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { ipc } = recordingShell(() => Promise.reject("failed"));
    followFrameColour(ipc, document, () => "#f4f7fa")();
    await settled();
    expect(logged).toHaveBeenCalledWith("The title bar didn't take the frame's colour:", "failed");
  });
});
