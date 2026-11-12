import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.spec.ts";

const stdio = (sites: string) =>
  yaml("id: notes", `transport: { stdio: { command: npx, ${sites} } }`);

verifies("format.connector-sites", () => {
  it("leaves sites out of a connector that names none, so older files read as before", () => {
    const connector = parsedValue("connector", stdio("args: [notes-mcp]"));
    expect("stdio" in connector.transport && connector.transport.stdio).not.toHaveProperty("sites");
  });

  it("reads the sites a local program may reach, as written", () => {
    const connector = parsedValue(
      "connector",
      stdio("sites: [API.Example.com, '*.docs.example.com']"),
    );
    expect("stdio" in connector.transport && connector.transport.stdio.sites).toEqual([
      "API.Example.com",
      "*.docs.example.com",
    ]);
  });

  it("refuses what the agent file's allowedSites refuses, at its own path", () => {
    const text = stdio(
      "sites: [api.example.com, '*', '*.com', 127.0.0.1, '[::1]', localhost, 'example.com:443']",
    );
    expect(summary(problemsOf("connector", text))).toEqual([
      "transport.stdio.sites.1 custom 2",
      "transport.stdio.sites.2 custom 2",
      "transport.stdio.sites.3 custom 2",
      "transport.stdio.sites.4 custom 2",
      "transport.stdio.sites.5 custom 2",
      "transport.stdio.sites.6 custom 2",
    ]);
  });

  it("refuses more than 50 sites, at the list", () => {
    const sites = Array.from({ length: 51 }, (_, index) => `s${index}.example.com`);
    expect(parsedValue("connector", stdio(`sites: [${sites.slice(1).join(", ")}]`))).toBeDefined();
    const problems = problemsOf("connector", stdio(`sites: [${sites.join(", ")}]`));
    expect(problems[0]?.message).toBe("Name at most 50 sites");
    expect(summary(problems)).toEqual(["transport.stdio.sites custom 2"]);
  });

  it("refuses sites on a remote connector, which the sandbox doesn't run", () => {
    const text = yaml(
      "id: notes",
      "transport: { http: { url: 'https://notes.example.com/mcp', sites: [notes.example.com] } }",
    );
    expect(problemsOf("connector", text)).not.toEqual([]);
  });
});
