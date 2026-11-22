import type { Deployment } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { chooseDeployment } from "./choose-deployment.ts";

/** A Cloudflare deployment whose `users` block counts usage with `meter`. */
function metered(meter: "none" | "config" | "cloud"): Deployment {
  return {
    name: "Web",
    host: "cloudflare",
    stage: "production",
    shadow: false,
    users: { mode: "many", meter, cloud: { product: "prod_acme_code" } },
  };
}

/** The error `run` throws; fails the test when it throws none. */
function thrownBy(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("expected it to throw");
}

verifies("app.deploy-cloud-meter", () => {
  it.each([
    ["named", "web"],
    ["the only one", undefined],
  ])("refuses a deployment with meter cloud, %s, and says what to use", (_how, name) => {
    const error = thrownBy(() => chooseDeployment("Acme", { web: metered("cloud") }, name));
    expect(error).toMatchObject({
      kind: "invalid_input",
      message: "web counts usage with meter: cloud, which this version of Halonic can't do yet.",
      fix: "Use meter: config or meter: none in deployments.yaml.",
    });
  });

  it.each(["none", "config"] as const)("chooses a deployment with meter %s", (meter) => {
    const deployment = metered(meter);
    expect(chooseDeployment("Acme", { web: deployment }, "web")).toEqual({
      kind: "chosen",
      id: "web",
      deployment,
    });
  });
});
