import { generateKeyPairSync, randomBytes, sign } from "node:crypto";

/** A certificate and its private key, as PEM text. */
export interface TestCertificate {
  readonly certificate: string;
  readonly privateKey: string;
}

/**
 * Makes a self-signed certificate for the given names and IPv4 addresses, so a
 * test can run a TLS server without a certificate file in the repository and
 * without `openssl`. Each certificate gets its own subject, because a trust
 * store looks a certificate up by subject and two that share one clash. Trust
 * it by adding it to the default CAs.
 */
export function selfSignedCertificate(subjects: {
  readonly names?: readonly string[];
  readonly ipv4?: readonly string[];
}): TestCertificate {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const signatureAlgorithm = sequence(oid([0x2a, 0x86, 0x48, 0xce, 0x3d, 0x04, 0x03, 0x02]));
  const commonName = sequence(
    set(
      sequence(
        oid([0x55, 0x04, 0x03]),
        tlv(0x0c, Buffer.from(`halonic test ${randomBytes(4).toString("hex")}`)),
      ),
    ),
  );
  const alternativeNames = sequence(
    ...(subjects.names ?? []).map((name) => tlv(0x82, Buffer.from(name))),
    ...(subjects.ipv4 ?? []).map((ip) => tlv(0x87, Buffer.from(ip.split(".").map(Number)))),
  );
  const toBeSigned = sequence(
    tlv(0xa0, tlv(0x02, Buffer.from([2]))),
    tlv(0x02, Buffer.from([1])),
    signatureAlgorithm,
    commonName,
    sequence(utcTime(daysFromNow(-1)), utcTime(daysFromNow(30))),
    commonName,
    Buffer.from(publicKey.export({ type: "spki", format: "der" })),
    tlv(0xa3, sequence(sequence(oid([0x55, 0x1d, 0x11]), tlv(0x04, alternativeNames)))),
  );
  const signature = sign("sha256", toBeSigned, { key: privateKey, dsaEncoding: "der" });
  const certificate = sequence(
    toBeSigned,
    signatureAlgorithm,
    tlv(0x03, Buffer.concat([Buffer.from([0]), signature])),
  );
  return {
    certificate: pem("CERTIFICATE", certificate),
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

/** One DER element: a tag, the length of its content, and the content. */
function tlv(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag, ...derLength(content.length)]), content]);
}

function derLength(length: number): number[] {
  if (length < 0x80) {
    return [length];
  }
  if (length < 0x100) {
    return [0x81, length];
  }
  return [0x82, length >> 8, length & 0xff];
}

const sequence = (...parts: Buffer[]) => tlv(0x30, Buffer.concat(parts));
const set = (...parts: Buffer[]) => tlv(0x31, Buffer.concat(parts));
const oid = (bytes: number[]) => tlv(0x06, Buffer.from(bytes));

function utcTime(date: Date): Buffer {
  const text = date.toISOString().replace(/^\d\d/, "").replace(/[-:T]/g, "").slice(0, 12);
  return tlv(0x17, Buffer.from(`${text}Z`));
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function pem(label: string, der: Buffer): string {
  const lines = der.toString("base64").match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}
