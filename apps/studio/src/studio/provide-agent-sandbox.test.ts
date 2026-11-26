import { ServiceRegistry } from "@halonicjs/app";
import { AgentSandboxService } from "@halonicjs/studio-feature-settings/api";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { provideAgentSandbox } from "./provide-agent-sandbox.ts";

/**
 * A desktop page whose agent host is still starting: each `agent_host_request` waits until the
 * test lets the host answer `GET /v1/sandbox/this-computer` with `offered`.
 */
function pageWithStartingHost() {
  let answer: (offered: boolean) => void = () => undefined;
  const hostUp = new Promise<boolean>((resolve) => {
    answer = resolve;
  });
  const invoke = async (command: string) => {
    if (command !== "agent_host_request") return null;
    return { status: 200, body: { offered: await hostUp } };
  };
  const internals = { invoke, transformCallback: () => 1, unregisterCallback: () => {} };
  return { page: { __TAURI_INTERNALS__: internals }, answer };
}

verifies("studio.agent-sandbox-early-open", () => {
  it("provides the sandbox without waiting for the agent host", async () => {
    const { page } = pageWithStartingHost();
    const services = new ServiceRegistry();

    // The host never answers here: a wait for it would time the test out.
    await provideAgentSandbox(services, page, undefined, "windows");

    expect(services.has(AgentSandboxService)).toBe(true);
  });

  it("reads Studio as not starting agents outside the sandbox until the host answers", async () => {
    const { page, answer } = pageWithStartingHost();
    const services = new ServiceRegistry();
    await provideAgentSandbox(services, page, undefined, "windows");
    const facts = services.get(AgentSandboxService);

    expect(facts.studioStartsUnfenced).toBe(false);

    answer(true);
    await vi.waitFor(() => expect(facts.studioStartsUnfenced).toBe(true));
  });
});
