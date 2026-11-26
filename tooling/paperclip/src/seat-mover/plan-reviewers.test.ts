import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { planMoves } from "./plan.ts";
import { agent, now, seat, settings } from "./seat-mover.test-helper.ts";

/** "Name → seat" for each move, for short assertions. */
const movesOf = (plan: ReturnType<typeof planMoves>) =>
  plan.moves.map((move) => `${move.agent.key} → ${move.to.name}`);

/** Item b of the checklist: where reviewers sit, and who may sit with them. */
verifies("paperclip.seat-mover-checklist", () => {
  describe("b. reviewers sit alone", () => {
    test("a reviewer goes to the empty seat with the most 5-hour room before an occupied one", () => {
      const seats = [
        seat("A", 75, 10),
        seat("Busy", 0, 10),
        seat("Empty1", 30, 10),
        seat("Empty2", 10, 10),
      ];
      const agents = [agent("liam", "A"), agent("kim", "Busy")];
      expect(movesOf(planMoves(seats, agents, settings, now))).toEqual(["liam → Empty2"]);
    });

    test("a reviewer moves at its own stop (70%) and only to a seat with room below it", () => {
      const seats = [seat("A", 70, 10), seat("B", 62, 10), seat("C", 55, 10)];
      expect(movesOf(planMoves(seats, [agent("liam", "A")], settings, now))).toEqual(["liam → C"]);
    });

    test("with no empty seat with room, a reviewer joins light agents, never a heavy agent or a reviewer", () => {
      const seats = [
        seat("A", 100, 10),
        seat("Light", 20, 10),
        seat("Heavy", 0, 10),
        seat("Rev", 0, 10),
        seat("EmptyFull", 85, 10),
      ];
      const agents = [
        agent("nora", "A"),
        agent("kim", "Light"),
        agent("mara", "Light"),
        agent("elena", "Heavy"),
        agent("julian", "Rev"),
      ];
      const plan = planMoves(seats, agents, { ...settings, reviewers: ["nora", "julian"] }, now);
      expect(movesOf(plan)).toEqual(["nora → Light"]);
      expect(plan.refused).toEqual([]);
    });

    test("light agents a reviewer joined stay with it; a heavy agent there leaves", () => {
      const seats = [seat("Rev", 10, 10), seat("B", 20, 10)];
      const agents = [agent("liam", "Rev"), agent("kim", "Rev"), agent("elena", "Rev")];
      const plan = planMoves(seats, agents, settings, now);
      expect(movesOf(plan)).toEqual(["elena → B"]);
      expect(plan.moves[0]?.reason).toBe("b-reviewer-seat");
    });

    test("nobody joins a reviewer's seat, even when it has the most room", () => {
      const seats = [seat("A", 85, 10), seat("Rev", 0, 0), seat("B", 50, 10)];
      const agents = [agent("julian", "Rev"), agent("kim", "A")];
      expect(movesOf(planMoves(seats, agents, settings, now))).toEqual(["kim → B"]);
    });

    test("a reviewer sharing with a paused reviewer leaves for an empty seat, since paused agents never move", () => {
      // Liam would leave by url key, but he is paused: Julian leaves instead.
      const seats = [seat("Rev", 10, 10), seat("B", 20, 10)];
      const agents = [agent("liam", "Rev", { paused: true }), agent("julian", "Rev")];
      const plan = planMoves(seats, agents, settings, now);
      expect(movesOf(plan)).toEqual(["julian → B"]);
      expect(plan.moves[0]?.reason).toBe("b-reviewer-not-alone");
    });

    test("two reviewers on one seat: the second by url key moves to an empty seat", () => {
      const seats = [seat("Rev", 10, 10), seat("B", 20, 10)];
      const plan = planMoves(seats, [agent("liam", "Rev"), agent("julian", "Rev")], settings, now);
      expect(movesOf(plan)).toEqual(["liam → B"]);
    });

    test("a reviewer whose company can't move leaves for an empty seat itself", () => {
      const seats = [seat("Rev", 10, 10), seat("Empty", 20, 10), seat("Full", 90, 10)];
      const agents = [agent("liam", "Rev"), agent("pip", "Rev")];
      const plan = planMoves(seats, agents, settings, now);
      expect(movesOf(plan)).toEqual(["liam → Empty"]);
    });
  });
});
