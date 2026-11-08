import { describe, expect, it } from "vitest";
import { parseFile } from "../../index.ts";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.ts";

describe("format.connector-file", () => {
  it("fills in tools, stdio args and the Google client", () => {
    const stdio = parsedValue(
      "connector",
      yaml("id: files", "transport:", "  stdio:", "    command: mcp"),
    );
    expect(stdio.transport).toEqual({ stdio: { command: "mcp", args: [] } });
    expect(stdio.tools).toEqual({ approve: [] });

    const google = yaml("id: mailbox", "transport:", "  google:", "    account: desk@example.com");
    expect(parsedValue("connector", google).transport).toEqual({
      google: { account: "desk@example.com", client: "google" },
    });
  });

  it("refuses an account that isn't an email address and a URL that isn't one", () => {
    const google = yaml("id: mailbox", "transport:", "  google:", "    account: desk");
    expect(summary(problemsOf("connector", google))).toEqual([
      "transport.google.account invalid_format 4",
    ]);
    const http = yaml("id: tracker", "transport:", "  http:", "    url: tracker");
    expect(summary(problemsOf("connector", http))).toEqual(["transport.http.url invalid_format 4"]);
  });

  it("refuses two transports at once, at the transport", () => {
    const text = yaml(
      "id: tracker",
      "transport:",
      "  http: { url: 'https://tracker.example.com' }",
      "  stdio: { command: mcp }",
    );
    expect(summary(problemsOf("connector", text))).toEqual(["transport invalid_union 3"]);
  });

  it("warns, without failing, when a tool needs approval but isn't allowed", () => {
    const text = yaml(
      "id: tracker",
      "transport: { stdio: { command: mcp } }",
      "tools:",
      "  allow: [read]",
      "  approve: [read, delete]",
    );
    const parsed = parseFile("connector", text);
    expect(parsed.ok && parsed.value.warnings).toEqual([
      {
        severity: "warning",
        source: "check",
        code: "approved-tool-not-allowed",
        path: ["tools", "approve", 1],
        message:
          'Connector "tracker": "delete" needs approval but is not in tools.allow, so agents never see it',
        line: 5,
        col: 19,
      },
    ]);
  });

  it("gives no warning when every tool is allowed", () => {
    const text = yaml(
      "id: tracker",
      "transport: { stdio: { command: mcp } }",
      "tools:",
      "  approve: [delete]",
    );
    const parsed = parseFile("connector", text);
    expect(parsed.ok && parsed.value.warnings).toEqual([]);
  });
});
