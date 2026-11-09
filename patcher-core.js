// The web patcher's work, for patcher.js (the page) and patcher-worker.js: reading a disc (an ISO, CISO, GCZ or RVZ), reading a
// patch file (scripts/iso/delta.py in the work repo has its format), unsealing it with the key of the disc
// (patcher-key.js) and making the ISO of the patch, checking a CRC32 of every part on the way. A classic script, so
// the worker can importScripts it and Node can require it for a test.

const PATCH_MAGIC = "GCPATCH";
const PATCH_FORMAT = 3;  // sealed, with the patch of format 2 inside
const CHUNK = 4 << 20;
const DISC_MAGIC = 0xc2339f3d;  // at 0x1C of every GameCube disc
const DISC_SIZE = 1459978240;
const GCZ_MAGIC = 0xb10bc001;
const GCZ_BATCH = 64;

const CRC_TABLE = (() => {
  const table = new Int32Array(256 * 4);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  for (let n = 0; n < 256; n++) {
    for (let t = 1; t < 4; t++) {
      table[t * 256 + n] = (table[(t - 1) * 256 + n] >>> 8) ^ table[table[(t - 1) * 256 + n] & 0xff];
    }
  }
  return table;
})();

// zlib's crc32: crc32(b, crc32(a)) is the CRC of a and b together. Four bytes a step
function crc32(bytes, crc = 0) {
  const t = CRC_TABLE;
  let c = ~crc;
  let i = 0;
  const end4 = bytes.length & ~3;
  for (; i < end4; i += 4) {
    c ^= bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24);
    c = t[768 + (c & 0xff)] ^ t[512 + ((c >>> 8) & 0xff)] ^ t[256 + ((c >>> 16) & 0xff)] ^ t[c >>> 24];
  }
  for (; i < bytes.length; i++) {
    c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return ~c >>> 0;
}

class PatchError extends Error {}

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

// SHA-256 of a file read in chunks, as hex: a downloaded patch against the facts of its release, without it all in
// memory at once (WebCrypto only hashes a whole buffer)
async function sha256(file) {
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
                             0x5be0cd19]);
  const w = new Uint32Array(64);
  const blocks = (bytes, view) => {
    for (let at = 0; at + 64 <= bytes.length; at += 64) {
      for (let i = 0; i < 16; i++) {
        w[i] = view.getUint32(at + i * 4);
      }
      for (let i = 16; i < 64; i++) {
        const a = w[i - 15], b = w[i - 2];
        const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
        const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
        w[i] = w[i - 16] + s0 + w[i - 7] + s1;
      }
      let [a, b, c, d, e, f, g, k] = h;
      for (let i = 0; i < 64; i++) {
        const t1 = k + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7)))
          + ((e & f) ^ (~e & g)) + SHA256_K[i] + w[i];
        const t2 = (((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10)))
          + ((a & b) ^ (a & c) ^ (b & c));
        k = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += k;
    }
  };
  const whole = file.size - file.size % 64;
  for (let at = 0; at < whole; at += CHUNK) {
    const bytes = await bytesOf(file, at, Math.min(CHUNK, whole - at));
    blocks(bytes, new DataView(bytes.buffer));
  }
  // The rest, a 1 bit, zeros and the length in bits
  const rest = await bytesOf(file, whole, file.size - whole);
  const tail = new Uint8Array(rest.length < 56 ? 64 : 128);
  tail.set(rest);
  tail[rest.length] = 0x80;
  const view = new DataView(tail.buffer);
  view.setUint32(tail.length - 8, Math.floor(file.size / 0x20000000));
  view.setUint32(tail.length - 4, (file.size * 8) >>> 0);
  blocks(tail, view);
  return [...h].map(word => word.toString(16).padStart(8, "0")).join("");
}

async function bytesOf(blob, offset, length) {
  return new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer());
}

// The same, for bytes that have to be there
async function exactly(blob, offset, length) {
  const bytes = await bytesOf(blob, offset, length);
  if (bytes.length !== length) {
    throw new PatchError("This file is cut short. The patch needs data past its end.");
  }
  return bytes;
}

const ascii = bytes => String.fromCharCode(...bytes);

