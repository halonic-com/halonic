import { verifies } from "@halonicjs/testing-spec";
import { describe } from "vitest";
import { blobStoreContract, type MakeBlobStore } from "./blob-store.ts";
import { clockContract, type MakeClock } from "./clock.ts";
import { coordinationContract } from "./coordination.ts";
import type { MakeCoordination } from "./coordination-harness.ts";
import { definitionSourceContract, type MakeDefinitionSource } from "./definition-store.ts";
import type { PasswordHashFormatCases } from "./password-hash-formats.ts";
import { type MakePasswordHasher, passwordHasherContract } from "./password-hasher.ts";
import { type MakeRecordStore, recordStoreContract } from "./record-store.ts";
import { schedulerContract } from "./scheduler.ts";
import type { MakeScheduler } from "./scheduler-harness.ts";
import {
  type MakeSecrets,
  type MakeTokenStore,
  secretsContract,
  tokenStoreContract,
} from "./secrets.ts";

/**
 * The ports every deployment target hands out, each as a function that makes
 * one fresh instance the way the target wires it (the Cloudflare Worker
 * builds them from `env`, not from the adapter alone). Every field is
 * required: a target that has no adapter for a port can't run the suite, so
 * it can't skip one by leaving it out.
 */
export interface TargetPorts {
  clock: MakeClock;
  blobs: MakeBlobStore;
  records: MakeRecordStore;
  secrets: MakeSecrets;
  tokens: MakeTokenStore;
  definitions: MakeDefinitionSource;
  coordination: MakeCoordination;
  scheduler: MakeScheduler;
  passwords: {
    make: MakePasswordHasher;
    /** The one format the target's hasher makes. */
    format: PasswordHashFormatCases;
  };
}

/**
 * The port contracts of a target (multi-cloud ADR 5.9, group "Port
 * contracts"): every port's own contract suite, run against the adapters as
 * the target wires them. Each adapter passes its suite on its own already;
 * this group catches what wiring can break, such as a binding handed to the
 * wrong adapter or a limit put in front of one.
 *
 * @example
 * targetPortContracts("cloudflare", { clock, blobs, records, secrets, tokens, definitions, coordination, scheduler, passwords });
 */
export function targetPortContracts(targetName: string, ports: TargetPorts): void {
  verifies("contracts.target-ports", () => {
    describe(`Target port contracts: ${targetName}`, () => {
      clockContract(targetName, ports.clock);
      blobStoreContract(targetName, ports.blobs);
      recordStoreContract(targetName, ports.records);
      secretsContract(targetName, ports.secrets);
      tokenStoreContract(targetName, ports.tokens);
      definitionSourceContract(targetName, ports.definitions);
      coordinationContract(targetName, ports.coordination);
      schedulerContract(targetName, ports.scheduler);
      passwordHasherContract(targetName, ports.passwords.make, ports.passwords.format);
    });
  });
}
