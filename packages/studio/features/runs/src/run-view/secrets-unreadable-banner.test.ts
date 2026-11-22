import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { context, failed, lines } from "./failure-banner.test-helper.ts";
import { causeBanner } from "./failure-banner.ts";

// The same cause and fix as the CLI's `secrets-file-failures.ts` (HAL-15693).

const file = "/profile/secrets/secrets.json";

function unreadable(fix: string, at = file) {
  return failed("error", {
    cause: { kind: "denied", code: "secrets.file-unreadable", detail: { file: at, fix } },
  });
}

function fixes(banner: ReturnType<typeof causeBanner>) {
  return banner?.kind === "callout" ? banner.fixes : undefined;
}

const cause = `Support reply stopped in the step Draft: the secrets file ${file} can't be read by your user account.`;

verifies("runs.run-view.secrets-unreadable-banner", () => {
  describe("a secrets file the person's user account can't read", () => {
    it("says to chmod 600 it in a terminal, with Copy command", () => {
      const banner = causeBanner(unreadable("chmod"), undefined, context, false);
      expect(lines(banner)).toEqual([
        `${cause} Run chmod 600 ${file} in a terminal, then run again.`,
      ]);
      expect(banner).toMatchObject({ tone: "danger" });
      expect(fixes(banner)).toEqual([{ kind: "copy-command", command: `chmod 600 ${file}` }]);
    });

    it("gives a file another user owns back first, quoting a macOS path in both", () => {
      const mac = "/srv/sam/Library/Application Support/halonic/secrets/secrets.json";
      const command = `sudo chown "$(id -un)" "${mac}" && chmod 600 "${mac}"`;
      const banner = causeBanner(unreadable("chown", mac), undefined, context, false);
      expect(lines(banner)?.[0]).toContain(
        `It belongs to another user. Run ${command} in a terminal, then run again.`,
      );
      expect(fixes(banner)).toEqual([{ kind: "copy-command", command }]);
    });

    it("names the file's Properties on Windows, with no command to copy", () => {
      const banner = causeBanner(unreadable("properties"), undefined, context, false);
      expect(lines(banner)).toEqual([
        `${cause} Give your user account access to it in the file's Properties, under Security, then run again.`,
      ]);
      expect(fixes(banner) ?? []).toEqual([]);
    });

    it("says to do it on the computer on a phone, with no button", () => {
      const chmod = causeBanner(unreadable("chmod"), undefined, context, true);
      expect(lines(chmod)).toEqual([
        `${cause} Run chmod 600 ${file} on your computer, then run again.`,
      ]);
      expect(fixes(chmod) ?? []).toEqual([]);
      const properties = causeBanner(unreadable("properties"), undefined, context, true);
      expect(lines(properties)?.[0]).toContain("On your computer, give your user account access");
    });
  });
});
