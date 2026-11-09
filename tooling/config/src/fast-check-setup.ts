// Runs before each test file of a package that uses fast-check (see
// definePackageTestConfig). fast-check keeps its global settings in its own
// module, which the test files share with this one.
import fc from "fast-check";
import { fastCheckSeed } from "./fast-check-seed.ts";

const seed = fastCheckSeed(process.env["FAST_CHECK_SEED"]);
if (seed !== undefined) {
  fc.configureGlobal({ ...fc.readConfigureGlobal(), seed });
}
