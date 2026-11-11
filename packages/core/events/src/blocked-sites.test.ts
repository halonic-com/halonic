import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { blockedSites } from "./blocked-sites.ts";
import type { RunEvent, RunEventBase, RunEventBody } from "./run-event.ts";
import type { LoggedSandboxBlock } from "./sandbox-blocked.ts";

type Step = RunEventBody & Partial<Pick<RunEventBase, "branch" | "item">>;

/** A run log of these events, numbered from seq 1. */
function log(...steps: Step[]): RunEvent[] {
  return steps.map((step, index) => ({
    runId: "r",
    seq: index + 1,
    at: "2026-11-11T08:00:00Z",
    ...step,
  }));
}

function entered(state: string): Step {
  return { type: "state.entered", state };
}

function blocked(block: LoggedSandboxBlock, count: number, state = "install"): Step {
  return { type: "sandbox.blocked", state, agent: "writer", block, count };
}

function site(host: string, count: number, port: number | null = 443): Step {
  return blocked({ kind: "network", host, port }, count);
}

/** `count` sites, each blocked once, named `site-00.example` and up. */
function manySites(count: number): Step[] {
  return Array.from({ length: count }, (_, index) =>
    site(`site-${String(index).padStart(2, "0")}.example`, 1),
  );
}

verifies("events.blocked-sites", () => {
  it("names a site once, with the latest count as its tries", () => {
    const events = log(
      entered("install"),
      site("registry.npmjs.org", 1),
      site("registry.npmjs.org", 12),
    );
    expect(blockedSites(events, { limit: 5 })).toEqual([
      {
        state: "install",
        agent: "writer",
        firstSeq: 2,
        sites: [{ host: "registry.npmjs.org", tries: 12 }],
        moreSites: 0,
        moreTries: 0,
        otherBlocks: 0,
      },
    ]);
  });

  it("adds up the ports of one site, however its name is written", () => {
    const events = log(
      site("api.example.com", 3, 443),
      site("API.Example.com.", 2, 80),
      site("api.example.com", 1, null),
    );
    expect(blockedSites(events, { limit: 5 })[0]?.sites).toEqual([
      { host: "api.example.com", tries: 6 },
    ]);
  });

  it("lowercases only A to Z, so a look-alike stays its own site", () => {
    const events = log(site("korse.com", 1), site("\u212Aorse.com", 2));
    expect(blockedSites(events, { limit: 5 })[0]?.sites).toEqual([
      { host: "\u212Aorse.com", tries: 2 },
      { host: "korse.com", tries: 1 },
    ]);
  });

  it("orders the sites by most tries first, then A to Z", () => {
    const events = log(site("b.example", 2), site("c.example", 9), site("a.example", 2));
    expect(blockedSites(events, { limit: 5 })[0]?.sites.map((each) => each.host)).toEqual([
      "c.example",
      "a.example",
      "b.example",
    ]);
  });

  it("lists up to 5 sites for a step's entry, and counts the rest", () => {
    const events = log(...manySites(5), site("site-05.example", 4), site("site-06.example", 3));
    const [step] = blockedSites(events, { limit: 5 });
    expect(step?.sites).toHaveLength(5);
    expect(step?.sites[0]).toEqual({ host: "site-05.example", tries: 4 });
    expect(step).toMatchObject({ moreSites: 2, moreTries: 2 });
  });

  it("lists up to 20 sites for the run log view", () => {
    const [step] = blockedSites(log(...manySites(25)), { limit: 20 });
    expect(step?.sites).toHaveLength(20);
    expect(step).toMatchObject({ moreSites: 5, moreTries: 5 });
  });

  it("keeps a count over 999 as it is; the words cap it", () => {
    const [step] = blockedSites(log(site("registry.npmjs.org", 1500)), { limit: 5 });
    expect(step?.sites).toEqual([{ host: "registry.npmjs.org", tries: 1500 }]);
  });

  it("gives the step the latest count of the accesses past the named targets", () => {
    const events = log(
      site("a.example", 1),
      blocked({ kind: "others" }, 1),
      blocked({ kind: "others" }, 40),
    );
    expect(blockedSites(events, { limit: 5 })[0]?.otherBlocks).toBe(40);
  });

  it("leaves out blocked files, and a step with only those", () => {
    const file = blocked({ kind: "file", path: "~/.ssh/id_ed25519", access: "read" }, 1, "draft");
    const events = log(entered("draft"), file, entered("install"), site("a.example", 1));
    expect(blockedSites(events, { limit: 5 })).toEqual([
      expect.objectContaining({ state: "install", firstSeq: 4 }),
    ]);
  });

  it("counts each visit of a state as its own step", () => {
    const events = log(
      entered("install"),
      site("a.example", 1),
      site("a.example", 4),
      entered("install"),
      site("a.example", 1),
    );
    const steps = blockedSites(events, { limit: 5 });
    expect(steps.map((step) => [step.firstSeq, step.sites[0]?.tries])).toEqual([
      [2, 4],
      [5, 1],
    ]);
  });

  it("counts each branch and item as its own step", () => {
    const events = log(
      { ...site("a.example", 2), branch: "left" },
      { ...site("a.example", 3), branch: "right" },
      { ...site("a.example", 1), item: 0 },
    );
    const steps = blockedSites(events, { limit: 5 });
    expect(steps.map((step) => [step.branch, step.item, step.sites[0]?.tries])).toEqual([
      ["left", undefined, 2],
      ["right", undefined, 3],
      [undefined, 0, 1],
    ]);
  });

  it("refuses a limit that isn't a whole number, 0 or more", () => {
    const events = log(site("a.example", 1));
    expect(() => blockedSites(events, { limit: -1 })).toThrow(RangeError);
    expect(() => blockedSites(events, { limit: 2.5 })).toThrow(RangeError);
    expect(blockedSites(events, { limit: 0 })[0]).toMatchObject({ sites: [], moreSites: 1 });
  });

  it("gives nothing for a log without blocked sites", () => {
    expect(blockedSites(log(entered("install")), { limit: 5 })).toEqual([]);
  });
});