// What a disc file is, before it's read: what the others are, and what to do with them
const NOT_A_DISC = [
  [0, "WIA\x01", "a WIA file. Dolphin turns it into an ISO: right-click the game, Convert File, format ISO."],
  [0x200, "NKIT", "an NKit image, which leaves parts of the disc out. NKit can turn it back into the full ISO."],
  [0, "7z\xBC\xAF\x27\x1C", "a 7z archive. Unpack the disc out of it first."],
  [0, "PK\x03\x04", "a zip archive. Unpack the disc out of it first."],
  [0, "Rar!", "a rar archive. Unpack the disc out of it first."],
];

// A disc to read from: {kind, id, size, read(offset, length)}. A CISO leaves out the blocks of junk between the files,
// which a patch never copies from
async function openDisc(file) {
  if (file.size < 0x8000) {
    throw new PatchError("This file is too small to be a GameCube disc.");
  }
  const head = await bytesOf(file, 0, 0x8000);
  if (ascii(head.subarray(0, 4)) === "RVZ\x01") {
    return openRvz(file, head);
  }
  if (new DataView(head.buffer).getUint32(0, true) === GCZ_MAGIC) {
    return openGcz(file, head);
  }
  for (const [at, magic, what] of NOT_A_DISC) {
    if (ascii(head.subarray(at, at + magic.length)) === magic) {
      throw new PatchError(`This is ${what}`);
    }
  }
  if (ascii(head.subarray(0, 4)) === "CISO") {
    const view = new DataView(head.buffer);
    const blockSize = view.getUint32(4, true);
    const map = head.subarray(8);
    const where = new Int32Array(map.length);
    let present = 0;
    map.forEach((on, i) => { where[i] = on ? present++ : -1; });
    if (!blockSize || where[0] < 0) {
      throw new PatchError("This CISO is damaged: it has no first block.");
    }
    const read = async (offset, length) => {
      const out = new Uint8Array(length);
      for (let done = 0; done < length;) {
        const block = Math.floor((offset + done) / blockSize);
        const inside = (offset + done) % blockSize;
        const take = Math.min(length - done, blockSize - inside);
        if (block >= where.length || where[block] < 0) {
          throw new PatchError(`This CISO has no data at ${hex(offset + done)}, where the patch needs it.`);
        }
        const start = 0x8000 + where[block] * blockSize + inside;
        out.set(await exactly(file, start, take), done);
        done += take;
      }
      return out;
    };
    const first = await read(0, 0x20);
    return disc("CISO", first, Math.min(map.length * blockSize, DISC_SIZE), read);
  }
  return disc("ISO", head, file.size, (offset, length) => exactly(file, offset, length));
}

// GCZ, Dolphin's older format: a header of 32 bytes (little endian: magic, sub type, the size of the data packed and
// unpacked, the block size and the number of blocks), a table of 8 byte block pointers into the data (the top bit set
// for a block that isn't packed) and one of their hashes, then the blocks, each packed on its own with zlib
async function openGcz(file, head) {
  const view = new DataView(head.buffer);
  const packedSize = Number(view.getBigUint64(8, true)), dataSize = Number(view.getBigUint64(16, true));
  const blockSize = view.getUint32(24, true), count = view.getUint32(28, true);
  if (view.getUint32(4, true) !== 0 || !blockSize || !count) {
    throw new PatchError("This GCZ isn't a GameCube disc.");
  }
  const dataStart = 32 + count * 12;
  let pointers = null, batch = null;
  const pointer = i => Number(pointers.getBigUint64(i * 8, true) & 0x7fffffffffffffffn);
  const end = i => (i + 1 < count ? pointer(i + 1) : packedSize);

  // Blocks are small (Dolphin makes them 16 KiB), so GCZ_BATCH of them come in one read and unpack side by side
  async function unpackBatch(first) {
    if (!pointers) {
      const table = await exactly(file, 32, count * 8);
      pointers = new DataView(table.buffer, table.byteOffset, table.byteLength);
    }
    const last = Math.min(count, first + GCZ_BATCH), from = pointer(first);
    const packed = await exactly(file, dataStart + from, end(last - 1) - from);
    return Promise.all(Array.from({ length: last - first }, async (_, k) => {
      const index = first + k;
      let bytes = packed.subarray(pointer(index) - from, end(index) - from);
      if (!(pointers.getUint8(index * 8 + 7) & 0x80)) {
        const unpacked = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
        bytes = new Uint8Array(await new Response(unpacked).arrayBuffer()
          .catch(() => { throw new PatchError("This GCZ is damaged."); }));
      }
      if (bytes.length < Math.min(blockSize, dataSize - index * blockSize)) {
        throw new PatchError("This GCZ is damaged.");
      }
      return bytes;
    }));
  }

  async function block(index) {
    if (!batch || index < batch.first || index >= batch.first + batch.blocks.length) {
      batch = { first: index, blocks: await unpackBatch(index) };
    }
    return batch.blocks[index - batch.first];
  }

  const read = async (offset, length) => {
    const out = new Uint8Array(length);
    for (let done = 0; done < length;) {
      const index = Math.floor((offset + done) / blockSize), inside = (offset + done) % blockSize;
      if (index >= count) {
        throw new PatchError(`This GCZ has no data at ${hex(offset + done)}, where the patch needs it.`);
      }
      const bytes = await block(index);
      const take = Math.min(length - done, bytes.length - inside);
      out.set(bytes.subarray(inside, inside + take), done);
      done += take;
    }
    return out;
  };
  return disc("GCZ", await read(0, 0x20), Math.min(dataSize, DISC_SIZE), read);
}

