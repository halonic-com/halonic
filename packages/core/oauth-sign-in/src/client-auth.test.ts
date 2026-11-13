import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { withClientAuth } from "./client-auth.ts";

// Fake values only; none is real.
const fakeSecret = "fake-client-secret-0000000001";

verifies("oauth-sign-in.client-auth", () => {
  it("puts the client ID and secret in the form body for post", () => {
    expect(
      withClientAuth(
        { clientId: "fake-client", clientSecret: fakeSecret, clientAuth: "post" },
        { grant_type: "refresh_token" },
      ),
    ).toEqual({
      form: { grant_type: "refresh_token", client_id: "fake-client", client_secret: fakeSecret },
      headers: {},
    });
  });

  it("sends HTTP Basic with the form-encoded ID and secret, and no client_id in the body", () => {
    const request = withClientAuth(
      { clientId: "fake client", clientSecret: "s3cr&t:+/=", clientAuth: "basic" },
      { grant_type: "refresh_token" },
    );

    expect(request.form).toEqual({ grant_type: "refresh_token" });
    const credentials = request.headers["authorization"]?.replace("Basic ", "") ?? "";
    expect(atob(credentials)).toBe("fake+client:s3cr%26t%3A%2B%2F%3D");
  });

  it("pads the Basic credentials as standard base64 does", () => {
    for (const secret of ["a", "ab", "abc"]) {
      const request = withClientAuth(
        { clientId: "id", clientSecret: secret, clientAuth: "basic" },
        {},
      );

      const credentials = request.headers["authorization"]?.replace("Basic ", "") ?? "";
      expect(credentials).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
      expect(credentials.length % 4).toBe(0);
      expect(atob(credentials)).toBe(`id:${secret}`);
    }
  });

  it("sends only the client ID, in the body, for a public client with either method", () => {
    for (const clientAuth of ["post", "basic"] as const) {
      expect(withClientAuth({ clientId: "fake-client", clientAuth }, { code: "x" })).toEqual({
        form: { code: "x", client_id: "fake-client" },
        headers: {},
      });
    }
  });
});
