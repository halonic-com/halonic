import { ok } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  type DefaultModelInput,
  defaultModelLine,
  doctorLineActions,
  type LastRunInput,
  lastRunLine,
} from "./doctor-first-run.ts";
import { sandboxLine } from "./doctor-lines.ts";
import { modelsLine } from "./doctor-models-line.ts";
import type { DoctorProvider } from "./doctor-service.ts";
import {
  answered,
  anthropic,
  doctor,
  ollama,
  ready,
  workspace,
} from "./testing/doctor-fixtures.ts";

const sample: DoctorProvider = {
  provider: "mock",
  name: "Sample answers",
  runs: "without-a-key",
  testModel: true,
};

function input(
  provider: DoctorProvider,
  found: Partial<DefaultModelInput> = {},
): DefaultModelInput {
  return {
    aliases: [{ alias: "default", provider: provider.provider }],
    providers: [provider],
    models: undefined,
    localOnly: false,
    ...found,
  };
}

const noKey = answered(
  modelsLine(
    [{ provider: "anthropic", name: "Anthropic", runs: "with-a-key", keyStored: false }],
    [{ alias: "default", provider: "anthropic" }],
  ),
);

const run: Omit<LastRunInput, "failure"> = {
  runId: "run-1",
  step: 2,
  steps: 3,
  stepName: "Write reply",
  durationMs: 6800,
};

verifies("app.doctor-default-model", () => {
  it("says default uses Sample answers on the test model", () => {
    expect(defaultModelLine(input(sample))).toEqual({
      check: "default-model",
      status: "ok",
      target: { uses: "sample-answers" },
    });
  });

  it("names the provider, and Local only before a missing key", () => {
    const target = { uses: "provider", provider: "anthropic", name: "Anthropic", local: false };
    expect(defaultModelLine(input(anthropic, { models: noKey }))).toEqual({
      check: "default-model",
      status: "failed",
      target,
      cause: "models.no-key",
    });
    expect(defaultModelLine(input(anthropic, { models: noKey, localOnly: true }))?.cause).toBe(
      "default-model.local-only",
    );
  });

  it("takes a server on this computer that doesn't answer from the Models line, and Local only allows it", () => {
    const unreachable = modelsLine(
      [
        {
          ...ollama,
          runs: "on-this-computer",
          address: "localhost:11434",
          models: { ok: false, error: "refused" },
        },
      ],
      [{ alias: "default", provider: "ollama" }],
    );
    const line = defaultModelLine(input(ollama, { models: unreachable, localOnly: true }));
    expect(line?.target).toEqual({
      uses: "provider",
      provider: "ollama",
      name: "Ollama",
      local: true,
    });
    expect(line?.cause).toBe("models.unreachable");
  });

  it("is ✓ when the model can be used, names no cause when Models ran over, and is left out without default", () => {
    expect(defaultModelLine(input(anthropic))?.status).toBe("ok");
    expect(
      defaultModelLine(
        input(anthropic, { models: { check: "models", status: "warning", timedOut: true } }),
      ),
    ).toEqual(expect.not.objectContaining({ cause: expect.anything() }));
    expect(
      defaultModelLine({
        ...input(anthropic),
        aliases: [{ alias: "smart", provider: "anthropic" }],
      }),
    ).toBeUndefined();
  });

  it("is in the report, but not in the summary halonic doctor counts", async () => {
    const { service } = doctor();
    const report = await service.check({
      ...workspace({
        aliases: [{ alias: "default", provider: "anthropic" }],
        providers: [anthropic],
      }),
      localOnly: true,
    });
    expect(report.defaultModel?.cause).toBe("default-model.local-only");
    // Only the Models line's missing key counts.
    expect(report.summary).toEqual({ problems: 0, warnings: 1, needsFixing: false });
  });
});

