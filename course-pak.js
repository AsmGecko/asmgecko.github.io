// Custom courses on an Ultra disc of Double Dash. The disc ends with mkddu/courses.pak: an index, then the course
// ZIPs as they are. courseSink fills it while the patcher writes the ISO. Loaded after patcher-core.js.

const PAK_MAGIC = 0x5550414b;  // "UPAK"
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
const PACKAGE_TEXT = 0x800;        // and of trackinfo.ini and minimap.json
const PACKAGE_SNIFF = 0x2000;      // the start of the archive, which has its file names
const ARCHIVE_MOST = 0x280000 - 0x30000;
const NAME_MOST = 0x20000;
const TEXT_MOST = 31;
const PREVIEW_SIZE = 23584;        // a 256x184 CMPR picture
const SONG_BLOCK = 0x2760;
const MINIMAP_MOST = 1000000;
const RACE_SLOTS = 16;
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

const latin = bytes => Array.from(bytes, byte => String.fromCharCode(byte)).join("");

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
    throw wrong(tail < 22 || blob.size <= ZIP_TAIL ? "is not a ZIP" : "has a long comment in it. Zip it again without one");
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

// Whether the game's streams can play a song: 16 bits, at most stereo, in their blocks
async function songFits(blob, entry) {
  const head = entry.size >= 0x40 ? await zipStart(blob, entry, 0x40) : null;
  const view = head && head.length === 0x40 ? new DataView(head.buffer, head.byteOffset, 0x40) : null;
  return Boolean(view) && latin(head.subarray(0, 4)) === "STRM" && view.getUint16(0x0a) === 16 &&
         view.getUint16(0x0c) >= 1 && view.getUint16(0x0c) <= 2 && view.getUint32(0x20) === SONG_BLOCK;
}

// What a course ZIP is and what the game takes of it: {name, author, label (the name as the game shows it), slot,
// plays, stage, music ("own", "wrong" or ""), packedMusic, preview, minimap}. Throws for a ZIP the game would leave
// out, with the reason.
async function courseInfo(blob) {
  const file = blob.name || "This ZIP";
  const wrong = why => new PatchError(`${file} ${why}.`);
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
  if (track.size > ARCHIVE_MOST || (split && split.size > ARCHIVE_MOST)) {
    throw wrong("is too big for the game");
  }
  const text = await zipWhole(blob, ini);
  if (!text) {
    throw wrong("is damaged");
  }
  const raw = key => ((latin(text).split("\n").find(line => line.slice(0, key.length).toLowerCase() === key) || "")
    .match(/=[ \t]*([^\r]*)/) || [])[1] || "";
  let shown = iniValue(latin(text), "trackname");
  for (const console of CONSOLES) {
    if (shown.startsWith(`${console} `) && shown.length > console.length + 1) {
      shown = shown.slice(console.length + 1).trimStart();
      break;
    }
  }
  if (!shown) {
    throw wrong("has no name the game can show");
  }
  const name = raw("trackname").trim();
  if (iniValue(latin(text), "code_patches")) {
    throw new PatchError(`${name} needs its own code, which Ultra can't load.`);
  }
  const start = await zipStart(blob, track, PACKAGE_SNIFF);
  const slot = start ? sniffedSlot(start) : -1;
  if (slot < 0) {
    throw new PatchError(`${name} doesn't replace a course of the game, so there's no place for it.`);
  }

  const info = { name, author: raw("author").trim(), label: shown, slot, plays: COURSES[slot][1],
                 stage: slot >= RACE_SLOTS, music: "", packedMusic: false, preview: false, minimap: false };
  for (const song of slot < RACE_SLOTS ? ["lap_music_normal.ast", "lap_music_fast.ast"] : []) {
    const entry = zipEntry(entries, { ...pack }, song);
    if (entry && await songFits(blob, entry)) {
      info.music = "own";
      info.packedMusic = info.packedMusic || entry.method === 8;
    } else if (entry && !info.music) {
      info.music = "wrong";
    }
  }
  const preview = zipEntry(entries, { ...pack }, "course_images/english/track_image.bti");
  const picture = preview && preview.size === PREVIEW_SIZE ? await zipWhole(blob, preview) : null;
  info.preview = Boolean(picture) && picture[0] === 0x0e && (picture[2] << 8 | picture[3]) === 256 &&
                 (picture[4] << 8 | picture[5]) === 184 && picture[0x1e] === 0 && picture[0x1f] === 0x20;
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

// The course ZIP with its zipped songs stored as they are instead, so the game streams them without unpacking; the
// same ZIP when it has none
async function songsStored(blob) {
  const { entries, offset, length, end } = await zipList(blob, why => new PatchError(`This ZIP ${why}.`));
  const pack = { folder: null, why: "" };
  const songs = !zipEntry(entries, pack, "trackinfo.ini") ? []
    : ["lap_music_normal.ast", "lap_music_fast.ast"].map(song => zipEntry(entries, { ...pack }, song))
      .filter(entry => entry && entry.method === 8).sort((a, b) => a.header - b.header);
  const parts = [], grown = [];
  let copied = 0, growth = 0;
  for (const song of songs) {
    const bytes = await zipWhole(blob, song);
    if (!bytes || song.header < copied) {
      return blob;
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
      list.setUint32(entry.record + 20, entry.size, true);
    }
  }
  const tail = await pakBytes(blob, offset + length, blob.size - offset - length);
  tail.setUint32(end - offset - length + 16, offset + growth, true);
  return new Blob([...parts, blob.slice(copied, offset), list.buffer, tail.buffer]);
}

const padded = size => size + (-size & (PAK_ALIGN - 1));

// The size of a pak with these courses ([{name, blob}])
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
      const index = new DataView(new ArrayBuffer(PAK_HEAD + PAK_RECORD * courses.length));
      let position = index.byteLength;
      index.setUint32(0, PAK_MAGIC);
      index.setUint32(4, courses.length);
      courses.forEach((course, i) => {
        const record = PAK_HEAD + i * PAK_RECORD;
        index.setUint32(record, position);
        index.setUint32(record + 4, course.blob.size);
        Array.from(pakName(course.name), (letter, j) => index.setUint8(record + 8 + j, letter.charCodeAt(0)));
        position += padded(course.blob.size);
      });
      await sink.write(new Uint8Array(index.buffer));
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
  module.exports = { courseInfo, courseSink, pakSize, songsStored };
}
