import type { ContainerOutboundProps } from "@halonicjs/adapter-cloudflare-durable";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { ContainerOutbound } from "./container-outbound.ts";
import type { RuntimeEnv } from "./env.ts";
import { RunContainerObject } from "./run-container-object.ts";

const props: ContainerOutboundProps = {
  runObjectName: "u/acme/run_1",
  rules: { bridgeHost: "bridge.halonic.invalid", allowedSites: [] },
};

/** The `RUN` namespace, recording which run object each call reached and what it was asked. */
function recordedRunObjects() {
  const calls: string[] = [];
  const RUN = {
    idFromName: (name: string) => name,
    get: (name: string) => ({
      bridge: async () => {
        calls.push(`bridge ${name}`);
        return new Response("bridge");
      },
      revokeBridge: async () => {
        calls.push(`revoke ${name}`);
      },
    }),
  };
  return { calls, env: { RUN } as unknown as RuntimeEnv };
}

/** The Worker's run container object, with its hooks callable. */
class OpenRunContainerObject extends RunContainerObject {
  handlerFor(given: ContainerOutboundProps): Fetcher {
    return this.outboundHandler(given);
  }

  revokeFor(name: string): Promise<void> {
    return this.revokeBridge(name);
  }
}

verifies("runtime.run-container-object", () => {
  it("has ContainerOutbound send a bridge request to the run object its props name", async () => {
    const { calls, env } = recordedRunObjects();
    const outbound = new ContainerOutbound({ props } as unknown as ExecutionContext, env);

    const answer = await outbound.fetch(new Request("http://bridge.halonic.invalid/v1/messages"));

    expect(await answer.text()).toBe("bridge");
    expect(calls).toEqual(["bridge u/acme/run_1"]);
  });

  it("points the container's intercepts at ContainerOutbound and revokes in the run's own run object", async () => {
    const { calls, env } = recordedRunObjects();
    const made: unknown[] = [];
    const ctx = {
      id: { name: "u/acme/run_1" },
      container: undefined,
      storage: {},
      exports: {
        ContainerOutbound: (options: { props: ContainerOutboundProps }) => {
          made.push(options.props);
          return {} as Fetcher;
        },
      },
    };
    const object = new OpenRunContainerObject(ctx as unknown as DurableObjectState, env as never);

    object.handlerFor(props);
    await object.revokeFor("u/acme/run_1");

    expect(made).toEqual([props]);
    expect(calls).toEqual(["revoke u/acme/run_1"]);
  });
});
