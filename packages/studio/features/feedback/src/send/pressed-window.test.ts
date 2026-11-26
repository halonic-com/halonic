import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { pressedWindowOf, pressLine } from "./pressed-window.ts";

verifies("feedback.select-again", () => {
  it.each([
    ["Runs · Acme · Halonic", "Halonic", "Runs · Acme"],
    ["Home · Halonic", "Halonic", "Home"],
    ["Inbox · Acme · Halonic Inbox", "Halonic Inbox", "Inbox · Acme"],
    ["Messenger · Acme · Halonic Messenger", "Halonic Messenger", "Messenger · Acme"],
    ["Halonic", "Halonic", ""],
    ["Something else", "Halonic", "Something else"],
  ])("reads %j as the app %j and the window %j", (title, app, window) => {
    expect(pressedWindowOf(title)).toEqual({ app, window });
  });

  it("writes the line under the crop, leaving out what's empty", () => {
    const runs = pressedWindowOf("Runs · Acme · Halonic");
    expect(pressLine(runs, "20 × 10")).toBe("Halonic · Runs · Acme · 20 × 10");
    expect(pressLine(pressedWindowOf("Halonic"), "20 × 10")).toBe("Halonic · 20 × 10");
    expect(pressLine({ app: "", window: "" }, "20 × 10")).toBe("20 × 10");
  });
});
