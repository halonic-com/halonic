// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { expect, it, vi } from "vitest";
import { click, render } from "../test/render.tsx";
import { ExternalLink } from "./external-link.tsx";
import { type ExternalAddress, OpenExternalProvider } from "./open-external.tsx";

const signInPage = "https://accounts.google.com/o/oauth2/v2/auth?state=fake-state";

/**
 * Renders "Sign in with Google" with an address from `startSignIn`, under an openExternal that
 * records what it got and waits for the address, the way the desktop shell does.
 */
function renderSignIn(startSignIn: () => Promise<string>) {
  const received: ExternalAddress[] = [];
  const opened: string[] = [];
  const openExternal = async (address: ExternalAddress) => {
    received.push(address);
    opened.push(await address);
  };
  const onError = vi.fn<(error: unknown) => void>();
  const { container } = render(
    <OpenExternalProvider openExternal={openExternal}>
      <ExternalLink href={startSignIn} onError={onError}>
        Sign in with Google
      </ExternalLink>
    </OpenExternalProvider>,
  );
  const button = container.querySelector("button") as HTMLButtonElement;
  return { button, received, opened, onError };
}

/** Lets the promises a click started settle, and React render what they changed. */
async function settle(): Promise<void> {
  await act(async () => {});
}

verifies("kit.external-link-requested-address", () => {
  it("is a button that reads like the link, since there's no address to put on a link yet", () => {
    const { button } = renderSignIn(async () => signInPage);
    expect(button.type).toBe("button");
    expect(button.textContent).toBe("Sign in with Google ↗ (opens in your browser)");
    expect(button.getAttribute("aria-busy")).toBe("false");
  });

  it("asks for the address on the click and hands it to openExternal at once, still pending", async () => {
    const startSignIn = vi.fn(async () => signInPage);
    const { button, received, opened } = renderSignIn(startSignIn);

    await click(button);
    await settle();

    expect(startSignIn).toHaveBeenCalledOnce();
    expect(received).toHaveLength(1);
    expect(received[0]).toBeInstanceOf(Promise);
    expect(opened).toEqual([signInPage]);
  });

  it("ignores more clicks while the address is on its way", async () => {
    let arrive: (url: string) => void = () => {};
    const startSignIn = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          arrive = resolve;
        }),
    );
    const { button, opened } = renderSignIn(startSignIn);

    await click(button);
    expect(button.getAttribute("aria-busy")).toBe("true");
    await click(button);
    expect(startSignIn).toHaveBeenCalledOnce();

    arrive(signInPage);
    await settle();
    expect(opened).toEqual([signInPage]);
    expect(button.getAttribute("aria-busy")).toBe("false");
  });

  it("tells the caller when the address doesn't arrive", async () => {
    const failure = new Error("The start route failed.");
    const { button, opened, onError } = renderSignIn(async () => {
      throw failure;
    });

    await click(button);
    await settle();

    expect(opened).toEqual([]);
    expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
    expect(button.getAttribute("aria-busy")).toBe("false");
  });

  it("tells the caller, and takes clicks again, when the request throws instead of rejecting", async () => {
    const failure = new Error("The start route failed.");
    const startSignIn = vi.fn((): Promise<string> => {
      throw failure;
    });
    const { button, opened, onError } = renderSignIn(startSignIn);

    await click(button);
    await settle();
    expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
    expect(button.getAttribute("aria-busy")).toBe("false");

    await click(button);
    await settle();
    expect(startSignIn).toHaveBeenCalledTimes(2);
    expect(opened).toEqual([]);
  });

  it("tells the caller when the shell's openExternal throws instead of rejecting", async () => {
    const failure = new Error("The system browser didn't start.");
    const onError = vi.fn<(error: unknown) => void>();
    const { container } = render(
      <OpenExternalProvider
        openExternal={() => {
          throw failure;
        }}
      >
        <ExternalLink href={async () => signInPage} onError={onError}>
          Sign in with Google
        </ExternalLink>
      </OpenExternalProvider>,
    );
    const button = container.querySelector("button") as HTMLButtonElement;

    await click(button);
    await settle();

    expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
    expect(button.getAttribute("aria-busy")).toBe("false");
  });

  it("refuses an address that arrives but isn't a web address", async () => {
    const { button, opened, onError } = renderSignIn(async () => "javascript:alert(1)");

    await click(button);
    await settle();

    expect(opened).toEqual([]);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(TypeError);
  });

  it("needs an onError, so a failed request can't go unseen", () => {
    // @ts-expect-error An address from a request needs onError.
    const element = <ExternalLink href={async () => signInPage}>Sign in with Google</ExternalLink>;
    expect(element.props.onError).toBeUndefined();
  });

  it("takes no onError with a known address, which can't fail to arrive", () => {
    const element = (
      // @ts-expect-error onError is only for an address from a request.
      <ExternalLink href={signInPage} onError={() => {}}>
        Sign in with Google
      </ExternalLink>
    );
    expect(element.props.href).toBe(signInPage);
  });
});
