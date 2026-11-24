import { AgentConnectionsService, FakeAgentConnections } from "@halonicjs/studio-services";
import { limitedLookup, type WorkspaceContext } from "@halonicjs/studio-shell";
import { describe, expect, it } from "vitest";
import { connectionsAvailable, connectionsFeature } from "./feature.ts";

function contextWith(connections: FakeAgentConnections | undefined): WorkspaceContext {
  const find = (key: unknown) => (key === AgentConnectionsService ? connections : undefined);
  const services = limitedLookup(connectionsFeature, { get: find, find });
  return { services } as unknown as WorkspaceContext;
}

describe("connectionsFeature", () => {
  it("is registered under its folder name", () => {
    expect(connectionsFeature.id).toBe("connections");
  });

  it("shows its section only where the app provides the connections", () => {
    const seen: boolean[] = [];
    connectionsAvailable(contextWith(new FakeAgentConnections()), (shown) => seen.push(shown));
    connectionsAvailable(contextWith(undefined), (shown) => seen.push(shown));
    expect(seen).toEqual([true, false]);
  });
});
