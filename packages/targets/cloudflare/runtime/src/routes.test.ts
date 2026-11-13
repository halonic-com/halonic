import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { answerRequest } from "./routes.ts";

const origin = "https://cloud.example";

function ask(path: string, method = "GET"): Response {
  return answerRequest(new Request(`${origin}${path}`, { method }));
}

verifies("runtime.health-route", () => {
  describe("the health route", () => {
    it.each(["GET", "HEAD"])("answers %s with ok and nothing else", async (method) => {
      const response = ask("/health", method);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      if (method === "GET") expect(await response.json()).toEqual({ status: "ok" });
    });

    it("answers a query string like the plain path", () => {
      expect(ask("/health?verbose=1").status).toBe(200);
    });
  });

  describe("everything else", () => {
    it.each(["/", "/index.html", "/api/hello", "/api/runs", "/health/", "/assets/app.js"])(
      "refuses %s with 404 and no detail",
      async (path) => {
        const response = ask(path);
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({
          code: "not_found",
          message: "There is nothing at this address.",
        });
      },
    );

    it.each(["POST", "PUT", "DELETE", "PATCH"])(
      "refuses %s on /health with 405 and says what is allowed",
      async (method) => {
        const response = ask("/health", method);
        expect(response.status).toBe(405);
        expect(response.headers.get("allow")).toBe("GET, HEAD");
        expect(await response.json()).toMatchObject({ code: "method_not_allowed" });
      },
    );
  });
});
