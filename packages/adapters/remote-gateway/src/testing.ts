// What other packages' tests need to drive the real gateway as a phone, as this package's own
// tests do: the phone's interop test in `packages/testing/integration` (HAL-15179). Only tests
// import it: it is not part of the gateway's entry, so a host can't pick it by accident.

export { keyPair, TestPhone } from "./e2e-phone.test-helper.ts";
export { FakePairing, FakePhones, testCode } from "./e2e-session.test-helper.ts";
export { FakeSource } from "./fake-source.test-helper.ts";
export { openListener, RawClient } from "./listener.test-helper.ts";
