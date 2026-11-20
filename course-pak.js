// Custom courses on an Ultra disc of Double Dash. The disc ends with mkddu/courses.pak: an index, then its files,
// which are the packs' inis, the course ZIPs, the cups' icons, and a previews and a scan file the game reads instead
// of the ZIPs where it can. A pak for an SD card is the same file. courseSink fills the disc's while the patcher
// writes the ISO.
// A pack is a pak with an ini: the Pack Maker (pack-maker.js) makes one of course ZIPs and reads one back.
// Loaded after patcher-core.js and course-music.js, which Node gets here.
if (typeof module !== "undefined") {
  Object.assign(globalThis, require("./patcher-core.js"), require("./course-music.js"));
}

const PAK_MAGIC = 0x5550414b;  // "UPAK"
const PAK_VERSION = 1;
const NAME_SHORT = 4;  // the letters of a course's name a package may leave out
const PAK_HEAD = 32;
const PAK_RECORD = 64;
const PAK_NAME = 56;
const PAK_ALIGN = 32;
const ISO_ALIGN = 0x8000;

async function pakBytes(blob, offset, length) {
  const bytes = new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer());
  if (bytes.length !== length) {
    throw new PatchError(`${blob.name || "This file"} is cut short.`);
  }
  return new DataView(bytes.buffer);
}

// What the game takes of a course ZIP, by the rules of its own reader (ultra/src/custom/zip.c and package.c of
// mkdd-ultra, which tests/package_rules.py there holds this against)
const ZIP_TAIL = 1024;             // the end record is looked for this far from the end
const ZIP_DIRECTORY = 0x4000;      // the most of the list of files
const ZIP_SECTOR = 512;            // a file is read from the start of a sector,
const ZIP_STREAM_CHUNK = 0x4000;   // this much at a time
const SCAN_MOST = 0x8000;          // a ZIP's part of the pak's scan file, and the pieces in it (pak.c)
const SCAN_PIECES = 16;
const PACKAGE_TEXT = 0x800;        // and of trackinfo.ini and minimap.json
const PACKAGE_SNIFF = 0x2000;      // the start of the archive, which has its file names
const COURSE_HEAP = 0x280000;       // the course heap, which holds the archive, the name picture and the ghost
const COURSE_HEAP_OTHERS = 0xC000;
const PICTURE_MOST = 0x18000;       // a preview as the ZIP has it
const TEXT_MOST = 31;
const PICTURE_SIDE = 512;           // a picture wider or higher isn't a preview
const PREVIEW_SLOT = 0x5c20;        // a preview's place in a pak's previews file: 256 by 184 as CMPR after its header
const SONG_BLOCK = 0x2760;
const MINIMAP_MOST = 1000000;
const RACE_SLOTS = 16;
const COURSES_MOST = 200, PACKS_MOST = 16;    // the game takes this many courses, and packs' inis
const PACK_INI_MOST = 0x8000;       // an ini of this size or more isn't read
const SONGS = ["lap_music_normal.ast", "lap_music_fast.ast"];
// The courses of the game by their archives' names, the race courses first
const COURSES = [
  ["Luigi", "Luigi Circuit"], ["Peach", "Peach Beach"], ["BabyLuigi", "Baby Park"], ["Desert", "Dry Dry Desert"],
  ["Nokonoko", "Mushroom Bridge"], ["Mario", "Mario Circuit"], ["Daisy", "Daisy Cruiser"],
  ["Waluigi", "Waluigi Stadium"], ["Snow", "Sherbet Land"], ["Patapata", "Mushroom City"], ["Yoshi", "Yoshi Circuit"],
  ["Donkey", "DK Mountain"], ["Wario", "Wario Colosseum"], ["Diddy", "Dino Dino Jungle"], ["Koopa", "Bowser's Castle"],
  ["Rainbow", "Rainbow Road"], ["Mini7", "Cookie Land"], ["Mini2", "Nintendo GameCube"], ["Mini3", "Block City"],
  ["Mini8", "Pipe Plaza"], ["Mini1", "Luigi's Mansion"], ["Mini5", "Tilt-A-Kart"],
];
const CONSOLES = ["NGC", "SNES", "N64", "GBA", "DS", "WII", "3DS", "GP", "GCN"];
const NO_CONSOLE = "FAN";           // the pill of a course without one
const LENGTHS = ["short", "medium", "long"], DIFFICULTIES = ["easy", "medium", "hard"];
const CUP_COURSES = 4, PAGE_CUPS = 4, PAGE_STAGES = 6;
const CUP_TEXT_MOST = 19;           // the letters of a pack's and a cup's name
const PACK_VERSION = /^[0-9.]{1,4}$/;   // a pack's version as the game takes it: 1.0 or 1.12 (cups.c)
const PACK_VERSION_NONE = "1.0";    // what the game shows for a pack without one
const MAKER_PAK = "maker.pak";      // the pack the Pack Maker hands to the patcher, in the site's storage
const MAKER_ZIPS = "maker-zips";    // and the folder of course ZIPs the patcher hands to the Pack Maker

const isZip = file => file.name.toLowerCase().endsWith(".zip");

// A ZIP's list of files: where it is, where the end record after it is, and its entries as {name, locked, method,
// crc, packed, size, header, record (where in the list)}
async function zipList(blob, wrong) {
  const tail = Math.min(blob.size, ZIP_TAIL);
  const end = await pakBytes(blob, blob.size - tail, tail);
  let at = tail - 22;
  while (at >= 0 && end.getUint32(at, true) !== 0x06054b50) {
    at -= 1;
  }
  if (at < 0) {
    throw wrong(tail < 22 || blob.size <= ZIP_TAIL ? "is not a ZIP"
      : "has a long comment in it. Zip it again without one");
  }
  const length = end.getUint32(at + 12, true);
  if (length > ZIP_DIRECTORY) {
    throw wrong("has too many files in it");
  }
  const offset = end.getUint32(at + 16, true);
  if (offset > blob.size || length > blob.size - offset) {
    throw wrong("is damaged");
  }
  const list = await pakBytes(blob, offset, length);
  const entries = [];
  for (let record = 0; record + 46 <= length && list.getUint32(record, true) === 0x02014b50;) {
    const name = list.getUint16(record + 28, true);
    if (name > length - record - 46) {
      break;
    }
    entries.push({
      name: latin(new Uint8Array(list.buffer, record + 46, name)), locked: list.getUint16(record + 8, true) & 1,
      method: list.getUint16(record + 10, true), crc: list.getUint32(record + 16, true),
      packed: list.getUint32(record + 20, true), size: list.getUint32(record + 24, true),
      header: list.getUint32(record + 42, true), record,
    });
    record += 46 + name + list.getUint16(record + 30, true) + list.getUint16(record + 32, true);
  }
  return { entries, offset, length, end: blob.size - tail + at };
}

const zipEntries = async (blob, wrong) => (await zipList(blob, wrong)).entries;

// The entry named wanted (lowercase) in the package's folder, which is that of its trackinfo.ini; null when it isn't
// there or the game can't unpack it, which pack.why then says
function zipEntry(entries, pack, wanted) {
  for (const entry of entries) {
    const before = pack.folder === null ? entry.name.length - wanted.length : pack.folder.length;
    if (before >= 0 && entry.name.length === before + wanted.length &&
        entry.name.slice(before).toLowerCase() === wanted && (before === 0 || entry.name[before - 1] === "/") &&
        (pack.folder === null || entry.name.startsWith(pack.folder))) {
      pack.folder = entry.name.slice(0, before);
      pack.why = entry.locked ? "is locked with a password"
        : entry.method !== 0 && entry.method !== 8 ? "is zipped in a way the game can't open" : "";
      return pack.why ? null : entry;
    }
  }
  return null;
}

// Up to most bytes from the start of an entry, or null when its data isn't where the ZIP says
async function zipStart(blob, entry, most) {
  if (entry.header > blob.size || 30 > blob.size - entry.header) {
    return null;
  }
  const head = await pakBytes(blob, entry.header, 30);
  const start = entry.header + 30 + head.getUint16(26, true) + head.getUint16(28, true);
  if (head.getUint32(0, true) !== 0x04034b50 || start > blob.size || entry.packed > blob.size - start ||
      (entry.method === 0 && entry.packed !== entry.size)) {
    return null;
  }
  const want = Math.min(most, entry.size);
  const packed = blob.slice(start, start + entry.packed);
  if (entry.method === 0) {
    return new Uint8Array(await packed.slice(0, want).arrayBuffer());
  }
  const out = new Uint8Array(want);
  const reader = packed.stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  let got = 0;
  try {
    while (got < want) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      out.set(value.subarray(0, want - got), got);
      got += Math.min(value.length, want - got);
    }
  } catch (error) {
    // Damaged from here on: the game has what came before
  }
  reader.cancel().catch(() => {});
  return out.subarray(0, got);
}

