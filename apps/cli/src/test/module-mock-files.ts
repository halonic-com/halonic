/**
 * The test files that replace a module with `vi.mock` or `vi.doMock`. A mock
 * applies only where the module isn't loaded yet, so these run in a fresh
 * module cache each; every other file shares its worker's module cache
 * (HAL-17930). `module-mock-files.test.ts` fails when this list is missing one.
 */
export const filesWithModuleMocks = ["src/open-local-integration.test.ts"];
