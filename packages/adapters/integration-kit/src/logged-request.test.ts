import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { client } from "./fake-transport.test-helper.ts";
import type { RequestLogEntry } from "./request-log.ts";

verifies("integration-kit.logged-request", () => {
  it("gives onLogged the entry the log took for an answered request", async () => {
    const { http, log, options } = client(() => new Response("slow down", { status: 429 }));
    const heard: RequestLogEntry[] = [];
    const response = await http.fetch("https://api.example.com/v1/forecast?city=Ghent", {
      method: "POST",
      onLogged: (entry) => heard.push(entry),
    });
    expect(response.status).toBe(429);
    expect(heard).toEqual(log.entries());
    expect(heard).toEqual([expect.objectContaining({ status: 429, host: "api.example.com" })]);
    expect(options[0]).not.toHaveProperty("onLogged");
  });

  it("gives onLogged an entry for each try of a request the kit tries again", async () => {
    let tries = 0;
    const { http, log } = client(() => {
      tries += 1;
      return tries === 1
        ? new Response("slow down", { status: 429, headers: { "retry-after": "0" } })
        : new Response("{}");
    });
    const heard: RequestLogEntry[] = [];
    await http.fetch("https://api.example.com/v1/forecast", {
      onLogged: (entry) => heard.push(entry),
    });
    expect(heard).toEqual(log.entries());
    expect(heard.map((entry) => [entry.status, entry.retry])).toEqual([
      [429, undefined],
      [200, 1],
    ]);
  });

  it("gives onLogged the entry of a refused request", async () => {
    const { http, log } = client();
    const heard: RequestLogEntry[] = [];
    await http
      .fetch("https://evil.example/collect", { onLogged: (entry) => heard.push(entry) })
      .catch(() => undefined);
    expect(heard).toEqual(log.entries());
    expect(heard).toEqual([
      expect.objectContaining({ host: "evil.example", refusal: "host-not-allowed" }),
    ]);
  });

  it("logs a request without onLogged, or with one that isn't a function, as before", async () => {
    const { http, log } = client();
    await http.fetch("https://api.example.com/v1/forecast");
    await http.fetch("https://api.example.com/v1/forecast", { onLogged: "no" } as never);
    expect(log.entries()).toHaveLength(2);
  });
});
