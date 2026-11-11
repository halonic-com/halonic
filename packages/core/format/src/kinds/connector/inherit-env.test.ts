import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.spec.ts";

verifies("format.connector-inherit-env", () => {
  it("reads the names a local program takes from the app's environment", () => {
    const text = yaml(
      "id: aws",
      "transport: { stdio: { command: uvx, inheritEnv: [AWS_PROFILE, AWS_REGION, KUBECONFIG] } }",
    );
    const connector = parsedValue("connector", text);
    expect("stdio" in connector.transport && connector.transport.stdio.inheritEnv).toEqual([
      "AWS_PROFILE",
      "AWS_REGION",
      "KUBECONFIG",
    ]);
  });

  it("refuses a name that says it holds a secret, pointing to secretEnv", () => {
    const text = yaml(
      "id: aws",
      "transport: { stdio: { command: uvx, inheritEnv: [AWS_PROFILE, ANTHROPIC_API_KEY, githubToken] } }",
    );
    const problems = problemsOf("connector", text);
    expect(summary(problems)).toEqual([
      "transport.stdio.inheritEnv.1 inherit-env-secret 2",
      "transport.stdio.inheritEnv.2 inherit-env-secret 2",
    ]);
    expect(problems[0]?.message).toContain("secretEnv");
  });

  it("refuses what isn't a variable name", () => {
    const text = yaml(
      "id: aws",
      'transport: { stdio: { command: uvx, inheritEnv: ["1PROFILE", "AWS PROFILE", "A=B"] } }',
    );
    expect(summary(problemsOf("connector", text))).toEqual([
      "transport.stdio.inheritEnv.0 inherit-env-name 2",
      "transport.stdio.inheritEnv.1 inherit-env-name 2",
      "transport.stdio.inheritEnv.2 inherit-env-name 2",
    ]);
  });
});
