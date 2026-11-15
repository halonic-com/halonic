import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { googleSetupSubject } from "./setup-subject.ts";

const connectors = [
  { id: "gmail", transport: { google: { account: "someone@example.com" } } },
  { id: "files", transport: { url: "https://files.example.com" } },
];

const ledger = {
  sheet: {
    id: "ledger",
    googleApis: [{ api: "ledger.googleapis.com", name: "Ledger API" }],
    googleScopes: [
      {
        scope: "https://www.googleapis.com/auth/ledger",
        reason: "Reads your ledger",
        restricted: true,
      },
    ],
    googleCheck: { method: "GET" as const, url: "https://ledger.googleapis.com/v1/me" },
  },
};
const plain = { sheet: { id: "plain" } };

verifies("google-setup.setup-subject", () => {
  it("gives the address and the services that ask for Google scopes", () => {
    expect(googleSetupSubject(connectors, [plain, ledger], "gmail")).toEqual({
      kind: "found",
      address: "someone@example.com",
      services: [
        {
          id: "ledger",
          label: "ledger",
          googleApis: ledger.sheet.googleApis,
          googleScopes: ledger.sheet.googleScopes,
          googleCheck: ledger.sheet.googleCheck,
        },
      ],
    });
  });

  it("gives an empty service list when no integration asks for scopes", () => {
    expect(googleSetupSubject(connectors, [plain], "gmail")).toEqual({
      kind: "found",
      address: "someone@example.com",
      services: [],
    });
  });

  it("says notGoogle for a connector with another transport", () => {
    expect(googleSetupSubject(connectors, [ledger], "files")).toEqual({ kind: "notGoogle" });
  });

  it("says noConnector for an id no connector has", () => {
    expect(googleSetupSubject(connectors, [ledger], "calendar")).toEqual({ kind: "noConnector" });
  });
});
