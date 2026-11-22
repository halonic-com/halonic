import { passwordHasherContract, scryptFormat } from "@halonicjs/testing-contracts";
import { vi } from "vitest";
import { createScryptHasher } from "./scrypt-hasher.ts";

// The real scrypt, in a thread without coverage (see `scryptInWorker`).
vi.mock("@noble/hashes/scrypt.js", async (importOriginal) => {
  const { scryptInWorker } = await import("./test/scrypt-in-worker.spec.ts");
  return { ...(await importOriginal<object>()), scryptAsync: scryptInWorker };
});

passwordHasherContract("scrypt", async () => createScryptHasher(), scryptFormat);
