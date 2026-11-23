import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { liveRunTarget } from "./live-target.ts";
import { type RunTarget, runChecks } from "./run-checks.ts";

const run = { hubId: "acme", workflowId: "reply" };

interface FakeWorker {
  /** The event types the run's stream sends, in order. */
  readonly types: readonly string[];
  /** Whether the stream ends with its `end` message. */
  readonly ends?: boolean;
  readonly password?: string;
}

/** A Worker that signs in one password, starts run `r-1` and streams the given events. */
function fakeWorker({ types, ends = true, password = "open-sesame" }: FakeWorker): RunTarget {
  const fake = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const { pathname } = new URL(String(input));
    const cookie = new Headers(init?.headers).get("cookie");
    if (pathname === "/api/login") {
      const sent = (JSON.parse(String(init?.body)) as { password: string }).password;
      if (sent !== password) return Response.json({ code: "sign_in_failed" }, { status: 401 });
      return new Response("{}", { headers: { "set-cookie": "s=abc; Path=/; Secure" } });
    }
    if (cookie !== "s=abc") return Response.json({ code: "sign_in_required" }, { status: 401 });
    if (pathname === "/api/runs") return Response.json({ id: "r-1" });
    if (pathname === "/api/runs/r-1/events") {
      const frames = types.map(
        (type, index) =>
          `id: ${index + 1}\nevent: run\ndata: ${JSON.stringify({ seq: index + 1, type })}\n\n`,
      );
      return new Response(frames.join("") + (ends ? "event: end\ndata: {}\n\n" : ""));
    }
    return new Response("{}", { status: 404 });
  };
  return { baseUrl: "https://hlt-7-1-w.acme.workers.dev", password: "open-sesame", fetch: fake };
}

verifies("cloudflare-live.runs", () => {
  it("passes a run that ends with run.completed after the model's answer", async () => {
    const target = fakeWorker({ types: ["run.started", "llm.response", "run.completed"] });
    await expect(runChecks.runToCompletion(target, run)).resolves.toBeUndefined();
  });

  it("fails a run that ends otherwise, and names how it ended", async () => {
    const target = fakeWorker({ types: ["run.started", "llm.response", "run.failed"] });
    await expect(runChecks.runToCompletion(target, run)).rejects.toThrow("run.failed");
  });

  it("fails a run with no model answer, and lists its events", async () => {
    const target = fakeWorker({ types: ["run.started", "run.completed"] });
    await expect(runChecks.runToCompletion(target, run)).rejects.toThrow(
      "no model answer: run.started, run.completed",
    );
  });

  it("fails when the stream closes before the run ends", async () => {
    const target = fakeWorker({ types: ["run.started"], ends: false });
    await expect(runChecks.runToCompletion(target, run)).rejects.toThrow("before the run ended");
  });

  it("fails on a wrong password and names the 401", async () => {
    const target = fakeWorker({ types: [], password: "another" });
    await expect(runChecks.runToCompletion(target, run)).rejects.toThrow(
      "The sign-in was answered 401",
    );
  });

  it("names the missing variables of the run target, never a value", () => {
    expect(() => liveRunTarget({ HALONIC_LIVE_WORKER_URL: "https://a.example" })).toThrow(
      "Missing: HALONIC_LIVE_PASSWORD.",
    );
  });
});
