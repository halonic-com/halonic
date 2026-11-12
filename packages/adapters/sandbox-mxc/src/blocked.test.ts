import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { blockOf } from "./blocked.ts";

const file = "C:\\acme\\x.txt"; // leak-guard: allow absolute-path made-up Windows path for a test

verifies("sandbox-mxc.session", () => {
  describe("blockOf", () => {
    it.each([
      ["open", "read"],
      ["lstat", "read"],
      ["scandir", "read"],
      ["mkdir", "write"],
      ["unlink", "write"],
      ["rename", "write"],
    ] as const)("reads an EACCES on %s as a refused %s", (call, access) => {
      expect(blockOf(`Error: EACCES: permission denied, ${call} '${file}'`)).toEqual({
        kind: "file",
        path: file,
        access,
      });
    });

    it("reads Node's EPERM that names a path", () => {
      expect(blockOf("EPERM: operation not permitted, lstat 'C:\\'")).toEqual({
        kind: "file",
        path: "C:\\",
        access: "read",
      });
    });

    it.each([
      ["connect ECONNREFUSED 127.0.0.1:5000", "127.0.0.1", 5000],
      ["connect ECONNREFUSED ::1:5000", "::1", 5000],
      ["Error: connect ENETUNREACH 93.184.216.34:443", "93.184.216.34", 443],
    ])("reads %s as a refused connection", (line, host, port) => {
      expect(blockOf(line)).toEqual({ kind: "network", host, port });
    });

    it.each([
      "Access is denied.",
      "EACCES: permission denied",
      "ENOENT: no such file or directory, open 'gone.txt'",
      "connect ETIMEDOUT 10.0.0.5:80",
      "just some output",
    ])("reports nothing for %j", (line) => {
      expect(blockOf(line)).toBeNull();
    });
  });
});