// RVZ, Dolphin's format: the disc in groups of chunk_size bytes, each compressed on its own with Zstandard
// (vendor/fzstd.js), and the junk between the files kept as the seeds of the generator that made it. The layout is in
// docs/WiaAndRvz.md of Dolphin. Its tables are read with the first bytes, so opening it to see what it is costs nothing
// and needs no Zstandard.
function openRvz(file, head) {
  const view = new DataView(head.buffer);
  const at = 0x48;  // wia_disc_t, after the file's own header
  const u32 = offset => view.getUint32(at + offset);
  const u64 = offset => Number(view.getBigUint64(at + offset));
  const compression = u32(4), chunk = u32(0xc);
  const dhead = head.slice(at + 0x10, at + 0x90);
  if (u32(0) !== 1) {
    throw new PatchError("This RVZ isn't a GameCube disc.");
  }
  if (compression !== 0 && compression !== 5) {
    throw new PatchError("This RVZ is packed with bzip2 or LZMA. Dolphin turns it into an ISO: right-click the game, " +
                         "Convert File, format ISO.");
  }
  const unpack = bytes => (compression === 5 ? fzstd.decompress(bytes) : bytes);
  let raw = null, groups = null, cached = null;

  async function tables() {
    const entries = unpack(await exactly(file, u64(0xb8), u32(0xc0)));
    const ev = new DataView(entries.buffer, entries.byteOffset, entries.byteLength);
    raw = [];
    for (let i = 0; i < u32(0xb4); i++) {
      const offset = Number(ev.getBigUint64(i * 24)), size = Number(ev.getBigUint64(i * 24 + 8));
      // The first one says 0x80 but holds the data from 0: every start is rounded down to 0x8000
      const start = offset - offset % 0x8000;
      raw.push({ start, end: offset + size, group: ev.getUint32(i * 24 + 16) });
    }
    groups = unpack(await exactly(file, u64(0xc8), u32(0xd0)));
  }

  // The bytes of one group, which starts at start on the disc
  async function group(index, start, size) {
    if (cached && cached.index === index) {
      return cached.bytes;
    }
    const gv = new DataView(groups.buffer, groups.byteOffset, groups.byteLength);
    const offset = gv.getUint32(index * 12) * 4, stored = gv.getUint32(index * 12 + 4);
    const packed = gv.getUint32(index * 12 + 8), length = stored & 0x7fffffff;
    let bytes = new Uint8Array(size);
    if (length) {
      bytes = await exactly(file, offset, length);
      if (stored >>> 31) {
        bytes = unpack(bytes);
      }
      if (packed) {
        bytes = unpackRvz(bytes.subarray(0, packed), start, size);
      }
    }
    if (bytes.length < size) {
      throw new PatchError("This RVZ is damaged.");
    }
    cached = { index, bytes };
    return bytes;
  }

  const read = async (offset, length) => {
    if (!raw) {
      await tables();
    }
    const out = new Uint8Array(length);
    for (let done = 0; done < length;) {
      const where = offset + done;
      const entry = raw.find(e => where >= e.start && where < e.end);
      if (!entry) {
        throw new PatchError(`This RVZ has no data at ${hex(where)}, where the patch needs it.`);
      }
      const index = Math.floor((where - entry.start) / chunk);
      const start = entry.start + index * chunk;
      const bytes = await group(entry.group + index, start, Math.min(chunk, entry.end - start));
      const take = Math.min(length - done, start + bytes.length - where);
      out.set(bytes.subarray(where - start, where - start + take), done);
      done += take;
    }
    if (offset < 0x80) {
      out.set(dhead.subarray(offset, Math.min(0x80, offset + length)));
    }
    return out;
  };
  return disc("RVZ", dhead, Number(view.getBigUint64(0x24)), read);
}

