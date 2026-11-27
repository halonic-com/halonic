import { SecretText } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { setup } from "./workspace-agents.test-helper.ts";

const writer = { hubId: "acme", id: "writer" };
const connectors = "hubs/acme/library/connectors";

verifies("studio.workspace-agents-connector-keys", () => {
  it("names each connector's secrets by name, once, and none when it names none", async () => {
    const { host, store } = setup();
    store[`${connectors}/acme-mail.connector.yaml`] =
      "version: 1\nid: acme-mail\nname: Acme mail\nsecret: acme-mail-token\ntransport: { http: { url: https://mail.acme.example/mcp } }\n";
    store[`${connectors}/notes.connector.yaml`] =
      "version: 1\nid: notes\nname: Notes\ntransport:\n  stdio:\n    command: acme-notes-server\n    secretEnv:\n      TOKEN: acme-notes-key\n      BACKUP_TOKEN: acme-notes-key\n";
    store[`${connectors}/plain.connector.yaml`] =
      "version: 1\nid: plain\nname: Plain\ntransport: { http: { url: https://plain.acme.example/mcp } }\n";

    const options = (await host.toolOptions(writer)).connectors;
    const secretsOf = (id: string) => options.find((each) => each.id === id)?.secrets;
    expect(secretsOf("acme-mail")).toEqual(["acme-mail-token"]);
    expect(secretsOf("notes")).toEqual(["acme-notes-key"]);
    expect(options.find((each) => each.id === "plain")).not.toHaveProperty("secrets");
  });

  it("hands the Tools page the keys it was made with, and none without them", async () => {
    const keys: Record<string, string> = {};
    const { host } = setup({
      connectorKeys: {
        stored: async (name) => name in keys,
        change: async (name, key) => {
          keys[name] = key.reveal();
        },
      },
    });
    expect(await host.connectorKeys?.stored("acme-mail-token")).toBe(false);
    await host.connectorKeys?.change("acme-mail-token", new SecretText("acme-test-key-2"));
    expect(await host.connectorKeys?.stored("acme-mail-token")).toBe(true);
    expect(setup().host.connectorKeys).toBeUndefined();
  });
});
