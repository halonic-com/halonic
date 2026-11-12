// Checks that a built App Bundle allows plain http:// exactly as HAL-1140
// decided: the app talks to the user's own computer on the home network,
// which has no certificate, so the <application> element says
// android:usesCleartextTraffic="true" and has no android:networkSecurityConfig.
// From Android 7 (our minSdk is 24) a network security config replaces
// usesCleartextTraffic, so one added later would decide cleartext on its own
// (HAL-7175).
//
// It reads the manifest as the built file holds it, so it needs no Android tools:
// - a bundle (.aab) keeps base/manifest/AndroidManifest.xml in aapt2's protobuf
//   format (Resources.proto):
//     unzip -p app.aab base/manifest/AndroidManifest.xml > manifest.pb
//     node check-cleartext.mjs manifest.pb
// - an APK keeps AndroidManifest.xml in Android's binary XML format, so it
//   needs the --apk flag (the APK Play signed, HAL-7561):
//     unzip -p app.apk AndroidManifest.xml > manifest.xml
//     node check-cleartext.mjs --apk manifest.xml

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

const BINARY_XML = 0x0003;
const STRING_POOL = 0x0001;
const START_ELEMENT = 0x0102;
const TYPE_BOOLEAN = 0x12;
const UTF8_FLAG = 0x100;
// Android's resource IDs for the two attributes. aapt2 can leave an attribute's
// name empty and keep only its ID, so both are matched.
const RESOURCE_IDS = { usesCleartextTraffic: 0x010104ec, networkSecurityConfig: 0x01010527 };

/** Reads a string pool chunk (UTF-8 or UTF-16) into a list of strings. */
function readStringPool(view, start, size) {
  const count = view.getUint32(start + 8, true);
  const flags = view.getUint32(start + 16, true);
  const stringsStart = start + view.getUint32(start + 20, true);
  const end = start + size;
  const bytes = new Uint8Array(view.buffer, view.byteOffset);
  const strings = [];
  for (let i = 0; i < count; i += 1) {
    let at = stringsStart + view.getUint32(start + 28 + i * 4, true);
    if (at >= end) throw new Error("The manifest's string pool is cut short.");
    if (flags & UTF8_FLAG) {
      // Two lengths (characters, then bytes), each one or two bytes.
      at += bytes[at] & 0x80 ? 2 : 1;
      let length = bytes[at];
      at += 1;
      if (length & 0x80) {
        length = ((length & 0x7f) << 8) | bytes[at];
        at += 1;
      }
      strings.push(text(bytes.subarray(at, at + length)));
    } else {
      let length = view.getUint16(at, true);
      at += 2;
      if (length & 0x8000) {
        length = ((length & 0x7fff) << 16) | view.getUint16(at, true);
        at += 2;
      }
      strings.push(Buffer.from(bytes.subarray(at, at + length * 2)).toString("utf16le"));
    }
  }
  return strings;
}

/**
 * Reads an APK's binary XML manifest into the same shape readElement gives:
 * `{ name, attributes: [{ namespace, name, value, id, boolean }], children }`.
 */
function readBinaryManifest(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (buffer.length < 8 || view.getUint16(0, true) !== BINARY_XML) {
    throw new Error("Not a binary XML manifest. Is this the .aab's protobuf one, without --apk?");
  }
  let strings = [];
  let resourceIds = [];
  const root = { children: [] };
  const stack = [root];
  const string = (index) => (index >= 0 && index < strings.length ? strings[index] : "");
  const total = Math.min(view.getUint32(4, true), buffer.length);
  for (let at = view.getUint16(2, true); at < total; ) {
    if (at + 8 > total) throw new Error("The manifest ends inside a chunk header.");
    const type = view.getUint16(at, true);
    const size = view.getUint32(at + 4, true);
    if (size < 8 || at + size > total) throw new Error("The manifest ends inside a chunk.");
    if (type === STRING_POOL) {
      strings = readStringPool(view, at, size);
    } else if (type === 0x0180) {
      for (let i = 8; i + 4 <= size; i += 4) resourceIds.push(view.getUint32(at + i, true));
    } else if (type === START_ELEMENT) {
      const body = at + 16;
      const attributeStart = view.getUint16(body + 8, true);
      const attributeSize = view.getUint16(body + 10, true);
      const attributeCount = view.getUint16(body + 12, true);
      const attributes = [];
      for (let i = 0; i < attributeCount; i += 1) {
        const a = body + attributeStart + i * attributeSize;
        if (a + 20 > at + size) throw new Error("The manifest ends inside an attribute.");
        const nameIndex = view.getInt32(a + 4, true);
        const raw = view.getInt32(a + 8, true);
        const dataType = view.getUint8(a + 15);
        const data = view.getUint32(a + 16, true);
        attributes.push({
          namespace: string(view.getInt32(a, true)),
          name: string(nameIndex),
          value: raw >= 0 ? string(raw) : String(data),
          id: resourceIds[nameIndex],
          boolean: dataType === TYPE_BOOLEAN ? data !== 0 : undefined,
        });
      }
      const element = {
        name: string(view.getInt32(body + 4, true)),
        attributes,
        children: [],
      };
      stack[stack.length - 1].children.push(element);
      stack.push(element);
    } else if (type === 0x0103) {
      if (stack.length > 1) stack.pop();
    }
    at += size;
  }
  return root.children[0];
}

function check(manifest) {
  if (manifest?.name !== "manifest") return ["The file's root element isn't <manifest>."];
  const applications = manifest.children.filter((c) => c.name === "application");
  if (applications.length !== 1) {
    return [`The manifest has ${applications.length} <application> elements, not one.`];
  }
  const attribute = (name) =>
    applications[0].attributes.find(
      (a) => (a.namespace === ANDROID_NS && a.name === name) || a.id === RESOURCE_IDS[name],
    );
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

const apk = argv.includes("--apk");
const file = argv.slice(2).find((a) => a !== "--apk");
if (!file) {
  console.error(
    "Usage: node check-cleartext.mjs [--apk] <AndroidManifest.xml: the .aab's base/manifest/ one, or with --apk the .apk's>",
  );
  exit(2);
}
let problems;
try {
  const bytes = readFileSync(file);
  problems = check(apk ? readBinaryManifest(bytes) : readElement(bytes));
} catch (error) {
  problems = [error.message];
}
if (problems.length > 0) {
  for (const problem of problems) console.error(`::error title=Cleartext (HAL-1140)::${problem}`);
  exit(1);
}
console.log(
  `The ${apk ? "APK" : "bundle"} allows http:// as HAL-1140 decided: usesCleartextTraffic true, no network security config.`,
);
