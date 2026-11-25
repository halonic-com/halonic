import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { readSchemaKeys } from "./schema-keys.ts";

// Shaped like @opencode/schema's built modules: one field per line.
const modules = new Map([
  [
    "config.js",
    [
      'import { ConfigProvider } from "./config/provider.js";',
      'export class Info extends Schema.Class("Config.Info")({',
      "    update: Schema.Literals([]).pipe(optional).annotate({",
      '        description: "Disable updates",',
      "    }),",
      "    providers: ConfigProvider.Info.pipe(optional),",
      "}) {}",
    ].join("\n"),
  ],
  [
    "config/provider.js",
    [
      'import { Provider } from "../provider.js";',
      "export const Overlays = {",
      "    headers: Schema.Record(Schema.String, Schema.String).pipe(optional),",
      "};",
    ].join("\n"),
  ],
  [
    "provider.js",
    [
      'export * from "./config.js";',
      "export const Settings = Schema.Struct({",
      "    baseURL: Schema.String.pipe(optional),",
      '    "max-retries": Schema.Int.pipe(optional),',
      '}).annotate({ identifier: "Provider.Settings" });',
    ].join("\n"),
  ],
  ["event.js", "export const Event = Schema.Struct({\n    type: Schema.String,\n});"],
]);

verifies("opencode-diff.diff", () => {
  describe("readSchemaKeys", () => {
    it("lists the fields of config.js and every module it reaches, without annotations", () => {
      expect(readSchemaKeys(modules)).toEqual([
        "config.js: providers",
        "config.js: update",
        "config/provider.js: headers",
        "provider.js: baseURL",
        "provider.js: max-retries",
      ]);
    });

    it("stops when the package has no config.js", () => {
      expect(() => readSchemaKeys(new Map([["event.js", ""]]))).toThrow(
        "The schema package has no config.js: its layout changed.",
      );
    });
  });
});
