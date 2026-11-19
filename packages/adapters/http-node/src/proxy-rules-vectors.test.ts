import { readFileSync } from "node:fs";
import { connectorHostClass } from "@halonicjs/adapter-http-kit";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { NoProxy } from "./no-proxy.ts";
import { ProxyError } from "./proxy-error.ts";
import { type ProxyFromEnv, proxyFromEnv } from "./proxy-from-env.ts";
import { routeFor } from "./proxy-route.ts";

/**
 * The cases the Studio shell's `halonic-http-guard` passes too, so the CLI
 * and Studio send the same calls through the proxy (HAL-12966).
 */
interface ProxyRuleVectors {
  readonly settings: readonly { env: Record<string, string>; setting: string }[];
  readonly noProxy: readonly { list: string; url: string; matches: boolean }[];
  readonly routes: readonly { env: Record<string, string>; url: string; route: string }[];
}

const vectors = JSON.parse(
  readFileSync(new URL("../test-vectors/proxy-rules.json", import.meta.url), "utf8"),
) as ProxyRuleVectors;

function shown(setting: ProxyFromEnv): string {
  return setting.kind === "proxy" ? setting.proxy.endpoint.toString() : setting.kind;
}

function routeOf(env: Record<string, string>, address: string): string {
  const url = new URL(address);
  const hostClass = connectorHostClass(url);
  if (hostClass === undefined) {
    throw new Error(`a vector's host must have a class: ${address}`);
  }
  try {
    return routeFor(url, hostClass, proxyFromEnv(env)).kind;
  } catch (error) {
    if (error instanceof ProxyError) {
      return "refused";
    }
    throw error;
  }
}

verifies("http-node.proxy-config", () => {
  describe("the shared proxy-rule vectors", () => {
    it.each(vectors.settings)("reads $env as $setting", ({ env, setting }) => {
      expect(shown(proxyFromEnv(env))).toBe(setting);
    });

    it.each(vectors.noProxy)("NO_PROXY=$list matches $url: $matches", ({ list, url, matches }) => {
      expect(NoProxy.parse(list).matches(new URL(url))).toBe(matches);
    });
  });
});

verifies("http-node.proxy-guard", () => {
  describe("the shared proxy-rule vectors", () => {
    it.each(vectors.routes)("routes $url with $env: $route", ({ env, url, route }) => {
      expect(routeOf(env, url)).toBe(route);
    });
  });
});
