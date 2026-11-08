import { describe, expect, it } from "vitest";
import { deploymentsJsonSchema, readDeployments } from "../examples/deployments.ts";

describe("schema-kit.parse-result", () => {
  describe("the README example", () => {
    it("fills in defaults", () => {
      expect(readDeployments({ deployments: { home: { name: "Home" } } })).toEqual({
        version: 1,
        deployments: { home: { name: "Home", host: "local", stage: "development" } },
      });
    });

    it("reports each problem with its path", () => {
      expect(readDeployments({ deployments: { Home: { name: "" } } })).toEqual([
        {
          code: "invalid_key",
          path: ["deployments", "Home"],
          message: "Invalid key \"Home\": use lowercase letters, digits, '-' or '_'",
        },
      ]);
      expect(readDeployments({ deployments: {} })).toEqual([
        { code: "custom", path: ["deployments"], message: "Name at least one deployment" },
      ]);
    });

    it("writes a JSON Schema where defaults are optional", () => {
      expect(deploymentsJsonSchema["required"]).toEqual(["deployments"]);
    });
  });
});
