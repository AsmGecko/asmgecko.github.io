// The course packages in an Ultra disc of Double Dash: mkddu/courses.pak, the file that ends the disc, holds the ZIPs
// as they are behind an index. readCourses lists them, writeCourses makes a disc with a new list. Blobs only point
// into the files they come from, so nothing is copied until the browser saves the result.

const PAK_PATH = ["mkddu", "courses.pak"];
const PAK_MAGIC = 0x5550414b;  // "UPAK"
const PAK_HEAD = 32;
const PAK_RECORD = 64;
const PAK_NAME = 56;
const PAK_ALIGN = 32;
const PAK_DISC_MAGIC = 0xc2339f3d;
const PAK_DISC_SIZE = 1459978240;
const PAK_DISC_ALIGN = 0x8000;

class CoursePakError extends Error {}

async function pakBytes(blob, offset, length) {
  const bytes = new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer());
  if (bytes.length !== length) {
    throw new CoursePakError("This file is cut short.");
  }
  return new DataView(bytes.buffer);
}

// Where the pak is on the disc and in its file table
async function findPak(iso) {
  const boot = await pakBytes(iso, 0, 0x440);
  if (boot.getUint32(0x1c) !== PAK_DISC_MAGIC) {
    throw new CoursePakError("This is not a GameCube disc.");
  }
  const tableAt = boot.getUint32(0x424);
  const table = await pakBytes(iso, tableAt, boot.getUint32(0x428));
  const count = table.getUint32(8);
  const nameOf = (entry) => {
    let name = "";
    for (let at = count * 12 + (table.getUint32(entry * 12) & 0xffffff); table.getUint8(at); at += 1) {
      name += String.fromCharCode(table.getUint8(at));
    }
    return name.toLowerCase();
  };
  // Down the path: a folder's last word is the first entry past it
  let entry = 0;
  for (const part of PAK_PATH) {
    const end = table.getUint32(entry * 12 + 8);
    let child = entry + 1;
    while (child < end && nameOf(child) !== part) {
      child = table.getUint8(child * 12) ? table.getUint32(child * 12 + 8) : child + 1;
    }
    if (child >= end) {
      throw new CoursePakError("This disc has no room for courses. Make it with the newest Ultra patch!");
    }
    entry = child;
  }
  const offset = table.getUint32(entry * 12 + 4);
  const length = table.getUint32(entry * 12 + 8);
  for (let other = 1; other < count; other += 1) {
    const isFile = !table.getUint8(other * 12);
    if (isFile && other !== entry && table.getUint32(other * 12 + 4) + table.getUint32(other * 12 + 8) > offset) {
      throw new CoursePakError("This disc was changed by another tool. Make a fresh one with the Ultra patch!");
    }
  }
  const head = await pakBytes(iso, offset, PAK_HEAD);
  if (head.getUint32(0) !== PAK_MAGIC) {
    throw new CoursePakError("This disc was changed by another tool. Make a fresh one with the Ultra patch!");
  }
  return {offset, length, lengthAt: tableAt + entry * 12 + 8, filesAt: boot.getUint32(0x434), count: head.getUint32(4)};
}

// The courses on the disc: [{name, blob}]
async function readCourses(iso) {
  const pak = await findPak(iso);
  const index = await pakBytes(iso, pak.offset + PAK_HEAD, pak.count * PAK_RECORD);
  const courses = [];
  for (let i = 0; i < pak.count; i += 1) {
    const at = i * PAK_RECORD;
    let name = "";
    for (let j = 0; j < PAK_NAME && index.getUint8(at + 8 + j); j += 1) {
      name += String.fromCharCode(index.getUint8(at + 8 + j));
    }
    const start = pak.offset + index.getUint32(at);
    courses.push({name, blob: iso.slice(start, start + index.getUint32(at + 4))});
  }
  return courses;
}

function pakName(name) {
  const dot = name.lastIndexOf(".");
  const stem = dot < 0 ? name : name.slice(0, dot);
  const suffix = dot < 0 ? "" : name.slice(dot);
  const short = stem.slice(0, PAK_NAME - 1 - suffix.length) + suffix;
  return Array.from(short, (letter) => (letter.charCodeAt(0) < 0x80 ? letter : "?")).join("");
}

// The room left on a real disc for courses, in bytes, with these on it
async function courseRoom(iso, courses) {
  const pak = await findPak(iso);
  let end = pak.offset + PAK_HEAD + PAK_RECORD * courses.length;
  for (const course of courses) {
    end += course.blob.size + (-course.blob.size & (PAK_ALIGN - 1));
  }
  return PAK_DISC_SIZE - end;
}

// The disc with these courses ([{name, blob}]) as its only ones; full pads it to the size of a real disc
async function writeCourses(iso, courses, full = false) {
  const pak = await findPak(iso);
  const index = new DataView(new ArrayBuffer(PAK_HEAD + PAK_RECORD * courses.length));
  const data = [];
  let position = index.byteLength;
  index.setUint32(0, PAK_MAGIC);
  index.setUint32(4, courses.length);
  courses.forEach((course, i) => {
    const at = PAK_HEAD + i * PAK_RECORD;
    const name = pakName(course.name);
    index.setUint32(at, position);
    index.setUint32(at + 4, course.blob.size);
    for (let j = 0; j < name.length; j += 1) {
      index.setUint8(at + 8 + j, name.charCodeAt(j));
    }
    const pad = -course.blob.size & (PAK_ALIGN - 1);
    data.push(course.blob, new Uint8Array(pad));
    position += course.blob.size + pad;
  });
  const end = pak.offset + position;
  if (end > PAK_DISC_SIZE) {
    throw new CoursePakError("These courses don't fit on the disc.");
  }
  const size = full ? PAK_DISC_SIZE : end + (-end & (PAK_DISC_ALIGN - 1));
  const words = new DataView(new ArrayBuffer(8));
  words.setUint32(0, position);
  words.setUint32(4, end - pak.filesAt);
  // The pak's length in the file table, the length of all files in the disc's head, and the new pak
  return new Blob([
    iso.slice(0, 0x438), words.buffer.slice(4), iso.slice(0x43c, pak.lengthAt), words.buffer.slice(0, 4),
    iso.slice(pak.lengthAt + 4, pak.offset), index.buffer, ...data, zeros(size - end),
  ]);
}

// What a course package says of itself in its trackinfo.ini: {name, author}. Not one the game would skip.
async function courseInfo(blob) {
  const notOne = new CoursePakError(`${blob.name || "This ZIP"} is not a course.`);
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
    throw new CoursePakError(`${value("trackname")} needs its own code, which Ultra can't load.`);
  }
  return {name: value("trackname"), author: value("author")};
}

// That many zero bytes without holding them all
function zeros(length) {
  const block = new Uint8Array(1 << 20);
  const parts = [];
  for (let left = length; left > 0; left -= block.length) {
    parts.push(left < block.length ? block.subarray(0, left) : block);
  }
  return new Blob(parts);
}

if (typeof module !== "undefined") {
  module.exports = {readCourses, writeCourses, courseRoom, courseInfo, CoursePakError};
}
