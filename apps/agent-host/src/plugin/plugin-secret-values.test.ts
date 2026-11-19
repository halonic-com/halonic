import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { PluginSecretValues } from "./plugin-secret-values.ts";

verifies("agent-host.plugin-secrets", () => {
  describe("the host's store of handed-over secrets", () => {
    it("gives a plugin's value by its name in any case and with `-` or `_`", async () => {
      const values = new PluginSecretValues();
      values.replace("acme", new Map([["plugin__acme__acme-key", "one"]]));
      expect(await values.secrets.get("plugin__acme__acme-key")).toBe("one");
      expect(await values.secrets.get("Plugin__Acme__Acme_Key")).toBe("one");
    });

    it("reads any name that isn't a plugin's, or isn't held, as none", async () => {
      const values = new PluginSecretValues();
      values.replace("acme", new Map([["plugin__acme__acme-key", "one"]]));
      expect(await values.secrets.get("openai-key")).toBeNull();
      expect(await values.secrets.get("token-key")).toBeNull();
      expect(await values.secrets.get("plugin__rain__acme-key")).toBeNull();
    });

    it("replaces everything held for a plugin and leaves the other plugins' values", async () => {
      const values = new PluginSecretValues();
      values.replace(
        "acme",
        new Map([
          ["plugin__acme__acme-key", "one"],
          ["plugin__acme__old-key", "old"],
        ]),
      );
      values.replace("rain", new Map([["plugin__rain__rain-key", "rain"]]));
      values.replace("acme", new Map([["plugin__acme__acme-key", "two"]]));
      expect(await values.secrets.get("plugin__acme__acme-key")).toBe("two");
      expect(await values.secrets.get("plugin__acme__old-key")).toBeNull();
      expect(await values.secrets.get("plugin__rain__rain-key")).toBe("rain");
      expect(values.countFor("acme")).toBe(1);
    });

    it("refuses a name that isn't one of the plugin's own and changes nothing", async () => {
      const values = new PluginSecretValues();
      values.replace("acme", new Map([["plugin__acme__acme-key", "one"]]));
      for (const name of ["openai-key", "plugin__rain__acme-key", "plugin__acmex__key"]) {
        expect(() => values.replace("acme", new Map([[name, "two"]]))).toThrow(RangeError);
      }
      expect(await values.secrets.get("plugin__acme__acme-key")).toBe("one");
    });

    it("forgets one plugin, or every plugin", async () => {
      const values = new PluginSecretValues();
      values.replace("acme", new Map([["plugin__acme__acme-key", "one"]]));
      values.replace("rain", new Map([["plugin__rain__rain-key", "rain"]]));
      values.forget("acme");
      expect(await values.secrets.get("plugin__acme__acme-key")).toBeNull();
      expect(await values.secrets.get("plugin__rain__rain-key")).toBe("rain");
      values.clear();
      expect(await values.secrets.get("plugin__rain__rain-key")).toBeNull();
    });
  });
});
