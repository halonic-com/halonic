import { createSocket } from "node:dgram";
import type { MulticastSocket } from "./pair-advert.ts";

/** The multicast DNS group and port (RFC 6762). */
const mdnsGroup = "224.0.0.251";
const mdnsPort = 5353;

/**
 * Opens a UDP socket on the multicast DNS group. It shares port 5353 with
 * the system's own responder (Bonjour, Avahi), which is why it reuses the
 * address. Errors after it opened go to `log`, so none stops the host.
 *
 * @throws the socket's error when it can't bind or join the group
 */
export async function openMdnsSocket(log: (text: string) => void): Promise<MulticastSocket> {
  const socket = createSocket({ type: "udp4", reuseAddr: true });
  await new Promise<void>((resolve, reject) => {
    socket.once("error", reject);
    socket.bind(mdnsPort, () => {
      socket.off("error", reject);
      resolve();
    });
  });
  socket.on("error", (error) => log(`The multicast DNS socket failed: ${String(error)}\n`));
  try {
    socket.addMembership(mdnsGroup);
    socket.setMulticastTTL(255);
  } catch (error) {
    socket.close();
    throw error;
  }
  return {
    send: (message) =>
      new Promise((resolve, reject) => {
        socket.send(message, mdnsPort, mdnsGroup, (error) => (error ? reject(error) : resolve()));
      }),
    onMessage: (handler) => {
      socket.on("message", (message) => handler(new Uint8Array(message)));
    },
    close: () => new Promise((resolve) => socket.close(() => resolve())),
  };
}
