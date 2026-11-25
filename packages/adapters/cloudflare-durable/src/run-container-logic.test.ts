import type {
  ContainerControl,
  ContainerProcess,
  RunContainerStorage,
} from "@halonicjs/adapter-sandbox-cloudflare-container";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type ContainerOutboundProps, RunContainerLogic } from "./run-container-logic.ts";

/** What the test's handler is: the props it was made with. */
interface Handler {
  readonly props: ContainerOutboundProps;
}

const objectName = "u/acme/run_1";
const startMs = Date.UTC(2026, 10, 25, 9);
const clock = { now: () => new Date(startMs) };

/** Cloudflare's container, recorded: its starts, intercepts and teardowns. */
class RecordedContainer implements ContainerControl<Handler> {
  running = false;
  destroyed = 0;
  readonly intercepts: { host: string; gate: Handler }[] = [];

  start(): void {
    this.running = true;
  }

  async destroy(): Promise<void> {
    this.running = false;
    this.destroyed += 1;
  }

  async interceptOutboundHttp(host: string, gate: Handler): Promise<void> {
    this.intercepts.push({ host, gate });
  }

  async interceptOutboundHttps(host: string, gate: Handler): Promise<void> {
    this.intercepts.push({ host, gate });
  }

  exec(): Promise<ContainerProcess> {
    throw new Error("Not used in this test.");
  }
}

/** A Durable Object's storage and alarm, in memory. */
function memoryStorage(): RunContainerStorage & { alarmAt: number | null } {
  const values = new Map<string, unknown>();
  const storage = {
    alarmAt: null as number | null,
    get: async (key: "run") => values.get(key) as never,
    put: async (key: "run", value: unknown) => {
      values.set(key, value);
    },
    setAlarm: async (atMs: number) => {
      storage.alarmAt = atMs;
    },
    deleteAlarm: async () => {
      storage.alarmAt = null;
    },
  };
  return storage;
}

/** The logic of `objectName`'s container object, recording its handlers and revokes. */
function containerObject(container: RecordedContainer | undefined) {
  const handlers: ContainerOutboundProps[] = [];
  const revoked: string[] = [];
  const logic = new RunContainerLogic({
    objectName,
    container,
    storage: memoryStorage(),
    clock,
    outboundHandlerOf: (props) => {
      handlers.push(props);
      return { props };
    },
    revokeBridge: async (name) => {
      revoked.push(name);
    },
  });
  return { logic, handlers, revoked };
}

const setup = {
  runId: objectName,
  deadlineMs: startMs + 60_000,
  env: { HALONIC_BRIDGE_TOKEN: "test-credential" },
  bridgeHost: "bridge.halonic.invalid",
  allowedSites: ["registry.npmjs.org"],
};

verifies("cloudflare-durable.run-container-object", () => {
  it("points every intercept at a handler told the rules and its own run object's name", async () => {
    const container = new RecordedContainer();
    const { logic, handlers } = containerObject(container);

    await logic.begin(setup);

    expect(handlers).toEqual([
      {
        runObjectName: objectName,
        rules: { bridgeHost: "bridge.halonic.invalid", allowedSites: ["registry.npmjs.org"] },
      },
    ]);
    expect(container.intercepts.map(({ host }) => host)).toEqual([
      "bridge.halonic.invalid",
      "registry.npmjs.org",
    ]);
  });

  it("revokes the run's bridge credential at the run's end", async () => {
    const container = new RecordedContainer();
    const { logic, revoked } = containerObject(container);
    await logic.begin(setup);

    await logic.end(objectName);

    expect(container.destroyed).toBe(1);
    expect(revoked).toEqual([objectName]);
  });

  it("revokes only its own run's credential when an end names another run", async () => {
    const container = new RecordedContainer();
    const { logic, revoked } = containerObject(container);
    await logic.begin(setup);

    await expect(logic.end("u/acme/run_other")).rejects.toThrow();

    expect(revoked).not.toContain("u/acme/run_other");
  });

  it("revokes the run's bridge credential when its alarm stops the container", async () => {
    const container = new RecordedContainer();
    const { logic, revoked } = containerObject(container);
    await logic.begin(setup);

    await logic.alarm();

    expect(container.destroyed).toBe(1);
    expect(revoked).toEqual([objectName]);
  });

  it("still revokes the credential when destroying the container throws", async () => {
    const container = new RecordedContainer();
    container.destroy = async () => {
      throw new Error("destroy failed");
    };
    const { logic, revoked } = containerObject(container);
    await logic.begin(setup);

    await expect(logic.end(objectName)).rejects.toThrow("destroy failed");
    await expect(logic.alarm()).rejects.toThrow("destroy failed");
    expect(revoked).toEqual([objectName, objectName]);
  });

  it("refuses to start where the deployment gives the class no container", async () => {
    const { logic, revoked } = containerObject(undefined);

    expect(logic.available()).toBe(false);
    await expect(logic.begin(setup)).rejects.toThrow(/no run container/);
    await logic.alarm();
    expect(revoked).toEqual([]);
  });
});
