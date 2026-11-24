import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { searchFeature } from "./feature.ts";
import { SearchStore } from "./search-store.ts";

/** Searches the fake once and gives the groups it shows. */
async function groupsFor(messaging: FakeAgentMessaging, query: string) {
  const store = new SearchStore(messaging);
  await store.search(query);
  const state = store.snapshot();
  if (state.kind !== "ready") throw new Error(`the search is ${state.kind}`);
  return state.groups;
}

describe("searchFeature", () => {
  it("is registered under its folder name", () => {
    expect(searchFeature.id).toBe("search");
  });
});

verifies("search.across-sources", () => {
  it("groups an agent and a work item by kind, each under its source's label", async () => {
    const messaging = new FakeAgentMessaging();
    const acme = messaging.addSource({ label: "Paperclip · Acme" });
    const chief = messaging.addAgent(acme.id, { name: "Chief" });
    messaging.addWork(acme.id, { label: "ACME-1", title: "Chief's launch plan" });

    const groups = await groupsFor(messaging, "chief");

    expect(groups.map((group) => group.kind)).toEqual(["agent", "work"]);
    const [agents, work] = groups;
    expect(agents?.sources.map((source) => source.label)).toEqual(["Paperclip · Acme"]);
    expect(agents?.sources[0]?.hits.map((hit) => hit.id)).toEqual([chief.id]);
    expect(work?.sources.map((source) => source.label)).toEqual(["Paperclip · Acme"]);
    expect(work?.sources[0]?.hits.map((hit) => hit.title)).toEqual(["ACME-1"]);
  });

  it("keeps two sources apart within a kind, in the order the sources are listed", async () => {
    const messaging = new FakeAgentMessaging();
    const acme = messaging.addSource({ label: "Paperclip · Acme" });
    const globex = messaging.addSource({ label: "Paperclip · Globex" });
    messaging.addAgent(globex.id, { name: "Chief" });
    messaging.addAgent(acme.id, { name: "Chief" });

    const [agents] = await groupsFor(messaging, "chief");

    expect(agents?.sources.map((source) => source.label)).toEqual([
      "Paperclip · Acme",
      "Paperclip · Globex",
    ]);
  });

  it("makes no search call for an empty or blank query", async () => {
    const messaging = new FakeAgentMessaging();
    const search = vi.spyOn(messaging, "search");
    const store = new SearchStore(messaging);

    await store.search("");
    await store.search("   ");

    expect(search).not.toHaveBeenCalled();
    expect(store.snapshot()).toEqual({ kind: "idle" });
  });

  it("shows only the latest query when an earlier one answers last", async () => {
    const messaging = new FakeAgentMessaging();
    const acme = messaging.addSource({ label: "Paperclip · Acme" });
    messaging.addAgent(acme.id, { name: "Chief" });
    const store = new SearchStore(messaging);

    const first = store.search("chief");
    await store.search("");
    await first;

    expect(store.snapshot()).toEqual({ kind: "idle" });
  });

  it("says the search failed when the source throws", async () => {
    const messaging = new FakeAgentMessaging();
    vi.spyOn(messaging, "search").mockRejectedValue(new Error("unreachable"));
    const store = new SearchStore(messaging);

    await store.search("chief");

    expect(store.snapshot().kind).toBe("failed");
  });
});
