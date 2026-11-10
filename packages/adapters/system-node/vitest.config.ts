import { platform } from "node:process";
import { definePackageTestConfig } from "@halonicjs/tooling-config/vitest";

// Windows reads the process table through Windows PowerShell 5.1, which
// starts slowly, and slower still when several test files start it at once;
// on a hosted runner that can pass the default 5 seconds (the program
// itself is stopped after 15).
export default definePackageTestConfig(
  platform === "win32" ? { test: { testTimeout: 20_000 } } : {},
);
