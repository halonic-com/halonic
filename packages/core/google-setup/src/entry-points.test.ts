import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import * as host from "./host.ts";
import * as main from "./index.ts";

verifies("google-setup.host-only-read", () => {
  it("exports the client secret reader from the host entry point only", () => {
    expect(Object.keys(host)).toContain("clientSecretReader");
    expect(Object.keys(main)).not.toContain("clientSecretReader");
  });

  it("gives no way to build a client secret's token name from the main entry point", () => {
    expect(Object.keys(main)).not.toContain("clientSecretName");
    expect(Object.keys(main)).not.toContain("stagedClientSecretName");
  });
});
