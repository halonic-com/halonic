import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { overviewFeature } from "./feature.ts";
import { OverviewStore } from "./overview-store.ts";

/** Reads the fake once and gives the overview it builds. */
async function overviewOf(messaging: FakeAgentMessaging) {
  const store = new OverviewStore(messaging);
  await store.read();
  const state = store.snapshot();
  if (state.kind !== "ready") throw new Error(`the overview is ${state.kind}`);
  return state.overview;
}

describe("overviewFeature", () => {
  it("is registered under its folder name", () => {
    expect(overviewFeature.id).toBe("overview");
  });
});

verifies("overview.agents-and-work", () => {
  it("lists an agent's two pieces of work under it", async () => {
    const messaging = new FakeAgentMessaging();
    const acme = messaging.addSource({ label: "Paperclip · Acme" });
    const chief = messaging.addAgent(acme.id, { name: "Chief", activity: "working" });
    messaging.addWork(acme.id, { label: "ACME-1", title: "Pick a logo", assignee: chief.id });
    messaging.addWork(acme.id, {
      label: "ACME-2",
      title: "Write the launch post",
      assignee: chief.id,
    });

    const [shown] = (await overviewOf(messaging)).agents;

    expect(shown?.name).toBe("Chief");
    expect(shown?.idle).toBe(false);
    expect(shown?.work.map((work) => work.label).sort()).toEqual(["ACME-1", "ACME-2"]);
  });

  it("marks an agent with no open work as idle", async () => {
    const messaging = new FakeAgentMessaging();
    const acme = messaging.addSource({ label: "Paperclip · Acme" });
    const pip = messaging.addAgent(acme.id, { name: "Pip", activity: "working" });
    messaging.addWork(acme.id, {
      label: "ACME-3",
      title: "Old work",
      assignee: pip.id,
      state: "done",
    });

    const [shown] = (await overviewOf(messaging)).agents;

    expect(shown).toMatchObject({ name: "Pip", idle: true, work: [] });
  });

  it("shows the label and title of what blocks a piece of work", async () => {
    const messaging = new FakeAgentMessaging();
    const acme = messaging.addSource({ label: "Paperclip · Acme" });
    const logo = messaging.addWork(acme.id, { label: "ACME-1", title: "Pick a logo" });
    messaging.addWork(acme.id, {
      label: "ACME-2",
      title: "Print the flyers",
      state: "blocked",
      blockedBy: [logo.id],
    });

    const { blocked } = await overviewOf(messaging);

    expect(blocked).toHaveLength(1);
    expect(blocked[0]).toMatchObject({
      label: "ACME-2",
      blockedBy: [{ id: logo.id, label: "ACME-1", title: "Pick a logo" }],
    });
  });

  it("keeps two sources' agents with the same name apart", async () => {
    const messaging = new FakeAgentMessaging();
    const acme = messaging.addSource({ label: "Paperclip · Acme" });
    const globex = messaging.addSource({ label: "Paperclip · Globex" });
    const acmeChief = messaging.addAgent(acme.id, { name: "Chief" });
    messaging.addAgent(globex.id, { name: "Chief" });
    messaging.addWork(acme.id, { label: "ACME-1", title: "Pick a logo", assignee: acmeChief.id });

    const { agents } = await overviewOf(messaging);

    expect(agents.map((agent) => [agent.name, agent.sourceLabel, agent.work.length])).toEqual([
      ["Chief", "Paperclip · Acme", 1],
      ["Chief", "Paperclip · Globex", 0],
    ]);
  });

  it("reads again when a source changes", async () => {
    const messaging = new FakeAgentMessaging();
    const acme = messaging.addSource({ label: "Paperclip · Acme" });
    const store = new OverviewStore(messaging);
    await store.start();
    const read = new Promise<void>((resolve) => {
      const stop = store.subscribe(() => {
        stop();
        resolve();
      });
    });

    messaging.addAgent(acme.id, { name: "Chief" });
    await read;
    store.stop();

    const state = store.snapshot();
    expect(state.kind === "ready" ? state.overview.agents.map((agent) => agent.name) : []).toEqual([
      "Chief",
    ]);
  });
});
