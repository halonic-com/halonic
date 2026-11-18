import { ModelCallError, VendorErrorText } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { failureCauseOf } from "../run/failure-cause-of.ts";
import { ScriptedModel, textAnswer } from "../testing/scripted-model.ts";
import { alias, runTurnOn } from "./model-chain.test-helper.ts";
import { MemoryTurnLog } from "./turn-test-kit.test-helper.ts";

// What a failed model call leaves behind: the provider's text on llm.fallback,
// and the last model's typed cause and message when none is left.

verifies("engine.provider-text", () => {
  it("keeps the provider's text on llm.fallback", async () => {
    const log = new MemoryTurnLog();
    const cause = new VendorErrorText(502, "upstream connect error");
    const proxyDown = new ModelCallError("offline", "acme-cloud can't be reached", { cause });
    const smart = new ScriptedModel([proxyDown], "acme-cloud");
    const local = new ScriptedModel([textAnswer("From this machine")], "acme-local");

    await runTurnOn(alias("smart", smart, { fallback: [alias("local", local)] }), { log });

    expect(log.events[1]).toEqual({
      type: "llm.fallback",
      agent: "clerk",
      from: "smart",
      to: "local",
      error: "offline: acme-cloud can't be reached",
      providerText: { status: 502, text: "upstream connect error" },
    });
  });
});

verifies("engine.none-left-cause", () => {
  it("keeps the last model's typed cause, such as a proxy that refused, for run.failed", async () => {
    const proxyRefused = new ModelCallError(
      "offline",
      "Halonic couldn't reach acme-cloud at api.acme.test: Your proxy refused to connect to api.acme.test (status 403).",
      {
        host: "api.acme.test",
        failureCause: { kind: "denied", code: "proxy.refused", detail: { status: "403" } },
      },
    );
    const smart = new ScriptedModel([proxyRefused], "acme-cloud");

    const failure = await runTurnOn(alias("smart", smart)).catch((error: unknown) => error);

    expect(failure).toMatchObject({
      reason: "offline",
      host: "api.acme.test",
      kind: "denied",
      failureCause: { code: "proxy.refused", detail: { status: "403" } },
      cause: proxyRefused,
    });
    expect((failure as Error).message).toMatch(/\(tried smart\): .*Your proxy refused/);
    expect(failureCauseOf(failure)).toEqual({
      kind: "denied",
      code: "proxy.refused",
      detail: { status: "403" },
    });
  });

  it("ends the message with the last model's own message", async () => {
    const smart = new ScriptedModel(
      [new ModelCallError("provider-busy", "acme-cloud was busy (HTTP 529)")],
      "acme-cloud",
    );
    const backup = new ScriptedModel(
      [new ModelCallError("provider-busy", "acme-other was busy (HTTP 429)")],
      "acme-other",
    );

    const failure = await runTurnOn(
      alias("smart", smart, { fallback: [alias("backup", backup)] }),
    ).catch((error: unknown) => error);

    expect((failure as Error).message).toBe(
      "no model free: the last one's provider was busy (tried smart, backup): acme-other was busy (HTTP 429)",
    );
    expect(failure).not.toHaveProperty("kind");
  });
});
