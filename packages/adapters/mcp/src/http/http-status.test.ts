import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { errorForStatus } from "./http-status.ts";

verifies("mcp.http-transport", () => {
  describe("an error status from the MCP server", () => {
    it.each([
      [400, "bad-arguments"],
      [422, "bad-arguments"],
      [401, "not-signed-in"],
      [403, "not-allowed"],
      [408, "rate-limited"],
      [429, "rate-limited"],
      [500, "unavailable"],
      [502, "unavailable"],
    ])("turns %i into %s, with or without a session", (status, code) => {
      expect(errorForStatus(status, false).code).toBe(code);
      expect(errorForStatus(status, true).code).toBe(code);
    });

    it("turns 404 into session-expired only once a session started", () => {
      expect(errorForStatus(404, true).code).toBe("session-expired");
      expect(errorForStatus(404, false).code).toBe("not-found");
    });

    it("turns 410 into not-found even with a session, since gone never means the session ended", () => {
      expect(errorForStatus(410, true).code).toBe("not-found");
      expect(errorForStatus(410, false).code).toBe("not-found");
    });

    it("writes its own message for the user, the same for every status it maps alike", () => {
      expect(errorForStatus(500, false).message).toBe("The MCP server is having trouble.");
      expect(errorForStatus(599, true).message).toBe("The MCP server is having trouble.");
      expect(errorForStatus(400, false).message).toBe(errorForStatus(422, true).message);
    });
  });
});
