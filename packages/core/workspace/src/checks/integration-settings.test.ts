import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { loadWorkspace } from "../index.ts";
import { MemorySource } from "../test/memory-source.ts";
import { sameSettings } from "./integration-settings.ts";

const workspaceFile = "id: acme\nname: Acme\n";

/** A connector file that runs the integration in `integrations/issues` with these settings. */
function issuesConnector(settings: string): string {
  return `transport:\n  integration:\n    folder: issues\n    settings: ${settings}\n`;
}

/** The issues of a workspace with these files, as `file key.path code`. */
async function issuesIn(files: Record<string, string>): Promise<string[]> {
  const workspace = await loadWorkspace(
    new MemorySource({ "workspace.yaml": workspaceFile, ...files }),
  );
  return workspace.issues.map((issue) => `${issue.file} ${issue.path.join(".")} ${issue.code}`);
}

verifies("workspace.integration-settings", () => {
  it("accepts two connector files that give one integration the same settings", async () => {
    expect(
      await issuesIn({
        "library/connectors/a.connector.yaml": issuesConnector(
          "{ url: 'http://a.test', limit: 2 }",
        ),
        "library/connectors/b.connector.yaml": issuesConnector(
          "{ limit: 2, url: 'http://a.test' }",
        ),
      }),
    ).toEqual([]);
  });

  it("refuses a second connector file that gives the integration other settings", async () => {
    const workspace = await loadWorkspace(
      new MemorySource({
        "workspace.yaml": workspaceFile,
        "library/connectors/a.connector.yaml": issuesConnector("{ url: 'http://a.test' }"),
        "library/connectors/b.connector.yaml": issuesConnector("{ url: 'http://b.test' }"),
      }),
    );
    expect(workspace.issues).toMatchObject([
      {
        severity: "error",
        file: "library/connectors/b.connector.yaml",
        path: ["transport", "integration", "settings"],
        code: "integration-settings-differ",
        message:
          "This connector gives the integration in integrations/issues other settings than library/connectors/a.connector.yaml does. An integration has one set of settings: make them the same in both files.",
      },
    ]);
  });

  it("counts a file without settings as giving none", async () => {
    expect(
      await issuesIn({
        "library/connectors/a.connector.yaml": issuesConnector("{ url: 'http://a.test' }"),
        "library/connectors/b.connector.yaml": "transport:\n  integration: { folder: issues }\n",
      }),
    ).toEqual([
      "library/connectors/b.connector.yaml transport.integration.settings integration-settings-differ",
    ]);
  });
});

describe("sameSettings", () => {
  it("compares keys and values in any order", () => {
    expect(sameSettings({ a: 1, b: "x" }, { b: "x", a: 1 })).toBe(true);
    expect(sameSettings({ a: 1 }, { a: "1" })).toBe(false);
    expect(sameSettings({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(sameSettings({}, {})).toBe(true);
  });
});
