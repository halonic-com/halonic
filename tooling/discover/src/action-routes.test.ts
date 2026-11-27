import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { shippedDefinitions } from "@halonicjs/action-catalog";
import type { ActionCallRoute, ActionRoute } from "@halonicjs/ports";
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

const guidedOnlyFields = ["method", "path", "body", "keep", "target"];

/**
 * The shape rules of the shell's reader (`routes.rs`, `call_route` and
 * `guided_route`), which refuses the whole list for one route that breaks
 * them: only an irreversible call has a target, and it must have one; a GET
 * has no body; no body field twice; a guided route has only an address.
 */
function shapeProblems(routes: readonly ActionRoute[]): string[] {
  return routes.flatMap((route) => {
    const where = `${route.definition}@${route.version}#${route.step}`;
    if (route.kind === "guided") {
      const extra = guidedOnlyFields.filter((field) => Object.hasOwn(route, field));
      return extra.length > 0 ? [`${where}: a guided step has only an address`] : [];
    }
    return callProblems(route).map((problem) => `${where}: ${problem}`);
  });
}

function callProblems(route: ActionCallRoute): string[] {
  const problems: string[] = [];
  const irreversible = route.risk === "irreversible";
  const hasTarget = Object.hasOwn(route, "target");
  if (irreversible && !hasTarget) problems.push("an irreversible call needs a target");
  if (!irreversible && hasTarget) problems.push("only an irreversible call has a target");
  if (route.method === "GET" && route.body.length > 0) problems.push("a GET has no body");
  const names = route.body.map((field) => field.name);
  if (new Set(names).size !== names.length) problems.push("a body field is listed twice");
  return problems;
}

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

    it("writes only routes the shell's reader takes", () => {
      expect(shapeProblems(actionRouteList(shipped).routes)).toEqual([]);
    });

    // Until `routesOf` writes targets, an irreversible definition with a call
    // step would make the shell refuse the whole list and send nothing.
    it("catches an irreversible call without a target", () => {
      const withCall = shipped.find(
        (definition) =>
          shellServices.includes(definition.service) &&
          definition.steps.some((step) => step.kind === "call"),
      );
      expect(withCall).toBeDefined();
      if (withCall === undefined) return;
      const irreversible = { ...withCall, risk: "irreversible" as const };
      expect(shapeProblems(actionRouteList([irreversible]).routes)).toContain(
        `${withCall.id}@${withCall.version}#${
          irreversible.steps.findIndex((step) => step.kind === "call") + 1
        }: an irreversible call needs a target`,
      );
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
