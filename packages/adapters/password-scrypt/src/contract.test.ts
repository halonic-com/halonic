import { passwordHasherContract, scryptFormat } from "@halonicjs/testing-contracts";
import { createScryptHasher } from "./scrypt-hasher.ts";

passwordHasherContract("scrypt", async () => createScryptHasher(), scryptFormat);
