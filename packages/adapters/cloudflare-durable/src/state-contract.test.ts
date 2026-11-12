import { coordinationContract } from "@halonicjs/testing-contracts";
import { CoordinationState } from "./coordination-state.ts";
import { FakeStateStorage, ManualClock } from "./fakes.test-helper.ts";

coordinationContract("state over fake storage, in Node", async () => {
  const clock = new ManualClock();
  return { coordination: new CoordinationState(new FakeStateStorage(), clock), clock };
});
