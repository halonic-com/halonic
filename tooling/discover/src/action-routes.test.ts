import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { shippedDefinitions } from "@halonicjs/action-catalog";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  actionRouteList,
  actionRoutesFile,
  shellServices,
  writeActionRoutes,
} from "./action-routes.ts";

const shipped = shippedDefinitions.map((entry) => entry.definition);

// The shell's pattern subset (`action-send`'s `pattern.rs`): `^`, then items
// (a class, an escaped character or a plain letter, digit, `-`, `_`, `:` or
// `@`), each with at most one quantifier, then `$`. No `.`, `|` or groups.
const item = String.raw`(?:\[\^?(?:\\.|[^\]\\])+\]|\\.|[A-Za-z0-9_:@-])`;
const quantifier = String.raw`(?:[?*+]|\{\d+(?:,\d*)?\})?`;
const shellPattern = new RegExp(String.raw`^\^(?:${item}${quantifier})*\$$`);

// A placeholder fills a whole segment and an address has no query or fragment (`template.rs`).
const plainTemplate = /^(?:https:\/\/[a-z0-9.-]+)?(?:\/(?:\{[A-Za-z][A-Za-z0-9_]*\}|[^/{}?#]*))+$/;

verifies("discover.action-routes", () => {
  describe("actionRouteList", () => {
    it("holds only definitions of services the shell knows", () => {
      const list = actionRouteList(shipped);
      expect(list.format).toBe("halonic.action-routes/1");
      expect(new Set(list.routes.map((route) => route.service))).toEqual(new Set(shellServices));
      expect(
        list.routes.map((route) => `${route.definition}@${route.version}#${route.step}`),
      ).toEqual(expect.arrayContaining(["github.upload-social-preview@1#1"]));
      expect(list.routes.some((route) => route.definition.startsWith("npm."))).toBe(false);
    });

    it("writes only patterns and templates the shell can read", () => {
      const routes = actionRouteList(shipped).routes;
      const templates = routes.map((route) =>
        route.kind === "guided" ? route.address : route.path,
      );
      const patterns = routes.flatMap((route) => [
        ...Object.values(route.placeholders),
        ...(route.kind === "call" ? route.body : []).flatMap((field) =>
          field.kind === "string" ? [field.pattern] : [],
        ),
      ]);
      expect(templates.filter((template) => !plainTemplate.test(template))).toEqual([]);
      expect(patterns.filter((pattern) => !shellPattern.test(pattern ?? ""))).toEqual([]);
    });

    it("names each guided host once, with no browser prefixes", () => {
      const { webOrigins } = actionRouteList(shipped);
      expect(webOrigins).toEqual([{ service: "github", host: "github.com", pathPrefixes: [] }]);
    });
  });

  describe("writeActionRoutes", () => {
    let root: string;

    beforeEach(() => {
      root = mkdtempSync(join(tmpdir(), "acme-routes-"));
    });

    afterEach(() => {
      rmSync(root, { recursive: true, force: true });
    });

    it("writes the list once and leaves an up-to-date file alone", () => {
      expect(writeActionRoutes(root)).toBe(true);
      const written = JSON.parse(readFileSync(join(root, actionRoutesFile), "utf8"));
      expect(written).toEqual(JSON.parse(JSON.stringify(actionRouteList(shipped))));
      expect(writeActionRoutes(root)).toBe(false);
    });
  });
});
