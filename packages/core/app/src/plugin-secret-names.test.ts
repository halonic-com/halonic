import { MAX_PLUGIN_ID_LENGTH, MAX_PLUGIN_SECRET_NAME_LENGTH } from "@halonicjs/format";
import { isHalonicSecretName, isPluginSecretName, isSecretName, secretKey } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { pluginSecretName, pluginSecretNames } from "./plugin-secret-names.ts";
import { pluginFrom } from "./testing/plugin-fixtures.ts";

verifies("app.plugin-secret-names", () => {
  it("names every secret the plugin declares, in the backend and in each local tool", () => {
    expect(pluginSecretNames(pluginFrom())).toEqual({
      "example-key": "plugin__weather__example-key",
      "acme-key": "plugin__weather__acme-key",
    });
  });

  it("gives no names for a plugin that declares no secret", () => {
    const files = pluginFrom(`id: files
version: 1.0.0
sdk: 1
name: Files
localTools:
  - id: lister
    start: { script: { program: node, path: server.js } }
    tools:
      - { name: list-files, description: Lists the files in a folder., risk: read, untrusted: true }
`);
    expect(pluginSecretNames(files)).toEqual({});
  });

  it("keeps apart ids and names that one `-` or `_` between them would join", () => {
    // `Secrets` takes `-` and `_` as the same, so compare the keys it matches by.
    const pairs = [
      ["a-b", "c"],
      ["a", "b-c"],
      ["a-b-c", "d"],
      ["a", "b-c-d"],
    ] as const;
    const keys = pairs.map(([id, secret]) => secretKey(pluginSecretName(id, secret)));
    expect(new Set(keys).size).toBe(pairs.length);
  });

  it("fits the longest id and secret name the format takes, and is never Halonic's own", () => {
    const longest = pluginSecretName(
      "a".repeat(MAX_PLUGIN_ID_LENGTH),
      "b".repeat(MAX_PLUGIN_SECRET_NAME_LENGTH),
    );
    expect(isSecretName(longest)).toBe(true);
    expect(isHalonicSecretName(longest)).toBe(false);
  });

  it("is a name no workspace may pick", () => {
    expect(isPluginSecretName(pluginSecretName("weather", "acme-key"))).toBe(true);
  });
});
