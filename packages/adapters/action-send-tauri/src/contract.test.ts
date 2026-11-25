import { actionSenderContract, FakeActionSender } from "@halonicjs/testing-contracts";
import { FakeActionShell } from "./fake-shell.test-helper.ts";
import { TauriActionSender } from "./tauri-action-sender.ts";

// The port's contract against a mocked Tauri `invoke`: every call goes
// through the shell's commands, by the shell's argument names, and every
// answer comes back through JSON, as over the IPC.
actionSenderContract("tauri", async (setup) => {
  const decider = new FakeActionSender({
    routes: setup.routes,
    answer: setup.answer,
    signInAs: setup.accounts,
    user: setup.user,
  });
  const sender = new TauriActionSender(new FakeActionShell(decider, setup.routes));
  return { sender, sent: () => decider.sent, opened: () => decider.opened };
});
