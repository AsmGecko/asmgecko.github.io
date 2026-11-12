// Your own courses on an Ultra disc of Double Dash. The disc ends with mkddu/courses.pak: an index, then the course
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

// The name and maker of a course ZIP, from its trackinfo.ini. Throws for a ZIP the game would skip.
async function courseInfo(blob) {
  const notOne = new PatchError(`${blob.name || "This ZIP"} is not a course.`);
  const tailAt = Math.max(0, blob.size - 66000);
  const tail = await pakBytes(blob, tailAt, blob.size - tailAt);
  let end = tail.byteLength - 22;
  while (end >= 0 && tail.getUint32(end, true) !== 0x06054b50) {
    end -= 1;
  }
  if (end < 0) {
    throw notOne;
  }
  const list = await pakBytes(blob, tail.getUint32(end + 16, true), tail.getUint32(end + 12, true));
  const files = {};
  for (let at = 0; at + 46 <= list.byteLength && list.getUint32(at, true) === 0x02014b50;) {
    const length = list.getUint16(at + 28, true);
    let name = "";
    for (let i = 0; i < length; i += 1) {
      name += String.fromCharCode(list.getUint8(at + 46 + i));
    }
    files[name.toLowerCase().split("/").pop()] = {
      method: list.getUint16(at + 10, true), packed: list.getUint32(at + 20, true), at: list.getUint32(at + 42, true),
    };
    at += 46 + length + list.getUint16(at + 30, true) + list.getUint16(at + 32, true);
  }
  const ini = files["trackinfo.ini"];
  if (!ini || !files["track.arc"] || (ini.method !== 0 && ini.method !== 8)) {
    throw notOne;
  }
  const head = await pakBytes(blob, ini.at, 30);
  const start = ini.at + 30 + head.getUint16(26, true) + head.getUint16(28, true);
  const packed = blob.slice(start, start + ini.packed);
  const text = await new Response(
    ini.method ? packed.stream().pipeThrough(new DecompressionStream("deflate-raw")) : packed).text();
  const value = (key) => (text.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*?)\\s*$`, "im")) || [])[1] || "";
  if (!value("trackname")) {
    throw notOne;
  }
  if (value("code_patches")) {
    throw new PatchError(`${value("trackname")} needs its own code, which Ultra can't load.`);
  }
  return {name: value("trackname"), author: value("author")};
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
      throw new PatchError("This version of Ultra can't take courses yet.");
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
  module.exports = { courseInfo, courseSink, pakSize };
}
