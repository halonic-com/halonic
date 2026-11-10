import { platform } from "node:process";
import { definePackageTestConfig } from "@halonicjs/tooling-config/vitest";

// Windows reads the process table through PowerShell, which takes more than
// the default 5 seconds on a cold runner (the program itself allows 15).
export default definePackageTestConfig(
  platform === "win32" ? { test: { testTimeout: 20_000 } } : {},
);