// A whole entry, checked as the game checks it, or null
async function zipWhole(blob, entry) {
  const bytes = await zipStart(blob, entry, entry.size);
  return bytes && bytes.length === entry.size && crc32(bytes) === entry.crc ? bytes : null;
}

// The value of key in an ini as the game reads it: in capitals, only with the letters its labels have
function iniValue(text, key) {
  for (const line of text.split("\n")) {
    const found = line.slice(0, key.length).toLowerCase() === key &&
                  line.slice(key.length).match(/^[ \t]*=[ \t]*([^\r]*)/);
    if (found) {
      return Array.from(found[1].toUpperCase()).filter(letter => /[A-Z0-9 '\-.!?&:+]/.test(letter))
        .slice(0, TEXT_MOST).join("").replace(/ +$/, "");
    }
  }
  return "";
}

// The number after "key": in JSON, as the game reads it, or null
function jsonNumber(text, key) {
  const found = text.match(new RegExp(`"${key}"[ :\\t\\r\\n]*(-?)([0-9.]*)`, "i"));
  const digits = found && found[2].replace(/^([0-9]*\.?[0-9]*).*$/, "$1");
  const number = digits && /[0-9]/.test(digits) ? Number(digits.replace(/\.$/, "")) : NaN;
  return Number.isFinite(number) && number < MINIMAP_MOST ? (found[1] ? -number : number) : null;
}

// The course whose files the start of an archive is named for (luigi_course.bol), or -1
function sniffedSlot(start) {
  const text = latin(start).toLowerCase();
  for (let at = text.indexOf("_course.bol"); at >= 0; at = text.indexOf("_course.bol", at + 1)) {
    const name = text.slice(text.lastIndexOf("\0", at) + 1, at);
    const slot = COURSES.findIndex(([archive]) => archive.toLowerCase() === name);
    if (slot >= 0) {
      return slot;
    }
  }
  return -1;
}

// How many letters of a course's name the text leaves out, spaces and marks aside (one in BOWSER CASTLE, four in
// DINO JUNGLE), or -1 if it has other letters
function lettersShort(text, name) {
  const letters = word => word.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const [short, whole] = [letters(text), letters(name)];
  let at = 0;
  for (const letter of whole) {
    at += short[at] === letter;
  }
  return at === short.length ? whole.length - short.length : -1;
}

// The course trackinfo.ini says a package replaces, if it is of the kind its files are named for, else that one
function namedSlot(replaces, files) {
  let found = files, least = NAME_SHORT + 1;
  COURSES.forEach(([, name], slot) => {
    const leftOut = lettersShort(replaces, name);
    if (leftOut >= 0 && leftOut < least) {
      [found, least] = [slot, leftOut];
    }
  });
  return (found < RACE_SLOTS) === (files < RACE_SLOTS) ? found : files;
}

// The console a name starts with (N64 KALIMARI DESERT, GCN for NGC) and the name without it, as name_console of
// package.c
function nameConsole(name) {
  for (const pill of CONSOLES) {
    if (name.slice(0, pill.length + 1).toUpperCase() === `${pill} ` && name.trimEnd().length > pill.length + 1) {
      return { console: pill === "GCN" ? "NGC" : pill, name: name.slice(pill.length + 1).trim() };
    }
  }
  return { console: "", name };
}

// Whether the game's streams can play a song: 16 bits, at most stereo, in their blocks
async function songFits(blob, entry) {
  const head = entry.size >= 0x40 ? await zipStart(blob, entry, 0x40) : null;
  const view = head && head.length === 0x40 ? new DataView(head.buffer, head.byteOffset, 0x40) : null;
  return Boolean(view) && latin(head.subarray(0, 4)) === "STRM" && view.getUint16(0x0a) === 16 &&
         view.getUint16(0x0c) >= 1 && view.getUint16(0x0c) <= 2 && view.getUint32(0x20) === SONG_BLOCK;
}

// Whether the game can show a preview: in a format its picture.c reads, with all its pixels and colors there
function pictureFits(file) {
  if (file.length < 0x20) {
    return false;
  }
  const view = new DataView(file.buffer, file.byteOffset, file.length);
  const format = file[0], width = view.getUint16(2), height = view.getUint16(4);
  const tile = format === 4 || format === 5 ? 4 : 8, down = format === 14 ? 8 : 4;
  const pixels = Math.ceil(width / tile) * tile * Math.ceil(height / down) * down;
  const bytes = format === 14 ? pixels / 2 : format === 9 ? pixels : pixels * 2;
  return [4, 5, 9, 14].includes(format) && width > 0 && height > 0 && width <= PICTURE_SIDE &&
         height <= PICTURE_SIDE && view.getUint32(0x1c) + bytes <= file.length &&
         (format !== 9 || ((file[9] === 1 || file[9] === 2) &&
                           view.getUint32(0x0c) + view.getUint16(0x0a) * 2 <= file.length));
}

// A package's preview when the game can show it, or null
async function previewOf(blob, entries, pack) {
  const entry = zipEntry(entries, { ...pack }, "course_images/english/track_image.bti");
  const picture = entry && entry.size <= PICTURE_MOST ? await zipWhole(blob, entry) : null;
  return picture && pictureFits(picture) ? picture : null;
}

const from565 = color => {
  const r = color >> 11, g = color >> 5 & 63, b = color & 31;
  return [r << 3 | r >> 2, g << 2 | g >> 4, b << 3 | b >> 2];
};

const from5a3 = color => {
  if (color & 0x8000) {
    return [color >> 10 & 31, color >> 5 & 31, color & 31].map(part => part << 3 | part >> 2);
  }
  return [color >> 8 & 15, color >> 4 & 15, color & 15].map(part => part * 0x11);
};

// A pixel of a picture pictureFits takes, as [r, g, b]
function picturePixel(file, view, x, y) {
  const format = file[0], pixels = view.getUint32(0x1c);
  const tile = format === 4 || format === 5 ? 4 : 8;
  const across = Math.ceil(view.getUint16(2) / tile) * tile;
  if (format === 14) {
    const block = pixels + ((y >> 3) * (across >> 3) * 4 + (x >> 3) * 4 + (y % 8 >> 2) * 2 + (x % 8 >> 2)) * 8;
    const first = view.getUint16(block), second = view.getUint16(block + 2);
    const a = from565(first), b = from565(second);
    const index = file[block + 4 + y % 4] >> (6 - x % 4 * 2) & 3;
    // With the first color not the bigger, the third is the middle and the fourth clear
    const [step, steps] = first > second ? [4 - index, 3] : [1, 2];
    return index === 0 ? a : index === 1 ? b : b.map((part, i) => part + Math.trunc((a[i] - part) * step / steps));
  }
  if (format === 9) {
    const index = file[pixels + ((y >> 2) * (across >> 3) + (x >> 3)) * 32 + y % 4 * 8 + x % 8];
    const color = index < view.getUint16(0x0a) ? view.getUint16(view.getUint32(0x0c) + index * 2) : 0;
    return file[9] === 2 ? from5a3(color) : from565(color);
  }
  const color = view.getUint16(pixels + (((y >> 2) * (across >> 2) + (x >> 2)) * 16 + y % 4 * 4 + x % 4) * 2);
  return format === 5 ? from5a3(color) : from565(color);
}

// Sixteen pixels as a CMPR block: the two colors are the corners of the box around them, and a pixel has the one of
// the four on the line between them it is nearest
function cmprBlock(pixels, to, at) {
  const low = [0, 1, 2].map(part => Math.min(...pixels.map(pixel => pixel[part])));
  const high = [0, 1, 2].map(part => Math.max(...pixels.map(pixel => pixel[part])));
  const span = high.map((part, i) => part - low[i]);
  const length = span.reduce((sum, part) => sum + part * part, 0);
  const first = high[0] >> 3 << 11 | high[1] >> 2 << 5 | high[2] >> 3;
  const second = low[0] >> 3 << 11 | low[1] >> 2 << 5 | low[2] >> 3;
  to.set([first >> 8, first & 0xff, second >> 8, second & 0xff, 0, 0, 0, 0], at);
  for (let i = 0; first !== second && i < 16; i += 1) {
    const along = pixels[i].reduce((sum, part, j) => sum + (part - low[j]) * span[j], 0);
    // From the second color to the first: the second, the fourth, the third, the first
    to[at + 4 + (i >> 2)] |= [1, 3, 2, 0][Math.floor((along * 6 + length) / (length * 2))] << (6 - i % 4 * 2);
  }
}

// A picture pictureFits takes as the game makes it for a select screen (picture.c of mkdd-ultra, which
// tests/package_rules.py there holds this against): CMPR of width by height after its header, a pixel the mean of
// four of the picture's under it
function pictureFit(file, width, height) {
  const view = new DataView(file.buffer, file.byteOffset, file.length);
  const wide = view.getUint16(2), high = view.getUint16(4);
  const to = new Uint8Array(0x20 + width * height / 2);
  to.set([14, 0, width >> 8, width & 0xff, height >> 8, height & 0xff]);
  to[0x14] = to[0x15] = to[0x18] = 1;
  to[0x1f] = 0x20;
  if (file[0] === 14 && wide === width && high === height) {
    to.set(file.subarray(view.getUint32(0x1c), view.getUint32(0x1c) + width * height / 2), 0x20);
    return to;
  }
  for (let part = 0; part < width * height / 16; part += 1) {
    // Four blocks to a tile of 8 by 8
    const x = (part >> 2) % (width >> 3) * 8 + part % 2 * 4;
    const y = Math.floor((part >> 2) / (width >> 3)) * 8 + (part % 4 >> 1) * 4;
    const pixels = [];
    for (let i = 0; i < 16; i += 1) {
      const sum = [0, 0, 0];
      for (let j = 0; j < 4; j += 1) {
        picturePixel(file, view, Math.floor((4 * (x + i % 4) + 1 + j % 2 * 2) * wide / (4 * width)),
                     Math.floor((4 * (y + (i >> 2)) + 1 + (j >> 1) * 2) * high / (4 * height)))
          .forEach((value, k) => { sum[k] += value; });
      }
      pixels.push(sum.map(value => value >> 2));
    }
    cmprBlock(pixels, to, 0x20 + part * 8);
  }
  return to;
}

// A picture pictureFits takes as {width, height, rgba}, to draw
function picturePixels(file) {
  const view = new DataView(file.buffer, file.byteOffset, file.length);
  const width = view.getUint16(2), height = view.getUint16(4);
  const rgba = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let at = 0; at < width * height; at += 1) {
    rgba.set(picturePixel(file, view, at % width, Math.floor(at / width)), at * 4);
  }
  return { width, height, rgba };
}

// A cup's icon: a BTI the game shows as it is, 96 by 96 CMPR with clear pixels, named for its bytes
const ICON_SIDE = 96;
const ICON_SIZE = 0x20 + ICON_SIDE * ICON_SIDE / 2;
const ICON_HEAD = [14, 1, 0, 96, 0, 96, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 32];
const ICON_ART = 88;                // a picture with clear parts fits in this, so its outline has room
const ICON_PIXEL_ART = 48;          // a picture this small or smaller is pixel art, scaled up by whole pixels
const ICON_OUTLINE = [[0x0a, 0x10, 0x30], [0xe8, 0xec, 0xf8]];  // around a picture, and around a dark one
const LUMA = [3, 6, 1];
const isIcon = file => file.name.toLowerCase().endsWith(".bti");

// The four colors of a CMPR block as the GameCube draws them: with the first the bigger, the third and fourth 3/8 of
// the way from one to the other, else the middle and a clear one (null)
function cmprColors(first, second) {
  const a = from565(first), b = from565(second);
  if (first > second) {
    return [a, b, a.map((part, i) => (part * 5 + b[i] * 3) >> 3), a.map((part, i) => (part * 3 + b[i] * 5) >> 3)];
  }
  return [a, b, a.map((part, i) => (part + b[i]) >> 1), null];
}

const to565 = color => {
  const [r, g, b] = color.map((part, i) => Math.round(Math.min(255, Math.max(0, part)) * (i === 1 ? 63 : 31) / 255));
  return r << 11 | g << 5 | b;
};

// The two colors as a block takes them, each pixel's nearest of its colors and the error: in three-color mode the
// first is not the bigger, else it is
function cmprTry(first, second, pixels, three) {
  const [a, b] = three === first > second ? [second, first] : [first, second];
  const colors = cmprColors(a, b).filter(Boolean);
  const indices = [];
  let error = 0;
  for (const pixel of pixels) {
    let best = 0, least = Infinity;
    for (let i = 0; i < colors.length; i += 1) {
      const color = colors[i];
      const off = LUMA[0] * (color[0] - pixel[0]) ** 2 + LUMA[1] * (color[1] - pixel[1]) ** 2 +
                  LUMA[2] * (color[2] - pixel[2]) ** 2;
      if (off < least) {
        [best, least] = [i, off];
      }
    }
    indices.push(best);
    error += least;
  }
  return { first: a, second: b, indices, error };
}

// The best two colors for these pixels: the corners of their box or the ends of their main axis, then each fitted to
// the pixels that took it and nudged a step at a time while that helps
function cmprFit(pixels, three) {
  const mean = [0, 1, 2].map(j => pixels.reduce((sum, pixel) => sum + pixel[j], 0) / pixels.length);
  const spread = [0, 1, 2].map(j => [0, 1, 2].map(k => pixels.reduce(
    (sum, pixel) => sum + (pixel[j] - mean[j]) * (pixel[k] - mean[k]), 0)));
  let axis = [1, 1, 1];
  for (let round = 0; round < 8; round += 1) {
    const next = spread.map(row => row.reduce((sum, value, k) => sum + value * axis[k], 0));
    const length = Math.hypot(...next);
    axis = length ? next.map(value => value / length) : axis;
  }
  const along = pixels.map(pixel => pixel.reduce((sum, value, j) => sum + (value - mean[j]) * axis[j], 0));
  const ends = [Math.max(...along), Math.min(...along)].map(t => mean.map((value, j) => value + t * axis[j]));
  const box = [Math.max, Math.min].map(pick => [0, 1, 2].map(j => pick(...pixels.map(pixel => pixel[j]))));
  let best = null;
  for (const [high, low] of [ends, box]) {
    let tried = cmprTry(to565(high), to565(low), pixels, three);
    // Least squares of the two colors for the pixels' places between them
    for (let round = 0; round < 2; round += 1) {
      const weights = tried.indices.map(index => (three ? [1, 0, 0.5] : [1, 0, 5 / 8, 3 / 8])[index]);
      const aa = weights.reduce((sum, w) => sum + w * w, 0), bb = weights.reduce((sum, w) => sum + (1 - w) ** 2, 0);
      const ab = weights.reduce((sum, w) => sum + w * (1 - w), 0), det = aa * bb - ab * ab;
      if (Math.abs(det) < 1e-6) {
        break;
      }
      const solved = [0, 1, 2].map(j => {
        const ax = pixels.reduce((sum, pixel, i) => sum + weights[i] * pixel[j], 0);
        const bx = pixels.reduce((sum, pixel, i) => sum + (1 - weights[i]) * pixel[j], 0);
        return [(ax * bb - bx * ab) / det, (bx * aa - ax * ab) / det];
      });
      const again = cmprTry(to565(solved.map(pair => pair[0])), to565(solved.map(pair => pair[1])), pixels, three);
      if (again.error >= tried.error) {
        break;
      }
      tried = again;
    }
    for (let better = true, rounds = 0; better && rounds < 16; rounds += 1) {
      better = false;
      for (const [shift, top] of [[11, 31], [5, 63], [0, 31]]) {
        for (const end of ["first", "second"]) {
          for (const by of [-1, 1]) {
            const part = (tried[end] >> shift & top) + by;
            if (part < 0 || part > top) {
              continue;
            }
            const moved = tried[end] & ~(top << shift) | part << shift;
            const again = end === "first" ? cmprTry(moved, tried.second, pixels, three)
              : cmprTry(tried.first, moved, pixels, three);
            if (again.error < tried.error) {
              [tried, better] = [again, true];
            }
          }
        }
      }
    }
    best = !best || tried.error < best.error ? tried : best;
  }
  return best;
}

// 96 by 96 pixels ([r, g, b, a] each) as CMPR: a block with clear pixels in three-color mode with those the fourth,
// its two colors fitted to the others; one without clear pixels the cheaper of both modes
function cmprIcon(rgba) {
  const out = new Uint8Array(ICON_SIDE * ICON_SIDE / 2);
  for (let part = 0; part < ICON_SIDE * ICON_SIDE / 16; part += 1) {
    const x = (part >> 2) % (ICON_SIDE >> 3) * 8 + part % 2 * 4;
    const y = Math.floor((part >> 2) / (ICON_SIDE >> 3)) * 8 + (part % 4 >> 1) * 4;
    const pixels = Array.from({ length: 16 }, (_, i) => {
      const at = ((y + (i >> 2)) * ICON_SIDE + x + i % 4) * 4;
      return [rgba[at], rgba[at + 1], rgba[at + 2], rgba[at + 3]];
    });
    const solid = pixels.filter(pixel => pixel[3] >= 128);
    let block;
    if (!solid.length) {
      // All clear: its color is what filtering pulls in at the edge, so that of the pixels around
      const color = to565([0, 1, 2].map(j => pixels.reduce((sum, pixel) => sum + pixel[j], 0) / 16));
      block = { first: color, second: color, indices: Array(16).fill(3) };
    } else if (solid.length < 16) {
      const fit = cmprFit(solid, true);
      let next = 0;
      block = { ...fit, indices: pixels.map(pixel => (pixel[3] >= 128 ? fit.indices[next++] : 3)) };
    } else {
      const [four, three] = [cmprFit(pixels, false), cmprFit(pixels, true)];
      block = three.error < four.error ? three : four;
    }
    const at = part * 8;
    out.set([block.first >> 8, block.first & 0xff, block.second >> 8, block.second & 0xff], at);
    block.indices.forEach((index, i) => { out[at + 4 + (i >> 2)] |= index << (6 - i % 4 * 2); });
  }
  return out;
}

// A cup's icon as {width, height, rgba}, as the game draws it
function iconPixels(bytes) {
  const rgba = new Uint8ClampedArray(ICON_SIDE * ICON_SIDE * 4);
  for (let part = 0; part < ICON_SIDE * ICON_SIDE / 16; part += 1) {
    const x = (part >> 2) % (ICON_SIDE >> 3) * 8 + part % 2 * 4;
    const y = Math.floor((part >> 2) / (ICON_SIDE >> 3)) * 8 + (part % 4 >> 1) * 4;
    const at = 0x20 + part * 8;
    const colors = cmprColors(bytes[at] << 8 | bytes[at + 1], bytes[at + 2] << 8 | bytes[at + 3]);
    for (let i = 0; i < 16; i += 1) {
      const index = bytes[at + 4 + (i >> 2)] >> (6 - i % 4 * 2) & 3;
      // A clear pixel has the middle color, which filtering pulls in
      const color = colors[index] || colors[2];
      rgba.set([...color, colors[index] ? 255 : 0], ((y + (i >> 2)) * ICON_SIDE + x + i % 4) * 4);
    }
  }
  return { width: ICON_SIDE, height: ICON_SIDE, rgba };
}

// Whether the game shows the file as a cup's icon: CMPR of 96 by 96, its pixels right after the header
function iconFits(bytes) {
  return bytes.length === ICON_SIZE && bytes[0] === 14 && [2, 3, 4, 5].every(i => bytes[i] === ICON_HEAD[i]) &&
         new DataView(bytes.buffer, bytes.byteOffset, bytes.length).getUint32(0x1c) === 0x20;
}

// Part of a picture ({width, height, rgba}) from x, y of wide by high, at width by height: each pixel the mean of those
// under it, by how much of it they cover, with their colors weighed by how solid they are; smaller pictures blend the
// nearest, pixel art takes the nearest
function pictureScaled(picture, [x, y, wide, high], width, height, nearest) {
  const taps = (from, size, to) => Array.from({ length: to }, (_, o) => {
    const scale = size / to;
    if (nearest) {
      return [[from + Math.floor((o + 0.5) * scale), 1]];
    }
    if (scale <= 1) {
      const center = Math.min(Math.max((o + 0.5) * scale - 0.5, 0), size - 1), low = Math.floor(center);
      return [[from + low, 1 - (center - low)], [from + Math.min(low + 1, size - 1), center - low]];
    }
    const list = [];
    for (let s = Math.floor(o * scale); s < Math.min(size, Math.ceil((o + 1) * scale)); s += 1) {
      list.push([from + s, Math.min(s + 1, (o + 1) * scale) - Math.max(s, o * scale)]);
    }
    const sum = list.reduce((total, tap) => total + tap[1], 0);
    return list.map(([at, weight]) => [at, weight / sum]);
  });
  const across = taps(x, wide, width), down = taps(y, high, height);
  // Across first, on solid-weighted colors, then down
  const rows = new Float32Array(width * high * 4);
  for (let row = 0; row < high; row += 1) {
    for (let o = 0; o < width; o += 1) {
      const sum = [0, 0, 0, 0];
      for (const [at, weight] of across[o]) {
        const from = ((y + row) * picture.width + at) * 4, alpha = picture.rgba[from + 3] * weight;
        sum[0] += picture.rgba[from] * alpha;
        sum[1] += picture.rgba[from + 1] * alpha;
        sum[2] += picture.rgba[from + 2] * alpha;
        sum[3] += alpha;
      }
      rows.set(sum, (row * width + o) * 4);
    }
  }
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let o = 0; o < height; o += 1) {
    for (let column = 0; column < width; column += 1) {
      const sum = [0, 0, 0, 0];
      for (const [at, weight] of down[o]) {
        for (let j = 0; j < 4; j += 1) {
          sum[j] += rows[((at - y) * width + column) * 4 + j] * weight;
        }
      }
      const to = (o * width + column) * 4;
      rgba.set(sum[3] > 0 ? [sum[0] / sum[3], sum[1] / sum[3], sum[2] / sum[3], sum[3]] : [0, 0, 0, 0], to);
    }
  }
  return rgba;
}

