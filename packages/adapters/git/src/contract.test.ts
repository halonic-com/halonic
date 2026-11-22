import { vcsContractParts } from "@halonicjs/testing-contracts";
import { gitContractHarness } from "./contract-harness.spec.ts";

// The Vcs contract's basics here; its other parts are in `contract-*.test.ts`, so
// the test runner can spread them over its workers (HAL-15905).
vcsContractParts.basics("git", gitContractHarness());
