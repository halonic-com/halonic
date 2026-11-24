import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { deployHostClass } from "./deploy-host.ts";

verifies("cli.commands.deploy.status", () => {
  it.each([
    "https://api.cloudflare.com/client/v4/accounts",
    "https://acme.sam-example.workers.dev/health",
  ])("lets a deploy target reach %s", (url) => {
    expect(deployHostClass(new URL(url))).toBe("public");
  });

  it.each([
    "http://api.cloudflare.com/client/v4/accounts",
    "https://example.com/",
    "https://workers.dev.example.com/",
    "https://api.cloudflare.com.example.com/",
  ])("refuses %s", (url) => {
    expect(deployHostClass(new URL(url))).toBeUndefined();
  });
});
