import { ModelCallError } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { failureCauseOf } from "../run/failure-cause-of.ts";
import { ScriptedModel } from "../testing/scripted-model.ts";
import { alias, runTurnOn } from "./model-chain.test-helper.ts";

// What a failed turn keeps when no model is left: the last model's typed cause
// and its message.

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
