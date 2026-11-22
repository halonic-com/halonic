import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { desktopOpenExternal } from "./desktop-open-external.ts";

/** The desktop app's page on macOS and Linux, which records where it was asked to go. */
function appPage(origin = "tauri://localhost") {
  const asked: string[] = [];
  const reported: Error[] = [];
  const page = { location: { origin, assign: (url: string) => asked.push(url) } };
  const open = desktopOpenExternal(page, (error) => reported.push(error));
  if (open === undefined) throw new Error("The page has a location.");
  return { open, asked, reported };
}

verifies("kit.external-link", () => {
  describe("desktopOpenExternal", () => {
    it("asks for an outside web page in the window, where the shell hands it to the browser", async () => {
      const { open, asked, reported } = appPage();
      await open("https://docs.example.com/start?x=1");
      expect(asked).toEqual(["https://docs.example.com/start?x=1"]);
      expect(reported).toEqual([]);
    });

    it("waits for an address that arrives later, such as a sign-in page", async () => {
      const { open, asked } = appPage();
      await open(Promise.resolve("https://accounts.example.com/o/oauth2/auth"));
      expect(asked).toEqual(["https://accounts.example.com/o/oauth2/auth"]);
    });

    it("rejects when a pending address doesn't arrive, and asks for nothing", async () => {
      const { open, asked } = appPage();
      await expect(open(Promise.reject(new Error("no address")))).rejects.toThrow("no address");
      expect(asked).toEqual([]);
    });

    it("hands an email address to the system as well", async () => {
      const { open, asked } = appPage();
      await open("mailto:help@example.com");
      expect(asked).toEqual(["mailto:help@example.com"]);
    });

    it("opens nothing on the app's own origin, or that isn't a page or an email address, and reports it", async () => {
      const { open, asked, reported } = appPage("http://tauri.localhost");
      await open("http://tauri.localhost/studio.html");
      await open("javascript:alert(1)");
      await open("file:///etc/hosts");
      await open("not an address");
      expect(asked).toEqual([]);
      expect(reported).toHaveLength(4);
    });

    it("keeps the kit's own opener for a page without a location", () => {
      expect(desktopOpenExternal({})).toBeUndefined();
    });
  });
});
