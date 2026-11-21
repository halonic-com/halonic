import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeHost, ok, refused } from "./fake-host.test-helper.ts";
import { AgentHostPlacementStore } from "./placement-store.ts";
import { AgentHostError } from "./transport.ts";

const key = { location: "/work/acme", hub: "support", agent: "coder" };
const placement = {
  ...key,
  runsOn: "this-computer" as const,
  agentFingerprint: "sha256:abc",
  chosenAt: "2026-11-18T10:00:00.000Z",
};

verifies("agent-host-client.placement-store", () => {
  describe("get", () => {
    it("answers null when the host has no choice, sending only the key", async () => {
      const host = new FakeHost().answer("POST /v1/placements/get", ok({ placement: null }));
      expect(await new AgentHostPlacementStore(host).get({ ...placement })).toBeNull();
      expect(host.calls).toEqual([{ route: "POST /v1/placements/get", body: key }]);
    });

    it("gives the choice the host answers", async () => {
      const host = new FakeHost().answer("POST /v1/placements/get", ok({ placement }));
      expect(await new AgentHostPlacementStore(host).get(key)).toEqual(placement);
    });

    it("fails on a choice for another agent, never answering null", async () => {
      const other = { ...placement, agent: "reviewer" };
      const host = new FakeHost().answer("POST /v1/placements/get", ok({ placement: other }));
      await expect(new AgentHostPlacementStore(host).get(key)).rejects.toThrow(
        /isn't for this agent/,
      );
    });

    it("fails on a choice for the same agent id in another hub", async () => {
      const other = { ...placement, hub: "billing" };
      const host = new FakeHost().answer("POST /v1/placements/get", ok({ placement: other }));
      await expect(new AgentHostPlacementStore(host).get(key)).rejects.toThrow(
        /isn't for this agent/,
      );
    });

    it("fails on a choice saved before the key had a hub", async () => {
      const { hub: _hub, ...hubless } = placement;
      const host = new FakeHost().answer("POST /v1/placements/get", ok({ placement: hubless }));
      await expect(new AgentHostPlacementStore(host).get(key)).rejects.toThrow();
    });

    it("fails on a choice with an extra field", async () => {
      const extra = { ...placement, sandbox: false };
      const host = new FakeHost().answer("POST /v1/placements/get", ok({ placement: extra }));
      await expect(new AgentHostPlacementStore(host).get(key)).rejects.toThrow();
    });

    it("fails with the host's kind and reason when the choice can't be read", async () => {
      const reason = "The placement can't be read.";
      const host = new FakeHost().answer(
        "POST /v1/placements/get",
        refused(422, "placement_unreadable", reason),
      );
      const failure = await new AgentHostPlacementStore(host)
        .get(key)
        .catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(AgentHostError);
      expect(failure).toMatchObject({ kind: "placement_unreadable", message: reason });
    });
  });

  describe("save and remove", () => {
    it("saves exactly the six fields of the choice", async () => {
      const host = new FakeHost().answer("POST /v1/placements/save", ok({}));
      await new AgentHostPlacementStore(host).save({ ...placement });
      expect(host.calls).toEqual([{ route: "POST /v1/placements/save", body: placement }]);
    });

    it("removes by key", async () => {
      const host = new FakeHost().answer("POST /v1/placements/remove", ok({}));
      await new AgentHostPlacementStore(host).remove({ ...placement });
      expect(host.calls).toEqual([{ route: "POST /v1/placements/remove", body: key }]);
    });

    it("fails when the host refuses", async () => {
      const host = new FakeHost().answer(
        "POST /v1/placements/save",
        refused(404, "unknown_workspace", "not named"),
      );
      await expect(new AgentHostPlacementStore(host).save(placement)).rejects.toMatchObject({
        kind: "unknown_workspace",
      });
    });
  });
});
