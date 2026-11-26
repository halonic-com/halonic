import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { planMoves } from "./plan.ts";
import { buildSeats, parseConnections } from "./readings.ts";
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

    test("a fast burner leaves a reserve seat (88% of its week); a slow agent stays", () => {
      const plan = planMoves(
        [seat("A", 10, 88), seat("B", 30, 10)],
        [agent("elena", "A"), agent("kim", "A")],
        settings,
        now,
      );
      expect(movesOf(plan)).toEqual(["elena → B"]);
      expect(plan.moves[0]?.reason).toBe("week-stop");
    });

    test("everyone leaves a seat at the weekly hard stop (95%)", () => {
      const plan = planMoves(
        [seat("A", 10, 95), seat("B", 30, 10)],
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

    test("a seat runs are parked waiting for takes nobody, whatever its reading says", () => {
      const seats = [seat("A", 85, 10), seat("Waited", 0, 0, { waiting: true }), seat("C", 50, 10)];
      expect(movesOf(planMoves(seats, [agent("kim", "A")], settings, now))).toEqual(["kim → C"]);
    });

    test("an agent the mover moved lately moves again only when parked or its seat is full", () => {
      const seats = [seat("A", 30, 10), seat("Full", 85, 10), seat("B", 20, 10)];
      const agents = [
        agent("elena", "A"),
        agent("mateo", "A"),
        agent("priya", "A", { recentlyMoved: true }),
        agent("kim", "Full", { recentlyMoved: true }),
      ];
      const plan = planMoves(seats, agents, settings, now);
      // Priya is the third heavy agent on A, but sitting together isn't a full seat: she stays.
      expect(movesOf(plan)).toEqual(["kim → B"]);
      expect(plan.stuck).toEqual([]);
    });

    test("fast burners pick a seat before the others", () => {
      const seats = [seat("Full", 85, 10), seat("B", 40, 10), seat("C", 10, 10)];
      const fastZed = { ...settings, fastBurners: [...settings.fastBurners, "zed"] };
      const agents = [agent("kim", "Full"), agent("zed", "Full")];
      expect(movesOf(planMoves(seats, agents, fastZed, now))).toEqual(["zed → C", "kim → B"]);
    });

    test("a seat below every stop keeps its agents, and an unread seat moves nobody for use", () => {
      const seats = [seat("A", 79, 87), seat("U", 0, 0, { reading: undefined }), seat("B", 0, 0)];
      expect(
        planMoves(seats, [agent("kim", "A"), agent("mara", "U")], settings, now).moves,
      ).toEqual([]);
    });

    test("a paused agent and a pinned agent are never moved", () => {
      const seats = [seat("A", 95, 95), seat("B", 0, 0)];
      const agents = [agent("leo", "A", { paused: true }), agent("pip", "A", { parked: true })];
      expect(planMoves(seats, agents, settings, now).moves).toEqual([]);
    });
  });

  describe("a. the weekly stop", () => {
    test("a reserve seat (88% of its week) takes a slow agent but never a fast burner", () => {
      const plan = planMoves(
        [seat("A", 85, 10), seat("B", 0, 88)],
        [agent("kim", "A"), agent("tomas", "A")],
        settings,
        now,
      );
      expect(movesOf(plan)).toEqual(["kim → B"]);
      expect(plan.stuck.map((stuck) => stuck.agent.key)).toEqual(["tomas"]);
    });

    test("a seat at the weekly hard stop (95%) is never a target", () => {
      const plan = planMoves(
        [seat("A", 85, 10), seat("B", 0, 95, { weekResetsAt: hours(2) })],
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

    test("a seat whose weekly reset is under 24 hours away takes a fast burner above the stop, below the hard stop", () => {
      const soon = seat("Soon", 10, 92, { weekResetsAt: hours(20) });
      const full = seat("Full", 5, 95, { weekResetsAt: hours(2) });
      const later = seat("Later", 0, 92, { weekResetsAt: hours(30) });
      const plan = planMoves(
        [seat("A", 85, 10), soon, full, later],
        [agent("tomas", "A")],
        settings,
        now,
      );
      expect(movesOf(plan)).toEqual(["tomas → Soon"]);
    });

    test("agents stay on a seat the weekly stop allows them on, so they don't bounce back", () => {
      const soon = seat("Soon", 10, 92, { weekResetsAt: hours(20) });
      expect(
        planMoves([soon, seat("B", 0, 0)], [agent("tomas", "Soon")], settings, now).moves,
      ).toEqual([]);
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

    test("the limit counts the heavy agents on the seat plus every move planned in the same pass", () => {
      const seats = [seat("Full", 100, 10), seat("Finance", 0, 10), seat("Week", 0, 96)];
      const agents = [
        agent("ravi", "Finance"),
        agent("elena", "Full"),
        agent("mateo", "Full"),
        agent("priya", "Full"),
      ];
      const plan = planMoves(seats, agents, settings, now);
      expect(movesOf(plan)).toEqual(["elena → Finance"]);
      expect(plan.stuck.map((stuck) => stuck.agent.key)).toEqual(["mateo", "priya"]);
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

  describe("g. the timer agents' quiet seat", () => {
    const timers = { ...settings, pinned: ["pip", "merger"] };

    test("a heavy agent never joins the quiet seat, even when it has the most room", () => {
      const seats = [seat("A", 85, 10), seat("Quiet", 5, 10), seat("B", 40, 10)];
      const agents = [agent("pip", "Quiet"), agent("merger", "Quiet"), agent("tomas", "A")];
      const plan = planMoves(seats, agents, timers, now);
      expect(movesOf(plan)).toEqual(["tomas → B"]);
    });

    test("a light agent may join the quiet seat", () => {
      const seats = [seat("A", 85, 10), seat("Quiet", 5, 10), seat("B", 40, 10)];
      const agents = [agent("pip", "Quiet"), agent("kim", "A")];
      expect(movesOf(planMoves(seats, agents, timers, now))).toEqual(["kim → Quiet"]);
    });

    test("a heavy agent on the quiet seat moves off; a paused one stays; the timers stay", () => {
      const seats = [seat("Quiet", 10, 10), seat("B", 20, 10)];
      const agents = [
        agent("pip", "Quiet"),
        agent("merger", "Quiet"),
        agent("tomas", "Quiet"),
        agent("elena", "Quiet", { paused: true }),
      ];
      const plan = planMoves(seats, agents, timers, now);
      expect(movesOf(plan)).toEqual(["tomas → B"]);
      expect(plan.moves[0]?.reason).toBe("g-quiet-seat");
    });

    test("with no other seat, the heavy agent is stuck rather than sent to the quiet seat", () => {
      const seats = [seat("A", 85, 10), seat("Quiet", 5, 10)];
      const plan = planMoves(seats, [agent("pip", "Quiet"), agent("tomas", "A")], timers, now);
      expect(plan.moves).toEqual([]);
      expect(plan.stuck.map((one) => one.agent.key)).toEqual(["tomas"]);
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
        seat("Week", 0, 95),
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

    test("a reviewer with only seats of heavy agents left stays and is stuck", () => {
      const seats = [seat("A", 75, 10), seat("B", 0, 0)];
      const plan = planMoves(seats, [agent("liam", "A"), agent("elena", "B")], settings, now);
      expect(plan.moves).toEqual([]);
      expect(plan.stuck.map((stuck) => stuck.agent.key)).toEqual(["liam"]);
    });
  });
});

verifies("paperclip.seat-mover-spread", () => {
  describe("one pass with several moves (HAL-19394)", () => {
    test("a reviewer sharing with a pinned agent takes the empty seat before the others spread (HAL-19464)", () => {
      const seats = [
        seat("X", 85, 10),
        seat("Busy", 10, 10),
        seat("Empty", 30, 10),
        seat("Rev", 10, 10),
      ];
      const agents = [
        agent("kim", "X"),
        agent("mara", "X"),
        agent("nina", "Busy"),
        agent("liam", "Rev"),
        agent("pip", "Rev"),
      ];
      const plan = planMoves(seats, agents, settings, now);
      expect(movesOf(plan)).toEqual(["liam → Empty", "kim → Busy", "mara → Rev"]);
      expect(plan.moves[0]?.reason).toBe("b-reviewer-not-alone");
      expect(plan.stuck).toEqual([]);
    });

    test("two light agents leaving a full seat go to two different legal seats", () => {
      const seats = [seat("Full", 85, 10), seat("B", 40, 10), seat("C", 20, 10)];
      const agents = [agent("kim", "Full"), agent("mara", "Full")];
      expect(movesOf(planMoves(seats, agents, settings, now))).toEqual(["kim → C", "mara → B"]);
    });

    test("a seat keeps room for each agent sent to it, so the next reading doesn't move them off again", () => {
      const seats = [seat("Full", 85, 10), seat("Close", 72, 10), seat("C", 55, 10)];
      const agents = [agent("kim", "Full"), agent("mara", "Full"), agent("nina", "Full")];
      const plan = planMoves(seats, agents, settings, now);
      // Close (72%) plus 10% for one agent reaches the 80% stop; C takes two (65%, 75%), not three.
      expect(movesOf(plan)).toEqual(["kim → C", "mara → C"]);
      expect(plan.stuck.map((stuck) => stuck.agent.key)).toEqual(["nina"]);
    });

    test("with one legal seat left, both still go there", () => {
      const seats = [seat("Full", 85, 10), seat("B", 40, 10), seat("Late", 82, 10)];
      const agents = [agent("kim", "Full"), agent("mara", "Full")];
      expect(movesOf(planMoves(seats, agents, settings, now))).toEqual(["kim → B", "mara → B"]);
    });
  });
});

verifies("paperclip.seat-mover-not-connected", () => {
  describe("a seat whose connection isn't connected (HAL-19394)", () => {
    test("its running agents move to a legal seat, a paused one stays, and it takes nobody", () => {
      const seats = [
        seat("Gone", 0, 0, { connection: "not-connected" }),
        seat("A", 85, 10),
        seat("B", 30, 10),
      ];
      const agents = [agent("kim", "Gone", { paused: true }), agent("mara", "Gone")];
      const plan = planMoves(seats, agents, settings, now);
      expect(movesOf(plan)).toEqual(["mara → B"]);
      expect(plan.moves[0]?.reason).toBe("not-connected");
      expect(plan.stuck).toEqual([]);
    });

    test("with no legal seat, the agent stays and is listed as stuck", () => {
      const seats = [seat("Gone", 0, 0, { connection: "not-connected" }), seat("Full", 90, 10)];
      const plan = planMoves(seats, [agent("kim", "Gone")], settings, now);
      expect(plan.moves).toEqual([]);
      expect(plan.stuck).toEqual([
        expect.objectContaining({ from: "c-Gone", reason: "not-connected" }),
      ]);
    });
  });

  describe("a connection with no status (HAL-19464)", () => {
    test("its agent stays put and nobody is sent there", () => {
      const connections = parseConnections({
        connections: [
          { id: "c-NoStatus", grantId: "g-NoStatus", method: "subscription" },
          { id: "c-A", grantId: "g-A", method: "subscription", status: "connected" },
          { id: "c-B", grantId: "g-B", method: "subscription", status: "connected" },
        ],
      });
      const reading = (name: string, session: number) => ({
        name,
        connectionId: `c-${name}`,
        at: now.toISOString(),
        error: undefined,
        sessionPercent: session,
        sessionResets: undefined,
        weekPercent: 10,
        weekResets: undefined,
      });
      const seats = buildSeats(
        connections,
        [reading("NoStatus", 0), reading("A", 85), reading("B", 40)],
        new Map(),
        now,
        45,
      );
      const plan = planMoves(seats, [agent("kim", "NoStatus"), agent("mara", "A")], settings, now);
      expect(movesOf(plan)).toEqual(["mara → B"]);
      expect(plan.stuck).toEqual([]);
    });
  });
});
