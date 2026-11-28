import { readFileSync } from "node:fs";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

const dockerfile = readFileSync(new URL("../container/Dockerfile", import.meta.url), "utf8");

/** Where the platform puts the Containers CA when the container starts. */
const containersCa = "/etc/cloudflare/certs/cloudflare-containers-ca.crt";

/** The values of one instruction, such as `USER`, in file order. */
function instructions(name: string): string[] {
  return [...dockerfile.matchAll(new RegExp(`^${name}\\s+(.+)$`, "gm"))].map(
    (match) => match[1]?.trim() ?? "",
  );
}

verifies("runtime.run-container-image", () => {
  describe("the run container image", () => {
    it("runs every program, including exec's, as halonic", () => {
      expect(instructions("USER").at(-1)).toBe("halonic");
    });

    it("names the Containers CA in the image's environment, which exec's programs get", () => {
      const env = instructions("ENV").join("\n");
      expect(env).toContain(`NODE_EXTRA_CA_CERTS=${containersCa}`);
      expect(env).toContain(`SSL_CERT_FILE=${containersCa}`);
    });

    it("has no entrypoint, since exec's programs wouldn't pass through it", () => {
      expect(instructions("ENTRYPOINT")).toEqual([]);
    });
  });
});
