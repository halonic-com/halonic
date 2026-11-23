// The CLI's engine names the next step on a refused send (HAL-15772): the
// shared engine passes a refusal's reason on as it is, so the CLI adds it to
// the run connectors it gives the engine (HAL-14217).

import { MemoryTokenStore } from "@halonicjs/adapter-memory";
import { ConnectorFactories } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import { expect, it } from "vitest";
import { withSendingNextStep } from "./cli-local-engine.ts";
import { noSheetHosts } from "./test/no-sheet-hosts.ts";

verifies("cli.local-engine", () => {
  it("adds the next step to a refused send of a connector that isn't a Google one", async () => {
    const runConnectors = withSendingNextStep(
      {
        factories: new ConnectorFactories([]),
        context: {
          http: { fetch: async () => new Response("unused") },
          tokens: new MemoryTokenStore(),
        },
        trust: null,
        sheetHostsOf: noSheetHosts,
        sending: {
          checkSending: async (key) => ({
            allowed: false,
            reason: `sending is off for the connector "${key.connector}"`,
          }),
        },
      },
      { files: [] } as unknown as LoadedWorkspace,
    );

    const check = await runConnectors.sending.checkSending({
      location: "/workspaces/acme",
      connector: "mail",
    });

    expect(check).toEqual({
      allowed: false,
      reason: `sending is off for the connector "mail". Halonic can't switch it on yet.`,
    });
  });
});
