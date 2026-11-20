import { describe, expect, it } from "vitest";
import { RemoteRunner } from "./remote-runner.ts";

function fakeFetch(
  answer: Response,
  seen: { url?: string; init?: RequestInit } = {},
): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    seen.url = url;
    if (init !== undefined) seen.init = init;
    return answer;
  }) as unknown as typeof fetch;
}

describe("RemoteRunner", () => {
  it("lists cases with the bearer token and no double slash in the address", async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    const tree = { kind: "suite", name: "", meta: {}, children: [] };
    const runner = new RemoteRunner(
      "https://w.example/",
      "tok",
      fakeFetch(Response.json(tree), seen),
    );
    expect(await runner.cases()).toEqual(tree);
    expect(seen.url).toBe("https://w.example/cases");
    expect(seen.init?.headers).toEqual({ authorization: "Bearer tok" });
  });

  it("runs a case by posting its ID", async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    const result = { status: "passed", assertions: 2 };
    const runner = new RemoteRunner(
      "https://w.example",
      "tok",
      fakeFetch(Response.json(result), seen),
    );
    expect(await runner.run("c1")).toEqual(result);
    expect(seen.init?.method).toBe("POST");
    expect(seen.init?.body).toBe('{"id":"c1"}');
  });

  it("says the status on an error and never prints the token", async () => {
    const runner = new RemoteRunner(
      "https://w.example",
      "s3cret",
      fakeFetch(new Response("no", { status: 401 })),
    );
    const error = await runner.cases().catch((e: unknown) => e as Error);
    expect((error as Error).message).toContain("401");
    expect((error as Error).message).not.toContain("s3cret");
  });

  // HAL-14022: right after a deploy, some of Cloudflare's edge servers don't route the new
  // workers.dev address yet and answer their own HTML "Page not found" instead of the Worker.
  it("asks again while Cloudflare's edge answers its HTML not-found page", async () => {
    const answers = [edgeNotFound(), edgeNotFound(), Response.json({ status: "passed" })];
    const waits: number[] = [];
    const runner = new RemoteRunner("https://w.example", "tok", queuedFetch(answers), {
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    expect(await runner.run("c1")).toEqual({ status: "passed" });
    expect(waits).toEqual([1000, 2000]);
  });

  it("gives up with the status once the edge keeps answering not found", async () => {
    const answers = Array.from({ length: 20 }, () => edgeNotFound());
    let tries = 0;
    const runner = new RemoteRunner(
      "https://w.example",
      "tok",
      (async () => {
        tries += 1;
        return answers.shift() ?? edgeNotFound();
      }) as unknown as typeof fetch,
      { sleep: async () => {} },
    );
    const error = await runner.cases().catch((e: unknown) => e as Error);
    expect((error as Error).message).toContain("answered GET /cases with 404");
    expect(tries).toBe(8);
  });

  it("never asks again when the Worker itself answers 404", async () => {
    let tries = 0;
    const runner = new RemoteRunner(
      "https://w.example",
      "tok",
      (async () => {
        tries += 1;
        return new Response("The test Worker has no POST /run.", { status: 404 });
      }) as unknown as typeof fetch,
      { sleep: async () => {} },
    );
    const error = await runner.run("c1").catch((e: unknown) => e as Error);
    expect((error as Error).message).toContain("The test Worker has no POST /run.");
    expect(tries).toBe(1);
  });
});

function edgeNotFound(): Response {
  return new Response("<!DOCTYPE html><title>Page not found</title>", {
    status: 404,
    headers: { "content-type": "text/html; charset=UTF-8" },
  });
}

function queuedFetch(answers: Response[]): typeof fetch {
  return (async () => {
    const answer = answers.shift();
    if (answer === undefined) throw new Error("The test asked more often than it planned.");
    return answer;
  }) as unknown as typeof fetch;
}
