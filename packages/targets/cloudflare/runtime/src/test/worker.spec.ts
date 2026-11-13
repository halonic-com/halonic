/**
 * The real Worker inside workerd: `fetch()` answers the health route, and every
 * Durable Object class is exported under its fixed name and bound by the
 * configuration (HAL-6802). Run by `worker.test.ts`.
 */

import { env } from "cloudflare:workers";
import { durableObjectClassNames } from "@halonicjs/adapter-cloudflare-durable";
import { describe, expect, it } from "vitest";
import * as entry from "../index.ts";

export { CoordinationObject, RoutinesObject, RunObject } from "../index.ts";

describe("the Worker in workerd", () => {
  it("answers the health route with ok", async () => {
    const response = await entry.default.fetch(new Request("https://cloud.example/health"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("refuses an API path while host/server isn't on main", async () => {
    const response = await entry.default.fetch(new Request("https://cloud.example/api/hello"));
    expect(response.status).toBe(404);
  });

  it("exports every Durable Object class under its fixed name", () => {
    const exported: Record<string, unknown> = { ...entry };
    for (const name of durableObjectClassNames) {
      expect(typeof exported[name], name).toBe("function");
    }
  });

  it("runs a Durable Object bound under its class", async () => {
    const { COORDINATION } = env as {
      COORDINATION: DurableObjectNamespace<entry.CoordinationObject>;
    };
    const object = COORDINATION.get(COORDINATION.idFromName("coordination"));
    expect(await object.tryAcquire("worker-spec", 60_000)).toMatchObject({ key: "worker-spec" });
  });
});