verifies("app.doctor-last-run", () => {
  const sandbox = sandboxLine(ready, { files: "shared", strength: "os" });

  it("points a missing key at the Models line that shows it", () => {
    const failure = {
      reason: "no-key",
      provider: "Anthropic",
      secret: "key",
      alias: "default",
    } as const;
    expect(lastRunLine({ ...run, failure }, { models: noKey, sandbox })).toEqual({
      check: "last-run",
      status: "failed",
      ...run,
      failure,
      cause: "models.no-key",
      causeShownOn: "models",
    });
  });

  it("points Local only through default at the Default model line", () => {
    const failure = {
      reason: "local-only",
      workspace: "acme",
      provider: "Anthropic",
      agent: "Clerk",
      alias: "default",
    } as const;
    const defaultModel = defaultModelLine(input(anthropic, { localOnly: true }));
    const line = lastRunLine(
      { ...run, failure },
      { sandbox, ...(defaultModel && { defaultModel }) },
    );
    expect(line?.cause).toBe("default-model.local-only");
    expect(line?.causeShownOn).toBe("default-model");
  });

  it("points at the Models line only when it shows the same alias or server", () => {
    const otherAlias = {
      reason: "no-key",
      provider: "OpenAI",
      secret: "openai-key",
      alias: "smart",
    } as const;
    expect(
      lastRunLine({ ...run, failure: otherAlias }, { models: noKey, sandbox }),
    ).not.toHaveProperty("causeShownOn");
    const unreachable = answered(
      modelsLine(
        [
          {
            ...ollama,
            runs: "on-this-computer",
            address: "localhost:11434",
            models: { ok: false, error: "refused" },
          },
        ],
        [{ alias: "default", provider: "ollama" }],
      ),
    );
    const failure = (address: string) =>
      ({
        reason: "model-unreachable",
        provider: "Ollama",
        address,
        alias: "default",
        local: true,
      }) as const;
    expect(
      lastRunLine({ ...run, failure: failure("localhost:11434") }, { models: unreachable, sandbox })
        ?.causeShownOn,
    ).toBe("models");
    expect(
      lastRunLine({ ...run, failure: failure("localhost:8080") }, { models: unreachable, sandbox }),
    ).not.toHaveProperty("causeShownOn");
  });

  it("names its own cause when no line above shows it, and has no line for a cancelled run", () => {
    const line = lastRunLine(
      { ...run, failure: { reason: "out-of-credit", provider: "Anthropic" } },
      { models: noKey, sandbox },
    );
    expect(line?.cause).toBe("last-run.out-of-credit");
    expect(line).not.toHaveProperty("causeShownOn");
    expect(
      lastRunLine(
        {
          ...run,
          failure: {
            reason: "model-unreachable",
            provider: "OpenAI",
            address: "api.openai.com",
            alias: "smart",
            local: false,
          },
        },
        { sandbox },
      )?.cause,
    ).toBe("last-run.model-unreachable");
    expect(lastRunLine({ ...run, failure: undefined }, { sandbox })).toBeUndefined();
  });

  it("points a sandbox that isn't ready at a failed Sandbox line", () => {
    const failed = sandboxLine(
      { ok: false, reason: "not-supported", missing: [] },
      { files: "shared", strength: "os" },
    );
    const line = lastRunLine(
      { ...run, failure: { reason: "sandbox-not-ready", code: "not-supported" } },
      { sandbox: failed },
    );
    expect(line?.cause).toBe("sandbox.not-supported");
    expect(line?.causeShownOn).toBe("sandbox");
  });

  it("names each line's actions by id", () => {
    const trust = (value: "trusted" | "new") =>
      doctorLineActions({ check: "workspace", status: "ok", name: "acme", trust: value });
    expect([trust("trusted"), trust("new")]).toEqual([[], ["review-trust"]]);
    expect(doctorLineActions(noKey)).toEqual(["test-again", "open-models"]);
    const answering = modelsLine(
      [{ ...ollama, runs: "on-this-computer", address: "localhost:11434", models: ok([]) }],
      [{ alias: "default", provider: "ollama" }],
    );
    expect(doctorLineActions(answering ?? sandbox)).toEqual(["test-again"]);
    expect(doctorLineActions(defaultModelLine(input(anthropic)) ?? sandbox)).toEqual([
      "pick-model",
    ]);
    expect(doctorLineActions(defaultModelLine(input(sample)) ?? sandbox)).toEqual([]);
    expect(doctorLineActions({ check: "models", status: "warning", timedOut: true })).toEqual([]);
    expect(doctorLineActions(sandbox)).toEqual([]);
  });

  it("is in the report when the host gives a failed run", async () => {
    const { service } = doctor();
    const report = await service.check({
      ...workspace({
        aliases: [{ alias: "default", provider: "anthropic" }],
        providers: [anthropic],
      }),
      lastRun: {
        ...run,
        failure: { reason: "no-key", provider: "Anthropic", secret: "key", alias: "default" },
      },
    });
    expect(report.lastRun?.causeShownOn).toBe("models");
    expect(doctorLineActions(report.lastRun ?? sandbox)).toEqual(["open-run"]);
    expect(report.summary.problems).toBe(0);
  });
});
