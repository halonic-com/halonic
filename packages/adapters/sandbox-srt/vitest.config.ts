import { definePackageTestConfig } from "@halonicjs/tooling-config/vitest";

export default definePackageTestConfig({
  test: {
    server: {
      deps: {
        // Vitest loads srt as is, so vi.mock can't reach the modules srt
        // imports itself. Loading this one file through Vitest lets
        // srt-config.key-store.test.ts fix the shell it looks up with `which`.
        inline: [/sandbox-runtime\/dist\/sandbox\/macos-sandbox-utils\.js$/],
      },
    },
  },
});
