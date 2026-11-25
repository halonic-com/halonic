// The fakes live in @halonicjs/testing-contracts, whose code is measured in
// this package's run (its "measuredIn"), so their contracts run here.
import {
  actionRecordsContract,
  actionSenderContract,
  FakeActionRecords,
  FakeActionSender,
} from "@halonicjs/testing-contracts";

actionSenderContract("fake", async (setup) => {
  const sender = new FakeActionSender({
    routes: setup.routes,
    answer: setup.answer,
    signInAs: setup.accounts,
    user: setup.user,
  });
  return { sender, sent: () => sender.sent, opened: () => sender.opened };
});

actionRecordsContract("fake", async () => new FakeActionRecords());
