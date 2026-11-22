import { vcsContractParts } from "@halonicjs/testing-contracts";
import { gitContractHarness } from "./contract-harness.spec.ts";

vcsContractParts.commits("git", gitContractHarness());
