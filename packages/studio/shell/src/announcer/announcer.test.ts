import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { defineFeature } from "../feature.ts";
import { createShell } from "../shell.ts";
import { ShellError } from "../shell-error.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { MapTarget } from "../test-support/map-target.ts";
import { createAnnouncer, type LiveRegions } from "./announcer.ts";

/** Regions that record what they were asked to say, as `politeness:text`. */
function recordingRegions(said: string[], prefix = ""): LiveRegions {
  return {
    polite: { say: (text) => said.push(`${prefix}polite:${text}`) },
    assertive: { say: (text) => said.push(`${prefix}assertive:${text}`) },
  };
}

function setUp(windowFocused = true) {
  const timers = new FakeTimers();
  const announcer = createAnnouncer({ timers, windowFocused });
  const said: string[] = [];
  announcer.mountRegions(recordingRegions(said));
  return { timers, announcer, said };
}

verifies("shell.announcer", () => {
  it("reads an announcement on the next tick, politely by default", () => {
    const { timers, announcer, said } = setUp();
    announcer.announce("Saved.");
    announcer.announce("Run 43 failed.", "assertive");
    expect(said).toEqual([]);
    timers.advance(0);
    expect(said).toEqual(["polite:Saved.", "assertive:Run 43 failed."]);
  });

  it("reads the same text once within 2 s, and again after", () => {
    const { timers, announcer, said } = setUp();
    announcer.announce("Saved.");
    timers.advance(0);
    timers.advance(1000);
    announcer.announce("Saved.");
    timers.advance(999);
    announcer.announce("Saved.", "assertive");
    timers.advance(0);
    expect(said).toEqual(["polite:Saved."]);
    timers.advance(1);
    announcer.announce("Saved.");
    timers.advance(0);
    expect(said).toEqual(["polite:Saved.", "polite:Saved."]);
  });

  it("reads a text asked for politely and assertively together once, assertively", () => {
    const { timers, announcer, said } = setUp();
    announcer.announce("Run 43 failed.");
    announcer.announce("Run 43 failed.", "assertive");
    announcer.announce("Run 43 failed.");
    timers.advance(0);
    expect(said).toEqual(["assertive:Run 43 failed."]);
  });

  it("reads only the last state for a key, 2 s after its last change", () => {
    const { timers, announcer, said } = setUp();
    announcer.announceState("run:43", "Running.");
    timers.advance(500);
    announcer.announceState("run:43", "Needs you.");
    announcer.announceState("run:44", "Done.");
    timers.advance(500);
    announcer.announceState("run:43", "Running.");
    timers.advance(1999);
    expect(said).toEqual(["polite:Done."]);
    timers.advance(1);
    expect(said).toEqual(["polite:Done.", "polite:Running."]);
    expect(timers.pending).toBe(0);
  });

  it("holds an announcement until the window has focus", () => {
    const { timers, announcer, said } = setUp(false);
    announcer.announce("fin@acme.example is signed in.", "polite", { whenWindowFocused: true });
    announcer.announce("Saved.");
    timers.advance(5000);
    expect(said).toEqual(["polite:Saved."]);
    announcer.setWindowFocused(true);
    timers.advance(0);
    expect(said).toEqual(["polite:Saved.", "polite:fin@acme.example is signed in."]);
  });

  it("holds a state announcement for focus too", () => {
    const { timers, announcer, said } = setUp(false);
    announcer.announceState("google", "Signed in.", { whenWindowFocused: true });
    timers.advance(3000);
    expect(said).toEqual([]);
    announcer.setWindowFocused(false);
    timers.advance(0);
    announcer.setWindowFocused(true);
    timers.advance(0);
    expect(said).toEqual(["polite:Signed in."]);
  });

  it("reads into the topmost modal's regions, then falls back", () => {
    const { timers, announcer, said } = setUp();
    const releaseDialog = announcer.pushModalRegions(recordingRegions(said, "dialog:"));
    const releaseSheet = announcer.pushModalRegions(recordingRegions(said, "sheet:"));
    announcer.announce("Copied.");
    timers.advance(0);
    releaseSheet();
    announcer.announce("Deleted.", "assertive");
    timers.advance(0);
    releaseDialog();
    releaseDialog();
    announcer.announce("Closed.");
    timers.advance(0);
    expect(said).toEqual(["sheet:polite:Copied.", "dialog:assertive:Deleted.", "polite:Closed."]);
  });

  it("releases a modal below the top without disturbing the top", () => {
    const { timers, announcer, said } = setUp();
    const releaseDialog = announcer.pushModalRegions(recordingRegions(said, "dialog:"));
    announcer.pushModalRegions(recordingRegions(said, "sheet:"));
    releaseDialog();
    announcer.announce("Copied.");
    timers.advance(0);
    expect(said).toEqual(["sheet:polite:Copied."]);
  });

  it("holds announcements until the frame mounts its regions", () => {
    const timers = new FakeTimers();
    const announcer = createAnnouncer({ timers });
    const said: string[] = [];
    announcer.announce("Welcome.");
    timers.advance(100);
    const unmount = announcer.mountRegions(recordingRegions(said));
    timers.advance(0);
    expect(said).toEqual(["polite:Welcome."]);
    unmount();
    announcer.mountRegions(recordingRegions(said, "again:"));
    expect(() => announcer.mountRegions(recordingRegions(said))).toThrow(
      "The announcer's regions are already mounted",
    );
  });

  it("refuses an empty text or key", () => {
    const { announcer } = setUp();
    expect(() => announcer.announce(" ")).toThrow(ShellError);
    expect(() => announcer.announceState("", "Running.")).toThrow(
      "announceState needs a non-empty key.",
    );
    expect(() => announcer.announceState("run:43", "")).toThrow(
      "announceState needs a non-empty text.",
    );
  });

  it("cancels everything pending when disposed", () => {
    const { timers, announcer, said } = setUp();
    announcer.announce("Saved.");
    announcer.announceState("run:43", "Running.");
    announcer.dispose();
    timers.advance(5000);
    expect(said).toEqual([]);
    expect(timers.pending).toBe(0);
  });

  it("shares one announcer between the shell and every workspace context", () => {
    const timers = new FakeTimers();
    const shell = createShell({
      features: [defineFeature({ id: "agents", title: "Agents", register: () => {} })],
      timers,
    });
    const said: string[] = [];
    shell.announcer.mountRegions(recordingRegions(said));
    const first = shell.services.contextFor("agents", new MapTarget());
    const second = shell.services.contextFor("agents", new MapTarget());
    expect(first.announcer).toBe(shell.announcer);
    expect(second.announcer).toBe(shell.announcer);
    first.announcer.announce("Saved.");
    second.announcer.announce("Saved.");
    timers.advance(0);
    expect(said).toEqual(["polite:Saved."]);
  });
});
