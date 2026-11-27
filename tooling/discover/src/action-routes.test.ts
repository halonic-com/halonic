import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { shippedDefinitions } from "@halonicjs/action-catalog";
import type { ActionBodyField, ActionCallRoute, ActionRoute } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type ActionRouteList,
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

const callOnlyFields = ["method", "path", "body", "keep", "target"];

// A body field name (`template.rs`, `is_name`): a letter, then letters, digits or `_`.
const bodyFieldName = /^[A-Za-z][A-Za-z0-9_]*$/;

// The keys the reader's structs name (`routes.rs`, `ListFile`, `WebOriginFile`,
// `RouteFile` and `BodyFieldFile`); each is read with `deny_unknown_fields`.
const listKeys = new Set(["format", "webOrigins", "routes"]);
const webOriginKeys = new Set(["service", "host", "pathPrefixes"]);
const routeKeys = new Set([
  ...["kind", "definition", "version", "step", "service", "risk", "placeholders"],
  ...["method", "path", "body", "keep", "address", "target"],
]);
const bodyFieldKeys = new Set(["name", "kind", "pattern", "value"]);

/**
 * The shape rules of the shell's reader (`routes.rs`, `call_route`,
 * `body_field` and `guided_route`), which refuses the whole list for one
 * route that breaks them: no key the reader doesn't know; only an
 * irreversible call has a target, and it must have one; a GET has no body; no
 * body field twice; every body field has a plain name and the shape of its
 * kind, and a constant one a value (serde reads `null` as missing); no kept
 * field without a name; a guided route has only an address. It reads the
 * routes as written, since a key set to `undefined` never reaches the file.
 */
function shapeProblems(routes: readonly ActionRoute[]): string[] {
  const written: ActionRoute[] = JSON.parse(JSON.stringify(routes));
  return written.flatMap((route) => {
    const where = whereOf(route);
    const unknown = unknownKeys(route, routeKeys, where);
    if (route.kind === "guided") {
      const extra = callOnlyFields.filter((field) => Object.hasOwn(route, field));
      return extra.length > 0
        ? [...unknown, `${where}: a guided step has only an address`]
        : unknown;
    }
    return [...unknown, ...callProblems(route).map((problem) => `${where}: ${problem}`)];
  });
}

/** The keys outside the routes the reader refuses: the list's own and each web origin's. */
function listKeyProblems(list: ActionRouteList): string[] {
  const written: ActionRouteList = JSON.parse(JSON.stringify(list));
  return [
    ...unknownKeys(written, listKeys, "the list"),
    ...written.webOrigins.flatMap((origin) =>
      unknownKeys(origin, webOriginKeys, `the web origin ${origin.host}`),
    ),
  ];
}

function unknownKeys(value: object, known: ReadonlySet<string>, where: string): string[] {
  return Object.keys(value)
    .filter((key) => !known.has(key))
    .map((key) => `${where}: the reader doesn't know the key \`${key}\``);
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
  problems.push(...route.body.flatMap(bodyFieldProblems));
  if (route.keep.some((name) => name === "")) problems.push("a kept field has no name");
  return problems;
}

function bodyFieldProblems(field: ActionBodyField): string[] {
  const problems: string[] = [];
  if (!bodyFieldName.test(field.name)) problems.push(`\`${field.name}\` isn't a body field name`);
  if (field.kind === "constant" && (field.value === undefined || field.value === null)) {
    problems.push(`the constant body field \`${field.name}\` has no value`);
  }
  problems.push(...unknownKeys(field, bodyFieldKeys, `the body field \`${field.name}\``));
  if (!fitsItsKind(field)) {
    problems.push(`the body field \`${field.name}\` of kind \`${field.kind}\` has the wrong shape`);
  }
  return problems;
}

// `body_field` in `routes.rs`: a `string` has a pattern and no value, a
// `constant` a scalar value and no pattern (a missing value is reported
// above), every other kind neither. The reader reads a `null` as absent.
function fitsItsKind(field: ActionBodyField): boolean {
  const hasPattern = field.pattern !== undefined && field.pattern !== null;
  const hasValue = field.value !== undefined && field.value !== null;
  switch (field.kind) {
    case "string":
      return hasPattern && !hasValue;
    case "constant":
      return !hasPattern && (!hasValue || typeof field.value !== "object");
    case "integer":
    case "boolean":
    case "integer-list":
    case "secret-input":
      return !hasPattern && !hasValue;
    default:
      return false;
  }
}

/** The first call route the shipped catalog writes, for the tests that break one rule on it. */
function shippedCall(): ActionCallRoute {
  const call = actionRouteList(shipped).routes.find(
    (route): route is ActionCallRoute => route.kind === "call",
  );
  if (call === undefined) throw new Error("the shipped catalog writes no call route");
  return call;
}

function whereOf(route: ActionRoute): string {
  return `${route.definition}@${route.version}#${route.step}`;
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
      const list = actionRouteList(shipped);
      expect(shapeProblems(list.routes)).toEqual([]);
      expect(listKeyProblems(list)).toEqual([]);
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

    it("catches a constant body field whose value is null", () => {
      const call = shippedCall();
      const broken = {
        ...call,
        body: [...call.body, { name: "query", kind: "constant" as const, value: null }],
      };
      expect(shapeProblems([broken])).toContain(
        `${whereOf(call)}: the constant body field \`query\` has no value`,
      );
    });

    it("catches a body field name the shell refuses", () => {
      const call = shippedCall();
      const broken = {
        ...call,
        body: [...call.body, { name: "run-id", kind: "integer" as const }],
      };
      expect(shapeProblems([broken])).toContain(
        `${whereOf(call)}: \`run-id\` isn't a body field name`,
      );
    });

    it("catches an empty name in keep", () => {
      const call = shippedCall();
      const broken = { ...call, keep: [...call.keep, ""] };
      expect(shapeProblems([broken])).toContain(`${whereOf(call)}: a kept field has no name`);
    });

    it("catches a key the reader doesn't know", () => {
      const call = shippedCall();
      const reviewers = { name: "reviewers", kind: "integer-list" as const, parameter: "ids" };
      const broken = { ...call, body: [...call.body, reviewers], retries: 2 };
      expect(shapeProblems([broken])).toEqual(
        expect.arrayContaining([
          `${whereOf(call)}: the body field \`reviewers\`: the reader doesn't know the key \`parameter\``,
          `${whereOf(call)}: the reader doesn't know the key \`retries\``,
        ]),
      );
      const list = actionRouteList(shipped);
      expect(listKeyProblems({ ...list, generatedAt: "today" } as ActionRouteList)).toEqual([
        "the list: the reader doesn't know the key `generatedAt`",
      ]);
    });

    it("catches a body field whose shape doesn't fit its kind", () => {
      const call = shippedCall();
      const broken = {
        ...call,
        body: [
          ...call.body,
          { name: "title", kind: "string" as const },
          { name: "draft", kind: "boolean" as const, value: true },
          { name: "labels", kind: "constant" as const, value: "acme", pattern: "^acme$" },
        ],
      };
      expect(shapeProblems([broken])).toEqual(
        expect.arrayContaining(
          ["title` of kind `string", "draft` of kind `boolean", "labels` of kind `constant"].map(
            (field) => `${whereOf(call)}: the body field \`${field}\` has the wrong shape`,
          ),
        ),
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
