// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { fakeClipboard } from "../test/clipboard.ts";
import { copyText } from "./copy-text.ts";

verifies("kit.copy-button", () => {
  it("uses the clipboard API when it's there", async () => {
    const clipboard = fakeClipboard("works", "works");
    expect(await copyText("halonic")).toBe(true);
    expect(clipboard.copied).toEqual(["halonic"]);
  });

  it("falls back to selecting the text when there's no secure context", async () => {
    const clipboard = fakeClipboard("missing", "works");
    expect(await copyText("halonic")).toBe(true);
    expect(clipboard.copied).toEqual(["halonic"]);
  });

  it("falls back when the clipboard API refuses", async () => {
    const clipboard = fakeClipboard("refuses", "works");
    expect(await copyText("halonic")).toBe(true);
    expect(clipboard.copied).toEqual(["halonic"]);
  });

  it("says so when both ways fail", async () => {
    const clipboard = fakeClipboard("refuses", "refuses");
    expect(await copyText("halonic")).toBe(false);
    expect(clipboard.copied).toEqual([]);
  });

  it("says so when the browser has neither way", async () => {
    fakeClipboard("missing", "missing");
    expect(await copyText("halonic")).toBe(false);
  });

  it("leaves no text box behind and gives the focus back", async () => {
    fakeClipboard("missing", "works");
    const button = document.createElement("button");
    document.body.append(button);
    button.focus();

    await copyText("halonic");

    expect(document.querySelector("textarea")).toBeNull();
    expect(document.activeElement).toBe(button);
    button.remove();
  });
});
