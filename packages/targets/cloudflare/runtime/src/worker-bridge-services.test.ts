import type { BridgeAgent } from "@halonicjs/host-harness-host";
import type { BridgeApprovalRequest, DefinitionSource, Secrets } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import {
  loadWorkspace,
  ManyUsersSubscriptionError,
  manyUsersSubscriptionCode,
} from "@halonicjs/workspace";
import { beforeEach, expect, it } from "vitest";
import { workerBridgeServices } from "./worker-bridge-services.ts";

/** Invented values: what the tests look for wherever the bridge could show them. */
const anthropicKey = "acme-anthropic-key-not-real-7d21";
const tokenKey = "acme-token-key-not-real-90fe";

/** A deployed workspace in memory. */
function sourceOf(files: Record<string, string>): DefinitionSource {
  return {
    location: "memory:acme",
    list: async () => Object.keys(files).sort(),
    read: async (path) => files[path] ?? null,
    version: async () => "v1",
  };
}

const acmeFiles = {
  "workspace.yaml": "id: acme\nname: Acme\n",
  "hubs/lab/hub.yaml": "id: lab\nname: Lab\n",
  "providers/claude.yaml": "id: claude\ntype: anthropic\nsecret: anthropic-key\n",
};

const coder: BridgeAgent = {
  runId: "run_1",
  agentId: "coder",
  hubId: "lab",
  harness: "claude-code",
  runsOn: "sandbox",
};

/** The secret names the Workers secrets were asked for. */
let asked: string[];

/** The Workers secrets: the provider's key and the token key, recording each name asked. */
const workersSecrets: Secrets = {
  get: async (name) => {
    asked.push(name);
    const values: Record<string, string> = { "anthropic-key": anthropicKey, "token-key": tokenKey };
    return values[name] ?? null;
  },
};

beforeEach(() => {
  asked = [];
});

async function servicesOf(files: Record<string, string>, secrets: Secrets = workersSecrets) {
  const workspace = await loadWorkspace(sourceOf(files));
  return workerBridgeServices({ workspace, secrets, deployment: "acme-cloud" });
}

verifies("runtime.worker-bridge-services", () => {
  it("gives the bridge only a secret a provider file names", async () => {
    const bridge = await servicesOf(acmeFiles);

    expect(await bridge.bridgeSecrets.get("token-key")).toBeNull();
    expect(asked).toEqual([]);
    expect(await bridge.bridgeSecrets.get("anthropic-key")).toBe(anthropicKey);
  });

  it("removes a value it gave out from a bridge failure", async () => {
    const bridge = await servicesOf(acmeFiles);
    await bridge.services.servicesFor(coder);

    const scrubbed = bridge.scrub(`401 from the provider: bad key ${anthropicKey}`);

    expect(scrubbed).not.toContain(anthropicKey);
    expect(scrubbed).toContain("401 from the provider");
  });

  it("serves the keyed provider only, with no tools and refused approvals", async () => {
    const bridge = await servicesOf(acmeFiles);

    const services = await bridge.services.servicesFor(coder);

    expect(services.providers).toEqual({
      anthropic: expect.objectContaining({ kind: "key", secret: "anthropic-key" }),
    });
    expect(await services.tools.list()).toEqual([]);
    const request = { tool: "Bash" } as BridgeApprovalRequest;
    await expect(
      services.approvals.request(request, { signal: new AbortController().signal }),
    ).rejects.toThrow(/can't ask for one yet/);
  });

  it("never falls back to the program's own sign-in when no provider has a key", async () => {
    const bridge = await servicesOf({
      ...acmeFiles,
      "providers/claude.yaml": "id: claude\ntype: anthropic\n",
    });

    await expect(bridge.services.servicesFor(coder)).rejects.toThrow(/acme-cloud/);
  });

  it("refuses an agent whose provider's key isn't set, naming the secret", async () => {
    const bridge = await servicesOf(acmeFiles, { get: async () => null });

    await expect(bridge.services.servicesFor(coder)).rejects.toThrow(
      /"anthropic-key" .* isn't set on deployment "acme-cloud"/,
    );
  });
});

verifies("harness-host.many-users-subscription", () => {
  it("refuses a harness agent with no provider key when its run starts, reading no key", async () => {
    const bridge = await servicesOf({
      ...acmeFiles,
      "providers/claude.yaml": "id: claude\ntype: anthropic\n",
    });

    const refused = bridge.services.servicesFor(coder);

    await expect(refused).rejects.toBeInstanceOf(ManyUsersSubscriptionError);
    await expect(refused).rejects.toMatchObject({
      code: manyUsersSubscriptionCode,
      message: expect.stringContaining('Deployment "acme-cloud" lets many people sign in'),
    });
    expect(asked).toEqual([]);
  });
});
