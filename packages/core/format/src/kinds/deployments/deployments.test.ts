import { describe, expect, it } from "vitest";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.ts";

describe("format.deployments-file", () => {
  it("fills in host, stage and shadow for each deployment", () => {
    const value = parsedValue("deployments", yaml("deployments:", "  laptop:", "    name: Laptop"));
    expect(value).toEqual({
      version: 1,
      deployments: {
        laptop: { name: "Laptop", host: "local", stage: "development", shadow: false },
      },
    });
  });

  it("refuses a file that names no deployment", () => {
    expect(summary(problemsOf("deployments", yaml("deployments: {}")))).toEqual([
      "deployments custom 1",
    ]);
  });

  it("refuses a deployment name with capitals", () => {
    const problems = problemsOf("deployments", yaml("deployments:", "  Laptop:", "    name: L"));
    expect(summary(problems)).toEqual(["deployments.Laptop invalid_key 3"]);
  });

  it("refuses an unknown host", () => {
    const text = yaml("deployments:", "  edge:", "    name: Edge", "    host: lambda");
    expect(summary(problemsOf("deployments", text))).toEqual([
      "deployments.edge.host invalid_value 4",
    ]);
  });

  it("refuses a default deployment that isn't listed, at the default's line", () => {
    const text = yaml("default: prod", "deployments:", "  laptop:", "    name: Laptop");
    const [problem] = problemsOf("deployments", text);
    expect(problem).toMatchObject({
      severity: "error",
      source: "check",
      code: "default-deployment-not-listed",
      path: ["default"],
      message: 'The default deployment "prod" is not listed',
      line: 1,
    });
  });

  it("accepts a default deployment that is listed", () => {
    const text = yaml("default: laptop", "deployments:", "  laptop:", "    name: Laptop");
    expect(parsedValue("deployments", text).default).toBe("laptop");
  });

  it("does not take a name from an object's prototype as a listed deployment", () => {
    const text = yaml("default: constructor", "deployments:", "  laptop:", "    name: Laptop");
    expect(summary(problemsOf("deployments", text))).toEqual([
      "default default-deployment-not-listed 1",
    ]);
  });
});
