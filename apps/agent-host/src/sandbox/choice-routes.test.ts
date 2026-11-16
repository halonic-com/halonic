import type { SandboxChoice } from "@halonicjs/app";
import { afterEach, describe, expect, it } from "vitest";
import { type HostServer, startHostServer } from "../server/host-server.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import { type SandboxChoiceSource, sandboxChoiceRoutes } from "./choice-routes.ts";

const token = randomLaunchToken();
const authorization = { authorization: `Bearer ${token}` };

const inUse: SandboxChoice = {
  active: "srt",
  setting: null,
  backends: [
    {
      id: "srt",
      offered: true,
      state: "in-use",
      reason: null,
      setup: null,
      missing: [],
      limits: ["project-folder-writable"],
      residuals: [],
    },
  ],
};

/** A choice that answers `latest`, and counts how often it was started or asked again. */
class FakeChoice implements SandboxChoiceSource {
  latest: SandboxChoice | null = null;
  starts = 0;
  changes = 0;
  failWith: Error | undefined;

  current(): SandboxChoice | null {
    return this.latest;
  }

  async start(): Promise<SandboxChoice> {
    this.starts += 1;
    return this.#decide();
  }

  async settingsChanged(): Promise<SandboxChoice> {
    this.changes += 1;
    return this.#decide();
  }

  #decide(): SandboxChoice {
    if (this.failWith !== undefined) throw this.failWith;
    this.latest = inUse;
    return inUse;
  }
}

let server: HostServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

async function started(choice: SandboxChoiceSource): Promise<string> {
  server = await startHostServer(token, sandboxChoiceRoutes(choice));
  return server.url;
}

function post(url: string, body: unknown): Promise<Response> {
  return fetch(`${url}/v1/sandbox/choice/settings-changed`, {
    method: "POST",
    headers: { ...authorization, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("agent-host.sandbox-choice-routes", () => {
  it("starts the choice on the first GET and answers the latest one after that", async () => {
    const choice = new FakeChoice();
    const url = await started(choice);
    for (let ask = 0; ask < 2; ask += 1) {
      const response = await fetch(`${url}/v1/sandbox/choice`, { headers: authorization });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(inUse);
    }
    expect(choice.starts).toBe(1);
  });

  it("chooses again when told the setting changed", async () => {
    const choice = new FakeChoice();
    const url = await started(choice);
    const response = await post(url, {});
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(inUse);
    expect(choice.changes).toBe(1);
  });

  it("takes nothing from the caller: a body with a setting is refused and chooses nothing", async () => {
    const choice = new FakeChoice();
    const url = await started(choice);
    const response = await post(url, { setting: { backend: "none" } });
    expect(response.status).toBe(400);
    expect(choice.changes).toBe(0);
  });

  it("answers 500 sandbox_choice_failed when the saved setting can't be read", async () => {
    const choice = new FakeChoice();
    choice.failWith = new Error("The saved sandbox choice can't be read.");
    const url = await started(choice);
    const response = await fetch(`${url}/v1/sandbox/choice`, { headers: authorization });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { kind: "sandbox_choice_failed", message: "The saved sandbox choice can't be read." },
    });
  });

  it("refuses a call without the launch token", async () => {
    const url = await started(new FakeChoice());
    expect((await fetch(`${url}/v1/sandbox/choice`)).status).toBe(401);
  });
});
