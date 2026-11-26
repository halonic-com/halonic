import {
  type AgentHostAnswer,
  AgentHostServerEngine,
  type AgentHostTransport,
} from "@halonicjs/adapter-agent-host-client";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { hostServerEngine } from "./server-engine.ts";

/** A host that answers every route with `answer`. */
function hostAnswering(answer: AgentHostAnswer): AgentHostTransport {
  return {
    request: async () => answer,
    stream: async () => ({ ok: false, answer }),
  } as unknown as AgentHostTransport;
}

const refusal = (status: number, kind: string): AgentHostAnswer => ({
  status,
  body: { error: { kind, message: kind } },
});

verifies("services.server-engine", () => {
  it("reads a host without a keychain as the keychain-needed engine", async () => {
    const host = hostAnswering(refusal(409, "keychain_needed"));
    const engine = hostServerEngine(new AgentHostServerEngine(host, "/work/acme"));
    expect(await engine.state()).toEqual({ engine: "keychain-needed" });
  });

  it("answers the host's state as it came", async () => {
    const state = { engine: "server", address: "https://halonic.acme.test", pairing: "kept" };
    const host = hostAnswering({ status: 200, body: state });
    const engine = hostServerEngine(new AgentHostServerEngine(host, "/work/acme"));
    expect(await engine.state()).toEqual(state);
  });

  it("passes the pairing calls to the host and answers as they came", async () => {
    const host = hostAnswering({ status: 200, body: { state: "expired" } });
    const engine = hostServerEngine(new AgentHostServerEngine(host, "/work/acme"));
    expect(await engine.status("pairing-1")).toEqual({ state: "expired" });
    const cancelled = hostAnswering({ status: 200, body: { cancelled: true } });
    expect(await hostServerEngine(new AgentHostServerEngine(cancelled, "/w")).cancel("p")).toBe(
      true,
    );
    const lost = hostAnswering({ status: 200, body: { state: "lost" } });
    const pairing = hostServerEngine(new AgentHostServerEngine(lost, "/w"));
    expect(await pairing.pair("https://halonic.acme.test", "7KQ2M9XF", "Acme laptop")).toEqual({
      state: "lost",
    });
  });

  it("passes the Access service token to the host, for a pairing and for an update", async () => {
    const sent: unknown[] = [];
    const host = {
      request: async (_route: string, body: unknown) => {
        sent.push(body);
        return { status: 200, body: { state: "saved", server: "online" } };
      },
    } as unknown as AgentHostTransport;
    const engine = hostServerEngine(new AgentHostServerEngine(host, "/w"));
    const access = { clientId: "id", clientSecret: "secret" };
    expect(await engine.setAccess(access)).toEqual({ state: "saved", server: "online" });
    expect(await engine.setAccess(undefined)).toEqual({ state: "saved", server: "online" });
    expect(sent).toEqual([
      { workspace: "/w", accessClientId: "id", accessClientSecret: "secret" },
      { workspace: "/w" },
    ]);
  });

  it("rejects with any other refusal", async () => {
    const host = hostAnswering(refusal(404, "unknown_workspace"));
    const engine = hostServerEngine(new AgentHostServerEngine(host, "/work/acme"));
    await expect(engine.state()).rejects.toMatchObject({ kind: "unknown_workspace" });
    await expect(engine.useThisComputer()).rejects.toMatchObject({ kind: "unknown_workspace" });
  });
});