// Any picture ({width, height, rgba}) as a cup's icon before its outline: {rgba of 96 by 96, each pixel solid or
// clear, clear (whether it has clear pixels)}, or null for a picture with nothing in it. One with clear parts is cut to
// them and fits in the middle, any other fills the icon from its middle; pixel art grows by whole pixels
function iconArt(picture) {
  const { width, height, rgba } = picture;
  let clear = false;
  const box = [width, height, -1, -1];
  for (let at = 0; at < width * height; at += 1) {
    clear = clear || rgba[at * 4 + 3] < 250;
    if (rgba[at * 4 + 3] >= 128) {
      const [x, y] = [at % width, Math.floor(at / width)];
      box.splice(0, 4, Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y));
    }
  }
  if (box[2] < 0) {
    return null;
  }
  let crop, side;
  if (clear) {
    crop = [box[0], box[1], box[2] - box[0] + 1, box[3] - box[1] + 1];
    side = ICON_ART;
  } else {
    const least = Math.min(width, height);
    crop = [(width - least) >> 1, (height - least) >> 1, least, least];
    side = ICON_SIDE;
  }
  const pixelArt = width <= ICON_PIXEL_ART && height <= ICON_PIXEL_ART;
  const most = Math.max(crop[2], crop[3]);
  const scale = pixelArt ? Math.max(1, Math.floor(side / most)) : side / most;
  const [wide, high] = [crop[2], crop[3]].map(length => Math.min(side, Math.max(1, Math.round(length * scale))));
  const scaled = pictureScaled(picture, crop, wide, high, pixelArt);
  const art = new Uint8ClampedArray(ICON_SIDE * ICON_SIDE * 4);
  const [left, top] = [(ICON_SIDE - wide) >> 1, (ICON_SIDE - high) >> 1];
  for (let row = 0; row < high; row += 1) {
    for (let column = 0; column < wide; column += 1) {
      const from = (row * wide + column) * 4, to = ((top + row) * ICON_SIDE + left + column) * 4;
      // The game's icons have clear or solid pixels only
      if (scaled[from + 3] >= 128) {
        art.set([scaled[from], scaled[from + 1], scaled[from + 2], 255], to);
      }
    }
  }
  return { rgba: art, clear: !art.every((value, i) => i % 4 !== 3 || value === 255) };
}

