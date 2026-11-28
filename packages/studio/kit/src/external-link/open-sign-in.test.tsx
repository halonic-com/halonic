// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { render } from "../test/render.tsx";
import {
  type OpenExternal,
  OpenExternalProvider,
  type OpenSignIn,
  useOpenExternal,
  useOpenSignIn,
} from "./open-external.tsx";

const approvalPage = "https://paperclip.acme.test/cli-auth/challenge-1";
const paperclip = "https://paperclip.acme.test";
const taskPage = "https://paperclip.acme.test/HAL/issues/HAL-1";

/** Renders a component that opens one page with each hook, and answers what each opener got. */
function openBoth(provider: { openExternal: OpenExternal; openSignIn?: OpenSignIn }) {
  function Opener() {
    const openExternal = useOpenExternal();
    const openSignIn = useOpenSignIn();
    void openExternal(taskPage);
    void openSignIn(approvalPage, paperclip);
    return null;
  }
  render(
    <OpenExternalProvider {...provider}>
      <Opener />
    </OpenExternalProvider>,
  );
}

verifies("kit.open-sign-in", () => {
  it("opens a sign-in page with the shell's openSignIn, with its origin, and any other page with openExternal", () => {
    const openExternal = vi.fn<OpenExternal>(async () => {});
    const openSignIn = vi.fn<OpenSignIn>(async () => {});
    openBoth({ openExternal, openSignIn });
    expect(openSignIn).toHaveBeenCalledExactlyOnceWith(approvalPage, paperclip);
    expect(openExternal).toHaveBeenCalledWith(taskPage);
    expect(openExternal).not.toHaveBeenCalledWith(approvalPage);
  });

  it("opens a sign-in page with openExternal where the shell gives no openSignIn", () => {
    const openExternal = vi.fn<OpenExternal>(async () => {});
    openBoth({ openExternal });
    expect(openExternal).toHaveBeenCalledWith(approvalPage);
    expect(openExternal).toHaveBeenCalledWith(taskPage);
  });
});