// RVZ packing: runs of a 4 byte size and then the bytes, or with the top bit of the size set, the 68 bytes of a seed of
// the junk generator
function unpackRvz(bytes, start, size) {
  const out = new Uint8Array(size);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let i = 0, o = 0;
  while (i < bytes.length && o < size) {
    let count = view.getUint32(i);
    i += 4;
    if (count >>> 31) {
      count &= 0x7fffffff;
      junk(bytes.subarray(i, i + 68), start + o, out.subarray(o, o + count));
      i += 68;
    } else {
      out.set(bytes.subarray(i, i + count), o);
      i += count;
    }
    o += count;
  }
  return out;
}

// The junk of GameCube discs: a lagged Fibonacci generator (xor, j = 32, k = 521) from a seed, its bytes counted from
// the start of the 0x8000 bytes of the disc that offset is in, as Dolphin's LaggedFibonacciGenerator does it
function junk(seed, offset, out) {
  const buffer = new Uint32Array(521);
  const sv = new DataView(seed.buffer, seed.byteOffset, 68);
  for (let i = 0; i < 17; i++) {
    buffer[i] = sv.getUint32(i * 4);
  }
  for (let i = 17; i < 521; i++) {
    buffer[i] = (buffer[i - 17] << 23) ^ (buffer[i - 16] >>> 9) ^ buffer[i - 1];
  }
  const forward = () => {
    for (let i = 0; i < 32; i++) {
      buffer[i] ^= buffer[i + 521 - 32];
    }
    for (let i = 32; i < 521; i++) {
      buffer[i] ^= buffer[i - 32];
    }
  };
  for (let n = 0; n < 4; n++) {
    forward();
  }
  const skip = offset % 0x8000;
  let word = 0, byte = 0;
  for (let k = 0; k < skip + out.length; k++) {
    if (k >= skip) {
      const value = buffer[word];
      out[k - skip] = byte === 0 ? value >>> 24 : byte === 1 ? value >>> 18 : byte === 2 ? value >>> 8 : value;
    }
    if (++byte === 4) {
      byte = 0;
      if (++word === 521) {
        word = 0;
        forward();
      }
    }
  }
}

function disc(kind, head, size, read) {
  if (new DataView(head.buffer, head.byteOffset).getUint32(0x1c) !== DISC_MAGIC) {
    throw new PatchError("This isn't a GameCube disc.");
  }
  return { kind, id: ascii(head.subarray(0, 6)), size, read };
}

const hex = n => "0x" + n.toString(16).toUpperCase();

// The clear manifest of a patch file (a Blob), and where its sealed data starts
async function readManifest(file) {
  const length = manifestLength(await bytesOf(file, 0, 12));
  const manifest = JSON.parse(new TextDecoder().decode(await bytesOf(file, 12, length)));
  return { manifest, start: 12 + length };
}

// The same from a stream, as a download gives it: the manifest, and the rest of the stream
async function readManifestFrom(stream) {
  const reader = new ByteReader(stream);
  return manifestOf(reader, manifestLength(await reader.read(12)));
}

async function manifestOf(reader, length) {
  const manifest = JSON.parse(new TextDecoder().decode(await reader.read(length)));
  return { manifest, data: reader.rest() };
}