// An icon's art (iconArt's) as the file the game shows, with a dark outline around its shape, or a light one around a
// dark shape. Clear pixels take the colors next to them, so filtering pulls in no black.
function iconBytes(art, outline = true) {
  const rgba = Uint8ClampedArray.from(art.rgba);
  const solid = at => rgba[at * 4 + 3] === 255;
  const all = ICON_SIDE * ICON_SIDE;
  if (outline && art.clear) {
    let dark = 0, count = 0;
    for (let at = 0; at < all; at += 1) {
      if (solid(at)) {
        count += 1;
        dark += LUMA.reduce((sum, weight, j) => sum + weight * rgba[at * 4 + j], 0) / 10 < 64;
      }
    }
    const color = ICON_OUTLINE[dark > count * 0.6 ? 1 : 0];
    const ring = [];
    for (let at = 0; at < all; at += 1) {
      const [x, y] = [at % ICON_SIDE, Math.floor(at / ICON_SIDE)];
      let near = false;
      for (let dy = -2; dy <= 2 && !near && !solid(at); dy += 1) {
        for (let dx = -2; dx <= 2 && !near; dx += 1) {
          near = dx * dx + dy * dy <= 5 && x + dx >= 0 && x + dx < ICON_SIDE && y + dy >= 0 && y + dy < ICON_SIDE &&
                 solid((y + dy) * ICON_SIDE + x + dx);
        }
      }
      if (near) {
        ring.push(at);
      }
    }
    ring.forEach(at => rgba.set([...color, 255], at * 4));
  }
  // The colors grow into the clear pixels, a ring at a time
  const filled = Uint8Array.from({ length: all }, (_, at) => solid(at));
  for (let grown = true; grown;) {
    grown = false;
    const now = Uint8Array.from(filled);
    for (let at = 0; at < all; at += 1) {
      if (now[at]) {
        continue;
      }
      const [x, y] = [at % ICON_SIDE, Math.floor(at / ICON_SIDE)];
      const sum = [0, 0, 0, 0];
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const near = (y + dy) * ICON_SIDE + x + dx;
          if (x + dx >= 0 && x + dx < ICON_SIDE && y + dy >= 0 && y + dy < ICON_SIDE && now[near]) {
            [0, 1, 2].forEach(j => { sum[j] += rgba[near * 4 + j]; });
            sum[3] += 1;
          }
        }
      }
      if (sum[3]) {
        rgba.set([sum[0] / sum[3], sum[1] / sum[3], sum[2] / sum[3]], at * 4);
        filled[at] = 1;
        grown = true;
      }
    }
  }
  const bytes = new Uint8Array(ICON_SIZE);
  bytes.set(ICON_HEAD);
  bytes.set(cmprIcon(rgba), 0x20);
  return bytes;
}

