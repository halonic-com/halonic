// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import type { ConnectorConnection } from "../connector-status-host.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ConnectorConnectionSummary } from "./connector-connection-summary.tsx";

afterEach(unmountAll);

/** The summary's rows as "label: value" text. */
function rowsOf(connection: ConnectorConnection): string[] {
  const root = render(<ConnectorConnectionSummary connection={connection} />);
  return [...root.querySelectorAll("dl > div")].map(
    (row) => `${row.querySelector("dt")?.textContent}: ${row.querySelector("dd")?.textContent}`,
  );
}

verifies("library.connection-summary", () => {
  it("shows an HTTP connector's transport, URL and secret name", () => {
    expect(
      rowsOf({ kind: "http", url: "https://search.acme.example/mcp", secrets: ["search-token"] }),
    ).toEqual([
      "Transport: MCP server over HTTP",
      "URL: https://search.acme.example/mcp",
      "Secrets: search-token",
    ]);
  });

  it("shows a local program's command and the names of its secrets", () => {
    expect(
      rowsOf({
        kind: "stdio",
        command: "npx -y @acme/notes-mcp",
        secrets: ["NOTES_TOKEN", "NOTES_KEY"],
      }),
    ).toEqual([
      "Transport: Local program (stdio)",
      "Command: npx -y @acme/notes-mcp",
      "Secrets: NOTES_TOKEN, NOTES_KEY",
    ]);
  });

  it("says none for a Google connector's secrets", () => {
    expect(rowsOf({ kind: "google", account: "fin@acme.example" })).toEqual([
      "Transport: Gmail and Google Drive (built in)",
      "Account: fin@acme.example",
      "Secrets: none",
    ]);
  });

  it("shows no Secrets row for an integration or a plugin, whose sheet declares its own", () => {
    expect(rowsOf({ kind: "integration", folder: "acme-crm" })).toEqual([
      "Transport: Local integration",
      "Folder: acme-crm",
    ]);
    expect(rowsOf({ kind: "plugin", id: "acme-notes" })).toEqual([
      "Transport: Plugin",
      "ID: acme-notes",
    ]);
    expect(rowsOf({ kind: "plugin", id: "acme-notes", name: "Acme Notes" })).toEqual([
      "Transport: Plugin",
      "Name: Acme Notes",
    ]);
  });

  it("draws the heading and no landmark", () => {
    const root = render(
      <ConnectorConnectionSummary connection={{ kind: "plugin", id: "acme-notes" }} />,
    );
    expect(root.querySelector("h2")?.textContent).toBe("How it connects");
    expect(root.querySelector("section, [role=region], nav")).toBeNull();
  });
});
