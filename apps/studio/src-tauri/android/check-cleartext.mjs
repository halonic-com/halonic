// Checks that a built App Bundle allows plain http:// exactly as HAL-1140
// decided: the app talks to the user's own computer on the home network,
// which has no certificate, so the <application> element says
// android:usesCleartextTraffic="true" and has no android:networkSecurityConfig.
// From Android 7 (our minSdk is 24) a network security config replaces
// usesCleartextTraffic, so one added later would decide cleartext on its own
// (HAL-7175).
//
// It reads the manifest as the bundle holds it: base/manifest/AndroidManifest.xml,
// in aapt2's protobuf format (Resources.proto), so it needs no Android tools.
//
//   unzip -p app.aab base/manifest/AndroidManifest.xml > manifest.pb
//   node check-cleartext.mjs manifest.pb

import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { argv, exit } from "node:process";

const ANDROID_NS = "http://schemas.android.com/apk/res/android";

/** Splits a protobuf message into its fields: `{ field, wire, value }`, value a number or bytes. */
function fields(bytes) {
  const out = [];
  let at = 0;
  const varint = () => {
    let value = 0;
    let shift = 0;
    for (;;) {
      if (at >= bytes.length) throw new Error("The manifest ends inside a number.");
      const byte = bytes[at];
      at += 1;
      value += (byte & 0x7f) * 2 ** shift;
      if (byte < 0x80) return value;
      shift += 7;
    }
  };
  while (at < bytes.length) {
    const key = varint();
    const field = Math.floor(key / 8);
    const wire = key % 8;
    if (wire === 0) {
      out.push({ field, wire, value: varint() });
    } else if (wire === 2) {
      const length = varint();
      if (at + length > bytes.length) throw new Error("The manifest ends inside a field.");
      out.push({ field, wire, value: bytes.subarray(at, at + length) });
      at += length;
    } else if (wire === 1 || wire === 5) {
      at += wire === 1 ? 8 : 4;
    } else {
      throw new Error(`Not a protobuf manifest (wire type ${wire}).`);
    }
  }
  return out;
}

const text = (bytes) => Buffer.from(bytes).toString("utf8");
const one = (list, field) => list.find((f) => f.field === field)?.value;

/** An XmlAttribute: namespace_uri 1, name 2, value 3, compiled_item 6 (Item, prim 7, boolean_value 8). */
function readAttribute(bytes) {
  const f = fields(bytes);
  const prim = one(fields(one(f, 6) ?? new Uint8Array()), 7);
  const flag = prim && fields(prim).find((p) => p.field === 8 && p.wire === 0);
  return {
    namespace: text(one(f, 1) ?? []),
    name: text(one(f, 2) ?? []),
    value: text(one(f, 3) ?? []),
    boolean: flag ? flag.value !== 0 : undefined,
  };
}

/** An XmlNode (element 1) holding an XmlElement: name 3, attribute 4, child 5. */
function readElement(nodeBytes) {
  const element = one(fields(nodeBytes), 1);
  if (!element) return undefined;
  const f = fields(element);
  return {
    name: text(one(f, 3) ?? []),
    attributes: f.filter((x) => x.field === 4).map((x) => readAttribute(x.value)),
    children: f
      .filter((x) => x.field === 5)
      .map((x) => readElement(x.value))
      .filter(Boolean),
  };
}

function check(manifest) {
  if (manifest?.name !== "manifest") return ["The file's root element isn't <manifest>."];
  const applications = manifest.children.filter((c) => c.name === "application");
  if (applications.length !== 1) {
    return [`The manifest has ${applications.length} <application> elements, not one.`];
  }
  const attribute = (name) =>
    applications[0].attributes.find((a) => a.namespace === ANDROID_NS && a.name === name);
  const problems = [];
  const cleartext = attribute("usesCleartextTraffic");
  if (!cleartext) {
    problems.push("<application> has no android:usesCleartextTraffic, so Android blocks http://.");
  } else if (cleartext.boolean !== true) {
    problems.push(
      `android:usesCleartextTraffic is "${cleartext.value}" (compiled: ${cleartext.boolean}), not true.`,
    );
  }
  if (attribute("networkSecurityConfig")) {
    problems.push(
      "<application> has an android:networkSecurityConfig, which replaces usesCleartextTraffic.",
    );
  }
  return problems;
}

const file = argv[2];
if (!file) {
  console.error("Usage: node check-cleartext.mjs <AndroidManifest.xml from base/manifest/>");
  exit(2);
}
let problems;
try {
  problems = check(readElement(readFileSync(file)));
} catch (error) {
  problems = [error.message];
}
if (problems.length > 0) {
  for (const problem of problems) console.error(`::error title=Cleartext (HAL-1140)::${problem}`);
  exit(1);
}
console.log(
  "The bundle allows http:// as HAL-1140 decided: usesCleartextTraffic true, no network security config.",
);
