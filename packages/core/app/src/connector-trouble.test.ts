import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { connectorTroubleOf, shownField } from "./connector-trouble.ts";
import type { RequestLogLine } from "./integration-log/index.ts";

const at = "2026-11-26T09:00:00.000Z";

function request(status: number | undefined, host = "shop.example.com"): RequestLogLine {
  return {
    type: "request",
    at,
    method: "GET",
    host,
    path: "/orders/{…}",
    ...(status === undefined ? {} : { status }),
    durationMs: 12,
    outcome: status === undefined ? "refused" : "ok",
  };
}

function failure(fields?: readonly unknown[]): RequestLogLine {
  return {
    type: "failure",
    at,
    tool: "list_orders",
    kind: "unavailable",
    ...(fields === undefined ? {} : { fields: fields as readonly string[] }),
  };
}

verifies("app.connector-trouble", () => {
  it.each([
    [401, "not-accepted"],
    [403, "not-allowed"],
    [404, "not-found"],
    [429, "slow-down"],
  ] as const)("reads a call whose last request got %i as %s", (status, kind) => {
    expect(connectorTroubleOf([request(200), request(status), failure()])).toEqual({
      kind,
      host: "shop.example.com",
      fields: [],
    });
  });

  it("reads a note with fields as a changed reply, whatever the status", () => {
    const lines = [request(200), failure(["fulfillment.status", "items[0].sku"])];
    expect(connectorTroubleOf(lines)).toEqual({
      kind: "reply-changed",
      host: "shop.example.com",
      fields: ["fulfillment.status", "items[0].sku"],
    });
  });

  it("finds no trouble for a 500, a refused request or a note without a request", () => {
    expect(connectorTroubleOf([request(500), failure()])).toBeUndefined();
    expect(connectorTroubleOf([request(undefined), failure()])).toBeUndefined();
    expect(connectorTroubleOf([failure()])).toBeUndefined();
  });

  it("finds no trouble once a later call worked, or with no failure at all", () => {
    expect(connectorTroubleOf([request(404), failure(), request(200)])).toBeUndefined();
    expect(connectorTroubleOf([request(200)])).toBeUndefined();
    expect(connectorTroubleOf([])).toBeUndefined();
  });

  it("shows a field name with anything but path characters as {…}", () => {
    for (const field of ["<b>x</b>", "order id", 'say "hi"', "a\nb", "", 42]) {
      expect(shownField(field)).toBe("{…}");
    }
    const lines = [request(200), failure(["<b>status</b>", "items[0].sku"])];
    expect(connectorTroubleOf(lines)?.fields).toEqual(["{…}", "items[0].sku"]);
  });

  it("cuts a field name over 60 characters, and keeps at most 8 names", () => {
    expect(shownField("a".repeat(60))).toBe("a".repeat(60));
    expect(shownField("b".repeat(61))).toBe(`${"b".repeat(59)}…`);
    const many = Array.from({ length: 12 }, (_, index) => `field${index}`);
    expect(connectorTroubleOf([request(200), failure(many)])?.fields).toHaveLength(8);
  });

  it("names no host that isn't a plain host name", () => {
    const lines = [request(404, '<img src="x">'), failure()];
    expect(connectorTroubleOf(lines)?.host).toBe("");
    expect(connectorTroubleOf([request(404, "{…}"), failure()])?.host).toBe("");
    expect(connectorTroubleOf([request(404, "localhost:8123"), failure()])?.host).toBe(
      "localhost:8123",
    );
  });
});
