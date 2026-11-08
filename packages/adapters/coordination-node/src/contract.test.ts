import { coordinationContract } from "@halonicjs/testing-contracts";
import { startCoordination } from "./fakes.test-helper.ts";

coordinationContract("node", async () => {
  const { coordination, clock } = startCoordination();
  return { coordination, clock };
});