// The name of an icon's file in a pack: the same icon is the same file
async function iconName(bytes) {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", bytes));
  return `cup-${Array.from(hash.subarray(0, 4), byte => byte.toString(16).padStart(2, "0")).join("")}.bti`;
}

// A course ZIP's preview as picturePixels has it, or null without one the game can show
async function previewPixels(blob) {
  try {
    const entries = await zipEntries(blob, why => new PatchError(why));
    const pack = { folder: null, why: "" };
    const picture = zipEntry(entries, pack, "trackinfo.ini") && await previewOf(blob, entries, pack);
    return picture ? picturePixels(picture) : null;
  } catch (error) {
    return null;
  }
}

// What a course ZIP is and what the game takes of it: {name, title (the name without its console), console, author,
// label (the name as the game shows it), slot, stage, music ("own", "wrong" or ""), preview, minimap, key (the same
// for the same course, as the game tells)}. Throws for a ZIP the game would leave out, with the reason: the error
// has what it is about and why apart too (subject, why).
async function courseInfo(blob) {
  const file = blob.name || "This ZIP";
  const wrong = (why, subject = file) => Object.assign(new PatchError(`${subject} ${why}.`), { subject, why });
  const entries = await zipEntries(blob, wrong);
  const pack = { folder: null, why: "" };
  const ini = zipEntry(entries, pack, "trackinfo.ini");
  if (!ini || ini.size >= PACKAGE_TEXT) {
    throw wrong(pack.why || "is not a course");
  }
  const track = zipEntry(entries, pack, "track.arc");
  if (!track) {
    throw wrong(pack.why || "is missing its track file");
  }
  const split = zipEntry(entries, pack, "track_mp.arc");
  const label = zipEntry(entries, pack, "course_images/english/track_name.bti");
  const room = COURSE_HEAP - COURSE_HEAP_OTHERS - (label ? label.size : 0);
  if (track.size > room || (split && split.size > room)) {
    throw wrong("is too big for the game");
  }
  const bytes = await zipWhole(blob, ini);
  if (!bytes) {
    throw wrong("is damaged");
  }
  const text = latin(bytes);
  const raw = key => ((text.split("\n").find(line => line.slice(0, key.length).toLowerCase() === key) || "")
    .match(/=[ \t]*([^\r]*)/) || [])[1] || "";
  const { console, name: shown } = nameConsole(iniValue(text, "trackname"));
  if (!shown) {
    throw wrong("has no course name");
  }
  const name = raw("trackname").trim();
  if (iniValue(text, "code_patches")) {
    throw wrong("needs its own code, which Ultra can't load", name);
  }
  const start = await zipStart(blob, track, PACKAGE_SNIFF);
  const files = start ? sniffedSlot(start) : -1;
  if (files < 0) {
    throw wrong("doesn't replace a course of the game", name);
  }
  const slot = namedSlot(iniValue(text, "replaces"), files);

  const info = { name, title: console ? nameConsole(name).name : name, console, author: raw("author").trim(),
                 label: shown, slot, stage: slot >= RACE_SLOTS, music: "", preview: false, minimap: false,
                 key: `${track.crc}:${track.size}` };
  for (const song of slot < RACE_SLOTS ? SONGS : []) {
    const entry = zipEntry(entries, { ...pack }, song);
    if (entry && await songFits(blob, entry)) {
      info.music = "own";
    } else if (entry && !info.music) {
      info.music = "wrong";
    }
  }
  info.preview = Boolean(await previewOf(blob, entries, pack));
  const minimap = zipEntry(entries, { ...pack }, "minimap.json");
  const json = minimap && minimap.size < PACKAGE_TEXT ? await zipWhole(blob, minimap) : null;
  if (json) {
    const corners = ["Top Left Corner X", "Top Left Corner Z", "Bottom Right Corner X", "Bottom Right Corner Z"]
      .map(key => jsonNumber(latin(json), key));
    const turn = jsonNumber(latin(json), "Orientation");
    info.minimap = corners.every(corner => corner !== null) && turn !== null && turn >= 0 && turn <= 3 &&
                   Number.isInteger(turn);
  }
  return info;
}

// The course ZIP with its songs stored instead of zipped, so the game streams them without unpacking, and as ADPCM
// where they're PCM (songAdpcm of course-music.js), a fifth of the size and of what the game has to read during the
// race; the same ZIP when it has none
async function songsStored(blob) {
  const { entries, offset, length, end } = await zipList(blob, why => new PatchError(`This ZIP ${why}.`));
  const pack = { folder: null, why: "" };
  const songs = !zipEntry(entries, pack, "trackinfo.ini") ? []
    : SONGS.map(song => zipEntry(entries, { ...pack }, song)).filter(Boolean).sort((a, b) => a.header - b.header);
  const parts = [], grown = [];
  let copied = 0, growth = 0;
  for (const song of songs) {
    const fits = await songFits(blob, song);
    let bytes = await zipWhole(blob, song);
    if (!bytes || song.header < copied) {
      return blob;
    }
    const packed = fits ? await songAdpcm(bytes) : null;
    if (packed) {
      bytes = packed;
      song.size = packed.length;
      song.crc = crc32(packed);
    }
    const sizes = await pakBytes(blob, song.header, 30);
    const head = await pakBytes(blob, song.header, 30 + sizes.getUint16(26, true) + sizes.getUint16(28, true));
    const flags = head.getUint16(6, true);
    let after = song.header + head.byteLength + song.packed;
    // Its sizes come after the data when bit 3 is set, with or without a mark before them
    if (flags & 8) {
      after += (await pakBytes(blob, after, 4)).getUint32(0, true) === 0x08074b50 ? 16 : 12;
    }
    head.setUint16(6, flags & ~8, true);
    head.setUint16(8, 0, true);
    head.setUint32(14, song.crc, true);
    head.setUint32(18, song.size, true);
    head.setUint32(22, song.size, true);
    parts.push(blob.slice(copied, song.header), head.buffer, bytes);
    growth += song.header + head.byteLength + song.size - after;
    grown.push({ from: song.header, by: growth });
    copied = after;
  }
  if (!songs.length || copied > offset) {
    return blob;
  }
  const list = await pakBytes(blob, offset, length);
  for (const entry of entries) {
    const moved = grown.filter(song => song.from < entry.header).pop();
    list.setUint32(entry.record + 42, entry.header + (moved ? moved.by : 0), true);
    if (songs.includes(entry)) {
      list.setUint16(entry.record + 8, list.getUint16(entry.record + 8, true) & ~8, true);
      list.setUint16(entry.record + 10, 0, true);
      list.setUint32(entry.record + 16, entry.crc, true);
      list.setUint32(entry.record + 20, entry.size, true);
      list.setUint32(entry.record + 24, entry.size, true);
    }
  }
  const tail = await pakBytes(blob, offset + length, blob.size - offset - length);
  tail.setUint32(end - offset - length + 16, offset + growth, true);
  return new Blob([...parts, blob.slice(copied, offset), list.buffer, tail.buffer]);
}

