import { expect, it } from "vitest";
import { adminNote } from "./admin-note.ts";

const scopes = [
  {
    scope: "https://www.googleapis.com/auth/ledger",
    restricted: false,
    neededBy: [{ service: "ledger", reason: "Reads your ledger" }],
  },
  {
    scope: "https://www.googleapis.com/auth/atlas",
    restricted: false,
    neededBy: [
      { service: "atlas", reason: "Reads your maps" },
      { service: "atlas", reason: "Pins places" },
    ],
  },
];
const names: Record<string, string> = { ledger: "Ledger", atlas: "Atlas" };

it("holds the project, the client ID, each service once with its reasons, and the Admin console path", () => {
  const note = adminNote({
    projectId: "halonic-x1",
    clientId: "123-abc.apps.googleusercontent.com",
    scopes,
    serviceName: (id) => names[id] ?? id,
  });
  expect(note).toContain("project halonic-x1");
  expect(note).toContain("client ID 123-abc.apps.googleusercontent.com");
  expect(note).toContain("Ledger (Reads your ledger), Atlas (Reads your maps; Pins places)");
  expect(note).toContain("Security → Access and data control → API controls → Manage app access");
  expect(note).toContain("Trusted");
});

it("leaves out the project and the client ID when the setup has none yet", () => {
  const note = adminNote({ projectId: null, clientId: null, scopes, serviceName: String });
  expect(note).not.toContain("project");
  expect(note).not.toContain("client ID 1");
  expect(note).toContain("I registered.");
});
