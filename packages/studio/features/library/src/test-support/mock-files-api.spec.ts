import { vi } from "vitest";

// Test files share their modules in a worker (`isolate: false`, HAL-15904), and many of them load
// the Files feature's api through library-place.tsx. A mock in one test file would only take hold
// when that file loaded the api first, so this setup file mocks it before every test file instead.
vi.mock("@halonicjs/studio-feature-files/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@halonicjs/studio-feature-files/api")>()),
  requestFilesReveal: (await import("./files-reveal.spec.ts")).requestFilesReveal,
}));
