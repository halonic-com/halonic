import { platform } from "node:process";
import { definePackageTestConfig } from "@halonicjs/tooling-config/vitest";

// Windows reads the process table through Windows PowerShell 5.1, which
// starts slowly and slower still while other test files start it too; on a
// hosted runner that goes past the default 5 seconds (the program allows 15).
export default definePackageTestConfig(
  platform === "win32" ? { test: { testTimeout: 20_000 } } : {},
);
