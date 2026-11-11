import { describe, expect, it, vi } from "vitest";
import { OpenWorkspaces } from "./open-workspaces.ts";

function locations(open: OpenWorkspaces<string>): readonly string[] {
  return open.all.map((slot) => slot.location);
}

function openThree(): OpenWorkspaces<string> {
  const open = new OpenWorkspaces<string>();
  open.add("/acme", "Acme");
  open.add("/beta", "Beta");
  open.add("/gamma", "Gamma");
  return open;
}

describe("OpenWorkspaces", () => {
  it("starts on the No workspace slot", () => {
    const open = new OpenWorkspaces<string>();

    expect(open.all).toEqual([]);
    expect(open.shown).toBeUndefined();
  });

  describe("workspace.switcher.open-beside", () => {
    it("puts the first workspace in the No workspace slot and shows it", () => {
      const open = new OpenWorkspaces<string>();
      open.add("/acme", "Acme");

      expect(locations(open)).toEqual(["/acme"]);
      expect(open.shown?.value).toBe("Acme");
    });

    it("adds the next beside it and shows that one", () => {
      const open = new OpenWorkspaces<string>();
      open.add("/acme", "Acme");
      open.add("/beta", "Beta");

      expect(locations(open)).toEqual(["/acme", "/beta"]);
      expect(open.shown?.location).toBe("/beta");
    });

    it("refuses to open a folder twice, so the caller shows it instead", () => {
      const open = openThree();

      expect(() => open.add("/acme", "Acme again")).toThrow(/already open/);
      open.show("/acme");
      expect(locations(open)).toEqual(["/acme", "/beta", "/gamma"]);
      expect(open.shown?.value).toBe("Acme");
    });
  });

  describe("workspace.switcher.ctrl-number-keys", () => {
    it("shows the workspace at that position", () => {
      const open = openThree();

      expect(open.showAt(1)).toBe(true);
      expect(open.shown?.location).toBe("/acme");
    });

    it("does nothing past the last one", () => {
      const open = openThree();

      expect(open.showAt(9)).toBe(false);
      expect(open.shown?.location).toBe("/gamma");
    });
  });

  describe("workspace.switcher.close-keeps-a-slot", () => {
    it("shows the workspace at the closed one's position", () => {
      const open = openThree();
      open.show("/acme");

      expect(open.close("/acme")?.value).toBe("Acme");
      expect(locations(open)).toEqual(["/beta", "/gamma"]);
      expect(open.shown?.location).toBe("/beta");
    });

    it("shows the last one when the last was closed", () => {
      const open = openThree();

      open.close("/gamma");
      expect(open.shown?.location).toBe("/beta");
    });

    it("keeps the shown one when another closes", () => {
      const open = openThree();
      open.show("/beta");

      open.close("/gamma");
      expect(open.shown?.location).toBe("/beta");
    });

    it("goes back to No workspace when none is left", () => {
      const open = new OpenWorkspaces<string>();
      open.add("/gamma", "Gamma");

      open.close("/gamma");
      expect(open.shown).toBeUndefined();
      expect(open.close("/gamma")).toBeUndefined();
    });
  });

  it("tells subscribers about each change until they stop", () => {
    const open = new OpenWorkspaces<string>();
    const listener = vi.fn();
    const stop = open.subscribe(listener);

    open.add("/acme", "Acme");
    open.close("/acme");
    stop();
    open.add("/beta", "Beta");

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("can't show a folder that isn't open", () => {
    expect(() => new OpenWorkspaces<string>().show("/nowhere")).toThrow(/No workspace is open/);
  });
});
