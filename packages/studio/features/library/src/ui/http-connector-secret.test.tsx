// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import type { ConnectorConnection } from "../connector-status-host.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { HttpConnectorSecret } from "./http-connector-secret.tsx";

afterEach(unmountAll);

const tracker: ConnectorConnection = {
  kind: "http",
  url: "https://tracker.acme.example/mcp",
  secrets: ["tracker-token"],
};

/** The page's lines, without the command box's own (empty until a copy). */
function linesOf(root: HTMLElement): string[] {
  return [...root.querySelectorAll("p")]
    .map((line) => line.textContent ?? "")
    .filter((text) => text !== "");
}

verifies("library.http-connector-secret", () => {
  it("says in the desktop app which runs use the secret, that Studio can't tell, and both ways to set it", () => {
    const root = render(<HttpConnectorSecret connection={tracker} host="desktop-app" />);
    expect(linesOf(root)).toEqual([
      "Studio can't connect to a server over HTTP yet, so only runs you start or continue with halonic in a terminal use tracker-token. Studio can't tell whether it's set. To save it, run this in a terminal:",
      "Or set HALONIC_SECRET_TRACKER_TOKEN in the terminal you run them from.",
    ]);
    expect(root.textContent).toContain("halonic secret set tracker-token");
  });

  it.each(["served", "phone", undefined] as const)(
    "says elsewhere (%s) that the computer running halonic serve reads it",
    (host) => {
      const root = render(<HttpConnectorSecret connection={tracker} host={host} />);
      expect(linesOf(root)).toEqual([
        "Studio can't set tracker-token here, or tell whether it's set. Halonic reads it on the computer running halonic serve. To save it, run this in a terminal on that computer:",
        "Or set HALONIC_SECRET_TRACKER_TOKEN for Halonic on that computer.",
      ]);
      expect(root.textContent).toContain("halonic secret set tracker-token");
    },
  );

  it("leaves out the variable for a name no store takes", () => {
    const root = render(
      <HttpConnectorSecret
        connection={{ ...tracker, secrets: ["tracker token"] }}
        host="desktop-app"
      />,
    );
    expect(linesOf(root)).toHaveLength(1);
  });

  it("shows no entry for the secret's value", () => {
    const root = render(<HttpConnectorSecret connection={tracker} host="desktop-app" />);
    expect(root.querySelector("input")).toBeNull();
  });

  it("says nothing for an HTTP connector without a secret, or a local program", () => {
    const withoutSecret = render(
      <HttpConnectorSecret connection={{ ...tracker, secrets: [] }} host="desktop-app" />,
    );
    expect(withoutSecret.textContent).toBe("");
    const program = render(
      <HttpConnectorSecret
        connection={{ kind: "stdio", command: "npx -y @acme/notes-mcp", secrets: ["NOTES_TOKEN"] }}
        host="desktop-app"
      />,
    );
    expect(program.textContent).toBe("");
  });
});
