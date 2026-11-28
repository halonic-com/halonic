/**
 * How the windows tell each other that a sign-in ended, so each reads its sign-ins again and a
 * prompt goes away in every open app (`shell.sign-in-needed`). The message carries nothing: each
 * window reads the state from the agent host it shares with the others.
 */
export interface SignInChannel {
  /** Tells the other windows; the window that posts doesn't hear its own message. */
  post(): void;
  /** Calls `listener` when another window posts. Returns a function that stops the calls. */
  subscribe(listener: () => void): () => void;
  /** Lets go of the channel. */
  close(): void;
}

/** The channel's name, the same in every window of the app. */
export const signInChannelName = "halonic-sign-ins";

/** A {@link SignInChannel} between the app's windows, over the Web-standard `BroadcastChannel`. */
export function createBroadcastSignInChannel(): SignInChannel {
  const channel = new BroadcastChannel(signInChannelName);
  return {
    post: () => channel.postMessage("changed"),
    subscribe: (listener) => {
      const onMessage = (): void => listener();
      channel.addEventListener("message", onMessage);
      return () => channel.removeEventListener("message", onMessage);
    },
    close: () => channel.close(),
  };
}
