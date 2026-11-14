import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { WorkspaceFacts } from "./api.ts";
import { testServer } from "./test-server.ts";
import { shownFolder } from "./workspace-routes.ts";

// A server with no password answers loopback names only.
const loopback = "localhost";
const named = "halonic.acme.example";

function serverFor(facts: WorkspaceFacts, passwordHash: string | null = null) {
  return testServer({ passwordHash, workspace: { describe: async () => facts } });
}

function ask(server: ReturnType<typeof testServer>, host = loopback, method = "GET") {
  return server.handle(new Request(`http://${host}/api/workspace`, { method, headers: { host } }));
}

const acme: WorkspaceFacts = {
  name: "Acme",
  sample: false,
  folder: "/people/user/Projects/acme",
  home: "/people/user",
};

describe("workspace", () => {
  verifies("server.workspace", () => {
    it("answers exactly the name, the sample flag and the folder under ~", async () => {
      const response = await ask(serverFor(acme));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        name: "Acme",
        sample: false,
        folder: "~/Projects/acme",
      });
    });

    it("passes the sample flag on", async () => {
      const response = await ask(serverFor({ ...acme, sample: true }));
      expect(((await response.json()) as { sample: boolean }).sample).toBe(true);
    });

    it("answers 401 without a session when a password is set", async () => {
      const response = await ask(serverFor(acme, "hash"), named);
      expect(response.status).toBe(401);
      expect(((await response.json()) as { code: string }).code).toBe("not_signed_in");
    });

    it("answers 404 when the host gives no workspace facts", async () => {
      const response = await ask(testServer({ passwordHash: null }));
      expect(response.status).toBe(404);
    });

    it("is refused on a foreign Host", async () => {
      const response = await serverFor(acme).handle(
        new Request("http://evil.example/api/workspace", { headers: { host: "evil.example" } }),
      );
      expect(response.status).toBe(421);
    });

    it("is read-only", async () => {
      const response = await ask(serverFor(acme), loopback, "POST");
      expect(response.status).toBe(404);
    });

    describe("shownFolder", () => {
      it("shortens the home folder to ~", () => {
        expect(shownFolder("/people/user", "/people/user")).toBe("~");
        expect(shownFolder("/people/user/", "/people/user")).toBe("~");
        expect(shownFolder("/people/user/Projects/acme/", "/people/user")).toBe("~/Projects/acme");
      });

      it("sends only the folder's own name outside the home folder", () => {
        expect(shownFolder("/shared/acme", "/people/user")).toBe("acme");
        expect(shownFolder("/shared/acme", null)).toBe("acme");
      });

      it("doesn't take a folder that only starts with the home name for one inside it", () => {
        expect(shownFolder("/people/username2/acme", "/people/user")).toBe("acme");
      });

      it("reads Windows paths", () => {
        const home = ["C:", "Users", "user"].join("\\");
        const acme = [home, "Projects", "acme"].join("\\");
        const elsewhere = ["D:", "Work", "acme"].join("\\");
        expect(shownFolder(acme, home)).toBe("~/Projects/acme");
        expect(shownFolder(elsewhere, home)).toBe("acme");
      });
    });
  });
});
