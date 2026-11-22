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

verifies("library.http-connector-secret", () => {
  it("says in the desktop app that only a run from a terminal uses the secret, and how to set it", () => {
    const root = render(<HttpConnectorSecret connection={tracker} host="desktop-app" />);
    expect(root.querySelector("p")?.textContent).toBe(
      "Studio can't connect to a server over HTTP yet, so it doesn't use tracker-token. Runs from a terminal do. To set it for them, run this in a terminal:",
    );
    expect(root.textContent).toContain("halonic secret set tracker-token");
  });

  it.each(["served", "phone", undefined] as const)(
    "says elsewhere (%s) that the computer Halonic runs on reads it",
    (host) => {
      const root = render(<HttpConnectorSecret connection={tracker} host={host} />);
      expect(root.querySelector("p")?.textContent).toBe(
        "Studio can't set tracker-token. Halonic reads it from the secrets of the computer it runs on. To set it, run this in a terminal on that computer:",
      );
      expect(root.textContent).toContain("halonic secret set tracker-token");
    },
  );

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
