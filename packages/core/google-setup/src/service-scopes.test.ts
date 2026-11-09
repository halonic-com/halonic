import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { serviceScopes } from "./service-scopes.ts";
import { atlasService, ledgerService } from "./services.test-helper.ts";
import type { SetupService } from "./setup-input.ts";

const ledgerScope = "https://www.googleapis.com/auth/ledger";
const atlasScope = "https://www.googleapis.com/auth/atlas.readonly";

verifies("google-setup.sign-in-scopes-per-service", () => {
  it("gives one entry per service, in order, when every scope was granted", () => {
    expect(
      serviceScopes([atlasService, ledgerService], ["openid", ledgerScope, atlasScope]),
    ).toEqual([
      { service: "atlas", granted: true },
      { service: "ledger", granted: true },
    ]);
  });

  it("marks only the service whose own scope is missing", () => {
    expect(serviceScopes([ledgerService, atlasService], [ledgerScope])).toEqual([
      { service: "ledger", granted: true },
      { service: "atlas", granted: false, missingScopes: [atlasScope] },
    ]);
  });

  it("lists each missing scope once, in sheet order", () => {
    const twice: SetupService = {
      ...atlasService,
      googleScopes: [...atlasService.googleScopes, ...atlasService.googleScopes],
    };

    expect(serviceScopes([twice], [])).toEqual([
      { service: "atlas", granted: false, missingScopes: [atlasScope, ledgerScope] },
    ]);
  });

  it("counts the short sign-in scopes as granted under the long names Google reports", () => {
    const withSignInScopes: SetupService = {
      ...ledgerService,
      googleScopes: [
        ...ledgerService.googleScopes,
        { scope: "openid", reason: "Signs the user in." },
        { scope: "email", reason: "Reads the account's address." },
        { scope: "profile", reason: "Reads the account's name." },
      ],
    };
    const granted = [
      ledgerScope,
      "openid",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
    ];

    expect(serviceScopes([withSignInScopes], granted)).toEqual([
      { service: "ledger", granted: true },
    ]);
  });

  it("counts a service that needs no scope as granted", () => {
    const noScopes: SetupService = { ...ledgerService, googleScopes: [] };

    expect(serviceScopes([noScopes], [])).toEqual([{ service: "ledger", granted: true }]);
  });
});
