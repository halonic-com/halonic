import { runFailureOf } from "@halonicjs/app/run-failure";
import type { RunFailureCause } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { calledModel, failedWith, openaiModel } from "../test/run-failure-fixtures.ts";
import { plainText } from "./phrase.ts";
import { runFailedLines } from "./run-failures.ts";

verifies("cli.run-failed-proxy", () => {
  /** A `model-unreachable` run at OpenAI whose cause is `code`, with `detail`. */
  function failedThroughProxy(code: string, detail: Record<string, string>) {
    const cause: RunFailureCause = { kind: "unavailable", code, detail };
    return runFailureOf(
      { ...failedWith("model-unreachable", "api.openai.com"), cause },
      calledModel({ ...openaiModel }),
    );
  }

  /** Line 1 and line 2 of a failure, as plain words. */
  function bothLines(failure: ReturnType<typeof runFailureOf>): [string, string | undefined] {
    if (failure === undefined) throw new Error("expected a failure");
    const run = { title: "Support reply", step: "Draft a reply", runId: "01JD8Q" };
    const { message, fix } = runFailedLines(run, failure);
    return [plainText(message.phrase), fix === undefined ? undefined : plainText(fix.phrase)];
  }

  const proxy = "http://127.0.0.1:3128";
  const at = "Support reply failed in the step Draft a reply:";

  it("names a proxy that refused the host, and who can allow it (Nina's 403)", () => {
    const failure = failedThroughProxy("proxy.refused", {
      variable: "HTTPS_PROXY",
      proxy,
      host: "api.openai.com",
      status: "403",
    });
    expect(failure).toEqual({
      reason: "proxy-failed",
      provider: "OpenAI",
      variable: "HTTPS_PROXY",
      problem: "refused",
      proxy,
      host: "api.openai.com",
    });
    expect(bothLines(failure)).toEqual([
      `${at} your proxy ${proxy} from HTTPS_PROXY refused to connect to api.openai.com.`,
      "Ask whoever runs your proxy to allow api.openai.com, then run again.",
    ]);
  });

  it("names a proxy that isn't running", () => {
    const failure = failedThroughProxy("proxy.unreachable", {
      variable: "HTTPS_PROXY",
      proxy,
      host: "api.openai.com",
    });
    expect(bothLines(failure)).toEqual([
      `${at} Halonic couldn't reach your proxy ${proxy} from HTTPS_PROXY, so nothing was sent to OpenAI.`,
      "Start your proxy, or set HTTPS_PROXY to one that runs, then run again.",
    ]);
  });

  it("names a proxy that never answered, with the same fix", () => {
    const failure = failedThroughProxy("proxy.timeout", { variable: "HTTPS_PROXY", proxy });
    expect(bothLines(failure)).toEqual([
      `${at} your proxy ${proxy} from HTTPS_PROXY didn't answer in time, so nothing was sent to OpenAI.`,
      "Start your proxy, or set HTTPS_PROXY to one that runs, then run again.",
    ]);
  });

  // socks5://, no http:// and https:// all read as an unusable setting (Nina's cases).
  it("names an unusable setting by its variable, with the shape it needs", () => {
    const failure = failedThroughProxy("proxy.setting", {
      variable: "https_proxy",
      host: "api.openai.com",
    });
    expect(bothLines(failure)).toEqual([
      `${at} the proxy setting in https_proxy isn't one Halonic can use, so nothing was sent to OpenAI.`,
      "Set https_proxy to http://host:port, then run again.",
    ]);
  });

  it("names a public http:// host, with https:// or NO_PROXY as the fix (Nina's case)", () => {
    const failure = failedThroughProxy("proxy.plain-http", {
      variable: "HTTPS_PROXY",
      host: "model.test",
    });
    expect(bothLines(failure)).toEqual([
      `${at} OpenAI is at model.test over plain http, which Halonic never sends through the proxy in HTTPS_PROXY.`,
      "Give OpenAI an https:// baseUrl, or add model.test to NO_PROXY, then run again.",
    ]);
  });

  it("names refused credentials without them", () => {
    const failure = failedThroughProxy("proxy.credentials", {
      variable: "HTTPS_PROXY",
      proxy,
      status: "407",
    });
    expect(bothLines(failure)).toEqual([
      `${at} your proxy ${proxy} from HTTPS_PROXY refused the user name and password.`,
      "Fix the user name and password in HTTPS_PROXY, then run again.",
    ]);
  });

  it("names a tunnel that failed its security check, with the certificate fix", () => {
    const failure = failedThroughProxy("proxy.insecure", {
      variable: "HTTPS_PROXY",
      proxy,
      host: "api.openai.com",
    });
    expect(bothLines(failure)).toEqual([
      `${at} the connection to api.openai.com through your proxy ${proxy} failed its security check.`,
      "If your proxy re-signs https, set NODE_EXTRA_CA_CERTS to your company's certificate, then run again.",
    ]);
  });

  it("says to check the variable for a code it doesn't know or one without its facts", () => {
    const other = [
      `${at} Halonic couldn't use your proxy from HTTPS_PROXY to reach OpenAI.`,
      "Check HTTPS_PROXY, then run again.",
    ];
    expect(bothLines(failedThroughProxy("proxy.bad-host", { variable: "HTTPS_PROXY" }))).toEqual(
      other,
    );
    expect(bothLines(failedThroughProxy("proxy.refused", { variable: "HTTPS_PROXY" }))).toEqual(
      other,
    );
    expect(failedThroughProxy("proxy.unreachable", {})).toMatchObject({
      variable: "HTTPS_PROXY",
      problem: "other",
    });
  });

  it("keeps the model-unreachable lines for any other cause", () => {
    expect(failedThroughProxy("google.api-disabled", {})).toMatchObject({
      reason: "model-unreachable",
    });
    expect(
      runFailureOf(failedWith("model-unreachable", "api.openai.com"), calledModel(openaiModel)),
    ).toMatchObject({ reason: "model-unreachable" });
  });
});
