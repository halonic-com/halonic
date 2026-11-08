import { describe, expect, it } from "vitest";
import { ServiceError, ServiceRegistry, serviceKey } from "./service-registry.ts";

const clockKey = serviceKey<{ now(): Date }>("clock");
const logKey = serviceKey<string[]>("log");

describe("app.service-registry", () => {
  it("returns the service provided for a key", () => {
    const registry = new ServiceRegistry();
    const clock = { now: () => new Date(0) };
    expect(registry.provide(clockKey, clock)).toBe(clock);
    expect(registry.get(clockKey)).toBe(clock);
    expect(registry.has(clockKey)).toBe(true);
  });

  it("refuses a missing key and a key provided twice", () => {
    const registry = new ServiceRegistry();
    expect(registry.has(clockKey)).toBe(false);
    expect(() => registry.get(clockKey)).toThrow(ServiceError);
    registry.provide(logKey, []);
    expect(() => registry.provide(logKey, [])).toThrow(ServiceError);
  });

  it("disposes newest first, goes on after a failure, then throws it", async () => {
    const registry = new ServiceRegistry();
    const order: string[] = [];
    registry.provide(serviceKey("a"), {
      dispose: () => {
        order.push("a");
        throw new Error("a failed");
      },
    });
    registry.provide(serviceKey("plain"), { value: 1 });
    registry.provide(serviceKey("b"), {
      dispose: async () => {
        order.push("b");
      },
    });
    await expect(registry.dispose()).rejects.toThrow("a failed");
    expect(order).toEqual(["b", "a"]);
    expect(registry.has(serviceKey("a"))).toBe(false);
  });

  it("refuses a service provided after it was disposed", async () => {
    const registry = new ServiceRegistry();
    await registry.dispose();
    expect(() => registry.provide(logKey, [])).toThrow(ServiceError);
    expect(registry.has(logKey)).toBe(false);
  });

  it("throws an AggregateError when several services fail to dispose", async () => {
    const registry = new ServiceRegistry();
    for (const name of ["a", "b"]) {
      registry.provide(serviceKey(name), {
        dispose: () => {
          throw new Error(name);
        },
      });
    }
    await expect(registry.dispose()).rejects.toThrow(AggregateError);
  });
});
