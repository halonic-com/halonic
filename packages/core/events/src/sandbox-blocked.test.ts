import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import {
  type LoggedSandboxBlock,
  maxBlockedTargetsPerStep,
  type SandboxBlock,
  sandboxBlockedView,
} from "./sandbox-blocked.ts";

const home = "/home/user"; // leak-guard: allow absolute-path a made-up home folder for the tests

verifies("events.sandbox-blocked", () => {
  typeTest("names a file, a site or the others", () => {
    expectTypeOf<SandboxBlock>().toEqualTypeOf<
      | { kind: "file"; path: string; access: "read" | "write" }
      | { kind: "network"; host: string; port: number | null }
    >();
    expectTypeOf<LoggedSandboxBlock>().toEqualTypeOf<SandboxBlock | { kind: "others" }>();
  });

  it("writes a path in the home folder with ~", () => {
    const block: SandboxBlock = { kind: "file", path: `${home}/.ssh/id_ed25519`, access: "read" };
    expect(sandboxBlockedView(block, home)).toEqual({
      kind: "file",
      path: "~/.ssh/id_ed25519",
      access: "read",
    });
  });

  it("keeps a path outside the home folder, or when the home folder is unknown", () => {
    const outside: SandboxBlock = { kind: "file", path: "/srv/private/a.txt", access: "write" };
    const inside: SandboxBlock = { kind: "file", path: `${home}/notes.txt`, access: "write" };
    expect(sandboxBlockedView(outside, home)).toEqual(outside);
    expect(sandboxBlockedView(inside, null)).toEqual(inside);
  });

  it("copies a site as it is, with no other field", () => {
    const block = { kind: "network", host: "api.example.com", port: 443, extra: "x" } as const;
    expect(sandboxBlockedView(block, home)).toEqual({
      kind: "network",
      host: "api.example.com",
      port: 443,
    });
  });

  it("names at most 100 targets per step", () => {
    expect(maxBlockedTargetsPerStep).toBe(100);
  });
});
