import { currentSecretForms } from "@halonicjs/adapter-integration-kit";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  bridgeOptions,
  fakeRunnerProcess,
  fakeSecret,
  HandDrivenRunner,
} from "../pipes.test-helper.ts";
import { type ConnectRunnerOptions, connectRunner } from "./connect-runner.ts";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
});

afterEach(() => {
  vi.useRealTimers();
});

async function startedRunner(overrides: Partial<ConnectRunnerOptions>) {
  const fake = fakeRunnerProcess();
  const options = bridgeOptions(fake, overrides);
  const runner = new HandDrivenRunner(fake);
  const connecting = connectRunner(options);
  await runner.start();
  return { fake, options, runner, connection: await connecting };
}

verifies("integration-runner.live-secret-filter", () => {
  it("removes a sign-in token that is issued while the runner runs, from results and from stderr", async () => {
    const issued: string[] = [];
    const secrets = currentSecretForms([], { filterValues: () => issued });
    const { fake, options, runner, connection } = await startedRunner({ secrets });
    const first = connection.callTool("forecast", {});
    await runner.send({ type: "result", call: 0, text: `token=${fakeSecret}` });
    expect(await first).toBe(`token=${fakeSecret}`);

    issued.push(fakeSecret);
    const second = connection.callTool("forecast", {});
    await fake.stderr.write(new TextEncoder().encode(`leaked ${fakeSecret}\n`));
    await vi.advanceTimersByTimeAsync(0);
    await runner.send({ type: "result", call: 1, text: `token=${fakeSecret}` });

    expect(await second).toBe("token=[secret removed]");
    expect(options.log.join("")).toContain("leaked [secret removed]");
    await connection.close();
  });
});
