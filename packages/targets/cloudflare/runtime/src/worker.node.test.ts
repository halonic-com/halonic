import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { worker } from "./worker.ts";

verifies("runtime.health-route", () => {
  it("fetch() hands the request to the routes", async () => {
    const health = worker.fetch(new Request("https://cloud.example/health"));
    expect(health.status).toBe(200);
    expect(worker.fetch(new Request("https://cloud.example/")).status).toBe(404);
  });
});
