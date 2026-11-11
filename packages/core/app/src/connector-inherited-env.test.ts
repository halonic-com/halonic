import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { connectorInheritedEnv } from "./connector-base-env.ts";

verifies("app.connector-inherited-env", () => {
  it("adds each named variable that is set to the base, and no other", () => {
    const env = { PATH: "/usr/bin", AWS_PROFILE: "work", ANTHROPIC_API_KEY: "sk-ant-test" };
    expect(connectorInheritedEnv(env, ["AWS_PROFILE", "KUBECONFIG"], "linux")).toEqual({
      PATH: "/usr/bin",
      AWS_PROFILE: "work",
    });
  });

  it("matches a name in any letter case on Windows, keeping it as written", () => {
    expect(connectorInheritedEnv({ Aws_Profile: "work" }, ["AWS_PROFILE"], "win32")).toEqual({
      Aws_Profile: "work",
    });
    expect(connectorInheritedEnv({ Aws_Profile: "work" }, ["AWS_PROFILE"], "linux")).toEqual({});
  });

  it("never takes a secret's name or a bash function, even when named", () => {
    const env = { GITHUB_TOKEN: "ghp_test", AWS_REGION: "() { evil; }" };
    expect(connectorInheritedEnv(env, ["GITHUB_TOKEN", "AWS_REGION"], "linux")).toEqual({});
  });
});
