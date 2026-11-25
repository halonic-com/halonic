// @vitest-environment jsdom
import {
  createShell,
  type PlaceViewProps,
  type ServiceKey,
  type ServiceTarget,
  type WorkspaceContext,
} from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act, type ComponentType, createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { PullRequestsService, SpendAndSeatsService } from "./api.ts";
import { teamFeature } from "./feature.ts";
import { pullRequestWords } from "./pull-request-words.ts";
import { render, unmountAll } from "./test-support/render.tsx";

afterEach(() => {
  unmountAll();
});

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

  it("adds Pull requests as the sidebar's pull-requests place, with the stuck PRs as the signal", () => {
    const shell = createShell({ features: [teamFeature], hostServices: [] });
    const place = shell.contributions.places.list().find((each) => each.id === "pull-requests");
    expect(place?.featureId).toBe("team");
    expect(place?.view).toBe("PullRequestsPlace");
    expect(place?.signal).toBeTypeOf("function");
    expect(place?.subscribeSignal).toBeTypeOf("function");
  });

  it("loads the Pull requests page as the pull-requests place's view", async () => {
    const shell = createShell({ features: [teamFeature], hostServices: [] });
    const place = shell.contributions.places.list().find((each) => each.id === "pull-requests");
    const workspace = new WorkspaceServices();
    shell.services.instantiate(workspace);
    const loaded = (await place?.load()) ?? {};
    const View = Reflect.get(loaded, place?.view ?? "") as ComponentType<PlaceViewProps>;
    const context = { services: workspace } as unknown as WorkspaceContext;
    const container = render(createElement(View, { context }));
    await act(async () => {
      for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
    });
    expect(container.querySelector("h1")?.textContent).toBe(pullRequestWords.place);
    expect(container.textContent).toContain(pullRequestWords.notAvailable);
  });
});
