import type { ConnectorClient, ConnectorConfig, ConnectorFactoryContext } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  IntegrationConnectorFactory,
  type OpenIntegrationRequest,
} from "./integration-connector-factory.ts";

const config: ConnectorConfig = {
  id: "notes",
  transport: { kind: "integration", folder: "notes" },
  secretEnv: {},
};
const context = { trust: null } as unknown as ConnectorFactoryContext;

/** A factory whose `open` the test controls, and what it saw. */
function fixture(refusals: string[] = []) {
  const seen = { opens: [] as OpenIntegrationRequest[], closes: 0, calls: [] as string[] };
  const factory = new IntegrationConnectorFactory(async (request) => {
    seen.opens.push(request);
    const refusal = refusals.shift();
    if (refusal !== undefined) throw new Error(refusal);
    const client: ConnectorClient = {
      id: request.id,
      listTools: async () => [],
      callTool: async (name) => {
        seen.calls.push(name);
        return "ok";
      },
      close: async () => {
        seen.closes += 1;
      },
    };
    return client;
  });
  return { seen, client: factory.create(config, context) };
}

verifies("cli.integration-connector-factory", () => {
  describe("IntegrationConnectorFactory", () => {
    it("serves the integration transport", () => {
      expect(new IntegrationConnectorFactory(async () => Promise.reject()).transport).toBe(
        "integration",
      );
    });

    it("refuses a connector of another transport", () => {
      const factory = new IntegrationConnectorFactory(async () => Promise.reject());
      expect(() =>
        factory.create({ ...config, transport: { kind: "plugin", id: "notes" } }, context),
      ).toThrow('Connector "notes" isn\'t a local integration.');
    });

    it("opens nothing until the first call, and opens once for several", async () => {
      const { seen, client } = fixture();
      expect(seen.opens).toEqual([]);
      await client.listTools();
      expect(await client.callTool("lookup", {})).toBe("ok");
      expect(seen.opens).toHaveLength(1);
      expect(seen.opens[0]).toMatchObject({ id: "notes", folder: "notes", context });
    });

    it("starts nothing when a client that was never used closes", async () => {
      const { seen, client } = fixture();
      await client.close();
      expect(seen.opens).toEqual([]);
      expect(seen.closes).toBe(0);
    });

    it("closes the integration it opened, once, and refuses calls after", async () => {
      const { seen, client } = fixture();
      await client.callTool("lookup", {});
      await client.close();
      await client.close();
      expect(seen.closes).toBe(1);
      await expect(client.callTool("lookup", {})).rejects.toThrow(
        'Connector "notes": its connection is closed.',
      );
      expect(seen.opens).toHaveLength(1);
    });

    it("names the connector and the reason when the start is refused, and checks again next time", async () => {
      const { seen, client } = fixture(["A file of the integration in notes changed."]);
      await expect(client.callTool("lookup", {})).rejects.toThrow(
        'Connector "notes" didn\'t start: A file of the integration in notes changed.',
      );
      expect(seen.calls).toEqual([]);
      expect(await client.callTool("lookup", {})).toBe("ok");
      expect(seen.opens).toHaveLength(2);
    });

    it("closes nothing for a start that was refused", async () => {
      const { seen, client } = fixture(["refused"]);
      await client.callTool("lookup", {}).catch(() => undefined);
      await client.close();
      expect(seen.closes).toBe(0);
    });
  });
});
