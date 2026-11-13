import { createShell, type ServiceKey, type ServiceTarget } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { RunsSourceService } from "./api.ts";
import { runsFeature } from "./feature.ts";
import { fakeSource } from "./source.test-helper.ts";
import { summaryWith } from "./summary.test-helper.ts";

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

verifies("runs.search", () => {
  it("adds a search provider whose hits are runs that open the run's page", async () => {
    const shell = createShell({ features: [runsFeature], hostServices: [RunsSourceService] });
    const workspace = new WorkspaceServices();
    workspace.provide(
      RunsSourceService,
      fakeSource([
        summaryWith({ id: "run_a_01jd8q", state: "draft" }),
        summaryWith({ id: "run_b_4f2a1b", status: "completed" }),
      ]).source,
    );
    shell.services.instantiate(workspace);
    const provider = shell.contributions.search.providers().find((added) => added.id === "runs");
    const context = shell.services.contextFor("runs", workspace);
    expect(await provider?.search("Run 01JD8Q", context)).toEqual([
      {
        item: { kind: "run", hub: "acme", id: "run_a_01jd8q" },
        label: "Run 01jd8q · Support reply",
        detail: "Run · acme",
        description: "In Draft",
      },
    ]);
    expect(await provider?.search("zzz", context)).toEqual([]);
  });

  it("fails when the runs can't be loaded, so Ctrl K doesn't read it as no results", async () => {
    const shell = createShell({ features: [runsFeature], hostServices: [RunsSourceService] });
    const workspace = new WorkspaceServices();
    const fake = fakeSource([summaryWith({ id: "run_a_01jd8q" })]);
    fake.fail(new Error("offline"));
    workspace.provide(RunsSourceService, fake.source);
    shell.services.instantiate(workspace);
    const provider = shell.contributions.search.providers().find((added) => added.id === "runs");
    const context = shell.services.contextFor("runs", workspace);
    await expect(provider?.search("run", context)).rejects.toThrow("offline");
  });
});
