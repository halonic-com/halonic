import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.spec.ts";

verifies("format.deployments-file", () => {
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
    expect(problems[0]?.message).toBe(
      "Not a deployment id: use lowercase letters, digits, '-' or '_'",
    );
  });

  it("accepts a deployment id of 64 characters", () => {
    const longest = "a".repeat(64);
    const value = parsedValue("deployments", yaml("deployments:", `  ${longest}:`, "    name: L"));
    expect(Object.keys(value.deployments)).toEqual([longest]);
  });

  it("refuses a deployment id over 64 characters, saying why", () => {
    const tooLong = "a".repeat(65);
    const problems = problemsOf(
      "deployments",
      yaml("deployments:", `  ${tooLong}:`, "    name: L"),
    );
    expect(summary(problems)).toEqual([`deployments.${tooLong} invalid_key 3`]);
    expect(problems[0]?.message).toContain("at most 64 characters");
  });

  it.each(["con", "prn", "aux", "nul", "com0", "com9", "lpt1"])(
    "refuses the Windows device name %s as a deployment id, saying why",
    (deviceName) => {
      const problems = problemsOf(
        "deployments",
        yaml("deployments:", `  ${deviceName}:`, "    name: D"),
      );
      expect(summary(problems)).toEqual([`deployments.${deviceName} invalid_key 3`]);
      expect(problems[0]?.message).toContain("Windows doesn't keep for a device");
    },
  );

  it.each(["console", "auxiliary", "com10", "lpt", "nul-1"])(
    "accepts %s, which only starts like a Windows device name",
    (name) => {
      const value = parsedValue("deployments", yaml("deployments:", `  ${name}:`, "    name: N"));
      expect(Object.keys(value.deployments)).toEqual([name]);
    },
  );

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
