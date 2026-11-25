import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { answerOutbound } from "./container-outbound.ts";

const props = {
  runObjectName: "u/acme/run_1",
  rules: { bridgeHost: "bridge.halonic.invalid", allowedSites: ["registry.npmjs.org"] },
};

/** Where the answers go, recorded: the run objects asked and the sites fetched. */
function recordedTargets() {
  const bridged: string[] = [];
  const fetched: string[] = [];
  return {
    bridged,
    fetched,
    targets: {
      bridge: async (name: string) => {
        bridged.push(name);
        return new Response("bridge");
      },
      site: async (request: Request) => {
        fetched.push(request.url);
        return new Response("site");
      },
    },
  };
}

verifies("runtime.run-container-object", () => {
  it("sends a bridge request to the run object the container object named", async () => {
    const { bridged, fetched, targets } = recordedTargets();

    const answer = await answerOutbound(
      new Request("http://bridge.halonic.invalid/v1/messages", { method: "POST" }),
      props,
      targets,
    );

    expect(await answer.text()).toBe("bridge");
    expect(bridged).toEqual(["u/acme/run_1"]);
    expect(fetched).toEqual([]);
  });

  it("lets an allowed site out over HTTPS, and refuses anything else with 403", async () => {
    const { bridged, fetched, targets } = recordedTargets();

    const allowed = await answerOutbound(
      new Request("https://registry.npmjs.org/"),
      props,
      targets,
    );
    const other = await answerOutbound(new Request("https://example.com/"), props, targets);
    const plainBridge = await answerOutbound(
      new Request("https://bridge.halonic.invalid/v1/messages"),
      props,
      targets,
    );

    expect(await allowed.text()).toBe("site");
    expect(other.status).toBe(403);
    expect(plainBridge.status).toBe(403);
    expect(fetched).toEqual(["https://registry.npmjs.org/"]);
    expect(bridged).toEqual([]);
  });
});