// A ZIP's part of the pak's scan file (ultra/course_pak.py of mkdd-ultra): copies of what the game reads of it at
// boot, which are its end, its list of files and the start of three files. The number of pieces, each one's offset
// in the ZIP and its size, then their bytes. Empty for a ZIP that doesn't fit, which the game then reads itself.
async function scanPart(blob) {
  let list;
  try {
    list = await zipList(blob, why => new PatchError(why));
  } catch (error) {
    return new Uint8Array(0);
  }
  const spans = [[Math.max(0, blob.size - ZIP_TAIL), blob.size], [list.offset, list.offset + list.length]];
  const pack = { folder: null, why: "" };
  for (const name of ["trackinfo.ini", "minimap.json", "track.arc"]) {
    const entry = zipEntry(list.entries, pack, name);
    if (entry && entry.header + 30 <= blob.size) {
      const head = await pakBytes(blob, entry.header + 26, 4);
      const data = entry.header + 30 + head.getUint16(0, true) + head.getUint16(2, true);
      spans.push([entry.header - entry.header % ZIP_SECTOR,
                  Math.min(data + entry.packed, data - data % ZIP_SECTOR + ZIP_STREAM_CHUNK, blob.size)]);
    }
  }
  const pieces = [];
  for (const [start, end] of spans.sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    const last = pieces[pieces.length - 1];
    if (last && start <= last[1]) {
      last[1] = Math.max(end, last[1]);
    } else {
      pieces.push([start, end]);
    }
  }
  const size = pieces.reduce((sum, [start, end]) => sum + end - start, 4 + 8 * pieces.length);
  if (pieces.length > SCAN_PIECES || size > SCAN_MOST) {
    return new Uint8Array(0);
  }
  const part = new DataView(new ArrayBuffer(size + (-size & 3)));
  part.setUint32(0, pieces.length);
  let at = 4 + 8 * pieces.length;
  for (const [i, [start, end]] of pieces.entries()) {
    part.setUint32(4 + 8 * i, start);
    part.setUint32(8 + 8 * i, end - start);
    new Uint8Array(part.buffer, at).set(new Uint8Array(await blob.slice(start, end).arrayBuffer()));
    at += end - start;
  }
  return new Uint8Array(part.buffer);
}

// A ZIP's place in a pak's previews file: its preview as the cup select shows it, or the stage select for a stage,
// so the game reads it in one go and doesn't have to make it. Zeros without one.
async function previewSlot(blob, stage) {
  const slot = new Uint8Array(PREVIEW_SLOT);
  try {
    const entries = await zipEntries(blob, why => new PatchError(why));
    const pack = { folder: null, why: "" };
    const picture = zipEntry(entries, pack, "trackinfo.ini") && await previewOf(blob, entries, pack);
    if (picture) {
      const [width, height] = stage ? [192, 136] : [256, 184];
      // One the ZIP has like that goes in as it is, as ultra/course_pak.py of mkdd-ultra has it
      const ready = picture[0] === 14 && picture.length === 0x20 + width * height / 2 &&
                    new DataView(picture.buffer, picture.byteOffset).getUint32(0x1c) === 0x20 &&
                    (picture[2] << 8 | picture[3]) === width && (picture[4] << 8 | picture[5]) === height;
      slot.set(ready ? picture : pictureFit(picture, width, height));
    }
  } catch (error) {
    // No preview there: the game looks in the ZIP
  }
  return slot;
}

// A pak's previews file for these files ([{previews: a ZIP's previewSlot}]), which goes before its scan file: a slot
// per file up to the last ZIP, as the game reads them by the file's number
const pakPreviews = files => ({ name: "previews", blob: new Blob(files.slice(0, files.findLastIndex(isZip) + 1).map(
  file => (isZip(file) && file.previews) || new Uint8Array(PREVIEW_SLOT))) });

// The scan file of a pak with these files ([{name, blob, scan: a ZIP's scanPart}]), which is its last: a word per
// file for where its part starts, one for where the last ends, then the parts
function pakScan(files) {
  const parts = files.map(file => file.scan || new Uint8Array(0));
  const starts = new DataView(new ArrayBuffer(4 * (files.length + 1)));
  let at = starts.byteLength;
  parts.forEach((part, i) => {
    starts.setUint32(4 * i, at);
    at += part.length;
  });
  starts.setUint32(4 * files.length, at);
  return { name: "scan", blob: new Blob([starts.buffer, ...parts]) };
}

// These files and the two the game reads instead of the ZIPs where it can. The icons go after the ZIPs, so they need
// no previews
function pakWhole(files) {
  const all = [...files.filter(file => !isIcon(file)), ...files.filter(isIcon)];
  all.push(pakPreviews(all));
  return [...all, pakScan(all)];
}

const padded = size => size + (-size & (PAK_ALIGN - 1));

// The size of a pak with these files ([{name, blob}])
const pakSize = courses => courses.reduce((size, course) => size + padded(course.blob.size),
  PAK_HEAD + PAK_RECORD * courses.length);

function pakName(name) {
  const dot = name.lastIndexOf(".");
  const stem = dot < 0 ? name : name.slice(0, dot);
  const suffix = dot < 0 ? "" : name.slice(dot);
  const short = stem.slice(0, PAK_NAME - 1 - suffix.length) + suffix;
  return Array.from(short, letter => (letter.charCodeAt(0) < 0x80 ? letter : "?")).join("");
}

// Where the pak is, from the start of the disc up to the end of its file table
function findPak(disc) {
  const table = disc.getUint32(0x424);
  const count = disc.getUint32(table + 8);
  const nameOf = entry => {
    let name = "";
    for (let at = table + count * 12 + (disc.getUint32(table + entry * 12) & 0xffffff); disc.getUint8(at); at += 1) {
      name += String.fromCharCode(disc.getUint8(at));
    }
    return name.toLowerCase();
  };
  // Down the path: a folder's last word is the first entry past it
  let entry = 0;
  for (const part of ["mkddu", "courses.pak"]) {
    const end = disc.getUint32(table + entry * 12 + 8);
    let child = entry + 1;
    while (child < end && nameOf(child) !== part) {
      child = disc.getUint8(table + child * 12) ? disc.getUint32(table + child * 12 + 8) : child + 1;
    }
    if (child >= end) {
      throw new PatchError("This version of Ultra can't take custom courses yet.");
    }
    entry = child;
  }
  return { offset: disc.getUint32(table + entry * 12 + 4), lengthAt: table + entry * 12 + 8 };
}

// The files of a pak someone made ([{name, blob, sha (its SHA-256), scan, previews, info: courseInfo's of a ZIP, or
// why: its error}]), without the two the game reads instead of the ZIPs, which pakWhole makes again. Those of the
// release's own pak are taken as they are, each file's part of them, and its files have no info
async function pakFiles(pak, own = false) {
  const wrong = new PatchError(`${pak.name || "This file"} is not a pack this version of Ultra reads.`);
  if (pak.size < PAK_HEAD) {
    throw wrong;
  }
  const head = await pakBytes(pak, 0, PAK_HEAD);
  const count = head.getUint32(4);
  if (head.getUint32(0) !== PAK_MAGIC || head.getUint32(8) !== PAK_VERSION || head.getUint32(12) !== pak.size ||
      count > (pak.size - PAK_HEAD) / PAK_RECORD) {
    throw wrong;
  }
  const index = await pakBytes(pak, PAK_HEAD, count * PAK_RECORD);
  const files = [], made = {};
  for (let record = 0; record < count * PAK_RECORD; record += PAK_RECORD) {
    const offset = index.getUint32(record), size = index.getUint32(record + 4);
    // The game ends a name at its last byte
    const name = latin(new Uint8Array(index.buffer, record + 8, PAK_NAME - 1)).replace(/\0.*/, "");
    if (offset > pak.size || size > pak.size - offset) {
      throw wrong;
    }
    const blob = pak.slice(offset, offset + size);
    if (name === "previews" || name === "scan") {
      made[name] = blob;
      continue;
    }
    files.push({ name, blob, info: null, scan: null, previews: null });
  }
  if (own && made.scan && made.previews) {
    // A slot of the previews file and a part of the scan file per file, in their order
    const scan = new Uint8Array(await made.scan.arrayBuffer());
    const starts = new DataView(scan.buffer);
    files.forEach((file, i) => {
      file.scan = scan.subarray(starts.getUint32(4 * i), starts.getUint32(4 * i + 4));
      file.previews = made.previews.slice(i * PREVIEW_SLOT, (i + 1) * PREVIEW_SLOT);
    });
    return files;
  }
  for (const file of files) {
    file.sha = await sha256(file.blob);
    if (isZip(file)) {
      file.info = await courseInfo(file.blob).catch(error => {
        file.why = error;
        return null;
      });
      file.scan = file.info && await scanPart(file.blob);
      file.previews = file.info && await previewSlot(file.blob, file.info.stage);
    }
  }
  return files;
}