// The patch inside a sealed one: its manifest and its gzip data, decrypted with the key of the bytes of the disc at
// the probes of the clear manifest and the code of the first screen. With another disc that's noise, so the first
// bytes tell whether the disc is right
async function unseal(source, clear, data, code = "") {
  if (source.id !== clear.source.id) {
    throw new PatchError(`This disc is ${source.id}, the patch is for ${clear.source.id}.`);
  }
  if (!Array.isArray(clear.probes) || clear.probes.length > 64) {
    throw new PatchError("The patch is damaged.");
  }
  for (const [offset, length] of clear.probes) {
    if (!(length > 0 && length <= 1 << 16 && offset >= 0 && offset + length <= source.size)) {
      throw new PatchError("This dump is cut short: the patch needs parts of the disc it doesn't have.");
    }
  }
  const probed = new Uint8Array(clear.probes.reduce((sum, probe) => sum + probe[1], 0));
  let at = 0;
  for (const [offset, length] of clear.probes) {
    probed.set(await source.read(offset, length), at);
    at += length;
  }
  const key = patchKey(probed, clear.salt, code);
  const reader = new ByteReader(data.pipeThrough(chacha20(key.subarray(0, 32), key.subarray(32, 44))));
  const head = await reader.read(12);
  if (ascii(head.subarray(0, 8)) !== PATCH_MAGIC + "\x02") {
    throw new PatchError(`Your disc differs from the clean ${clear.source.id} dump. Make a new dump of it, ` +
                         "or check it against Redump.");
  }
  return manifestOf(reader, new DataView(head.buffer).getUint32(8));
}

// ChaCha20 (RFC 8439) from block 0 as a TransformStream, in place, on chunks of any size
function chacha20(key, nonce) {
  const state = new Uint32Array(16), x = new Uint32Array(16);
  const stream = new Uint8Array(64), words = new Uint32Array(stream.buffer);
  state.set([0x61707865, 0x3320646e, 0x79622d32, 0x6b206574]);
  const kv = new DataView(key.buffer, key.byteOffset, 32), nv = new DataView(nonce.buffer, nonce.byteOffset, 12);
  for (let i = 0; i < 8; i++) {
    state[4 + i] = kv.getUint32(i * 4, true);
  }
  for (let i = 0; i < 3; i++) {
    state[13 + i] = nv.getUint32(i * 4, true);
  }
  const quarter = (a, b, c, d) => {
    x[a] += x[b]; x[d] ^= x[a]; x[d] = (x[d] << 16) | (x[d] >>> 16);
    x[c] += x[d]; x[b] ^= x[c]; x[b] = (x[b] << 12) | (x[b] >>> 20);
    x[a] += x[b]; x[d] ^= x[a]; x[d] = (x[d] << 8) | (x[d] >>> 24);
    x[c] += x[d]; x[b] ^= x[c]; x[b] = (x[b] << 7) | (x[b] >>> 25);
  };
  // The next 64 bytes of key stream, as little endian words (Uint32Array is that on every machine a browser runs on)
  const next = () => {
    x.set(state);
    for (let round = 0; round < 10; round++) {
      quarter(0, 4, 8, 12); quarter(1, 5, 9, 13); quarter(2, 6, 10, 14); quarter(3, 7, 11, 15);
      quarter(0, 5, 10, 15); quarter(1, 6, 11, 12); quarter(2, 7, 8, 13); quarter(3, 4, 9, 14);
    }
    for (let i = 0; i < 16; i++) {
      words[i] = x[i] + state[i];
    }
    state[12]++;
  };
  let used = 64;
  return new TransformStream({
    transform(chunk, controller) {
      let i = 0;
      while (i < chunk.length && used < 64) {
        chunk[i++] ^= stream[used++];
      }
      // Whole blocks a word at a time, when they lie on a word in memory
      const blocks = (chunk.length - i) >> 6;
      if (blocks && (chunk.byteOffset + i) % 4 === 0) {
        const into = new Uint32Array(chunk.buffer, chunk.byteOffset + i, blocks * 16);
        for (let b = 0; b < into.length; b += 16) {
          next();
          for (let k = 0; k < 16; k++) {
            into[b + k] ^= words[k];
          }
        }
        i += blocks * 64;
      }
      for (; i < chunk.length; i++) {
        if (used === 64) {
          next();
          used = 0;
        }
        chunk[i] ^= stream[used++];
      }
      controller.enqueue(chunk);
    },
  });
}

// The length of the clear manifest after the first 12 bytes of a patch file, which say what it is
function manifestLength(head) {
  if (head.length < 12 || ascii(head.subarray(0, 7)) !== PATCH_MAGIC) {
    throw new PatchError("This isn't an Ultra patch.");
  }
  if (head[7] !== PATCH_FORMAT) {
    throw new PatchError("This patch is for another version of the patcher. Reload the page and try again.");
  }
  return new DataView(head.buffer, head.byteOffset).getUint32(8);
}

// Exactly so many bytes at a time from a stream
class ByteReader {
  constructor(stream) {
    this.reader = stream.getReader();
    this.chunks = [];
    this.buffered = 0;
  }

