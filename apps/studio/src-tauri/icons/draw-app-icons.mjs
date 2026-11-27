// Draws Studio's and the focused apps' native icons. Windows' .ico files and the windows' icons are
// the dark, all-blue set the board approved on HAL-20465 (`dark-blue-icons.mjs`): one line of light
// on ink glass around a point of light, each size drawn on its own pixel grid. `icon.png` (macOS and
// Linux) keeps Noah's masters on HAL-17379: the slate tile, the brand ring and the kit's glyph,
// glowing. A hand-tuned `tuned/<app>-<pixels>.png` replaces the drawn image in the .ico.
// Chromium turns each SVG into pixels, so it needs no image library, in three steps:
//
//   pnpm exec node apps/studio/src-tauri/icons/draw-app-icons.mjs page > page.html
//   chrome-headless-shell --headless --no-sandbox --virtual-time-budget=20000 --dump-dom file://$PWD/page.html > drawn.html
//   pnpm exec node apps/studio/src-tauri/icons/draw-app-icons.mjs write drawn.html
//
// The page is the script's own, with no network, so Chromium's sandbox (which containers often can't
// start) guards nothing. The last step writes, next to this script: icon.svg and icon.png (512, the
// tile), icon.ico (Studio's, which the exe and the installer carry), and for each focused app
// apps/<app>.svg (its taskbar drawing at 256 px), apps/<app>.ico (its Start menu shortcut) and
// apps/<app>.rgba (its window, 64 by 64 raw RGBA like the tray's, so the shell needs no image
// decoder).
//
// Android's shortcut icons (HAL-19143) need no Chromium, as Android draws them from vectors:
//
//   pnpm exec node apps/studio/src-tauri/icons/draw-app-icons.mjs android
//
// writes, for each focused app, the adaptive icon's slate background and its ring and glyph in front,
// in the Android app's res/drawable: the kit's ring and glyph, at the size Android keeps clear of the mask.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { appGlyphScale, appGlyphs } from "@halonicjs/studio-kit/app-glyphs";
import { darkBlueIconSvg } from "./dark-blue-icons.mjs";

const here = import.meta.dirname;
const focusedApps = ["inbox", "messenger"];
// The sizes the board's set is drawn at (HAL-20465): the small icon at 100 to 150% scaling (16 to
// 24), the taskbar's at 100 to 200% (24 to 48), 64, and the shell's 256. Windows shrinks the next
// bigger one for any other size.
const icoSizes = [16, 20, 24, 32, 40, 48, 64, 256];
const windowIconSize = 64;

const blue = "#3175f2";
const cyan = "#1bc6c8";
const slate950 = "#020617";

const shapeMarkup = (shape) => {
  if (shape.kind === "cut") {
    return "";
  }
  if (shape.kind === "dot") {
    return `<circle cx="${shape.cx}" cy="${shape.cy}" r="${shape.r}" fill="#fff"/>`;
  }
  if (shape.kind === "solid") {
    return `<path d="${shape.d}" fill="#fff" stroke="#fff" stroke-width="4.5" stroke-linejoin="round"/>`;
  }
  return `<path d="${shape.d}" fill="none" stroke="#fff" stroke-width="${shape.width}" stroke-linecap="round" stroke-linejoin="round"/>`;
};

// The masters' glow (icons.mjs on HAL-17379): white around the ring, white and teal around the glyph.
const glow = (id, layers) => {
  let previous = "SourceGraphic";
  const steps = layers.map(([sigma, colour, opacity], index) => {
    const step = `<feGaussianBlur in="${previous}" stdDeviation="${sigma}" result="b${index}"/><feFlood flood-color="${colour}" flood-opacity="${opacity}"/><feComposite in2="b${index}" operator="in" result="g${index}"/><feMerge result="l${index}"><feMergeNode in="g${index}"/><feMergeNode in="${previous}"/></feMerge>`;
    previous = `l${index}`;
    return step;
  });
  return `<filter id="${id}" filterUnits="userSpaceOnUse" x="-50" y="-50" width="200" height="200" color-interpolation-filters="sRGB">${steps.join("")}</filter>`;
};

/** How much of the tile the ring fills: more at small sizes, as in the masters. */
function ringShare(pixels) {
  if (pixels <= 16) {
    return 0.84;
  }
  return pixels <= 32 ? 0.76 : 0.6;
}

const names = { studio: "Halonic", inbox: "Halonic Inbox", messenger: "Halonic Messenger" };

