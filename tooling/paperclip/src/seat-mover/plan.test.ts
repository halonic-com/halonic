import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { planMoves } from "./plan.ts";
import { agent, now, seat, settings } from "./seat-mover.test-helper.ts";

const hours = (n: number) => new Date(now.getTime() + n * 3_600_000).toISOString();

/** "Name → seat" for each move, for short assertions. */
const movesOf = (plan: ReturnType<typeof planMoves>) =>
  plan.moves.map((move) => `${move.agent.key} → ${move.to.name}`);

verifies("paperclip.seat-mover-checklist", () => {
  describe("when an agent moves", () => {
    test("an agent leaves a seat at 80% of its 5-hour window for the seat with the most room", () => {
      const seats = [seat("A", 80, 10), seat("B", 40, 10), seat("C", 20, 10)];
      const plan = planMoves(seats, [agent("kim", "A")], settings, now);
      expect(movesOf(plan)).toEqual(["kim → C"]);
      expect(plan.moves[0]?.reason).toBe("session-stop");
    });

    test("an agent leaves a seat at 88% of its week", () => {
      const plan = planMoves(
        [seat("A", 10, 88), seat("B", 30, 10)],
        [agent("kim", "A")],
        settings,
        now,
      );
      expect(plan.moves.map((move) => move.reason)).toEqual(["week-stop"]);
    });

    test("an agent with runs parked on its seat moves even below the stops", () => {
      const seats = [seat("A", 30, 30), seat("B", 20, 10)];
      const plan = planMoves(seats, [agent("kim", "A", { parked: true })], settings, now);
      expect(plan.moves.map((move) => move.reason)).toEqual(["parked"]);
    });

    test("a provider_quota failure marks the seat full: its agents leave and nobody joins", () => {
      const seats = [
        seat("A", 30, 30, { quotaHit: true }),
        seat("B", 5, 10, { quotaHit: true }),
        seat("C", 50, 10),
      ];
      const plan = planMoves(seats, [agent("kim", "A")], settings, now);
      expect(movesOf(plan)).toEqual(["kim → C"]);
      expect(plan.moves[0]?.reason).toBe("quota-hit");
    });

    test("a seat below every stop keeps its agents, and an unread seat moves nobody for use", () => {
      const seats = [seat("A", 79, 87), seat("U", 0, 0, { reading: undefined }), seat("B", 0, 0)];
      expect(
        planMoves(seats, [agent("kim", "A"), agent("mara", "U")], settings, now).moves,
      ).toEqual([]);
    });

    test("a paused agent isn't moved for use, and a pinned agent is never moved", () => {
      const seats = [seat("A", 95, 95), seat("B", 0, 0)];
      const agents = [agent("leo", "A", { paused: true }), agent("pip", "A", { parked: true })];
      expect(planMoves(seats, agents, settings, now).moves).toEqual([]);
    });
  });

  describe("a. the weekly stop", () => {
    test("a seat at 88% of its week is never a target", () => {
      const plan = planMoves(
        [seat("A", 85, 10), seat("B", 0, 88)],
        [agent("kim", "A")],
        settings,
        now,
      );
      expect(plan.moves).toEqual([]);
      expect(plan.stuck.map((stuck) => stuck.agent.key)).toEqual(["kim"]);
    });

    test("a reset-fill seat takes agents above the weekly stop", () => {
      const seats = [seat("A", 85, 10), seat("Ravi", 10, 97)];
      expect(movesOf(planMoves(seats, [agent("kim", "A")], settings, now))).toEqual(["kim → Ravi"]);
    });

    test("a seat whose weekly reset is under 24 hours away takes agents above the stop, below the hard stop", () => {
      const soon = seat("Soon", 10, 92, { weekResetsAt: hours(20) });
      const full = seat("Full", 5, 98, { weekResetsAt: hours(2) });
      const later = seat("Later", 0, 92, { weekResetsAt: hours(30) });
      const plan = planMoves(
        [seat("A", 85, 10), soon, full, later],
        [agent("kim", "A")],
        settings,
        now,
      );
      expect(movesOf(plan)).toEqual(["kim → Soon"]);
    });

    test("agents stay on a seat the weekly stop allows them on, so they don't bounce back", () => {
      const soon = seat("Soon", 10, 92, { weekResetsAt: hours(20) });
      expect(
        planMoves([soon, seat("B", 0, 0)], [agent("kim", "Soon")], settings, now).moves,
      ).toEqual([]);
    });
  });

  describe("b. reviewers sit alone", () => {
    test("a reviewer goes to the empty seat with the most 5-hour room, never to an occupied one", () => {
      const seats = [
        seat("A", 75, 10),
        seat("Busy", 0, 10),
        seat("Empty1", 30, 10),
        seat("Empty2", 10, 10),
      ];
      const agents = [agent("liam", "A"), agent("kim", "Busy")];
      expect(movesOf(planMoves(seats, agents, settings, now))).toEqual(["liam → Empty2"]);
    });

    test("a reviewer moves at its own stop (70%) and only to a seat below it", () => {
      const seats = [seat("A", 70, 10), seat("B", 72, 10), seat("C", 65, 10)];
      expect(movesOf(planMoves(seats, [agent("liam", "A")], settings, now))).toEqual(["liam → C"]);
    });

    test("nobody joins a reviewer's seat, even when it has the most room", () => {
      const seats = [seat("A", 85, 10), seat("Rev", 0, 0), seat("B", 50, 10)];
      const agents = [agent("julian", "Rev"), agent("kim", "A")];
      expect(movesOf(planMoves(seats, agents, settings, now))).toEqual(["kim → B"]);
    });

    test("an agent sharing a reviewer's seat moves off, paused or not", () => {
      const seats = [seat("Rev", 10, 10), seat("B", 20, 10)];
      const agents = [agent("liam", "Rev"), agent("nora", "Rev", { paused: true })];
      const plan = planMoves(seats, agents, settings, now);
      expect(movesOf(plan)).toEqual(["nora → B"]);
      expect(plan.moves[0]?.reason).toBe("b-reviewer-seat");
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

  describe("c. at most two heavy agents per seat", () => {
    test("a heavy agent doesn't join a seat with two heavy agents; a light one may", () => {
      const seats = [seat("A", 85, 10), seat("Two", 10, 10), seat("B", 40, 10)];
      const agents = [
        agent("elena", "Two"),
        agent("priya", "Two"),
        agent("tomas", "A"),
        agent("kim", "A"),
      ];
      expect(movesOf(planMoves(seats, agents, settings, now))).toEqual(["tomas → B", "kim → Two"]);
    });

    test("a third heavy agent on a seat moves off; paused heavy agents don't count", () => {
      const seats = [seat("A", 10, 10), seat("B", 20, 10)];
      const agents = [
        agent("elena", "A"),
        agent("priya", "A"),
        agent("tomas", "A"),
        agent("leo", "A", { paused: true }),
      ];
      const plan = planMoves(
        seats,
        agents,
        { ...settings, heavy: [...settings.heavy, "leo"] },
        now,
      );
      expect(movesOf(plan)).toEqual(["tomas → B"]);
      expect(plan.moves[0]?.reason).toBe("c-heavy-limit");
    });
  });

  describe("d. the Admin seat, e. the paid API, f. the 5-hour stop", () => {
    test("Admin is never a target, and an agent on it moves off", () => {
      const seats = [seat("Admin", 0, 0), seat("B", 30, 10)];
      const plan = planMoves(seats, [agent("kim", "Admin")], settings, now);
      expect(movesOf(plan)).toEqual(["kim → B"]);
      expect(plan.moves[0]?.reason).toBe("d-admin");
    });

    test("a seat excluded by its connection id is never a target", () => {
      const seats = [seat("A", 85, 10), seat("Own", 0, 0)];
      const own = { ...settings, excludedSeats: ["c-Own"] };
      expect(planMoves(seats, [agent("kim", "A")], own, now).moves).toEqual([]);
    });

    test("the paid API is never a target, and an agent on it moves off", () => {
      const seats = [
        seat("A", 85, 10),
        seat("Api", 0, 0, { method: "api_key" }),
        seat("B", 30, 10),
      ];
      const agents = [agent("kim", "A"), agent("mara", "Api")];
      const plan = planMoves(seats, agents, settings, now);
      expect(movesOf(plan)).toEqual(["kim → B", "mara → B"]);
      expect(plan.moves[1]?.reason).toBe("e-paid-api");
    });

    test("a seat at 80% of its 5-hour window is never a target", () => {
      const plan = planMoves(
        [seat("A", 90, 10), seat("B", 80, 10)],
        [agent("kim", "A")],
        settings,
        now,
      );
      expect(plan.moves).toEqual([]);
    });
  });

  describe("no legal target", () => {
    test("the agent stays where it is and is listed as stuck with its reason", () => {
      const seats = [
        seat("A", 85, 10),
        seat("Admin", 0, 0),
        seat("Week", 0, 90),
        seat("Api", 0, 0, { method: "api_key" }),
      ];
      const plan = planMoves(seats, [agent("kim", "A")], settings, now);
      expect(plan.moves).toEqual([]);
      expect(plan.stuck).toEqual([
        expect.objectContaining({ from: "c-A", reason: "session-stop" }),
      ]);
    });

    test("a break the seats already had, such as a stuck third heavy agent, stops no other move", () => {
      const seats = [seat("Three", 10, 10), seat("Full", 85, 10), seat("Empty", 20, 10)];
      const agents = [
        agent("elena", "Three"),
        agent("priya", "Three"),
        agent("tomas", "Three"),
        agent("kim", "Full"),
        agent("liam", "Full"),
      ];
      const plan = planMoves(seats, agents, settings, now);
      // Tomas may go nowhere: Full is past the 5-hour stop and Empty is the reviewer's.
      expect(plan.stuck.map((stuck) => `${stuck.agent.key} ${stuck.reason}`)).toEqual([
        "tomas c-heavy-limit",
      ]);
      expect(movesOf(plan)).toEqual(["liam → Empty", "kim → Three"]);
      expect(plan.refused).toEqual([]);
    });

    test("a reviewer with only occupied seats left stays and is stuck", () => {
      const seats = [seat("A", 75, 10), seat("B", 0, 0)];
      const plan = planMoves(seats, [agent("liam", "A"), agent("kim", "B")], settings, now);
      expect(plan.moves).toEqual([]);
      expect(plan.stuck.map((stuck) => stuck.agent.key)).toEqual(["liam"]);
    });
  });
});
