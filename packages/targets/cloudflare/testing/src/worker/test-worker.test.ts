import { describe, expect, it } from "vitest";
import { testWorker } from "./test-worker.ts";

const env = { HALONIC_TEST_RUNNER_TOKEN: "runner", HALONIC_SELFTEST_TOKEN: "self" };
const call = (path: string, method: string, token?: string, e: object | undefined = env) =>
  testWorker.fetch(
    new Request(`https://w.example${path}`, {
      method,
      ...(token === undefined ? {} : { headers: { authorization: `Bearer ${token}` } }),
    }),
    e,
  );

describe("the test Worker's token", () => {
  it("refuses a request without the runner's token", async () => {
    expect((await call("/cases", "GET")).status).toBe(401);
    expect((await call("/cases", "GET", "wrong")).status).toBe(401);
    expect((await call("/run", "POST", "self")).status).toBe(401);
  });

  it("refuses everything when it was deployed without a token or without env", async () => {
    expect((await call("/cases", "GET", "", {})).status).toBe(401);
    expect((await call("/cases", "GET", "x", undefined)).status).toBe(401);
  });

  it("answers the runner's token on /cases", async () => {
    expect((await call("/cases", "GET", "runner")).status).toBe(200);
  });

  it("answers the deploy's self-test only with its own token", async () => {
    expect((await call("/self-test", "POST", "runner")).status).toBe(401);
    const answer = await call("/self-test", "POST", "self");
    expect(await answer.json()).toEqual({ ok: true, checks: [] });
  });
});
