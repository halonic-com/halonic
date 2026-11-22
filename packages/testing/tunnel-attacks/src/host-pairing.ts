import type {
  ConnectedPhone,
  GatewayPairing,
  GatewayPhones,
  PairingAnswer,
  PairingAttempt,
  PairingPhone,
  PairingStart,
} from "@halonicjs/adapter-remote-gateway";
import {
  deviceId,
  type HostKey,
  type PairedPhones,
  type PairingDesk,
  type PairingTicket,
} from "@halonicjs/app-agent-host/remote-parts";

/** What {@link hostPhoneAccess} puts in front of the gateway. */
export interface HostPhoneAccessParts {
  readonly desk: PairingDesk;
  readonly phones: PairedPhones;
  readonly hostKey: HostKey;
  readonly hostName: string;
  /** Where a last seen that couldn't be written is reported. */
  readonly log: (text: string) => void;
}

/**
 * The host's pairing desk, paired phones and host key as the gateway asks
 * for them. The host doesn't connect these to its gateway yet (it runs it on
 * `NobodyPaired` until B8); this does it the way the ports describe, with no
 * rule of its own, so the attacks reach the real desk and store through the
 * real gateway. When the host's own connection lands, the rig uses that.
 */
export function hostPhoneAccess(parts: HostPhoneAccessParts): GatewayPhones & GatewayPairing {
  const { desk, phones, hostKey, hostName, log } = parts;
  return {
    hostPrivateKey: () => hostKey.privateKey(),
    hostName: () => hostName,
    isPaired: (publicKey) => phones.find(publicKey) !== undefined,
    connected(publicKey, onRevoked): ConnectedPhone {
      // Throws for a key that isn't paired, which the gateway takes as a revoke.
      const session = phones.connect(deviceId(publicKey), onRevoked);
      return {
        end: () => {
          session.end().catch((error: unknown) => log(`last seen not saved: ${String(error)}\n`));
        },
      };
    },
    begin(): PairingStart {
      const admission = desk.admit();
      if (!admission.admitted) return { kind: "refused", refusal: admission.refusal };
      return {
        kind: "open",
        code: admission.ticket.code,
        attempt: ticketAttempt(admission.ticket),
      };
    },
  };
}

/** One handshake's ticket at the desk, as the gateway reports on it. */
function ticketAttempt(ticket: PairingTicket): PairingAttempt {
  return {
    // A message 1 the host couldn't read tested nothing about the code: the ticket is left as it is.
    drop: () => undefined,
    wrongTry: () => ticket.wrongTry(),
    async decrypted(phone: PairingPhone, signal: AbortSignal): Promise<PairingAnswer> {
      const { publicKey, name, platform, checkCode } = phone;
      const use = ticket.useCode({ publicKey, name, platform }, checkCode);
      if (!use.used) return { kind: "refused", refusal: use.refusal };
      if (signal.aborted) ticket.close();
      else signal.addEventListener("abort", () => ticket.close(), { once: true });
      const verdict = await use.verdict;
      return verdict.allowed ? { kind: "allowed" } : { kind: verdict.reason };
    },
  };
}