/** The app's icon at `pixels`: Windows' rounded tile, the ring at the masters' share of it. */
function appIconSvg(app, pixels) {
  const glows = pixels >= 48;
  const scale = appGlyphScale(pixels);
  const share = ringShare(pixels);
  const ringSize = 100 * share;
  const at = 50 - ringSize / 2;
  const glyph = appGlyphs[app].map(shapeMarkup).join("");
  const filters = glows
    ? glow("r", [
        [3.5, "#ffffff", 0.45],
        [11, "#ffffff", 0.18],
      ]) +
      glow("c", [
        [2, "#ffffff", 0.9],
        [6, "#7fe3e4", 0.5],
      ])
    : "";
  const ring = `<circle cx="50" cy="50" r="42" fill="none" stroke="url(#ring)" stroke-width="16"/>`;
  const centre = `<g transform="translate(50 50) scale(${scale}) translate(-50 -50)">${glyph}</g>`;
  const edge = glows
    ? `<rect x="0.25" y="0.25" width="99.5" height="99.5" rx="22" fill="none" stroke="#ffffff" stroke-opacity="0.1" stroke-width="0.5"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pixels}" height="${pixels}" viewBox="0 0 100 100" role="img" data-app="${app}"><title>${names[app]}</title><defs><linearGradient id="ring" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${blue}"/><stop offset="1" stop-color="${cyan}"/></linearGradient>${filters}</defs><rect width="100" height="100" rx="22" fill="${slate950}"/>${edge}<g transform="translate(${at} ${at}) scale(${share})">${glows ? `<g filter="url(#r)">${ring}</g><g filter="url(#c)">${centre}</g>` : ring + centre}</g></svg>`;
}

// The approved ring taskbar logo's stroke at 256 px (HAL-19183), which Android's shortcuts keep, and
// how much of the ring's hole the glyph spans there, with the glyph's own width on its 100-unit box.
const ringStroke = 44;
const glyphFill = { studio: 0.45, messenger: 0.5, inbox: 0.58 };
const glyphWidth = { studio: 14, messenger: 28, inbox: 34 };

/** An .ico of PNG images, as Studio's icon.ico has always been. */
function ico(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ pixels, png }, index) => {
    const entry = 6 + 16 * index;
    header.writeUInt8(pixels >= 256 ? 0 : pixels, entry);
    header.writeUInt8(pixels >= 256 ? 0 : pixels, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...pngs.map(({ png }) => png)]);
}

/** The page that draws every picture the icons need, once Chromium has run its script. */
function page(jobs) {
  return `<!doctype html><pre id="out"></pre><script>
const jobs = ${JSON.stringify(jobs)};
Promise.all(jobs.map(async ({ key, pixels, svg }) => {
  const image = new Image();
  image.src = "data:image/svg+xml;base64," + btoa(svg);
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = pixels;
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, pixels, pixels);
  const bytes = context.getImageData(0, 0, pixels, pixels).data;
  let rgba = "";
  for (let i = 0; i < bytes.length; i += 8192) rgba += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return [key, { png: canvas.toDataURL("image/png").split(",")[1], rgba: btoa(rgba) }];
})).then((done) => { document.getElementById("out").textContent = JSON.stringify(Object.fromEntries(done)); });
</script>`;
}

/** What Chromium drew, from the page it dumped: `{ "<app> <pixels>": { png, rgba } }`. */
function drawnFrom(dom) {
  const json = /<pre id="out">([^<]*)<\/pre>/.exec(dom)?.[1];
  if (json === undefined || json === "") {
    throw new Error("Chromium drew nothing: give it more --virtual-time-budget.");
  }
  const drawn = JSON.parse(json.replaceAll("&quot;", '"').replaceAll("&amp;", "&"));
  return Object.fromEntries(
    Object.entries(drawn).map(([key, { png, rgba }]) => [
      key,
      { png: Buffer.from(png, "base64"), rgba: Buffer.from(rgba, "base64") },
    ]),
  );
}

/** The .ico's image at `pixels`: a hand-tuned one when there is one, else the drawn one. */
function icoImage(drawn, app, pixels) {
  const tuned = join(here, "tuned", `${app}-${pixels}.png`);
  return existsSync(tuned) ? readFileSync(tuned) : drawn[`${app} ${pixels}`].png;
}

function write(drawn) {
  const icoOf = (app) =>
    ico(icoSizes.map((pixels) => ({ pixels, png: icoImage(drawn, app, pixels) })));
  writeFileSync(join(here, "icon.svg"), `${appIconSvg("studio", 512)}\n`);
  writeFileSync(join(here, "icon.png"), drawn["tile 512"].png);
  writeFileSync(join(here, "icon.ico"), icoOf("studio"));
  mkdirSync(join(here, "apps"), { recursive: true });
  for (const app of focusedApps) {
    writeFileSync(join(here, "apps", `${app}.svg`), `${darkBlueIconSvg(app, 256, names[app])}\n`);
    writeFileSync(join(here, "apps", `${app}.ico`), icoOf(app));
    writeFileSync(join(here, "apps", `${app}.rgba`), drawn[`${app} ${windowIconSize}`].rgba);
  }
}

/**
 * One shape of a glyph as a vector path: white, filled or stroked as `shapeMarkup` draws it. Vectors
 * have no mask, so a `cut` is drawn in the slate the shortcut's ring sits on.
 */
