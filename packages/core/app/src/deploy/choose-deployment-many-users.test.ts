import type { Deployment } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { type LoadedFile, loadWorkspace, manyUsersSubscriptionCode } from "@halonicjs/workspace";
import { expect, it } from "vitest";
import { TestDefinitionStore } from "../testing/memory-definition-store.ts";
import { chooseDeployment } from "./choose-deployment.ts";

/** A Cloudflare deployment in this users mode. */
function web(mode: "owner" | "many"): Deployment {
  return {
    name: "Web",
    host: "cloudflare",
    stage: "production",
    shadow: false,
    users: { mode, meter: "none" },
  };
}

/** The files of Acme with the harness agent `writer` and the provider `claude`, keyed or not. */
async function acme(secret: boolean): Promise<readonly LoadedFile[]> {
  const workspace = await loadWorkspace(
    new TestDefinitionStore({
      "workspace.yaml": "id: acme\nname: Acme\n",
      "providers/claude.yaml": `id: claude\ntype: anthropic\n${secret ? "secret: anthropic-key\n" : ""}`,
      "agents/writer.agent.yaml": "name: Writer\nharness: claude-code\n",
    }),
  );
  return workspace.files;
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

verifies("app.deploy-many-users-subscription", () => {
  it.each([
    ["named", "web"],
    ["the only one", undefined],
  ])("refuses mode many with a harness agent that has no key, %s", async (_how, name) => {
    const files = await acme(false);

    const error = thrownBy(() => chooseDeployment("Acme", { web: web("many") }, name, files));

    expect(error).toMatchObject({
      kind: "invalid_input",
      code: manyUsersSubscriptionCode,
      message:
        'Deployment "web" lets many people sign in, and agent "writer" runs in claude-code with no provider key, so their runs would use your own sign-in.',
      fix: "Add a provider of type anthropic with a secret, and save the key with halonic secret set.",
    });
  });

  it("chooses mode many once a provider of the agent's type has a key", async () => {
    const files = await acme(true);
    expect(chooseDeployment("Acme", { web: web("many") }, "web", files)).toMatchObject({
      kind: "chosen",
      id: "web",
    });
  });

  it("chooses mode owner as before, with no key", async () => {
    const files = await acme(false);
    expect(chooseDeployment("Acme", { web: web("owner") }, "web", files)).toMatchObject({
      kind: "chosen",
      id: "web",
    });
  });
});