const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();
const isIni = file => file.name.toLowerCase().endsWith(".ini");
const textBytes = text => Uint8Array.from(text, letter => letter.charCodeAt(0));

// The files of a pak (pakFiles') to go beside the others of a disc ([{name, blob, scan}]), whose names its inis find
// the ZIPs and icons by. One the others have as it is doesn't come again. Another of a name they have gets a name of
// its own, in the pak's inis too. An ini gets one as well, as its name only gives its pack's place among the others
async function pakBeside(files, name, others) {
  const taken = other => [...others, ...files, ...beside].some(file => sameName(file.name, other));
  const free = (stem, suffix) => {
    for (let number = 1; ; number += 1) {
      if (!taken(pakName(`${stem} ${number}${suffix}`))) {
        return pakName(`${stem} ${number}${suffix}`);
      }
    }
  };
  const bytes = async file => new Uint8Array(await file.blob.arrayBuffer());
  const beside = [], renamed = [];
  for (const file of files.filter(one => isZip(one) || isIcon(one))) {
    const theirs = others.find(other => sameName(other.name, file.name));
    // The release's own files have no SHA-256: a ZIP of those is compared by what the game scans of it
    let same = theirs && theirs.blob.size === file.blob.size;
    if (same && theirs.sha && file.sha) {
      same = theirs.sha === file.sha;
    } else if (same && isZip(file)) {
      same = theirs.scan && file.scan && file.scan.length && theirs.scan.length === file.scan.length &&
             theirs.scan.every((byte, i) => byte === file.scan[i]);
    } else if (same) {
      const [mine, other] = [await bytes(file), await bytes(theirs)];
      same = mine.every((byte, i) => byte === other[i]);
    }
    if (theirs && !same) {
      renamed.push([file.name.toLowerCase(), free(file.name.slice(0, -4), file.name.slice(-4).toLowerCase())]);
    }
    if (!same) {
      beside.push({ ...file, name: theirs ? renamed[renamed.length - 1][1] : file.name });
    }
  }
  for (const ini of files.filter(isIni)) {
    let blob = ini.blob;
    if (renamed.length) {
      // A line that is a ZIP's name, the name in a [course], and an icon's or a music's ZIP
      const lines = latin(await bytes(ini)).split("\n").map(line => {
        const course = line.match(/^(\s*\[\s*course\s+)(.*?)(\s*\].*)$/i);
        const keyed = line.match(/^(\s*(?:icon|music)\s*=\s*)(.*?)(\s*)$/i);
        const named = course ? course[2] : keyed ? keyed[2] : line.trim();
        const found = renamed.find(([old]) => old === named.toLowerCase());
        return !found ? line : course ? course[1] + found[1] + course[3] : keyed ? keyed[1] + found[1] + keyed[3]
          : found[1];
      });
      blob = new Blob([textBytes(lines.join("\n"))]);
    }
    beside.push({ ...ini, blob, name: free(name.replace(/\.pak$/i, ""), ".ini") });
  }
  return beside;
}

// A pak's head and its list of these files
function pakIndex(files) {
  const index = new DataView(new ArrayBuffer(PAK_HEAD + PAK_RECORD * files.length));
  let position = index.byteLength;
  index.setUint32(0, PAK_MAGIC);
  index.setUint32(4, files.length);
  index.setUint32(8, PAK_VERSION);
  index.setUint32(12, pakSize(files));
  files.forEach((file, i) => {
    const record = PAK_HEAD + i * PAK_RECORD;
    index.setUint32(record, position);
    index.setUint32(record + 4, file.blob.size);
    Array.from(pakName(file.name), (letter, j) => index.setUint8(record + 8 + j, letter.charCodeAt(0)));
    position += padded(file.blob.size);
  });
  return new Uint8Array(index.buffer);
}

// A whole pak, for mkddu on an SD card
const pakBlob = files => new Blob([pakIndex(files), ...files.flatMap(file =>
  [file.blob, new Uint8Array(padded(file.blob.size) - file.blob.size)])]);

