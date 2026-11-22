import { vcsContractParts } from "@halonicjs/testing-contracts";
import { gitContractHarness } from "./contract-harness.spec.ts";

const make = gitContractHarness();
vcsContractParts.versions("git", make);
vcsContractParts.versionSafety("git", make);
