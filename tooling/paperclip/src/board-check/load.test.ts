import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { type LoadTask, loadLines, readLoad, sameLoad, teamLoad } from "./load.ts";

const agent = (id: string, status = "idle") => ({ id, urlKey: id, status });
const task = (assigneeAgentId: string, status: string, blockers = 0): LoadTask => ({
  status,
  assigneeAgentId,
  blockerAttention: { unresolvedBlockerCount: blockers },
});

verifies("paperclip.board-check-load", () => {
  test("names agents with nothing to start, leaving out Pip and agents that don't take work", () => {
    const load = teamLoad(
      [task("mateo", "todo"), task("priya", "in_progress", 1), task("liam", "in_progress")],
      [
        agent("mateo"),
        agent("priya"),
        agent("liam"),
        agent("nina"),
        agent("pip"),
        agent("owen", "paused"),
      ],
    );
    expect(load.idle).toEqual(["nina", "priya"]);
  });

  test("names agents with more than 10 tasks in progress, most first", () => {
    const many = (agentId: string, count: number) =>
      Array.from({ length: count }, () => task(agentId, "in_progress"));
    const load = teamLoad(
      [...many("mateo", 11), ...many("priya", 13), ...many("liam", 10)],
      [agent("mateo"), agent("priya"), agent("liam")],
    );
    expect(load.overloaded).toEqual([
      { agentId: "priya", inProgress: 13 },
      { agentId: "mateo", inProgress: 11 },
    ]);
  });

  test("writes Chief's two lines with names, and nobody when a list is empty", () => {
    const names = new Map([
      ["nina", "Nina"],
      ["priya", "Priya"],
    ]);
    expect(
      loadLines({ idle: ["nina"], overloaded: [{ agentId: "priya", inProgress: 13 }] }, names),
    ).toEqual([
      "- Nothing to start (no todo, no unblocked in progress): Nina.",
      "- More than 10 tasks in progress: Priya (13).",
    ]);
    expect(loadLines({ idle: [], overloaded: [] }, names)).toEqual([
      "- Nothing to start (no todo, no unblocked in progress): nobody.",
      "- More than 10 tasks in progress: nobody.",
    ]);
  });

  test("compares and reads back a saved load", () => {
    const load = { idle: ["nina"], overloaded: [] };
    expect(sameLoad(load, { idle: ["nina"], overloaded: [] })).toBe(true);
    expect(sameLoad(load, { idle: [], overloaded: [] })).toBe(false);
    expect(readLoad(load)).toEqual(load);
    expect(readLoad({ idle: "nina" })).toBeUndefined();
  });
});