const iniWord = text => text.replace(/[\[\]=#\s]+/g, " ").trim();

// The name a course ZIP has in a pak, which its pack's ini can name it by
const courseName = name => pakName(iniWord(name));

// What a course ZIP itself says to show of its course, which a pack's ini can change
const courseTexts = info => ({ name: info.title, author: info.author, console: info.console || NO_CONSOLE,
                               length: "", difficulty: "" });

// A course ZIP as a file of a pack: {name (in the pak), blob, sha, scan, previews, info, texts (what to show of it)}.
// Its songs go in stored and as ADPCM (songsStored), which onMusic hears of before it starts. Throws as courseInfo.
async function courseFile(blob, onMusic = () => {}) {
  const info = await courseInfo(blob);
  if (info.music === "own") {
    onMusic(info);
  }
  const zip = info.music === "own" ? await songsStored(blob) : blob;
  return { name: courseName(blob.name || "course.zip"), blob: zip, sha: await sha256(zip), scan: await scanPart(zip),
           previews: await previewSlot(zip, info.stage), info, texts: courseTexts(info) };
}

// The files of a pack ({name, cups: [{name, courses, icon: {name, bytes} or none}], stages}, the courses
// courseFile's) for pakWhole: the ini the game reads (docs/custom-courses.md of mkdd-ultra), the ZIPs, then the icons.
// A cup has up to four courses, and one without any is left out with its icon. A [course] has what the pack shows of
// a course other than its ZIP says.
function packFiles(pack) {
  const cups = pack.cups.filter(cup => cup.courses.length);
  const courses = [...cups.flatMap(cup => cup.courses), ...pack.stages];
  const version = PACK_VERSION.test(pack.version || "") ? pack.version : PACK_VERSION_NONE;
  const lines = ["[pack]", ...(iniWord(pack.name) ? [`name = ${iniWord(pack.name)}`] : []), `version = ${version}`,
                 "format = 1"];
  for (const cup of cups) {
    lines.push("", `[cup ${iniWord(cup.name)}`.trim() + "]", ...(cup.icon ? [`icon = ${cup.icon.name}`] : []),
               ...cup.courses.map(course => course.name));
  }
  if (pack.stages.length) {
    lines.push("", "[battle]", ...pack.stages.map(stage => stage.name));
  }
  for (const course of courses) {
    const own = courseTexts(course.info);
    const keys = ["name", "author", "console", "length", "difficulty"]
      .filter(key => iniWord(course.texts[key]) !== iniWord(own[key]))
      .map(key => `${key} = ${iniWord(course.texts[key])}`);
    if (keys.length || course.music) {
      lines.push("", `[course ${course.name}]`, ...keys, ...(course.music ? [`music = ${course.music}`] : []));
    }
  }
  const icons = new Map(cups.filter(cup => cup.icon).map(({ icon }) => [icon.name.toLowerCase(), icon]));
  // In the ini's order, so the game reads the previews of a stage page in one go
  return [{ name: "pack.ini", blob: new Blob([textBytes(`${lines.join("\n")}\n`)]) },
          ...courses.map(({ name, blob, sha, scan, previews, info }) => ({ name, blob, sha, scan, previews, info })),
          ...[...icons.values()].map(icon => ({ name: icon.name, blob: new Blob([icon.bytes]) }))];
}

// What a pack's ini says, as the game reads it (pack_line of package.c and pack_read of cups.c): {name, version,
// own (false for the Retro Pack, which keeps its courses out of the CUSTOM tab), cups: [{name, zips, icon}], stages:
// [zips], courses: {a ZIP's name in small letters: its keys}}. ZIPs of cups of one name fill the last of them first.
// A [cup]'s icon is that of every cup it makes, unless one before gave it one.
function packIni(text) {
  const ini = { name: "", version: "", own: true, cups: [], stages: [], courses: {} };
  let section = "", cup = "", course = null, made = [], icon = "";
  for (const line of text.split("\n").map(part => part.trim())) {
    const close = line[0] === "[" ? line.indexOf("]") : -1;
    if (!line || line[0] === "#" || (line[0] === "[" && close < 0)) {
      continue;
    }
    if (close >= 0) {
      const [, word, value] = line.slice(1, close).trim().match(/^(\S*)\s*(.*)$/);
      section = word.toLowerCase();
      cup = value;
      course = section === "course" ? ini.courses[value.toLowerCase()] = {} : null;
      [made, icon] = [[], ""];
      continue;
    }
    const equals = line.indexOf("=");
    const key = equals < 0 ? "" : line.slice(0, equals).trim().toLowerCase();
    const value = line.slice(equals + 1).trim();
    if (section === "pack" && key === "format" && value !== "1") {
      break;  // of a newer game
    } else if (section === "pack" && key === "name") {
      ini.name = value;
    } else if (section === "pack" && key === "version") {
      ini.version = PACK_VERSION.test(value) ? value : ini.version;
    } else if (section === "pack" && key === "custom") {
      ini.own = value.toLowerCase() !== "no";
    } else if (course && key) {
      course[key] = value;
    } else if (section === "battle" && !key) {
      ini.stages.push(value);
    } else if (section === "cup" && !key) {
      let last = ini.cups.filter(other => sameName(other.name, cup)).pop();
      if (last && last.zips.length < CUP_COURSES) {
        last.zips.push(value);
      } else {
        ini.cups.push(last = { name: cup, zips: [value], icon: "" });
      }
      made.push(last);
    } else if (section === "cup" && key === "icon") {
      icon = icon || value;
    }
    for (const one of section === "cup" && icon ? made : []) {
      one.icon = one.icon || icon;
    }
  }
  return ini;
}

const iniOf = async file => packIni(latin(new Uint8Array(await file.blob.arrayBuffer())));

// What a pak's files (pakFiles') are to a player: {name (its pack's, or else its file's), races, cups, stages}
async function pakAbout(files, name) {
  const inis = await Promise.all(files.filter(isIni).map(iniOf));
  const stages = files.filter(file => file.info && file.info.stage).length;
  return { name: (inis.length === 1 && inis[0].name) || name.replace(/\.pak$/i, ""),
           races: files.filter(file => file.info).length - stages, stages,
           cups: inis.reduce((sum, ini) => sum + ini.cups.length, 0) };
}

// The one pack of a pak's files (pakFiles'), as packFiles takes it, with the courses its ini doesn't have (loose)
// and the ZIPs the game can't take (out: their errors). Throws for a pak with several packs, or the Retro Pack.
async function packOf(files, name) {
  const inis = files.filter(isIni);
  if (inis.length > 1) {
    throw new PatchError(`${name} has ${inis.length} packs in it. The Pack Maker opens one pack at a time.`);
  }
  const ini = inis.length ? await iniOf(inis[0]) : packIni("");
  if (!ini.own) {
    throw new PatchError("The Retro Pack can't be changed here.");
  }
  const left = new Map(files.filter(file => file.info).map(file => [file.name.toLowerCase(), file]));
  // A course of the ini, once: with what its [course] says over what its ZIP does
  const course = (zip, stage) => {
    const file = left.get(zip.toLowerCase());
    if (!file || file.info.stage !== stage) {
      return [];
    }
    left.delete(zip.toLowerCase());
    const { music, ...keys } = ini.courses[zip.toLowerCase()] || {};
    const texts = { ...courseTexts(file.info) };
    for (const key of Object.keys(texts).filter(one => keys[one] !== undefined)) {
      texts[key] = key === "console" ? keys[key].toUpperCase() : keys[key];
    }
    if (keys.name !== undefined && nameConsole(keys.name).console) {
      // A console before the name counts, unless the ini has one after it
      texts.name = nameConsole(keys.name).name;
      texts.console = keys.console === undefined ? nameConsole(keys.name).console : texts.console;
    }
    texts.console = [...CONSOLES.slice(0, -1), NO_CONSOLE].includes(texts.console) ? texts.console
      : courseTexts(file.info).console;
    texts.length = LENGTHS.find(word => word === texts.length.toLowerCase()) || "";
    texts.difficulty = DIFFICULTIES.find(word => word === texts.difficulty.toLowerCase()) || "";
    return [{ ...file, texts, music }];
  };
  // An icon the game shows, as it is
  const icons = new Map();
  for (const file of files.filter(isIcon)) {
    const bytes = new Uint8Array(await file.blob.arrayBuffer());
    if (iconFits(bytes)) {
      icons.set(file.name.toLowerCase(), { name: file.name, bytes });
    }
  }
  const cups = ini.cups.map(cup => ({ name: cup.name, courses: cup.zips.flatMap(zip => course(zip, false)),
                                      icon: icons.get(cup.icon.toLowerCase()) || null }));
  const stages = ini.stages.flatMap(zip => course(zip, true));
  return { name: ini.name, version: ini.version || PACK_VERSION_NONE, cups: cups.filter(cup => cup.courses.length),
           stages,
           loose: [...left.values()].map(file => ({ ...file, texts: courseTexts(file.info) })),
           out: files.filter(file => isZip(file) && !file.info).map(file => file.why) };
}

// A pack's code, of its files without the two the game reads instead of the ZIPs: five letters that are the same for
// the same pack, to compare before LAN play
async function packCode(files) {
  const parts = [];
  for (const file of files) {
    parts.push(`${file.name}:${file.sha || await sha256(file.blob)}`);
  }
  const bits = parseInt((await sha256(new Blob([parts.join("\n")]))).slice(0, 8), 16);
  return [27, 22, 17, 12, 7].map(shift => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[bits >>> shift & 31]).join("");
}

// A sink for makeIso that writes the disc on to sink with these courses in its pak. It holds the start of the disc
// until the file table is in, to set the pak's length there, and writes its own end from where the pak starts.
function courseSink(sink, courses, full) {
  if (!courses.length) {
    return sink;
  }
  const size = pakSize(courses);
  let held = new Uint8Array(0), at = 0, pak = null;
  const pass = async (bytes, start) => {
    if (start < pak.offset) {
      await sink.write(bytes.subarray(0, Math.min(bytes.length, pak.offset - start)));
    }
  };
  return {
    ...sink,
    write: async bytes => {
      const start = at;
      at += bytes.length;
      if (pak) {
        return pass(bytes, start);
      }
      const joined = new Uint8Array(held.length + bytes.length);
      joined.set(held);
      joined.set(bytes, held.length);
      held = joined;
      const disc = new DataView(held.buffer);
      if (held.length < 0x440 || held.length < disc.getUint32(0x424) + disc.getUint32(0x428)) {
        return;
      }
      pak = findPak(disc);
      if (pak.offset + size > DISC_SIZE) {
        throw new PatchError("These courses don't fit on the disc.");
      }
      disc.setUint32(pak.lengthAt, size);
      disc.setUint32(0x438, pak.offset + size - disc.getUint32(0x434));
      await pass(held, 0);
      held = null;
    },
    close: async () => {
      await sink.write(pakIndex(courses));
      for (const course of courses) {
        for (let done = 0; done < course.blob.size; done += CHUNK) {
          await sink.write(new Uint8Array(await course.blob.slice(done, done + CHUNK).arrayBuffer()));
        }
        await sink.write(new Uint8Array(padded(course.blob.size) - course.blob.size));
      }
      const end = pak.offset + size;
      const zeros = new Uint8Array(CHUNK);
      for (let left = (full ? DISC_SIZE : end + (-end & (ISO_ALIGN - 1))) - end; left > 0; left -= CHUNK) {
        await sink.write(zeros.subarray(0, Math.min(CHUNK, left)));
      }
      await sink.close();
    },
  };
}

if (typeof module !== "undefined") {
  module.exports = { courseFile, courseInfo, courseSink, iconArt, iconBytes, iconFits, iconName, iconPixels, packCode,
                     packFiles, packIni, packOf, pakAbout, pakBeside, pakBlob, pakFiles, pakSize, pakWhole, pictureFit,
                     previewPixels, previewSlot, scanPart, songsStored };
}