  async read(length) {
    while (this.buffered < length) {
      // A gzip stream that's damaged or cut short fails here
      const { done, value } = await this.reader.read().catch(() => {
        throw new PatchError("The patch is damaged or not fully downloaded.");
      });
      if (done) {
        break;
      }
      this.chunks.push(value);
      this.buffered += value.length;
    }
    const out = new Uint8Array(Math.min(length, this.buffered));
    let at = 0;
    while (at < out.length) {
      const chunk = this.chunks[0];
      const take = Math.min(chunk.length, out.length - at);
      out.set(chunk.subarray(0, take), at);
      at += take;
      if (take === chunk.length) {
        this.chunks.shift();
      } else {
        this.chunks[0] = chunk.subarray(take);
      }
    }
    this.buffered -= out.length;
    return out;
  }

  // What's left, as a stream again
  rest() {
    const { chunks, reader } = this;
    this.chunks = [];
    this.buffered = 0;
    return new ReadableStream({
      async pull(controller) {
        if (chunks.length) {
          controller.enqueue(chunks.shift());
          return;
        }
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
        } else {
          controller.enqueue(value);
        }
      },
      cancel: reason => reader.cancel(reason),
    });
  }
}

// Checks that the disc is the one the patch is for, before anything is written
function checkDisc(source, manifest) {
  const want = manifest.source;
  if (source.id !== want.id) {
    throw new PatchError(`This disc is ${source.id}, the patch is for ${want.id}.`);
  }
  const end = Math.max(...manifest.parts.filter(p => p[0] === "copy").map(p => p[1] + p[2]));
  if (source.size < end) {
    throw new PatchError("This dump is cut short: the patch needs parts of the disc it doesn't have.");
  }
}

// The size of the ISO a patch makes: the compact one of the release, or padded with zeros to the size of a disc
const isoSize = (manifest, full) => (full ? Math.max(manifest.target.size, DISC_SIZE) : manifest.target.size);

// Writes the ISO of the patch to sink ({write(bytes), close()}) in order. data is the patch's gzip stream, progress
// gets the bytes written so far. The release is the disc without its padding (the files right after the FST, the
// header says where they end); with full the zeros go back on, so the file has the size of a real disc
async function makeIso(source, manifest, data, sink, progress = () => {}, full = false) {
  checkDisc(source, manifest);
  const unpacked = new ByteReader(data.pipeThrough(new DecompressionStream("gzip")));
  const zeros = new Uint8Array(CHUNK);
  let written = 0;
  const put = async bytes => {
    await sink.write(bytes);
    written += bytes.length;
    progress(written);
  };
  for (const part of manifest.parts) {
    if (part[0] === "copy") {
      const [, offset, length, want] = part;
      let crc = 0;
      for (let at = 0; at < length; at += CHUNK) {
        const bytes = await source.read(offset + at, Math.min(CHUNK, length - at));
        crc = crc32(bytes, crc);
        await put(bytes);
      }
      if (crc !== want) {
        throw new PatchError(`Your disc differs from the clean ${manifest.source.id} dump at ${hex(offset)}. ` +
                             "Make a new dump of it, or check it against Redump.");
      }
    } else if (part[0] === "data") {
      const [, length, want] = part;
      let crc = 0;
      for (let at = 0; at < length; at += CHUNK) {
        const bytes = await unpacked.read(Math.min(CHUNK, length - at));
        if (!bytes.length) {
          throw new PatchError("The patch ends too soon: it's damaged or not fully downloaded.");
        }
        crc = crc32(bytes, crc);
        await put(bytes);
      }
      if (crc !== want) {
        throw new PatchError("The patch is damaged.");
      }
    } else {
      for (let at = 0; at < part[1]; at += CHUNK) {
        await put(zeros.subarray(0, Math.min(CHUNK, part[1] - at)));
      }
    }
  }
  // Reading on to the end has the gzip stream check itself, and there must be nothing after the last part
  if (written !== manifest.target.size || (await unpacked.read(1)).length) {
    throw new PatchError("The patch is damaged.");
  }
  while (written < isoSize(manifest, full)) {
    await put(zeros.subarray(0, Math.min(CHUNK, isoSize(manifest, full) - written)));
  }
  await sink.close();
}

if (typeof module !== "undefined") {
  module.exports = { crc32, sha256, openDisc, readManifest, readManifestFrom, unseal, makeIso, isoSize, PatchError };
}
