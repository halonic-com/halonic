import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { deployHostClass } from "./deploy-host.ts";

verifies("cli.commands.deploy.status", () => {
  it.each([
    "https://api.cloudflare.com/client/v4/accounts",
    "https://acme.sam-example.workers.dev/health",
  ])("lets the deploy target of the Worker acme reach %s", (url) => {
    expect(deployHostClass("acme")(new URL(url))).toBe("public");
  });

  it.each([
    "http://api.cloudflare.com/client/v4/accounts",
    "http://acme.sam-example.workers.dev/health",
    "https://example.com/",
    "https://workers.dev.example.com/",
    "https://api.cloudflare.com.example.com/",
    "https://other.sam-example.workers.dev/health",
    "https://acme.workers.dev/",
    "https://acme.a.b.workers.dev/",
    "https://sam-example.workers.dev/",
  ])("refuses %s to the deploy target of the Worker acme", (url) => {
    expect(deployHostClass("acme")(new URL(url))).toBeUndefined();
  });

  it("refuses every workers.dev address without a Worker, and still reaches the API", () => {
    const hostClass = deployHostClass(undefined);
    expect(hostClass(new URL("https://acme.sam-example.workers.dev/"))).toBeUndefined();
    expect(hostClass(new URL("https://api.cloudflare.com/client/v4/accounts"))).toBe("public");
  });
});
