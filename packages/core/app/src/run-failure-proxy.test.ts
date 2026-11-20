import type { RunFailureCause } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type FailedModel, type RunFailedEvent, runFailureOf } from "./run-failure.ts";
import { proxyFailureOf } from "./run-failure-proxy.ts";

verifies("app.run-failure-proxy", () => {
  const proxy = "http://127.0.0.1:3128";
  const atOpenai: FailedModel = {
    alias: "smart",
    model: "gpt-4.1",
    agent: "writer",
    workspace: "Acme",
    providerId: "openai",
    provider: undefined,
    address: "api.openai.com",
    keyMissing: false,
  };

  /** A cause with a `code` and its `detail`, as the engine logs it. */
  function causeOf(code: string, detail: Record<string, string> = {}): RunFailureCause {
    return { kind: "unavailable", code, detail };
  }

  /** A `model-unreachable` run whose cause is `cause`. */
  function unreachable(cause: RunFailureCause | undefined): RunFailedEvent {
    return {
      runId: "01JD8Q",
      seq: 9,
      at: "2026-11-10T09:00:00.000Z",
      type: "run.failed",
      state: "draft",
      error: "the engine's own words",
      reason: "model-unreachable",
      host: "api.openai.com",
      ...(cause === undefined ? {} : { cause }),
    };
  }

  it("gives a model-unreachable run with a proxy cause the proxy's facts", () => {
    const cause = causeOf("proxy.refused", {
      variable: "https_proxy",
      proxy,
      host: "api.openai.com",
      status: "403",
    });
    expect(runFailureOf(unreachable(cause), atOpenai)).toEqual({
      reason: "proxy-failed",
      provider: "openai",
      variable: "https_proxy",
      problem: "refused",
      proxy,
      host: "api.openai.com",
    });
  });

  it("keeps model-unreachable for any other cause, or none", () => {
    const network = causeOf("network.refused", { host: "api.openai.com" });
    for (const failed of [unreachable(network), unreachable(undefined)]) {
      expect(runFailureOf(failed, atOpenai)).toMatchObject({ reason: "model-unreachable" });
    }
  });

  it("names each problem with the facts its lines need", () => {
    const facts = { variable: "HTTPS_PROXY", proxy, host: "api.openai.com" };
    expect(proxyFailureOf(causeOf("proxy.setting", facts), "OpenAI")).toMatchObject({
      problem: "setting",
    });
    for (const problem of ["unreachable", "timeout", "credentials"]) {
      expect(proxyFailureOf(causeOf(`proxy.${problem}`, facts), "OpenAI")).toEqual({
        reason: "proxy-failed",
        provider: "OpenAI",
        variable: "HTTPS_PROXY",
        problem,
        proxy,
      });
    }
    expect(proxyFailureOf(causeOf("proxy.insecure", facts), "OpenAI")).toMatchObject({
      problem: "insecure",
      proxy,
      host: "api.openai.com",
    });
    expect(proxyFailureOf(causeOf("proxy.plain-http", facts), "OpenAI")).toMatchObject({
      problem: "plain-http",
      host: "api.openai.com",
    });
  });

  it("is other for a code it doesn't know, or one without its facts, and names HTTPS_PROXY by default", () => {
    for (const code of ["proxy.bad-host", "proxy.refused", "proxy.plain-http", "proxy.timeout"]) {
      expect(proxyFailureOf(causeOf(code), "OpenAI")).toEqual({
        reason: "proxy-failed",
        provider: "OpenAI",
        variable: "HTTPS_PROXY",
        problem: "other",
      });
    }
  });
});
