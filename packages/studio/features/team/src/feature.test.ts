import { createShell, type ServiceKey, type ServiceTarget } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { PullRequestsService, SpendAndSeatsService } from "./api.ts";
import { teamFeature } from "./feature.ts";

/** One open workspace's services, as the shell fills them. */
class WorkspaceServices implements ServiceTarget {
  readonly #services = new Map<string, unknown>();
  provide<Service>(key: ServiceKey<Service>, service: Service): void {
    this.#services.set(key.name, service);
  }
  get<Service>(key: ServiceKey<Service>): Service {
    return this.#services.get(key.name) as Service;
  }
  has(key: ServiceKey<unknown>): boolean {
    return this.#services.has(key.name);
  }
}

describe("teamFeature", () => {
  it("is registered under its folder name", () => {
    expect(teamFeature.id).toBe("team");
  });
});

verifies("team.spend-and-seats", () => {
  it("opens a workspace where nothing serves TeamStatus, and reads as nothing to show", async () => {
    const shell = createShell({ features: [teamFeature], hostServices: [] });
    const workspace = new WorkspaceServices();
    shell.services.instantiate(workspace);
    expect(await workspace.get(SpendAndSeatsService).read()).toBeUndefined();
  });

  it("adds Spend and seats as the sidebar's team place, with its problems as the signal", () => {
    const shell = createShell({ features: [teamFeature], hostServices: [] });
    const place = shell.contributions.places.list().find((each) => each.id === "team");
    expect(place?.featureId).toBe("team");
    expect(place?.view).toBe("SpendAndSeatsPlace");
    expect(place?.signal).toBeTypeOf("function");
    expect(place?.subscribeSignal).toBeTypeOf("function");
  });
});

verifies("team.pull-request-stuck", () => {
  it("opens a workspace where nothing serves TeamStatus, and says PR states aren't available", async () => {
    const shell = createShell({ features: [teamFeature], hostServices: [] });
    const workspace = new WorkspaceServices();
    shell.services.instantiate(workspace);
    expect(await workspace.get(PullRequestsService).read()).toEqual({ kind: "not-available" });
  });
});
