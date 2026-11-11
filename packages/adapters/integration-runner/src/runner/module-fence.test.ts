import { pathToFileURL } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { checkResolved, checkSpecifier, folderUrl } from "./module-fence.ts";

const folder = "/work/weather";

/** A path's file URL, as Node gives it on this platform (with a drive on Windows). */
const fileUrl = (path: string) => pathToFileURL(path).href;
const entry = fileUrl("/work/weather/index.js");
const nested = fileUrl("/work/weather/lib/forecast.js");

verifies("integration-runner.module-fence", () => {
  describe("checkSpecifier", () => {
    it.each([
      ["./lib/forecast.js", entry],
      ["../index.js", nested],
      ["/work/weather/lib/forecast.js", entry],
      [nested, entry],
      ["zod", entry],
      ["zod/v4", entry],
    ])("lets %s from %s through to Node's resolver", (specifier, parent) => {
      expect(checkSpecifier(specifier, parent, folder)).toEqual({ allowed: true });
    });

    it.each([
      ["node:fs", /node: imports/],
      ["node:module", /node: imports/],
      ["fs", /not a file in the integration's folder or zod/],
      ["child_process", /not a file in the integration's folder or zod/],
      ["left-pad", /not a file in the integration's folder or zod/],
      ["zodiac", /not a file in the integration's folder or zod/],
      ["data:text/javascript,export default 1", /data: imports/],
      ["blob:nodedata:1234", /blob: imports/],
      ["https://example.com/evil.js", /https: imports/],
      ["../secrets.js", /outside the integration's folder/],
      ["./../../etc/passwd", /outside the integration's folder/],
      ["./%2e%2e/secrets.js", /outside the integration's folder/],
      ["/work/weather-twin/index.js", /outside the integration's folder/],
      ["file:///etc/passwd", /outside the integration's folder/],
    ])("refuses %s", (specifier, reason) => {
      const check = checkSpecifier(specifier, entry, folder);
      expect(check.allowed).toBe(false);
      expect(check.allowed ? "" : check.reason).toMatch(reason);
    });

    it("refuses a relative import with no importing module", () => {
      expect(checkSpecifier("./index.js", undefined, folder).allowed).toBe(false);
    });
  });

  describe("checkResolved", () => {
    it("allows a file inside the folder, at any depth", () => {
      expect(checkResolved(nested, folder)).toEqual({ allowed: true });
    });

    it("refuses what Node resolved to outside the folder, such as zod from a parent folder", () => {
      const check = checkResolved(fileUrl("/work/node_modules/zod/index.js"), folder);
      expect(check.allowed).toBe(false);
    });

    it("refuses Node's own modules, which a bare name such as fs resolves to", () => {
      expect(checkResolved("node:fs", folder).allowed).toBe(false);
    });

    it("refuses the folder itself, which isn't a module", () => {
      expect(checkResolved(fileUrl("/work/weather"), folder).allowed).toBe(false);
    });

    it("refuses a native add-on inside the folder, with or without a query", () => {
      expect(checkResolved(fileUrl("/work/weather/x.node"), folder).allowed).toBe(false);
      expect(checkResolved(`${fileUrl("/work/weather/x.node")}?v=1`, folder).allowed).toBe(false);
    });
  });

  describe("folderUrl", () => {
    it("ends in a slash, so a sibling folder with a longer name never matches", () => {
      expect(folderUrl("/work/weather")).toBe(`${fileUrl("/work/weather")}/`);
      expect(folderUrl("/work/weather/")).toBe(`${fileUrl("/work/weather")}/`);
    });
  });
});