function vectorPath(shape) {
  if (shape.kind === "cut") {
    return `<path android:strokeColor="${slate950}" android:strokeWidth="${shape.width}" android:strokeLineCap="round" android:strokeLineJoin="round" android:pathData="${shape.d}" />`;
  }
  if (shape.kind === "dot") {
    const { cx, cy, r } = shape;
    const circle = `M${cx - r},${cy} a${r},${r} 0 1,0 ${2 * r},0 a${r},${r} 0 1,0 ${-2 * r},0 Z`;
    return `<path android:fillColor="#ffffff" android:pathData="${circle}" />`;
  }
  if (shape.kind === "solid") {
    return `<path android:fillColor="#ffffff" android:strokeColor="#ffffff" android:strokeWidth="4.5" android:strokeLineJoin="round" android:pathData="${shape.d}" />`;
  }
  return `<path android:strokeColor="#ffffff" android:strokeWidth="${shape.width}" android:strokeLineCap="round" android:strokeLineJoin="round" android:pathData="${shape.d}" />`;
}

const generated =
  "<!-- Drawn by apps/studio/src-tauri/icons/draw-app-icons.mjs. Edit the script, not this file. -->";

/** A 108 dp vector: Android's adaptive icon layer, whose middle 66 dp no mask cuts. */
const vector = (body) =>
  `<?xml version="1.0" encoding="utf-8"?>\n${generated}\n<vector xmlns:android="http://schemas.android.com/apk/res/android" xmlns:aapt="http://schemas.android.com/aapt" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">\n${body}\n</vector>\n`;

/**
 * The glyph's size against the ring's 100 units in the approved taskbar logo at 256 px (HAL-20219):
 * that ring is 256 px across, so one unit is 2.56 px, and the glyph spans its share of the hole.
 */
function glyphOnRing(app) {
  const pixels = 256;
  const hole = pixels - 2 * ringStroke;
  const glyphScale = (hole * glyphFill[app]) / glyphWidth[app];
  return (glyphScale / (pixels / 100)) * appGlyphScale(pixels);
}

/**
 * The ring and the glyph, 60 dp across in the middle, as the launcher icon's ring is; the glyph at
 * the logos' size against the ring, so the long-press menu matches Windows.
 */
function shortcutForeground(app) {
  const ring = `<path android:strokeWidth="16" android:pathData="M8,50 a42,42 0 1,0 84,0 a42,42 0 1,0 -84,0 Z"><aapt:attr name="android:strokeColor"><gradient android:type="linear" android:startX="0" android:startY="100" android:endX="100" android:endY="0"><item android:color="${blue}" android:offset="0" /><item android:color="${cyan}" android:offset="1" /></gradient></aapt:attr></path>`;
  const glyph = appGlyphs[app].map(vectorPath).join("\n");
  const scale = glyphOnRing(app).toFixed(4);
  return vector(
    `<group android:translateX="24" android:translateY="24" android:scaleX="0.6" android:scaleY="0.6">\n${ring}\n<group android:pivotX="50" android:pivotY="50" android:scaleX="${scale}" android:scaleY="${scale}">\n${glyph}\n</group>\n</group>`,
  );
}

/** Each focused app's shortcut icon: adaptive from Android 8, the two layers stacked before it. */
function writeAndroid() {
  const res = join(here, "..", "gen", "android", "app", "src", "main", "res");
  mkdirSync(join(res, "drawable-anydpi-v26"), { recursive: true });
  writeFileSync(
    join(res, "drawable", "ic_shortcut_background.xml"),
    vector(`<path android:fillColor="${slate950}" android:pathData="M0,0h108v108h-108z" />`),
  );
  for (const app of focusedApps) {
    const name = `ic_shortcut_${app}`;
    writeFileSync(join(res, "drawable", `${name}_foreground.xml`), shortcutForeground(app));
    writeFileSync(
      join(res, "drawable", `${name}.xml`),
      `<?xml version="1.0" encoding="utf-8"?>\n${generated}\n<layer-list xmlns:android="http://schemas.android.com/apk/res/android">\n<item android:drawable="@drawable/ic_shortcut_background" />\n<item android:drawable="@drawable/${name}_foreground" />\n</layer-list>\n`,
    );
    writeFileSync(
      join(res, "drawable-anydpi-v26", `${name}.xml`),
      `<?xml version="1.0" encoding="utf-8"?>\n${generated}\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n<background android:drawable="@drawable/ic_shortcut_background" />\n<foreground android:drawable="@drawable/${name}_foreground" />\n</adaptive-icon>\n`,
    );
  }
}

const [step, drawnPage] = process.argv.slice(2);
if (step === "android") {
  writeAndroid();
} else if (step === "page") {
  const sizes = [...new Set([...icoSizes, windowIconSize])];
  const jobs = ["studio", ...focusedApps].flatMap((app) =>
    sizes.map((pixels) => ({ key: `${app} ${pixels}`, pixels, svg: darkBlueIconSvg(app, pixels) })),
  );
  jobs.push({ key: "tile 512", pixels: 512, svg: appIconSvg("studio", 512) });
  process.stdout.write(page(jobs));
} else if (step === "write" && drawnPage !== undefined) {
  write(drawnFrom(readFileSync(drawnPage, "utf8")));
} else {
  throw new Error(
    "Run it with `page`, then with `write <the page Chromium dumped>`, or with `android`.",
  );
}
