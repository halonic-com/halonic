import { passwordHasherContract, pbkdf2ChainFormat } from "@halonicjs/testing-contracts";
import { createPbkdf2ChainHasher } from "./pbkdf2-chain-hasher.ts";

passwordHasherContract("chained PBKDF2", async () => createPbkdf2ChainHasher(), pbkdf2ChainFormat);
