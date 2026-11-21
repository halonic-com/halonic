import type { Readable } from "node:stream";
import type { FramedHandshake, Handshake, HostIo } from "./host.ts";
import type { ShellSecretsChannel } from "./secrets/shell-secrets-channel.ts";
import { type HostRoute, serveHostOverFrames, startHostServer } from "./server/host-server.ts";
import { randomLaunchToken } from "./server/launch-token.ts";
import { carryHostConnection } from "./stdio/frame-stream.ts";

/** The routes the host serves, and how to stop all they started. */
export interface HostServices {
  routes: HostRoute[];
  stop(): Promise<void>;
  /** Tells the host which port its own server listens on, so no provider's address may be that port. */
  listeningOn(port: number): void;
  /**
   * Starts the remote gateway's listener when the setting turns it on, and does nothing otherwise.
   * A listener that can't start is told to `log` and the host serves without it.
   */
  startGateway(log: (text: string) => void): Promise<void>;
}

/** What `--relay-host` may name: the relay's port on Windows' own loopback address. */
const relayHostPattern = /^127\.0\.0\.1:([1-9][0-9]{0,4})$/;

/**
 * Serves over frames with `--stdio`, and on loopback otherwise.
 *
 * @returns the exit code: 0 at the end of the input, 1 when the stream broke, 2 for a wrong `--relay-host`
 */
export async function serveHost(
  args: readonly string[],
  io: HostIo,
  host: HostServices,
  keychain: ShellSecretsChannel | undefined,
): Promise<number> {
  if (args.includes("--stdio")) return await serveOverFrames(args, io, host, keychain);
  const ended = await serveOnLoopback(io, host, keychain);
  if (ended === undefined) return 0;
  io.writeError(`The agent host stopped: ${ended.message}\n`);
  return 1;
}

/**
 * Serves on a free port of 127.0.0.1 with a token made for this launch, and
 * prints one {@link Handshake} line. The token goes only to the program that
 * started the host, on standard output: never in arguments, the environment
 * or a file, where other programs could read it. The host stops when its
 * standard input closes, so it never outlives that program.
 *
 * With `keychain`, standard input and output carry the frames of the host's
 * secrets channel after the handshake line, and nothing else: standard
 * output is taken over, so a stray print goes to standard error.
 *
 * @returns `undefined` at the end of the input, or the error that broke the secrets channel's frames
 */
async function serveOnLoopback(
  io: HostIo,
  host: HostServices,
  keychain: ShellSecretsChannel | undefined,
): Promise<Error | undefined> {
  const token = randomLaunchToken();
  const server = await startHostServer(token, host.routes);
  host.listeningOn(Number(new URL(server.url).port));
  await host.startGateway((text) => io.writeError(text));
  const handshake: Handshake = { url: server.url, token };
  io.write(`${JSON.stringify(handshake)}\n`);
  const ended =
    keychain === undefined
      ? await inputClosed(io.input)
      : await carryHostConnection({ input: io.input, output: io.takeOutput() }, keychain);
  await host.stop();
  await server.close();
  return ended;
}

/**
 * Serves the same routes as {@link serveOnLoopback}, but on no port at all: in WSL,
 * every distro of a person shares one network, so a port in Halonic's distro
 * would be open to their other distros too (HAL-5396). Studio starts the host
 * through `wsl.exe` and relays the connections it accepts on Windows' loopback
 * as frames over the host's standard input and output (see `demuxFrames`).
 *
 * The handshake is one {@link FramedHandshake} line; after it, standard output
 * carries frames only. Requests must name the relay's address
 * (`--relay-host`) in their `Host` header. The host stops when the frame
 * stream ends: at the end of its input, as in the other mode, or when the
 * stream breaks the format. With `keychain`, frames on id 0 are its secrets
 * channel's.
 *
 * @returns the exit code: 0 at the end of the input, 1 when the stream broke, 2 for a wrong `--relay-host`
 */
async function serveOverFrames(
  args: readonly string[],
  io: HostIo,
  host: HostServices,
  keychain: ShellSecretsChannel | undefined,
): Promise<number> {
  const relayPort = relayPortOf(args);
  if (relayPort === undefined) {
    io.writeError("The agent host needs --relay-host 127.0.0.1:<port> with --stdio.\n");
    return 2;
  }
  const output = io.takeOutput();
  const token = randomLaunchToken();
  const handshake: FramedHandshake = { token };
  output.write(`${JSON.stringify(handshake)}\n`);
  host.listeningOn(relayPort);
  await host.startGateway((text) => io.writeError(text));
  const server = serveHostOverFrames(
    token,
    host.routes,
    { input: io.input, output },
    relayPort,
    undefined,
    keychain,
  );
  const ended = await server.ended;
  await host.stop();
  await server.close();
  if (ended === undefined) return 0;
  io.writeError(`The agent host stopped: ${ended.message}\n`);
  return 1;
}

/** The port `--relay-host` names, or `undefined` when it is missing or isn't `127.0.0.1:<port>`. */
export function relayPortOf(args: readonly string[]): number | undefined {
  const relayHost = args[args.indexOf("--relay-host") + 1] ?? "";
  const port = Number(relayHostPattern.exec(relayHost)?.[1] ?? 0);
  return port === 0 || port > 65_535 ? undefined : port;
}

function inputClosed(input: Readable): Promise<undefined> {
  return new Promise((resolve) => {
    input.once("end", () => resolve(undefined));
    input.once("close", () => resolve(undefined));
    input.once("error", () => resolve(undefined));
    // Nothing is read from the input yet; reading it lets its end arrive.
    input.resume();
  });
}
