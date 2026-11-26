import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { noStudioPage } from "./no-studio-page.ts";

verifies("cli.commands.serve.npm-package-page", () => {
  describe("noStudioPage", () => {
    it("says to serve with --network first when a phone can't reach the address", () => {
      expect(noStudioPage(false)).toContain(
        "<p>The Studio page for a browser doesn't come with the npm package. To open it from the Halonic app for Android, serve it with halonic serve --network, then run halonic serve pair.</p>",
      );
    });

    it("sends a reachable address straight to pairing", () => {
      expect(noStudioPage(true)).toContain(
        "<p>Open it from the Halonic app for Android: run halonic serve pair to add it. The Studio page for a browser doesn't come with the npm package.</p>",
      );
    });

    it("scales to a phone's screen and has no script or style", () => {
      const page = noStudioPage(true);
      expect(page).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
      expect(page).not.toMatch(/<script|<style|style=/);
    });
  });
});
