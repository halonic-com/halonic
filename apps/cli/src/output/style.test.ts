import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { paintFor } from "./paint.ts";
import { decideStyle, type StyleInputs } from "./style.ts";

/** A Linux terminal with nothing set, changed by `overrides`. */
function inputs(overrides: Partial<StyleInputs> = {}): StyleInputs {
  return {
    env: { LANG: "en_US.UTF-8" },
    isTerminal: true,
    platform: "linux",
    noColor: false,
    json: false,
    ...overrides,
  };
}

const csi = "\u001b[";

verifies("cli.output-style", () => {
  it("turns colour and live lines on in a terminal, with the Unicode marks", () => {
    expect(decideStyle(inputs())).toEqual({ colour: true, live: true, unicode: true });
  });

  it("writes no escape code to a pipe", () => {
    const style = decideStyle(inputs({ isTerminal: false }));
    expect(style).toEqual({ colour: false, live: false, unicode: true });
    const paint = paintFor(style);
    expect([paint.mark("done"), paint.bold("acme"), paint.dim("0.4 s")]).toEqual([
      "✓",
      "acme",
      "0.4 s",
    ]);
  });

  it("lets NO_COLOR turn off colour only", () => {
    expect(decideStyle(inputs({ env: { NO_COLOR: "1" } }))).toEqual({
      colour: false,
      live: true,
      unicode: true,
    });
  });

  it("lets CI turn off live lines only", () => {
    expect(decideStyle(inputs({ env: { CI: "true" } }))).toMatchObject({
      colour: true,
      live: false,
    });
    expect(decideStyle(inputs({ env: { CI: "false" } })).live).toBe(true);
    expect(decideStyle(inputs({ env: { CI: "0" } })).live).toBe(true);
  });

  it("turns colour and live lines off for TERM=dumb, --no-color and --json", () => {
    for (const style of [
      decideStyle(inputs({ env: { TERM: "dumb" } })),
      decideStyle(inputs({ noColor: true })),
      decideStyle(inputs({ json: true })),
    ]) {
      expect(style).toMatchObject({ colour: false, live: false });
    }
  });

  it("lets FORCE_COLOR turn colour on, but never against the flags", () => {
    const piped = { isTerminal: false };
    expect(decideStyle(inputs({ ...piped, env: { FORCE_COLOR: "1" } })).colour).toBe(true);
    expect(decideStyle(inputs({ env: { FORCE_COLOR: "1", NO_COLOR: "1" } })).colour).toBe(true);
    expect(decideStyle(inputs({ env: { FORCE_COLOR: "0" } })).colour).toBe(false);
    expect(decideStyle(inputs({ env: { FORCE_COLOR: "1" }, noColor: true })).colour).toBe(false);
    expect(decideStyle(inputs({ ...piped, env: { FORCE_COLOR: "1" } })).live).toBe(false);
  });

  it("falls back to ok, x and ! when the stream isn't UTF-8", () => {
    const oldConsole = decideStyle(inputs({ platform: "win32", env: {} }));
    const latin1 = decideStyle(inputs({ env: { LANG: "en_US.ISO-8859-1" } }));
    for (const style of [oldConsole, latin1]) {
      expect(style.unicode).toBe(false);
      const paint = paintFor({ ...style, colour: false });
      expect([paint.mark("done"), paint.mark("failed"), paint.mark("needsYou")]).toEqual([
        "ok",
        "x",
        "!",
      ]);
    }
  });
});

describe("decideStyle", () => {
  it("counts Windows Terminal, VS Code and a redirected stream on Windows as UTF-8", () => {
    expect(decideStyle(inputs({ platform: "win32", env: { WT_SESSION: "1" } })).unicode).toBe(true);
    expect(
      decideStyle(inputs({ platform: "win32", env: { TERM_PROGRAM: "vscode" } })).unicode,
    ).toBe(true);
    expect(decideStyle(inputs({ platform: "win32", env: {}, isTerminal: false })).unicode).toBe(
      true,
    );
  });

  it("counts the C locale as UTF-8, because CI images set it and keep UTF-8 logs", () => {
    expect(decideStyle(inputs({ env: { LANG: "C" } })).unicode).toBe(true);
    expect(
      decideStyle(inputs({ env: { LC_ALL: "C.UTF-8", LANG: "de_DE.ISO-8859-1" } })).unicode,
    ).toBe(true);
  });
});

describe("paintFor", () => {
  it("colours the marks and ends each style with its own reset", () => {
    const paint = paintFor({ colour: true, live: true, unicode: true });
    expect(paint.mark("done")).toBe(`${csi}32m✓${csi}39m`);
    expect(paint.mark("failed")).toBe(`${csi}31m✕${csi}39m`);
    expect(paint.mark("needsYou")).toBe(`${csi}33m!${csi}39m`);
    expect(paint.mark("working")).toBe("◌");
    expect(paint.mark("separator")).toBe(`${csi}2m·${csi}22m`);
    expect(paint.bold("acme")).toBe(`${csi}1macme${csi}22m`);
    expect(paint.dim("")).toBe("");
  });

  it("writes plain stand-ins for the progress and separator marks without UTF-8", () => {
    const paint = paintFor({ colour: false, live: false, unicode: false });
    expect([paint.mark("working"), paint.mark("separator"), paint.mark("studioPath")]).toEqual([
      "..",
      "-",
      ">",
    ]);
  });
});
