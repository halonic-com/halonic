import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { client, redirect } from "./fake-transport.test-helper.ts";
import { IntegrationRefusedError } from "./integration/index.ts";

/** The refusal a request ends in. */
async function refusedWith(request: Promise<Response>): Promise<IntegrationRefusedError> {
  const error = await request.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  if (!(error instanceof IntegrationRefusedError)) throw new Error("expected a refusal");
  return error;
}

verifies("integration-kit.redirects-checked", () => {
  it("says a refused host came from the integration's own request", async () => {
    const { http } = client();
    const refusal = await refusedWith(http.fetch("https://undeclared.example.net/collect"));
    expect(refusal.code).toBe("host-not-allowed");
    expect(refusal.url).toEqual({ host: "undeclared.example.net", fromRedirect: false });
  });

  it("says a refused host came from a redirect the service sent", async () => {
    const { http, sent } = client(() => redirect(302, "https://undeclared.example.net/elsewhere"));
    const refusal = await refusedWith(http.fetch("https://api.example.com/v1/forecast"));
    expect(refusal.code).toBe("host-not-allowed");
    expect(refusal.url).toEqual({ host: "undeclared.example.net", fromRedirect: true });
    expect(sent).toHaveLength(1);
  });
});
