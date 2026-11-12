import { definePackageTestConfig } from "@halonicjs/tooling-config/vitest";

export default definePackageTestConfig({
  test: {
    // Parity tests start git and Node processes through cmd.exe on Windows. Run
    // side by side on a CI runner they slow each other past the 30 s test limit.
    fileParallelism: process.platform !== "win32",
  },
});
