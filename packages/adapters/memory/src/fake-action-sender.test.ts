// The fake lives in @halonicjs/testing-contracts, whose code is measured in
// this package's run (its "measuredIn"), so its contract runs here.
import { actionSenderContract, FakeActionSender } from "@halonicjs/testing-contracts";

actionSenderContract("fake", async (setup) => {
  const sender = new FakeActionSender({
    steps: setup.steps,
    answer: setup.answer,
    signInAs: { github: setup.githubAccount },
  });
  return { sender, sent: () => sender.sent };
});
