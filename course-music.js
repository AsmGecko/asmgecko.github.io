// A course's song as the game's own music is: an AST of ADPCM at 32 kHz instead of PCM, a fifth of the size, as
// ultra/music.py and geckokit's audio/stream.py of mkdd-ultra make it for the Retro Pack. Loaded before course-pak.js.

const SONG_RATE = 32000;
const SONG_BYTES = 0x2760;                       // a channel's bytes in a block
const SONG_FRAMES = Math.floor(SONG_BYTES / 9);  // frames of 16 samples in them
// 9 bytes for 16 samples: scale and coefficient pair in one byte, then a nibble per sample
const SONG_PAIRS = [[0, 0], [2048, 0], [0, 2048], [1024, 1024], [4096, -2048], [3584, -1536], [3072, -1024],
                    [4608, -2560], [4200, -2248], [4800, -2300], [5120, -3072], [2048, -2048], [1024, -1024],
                    [-1024, 1024], [-1024, 0], [-2048, 0]];
const SONG_SCALES = 13;                          // up to 1 << 12, as the DSP's 16-bit step overflows above
const SONG_TAPS = 24;                            // zero crossings of the resampler's kernel to each side

// Lets the page draw now and then during a long conversion
function songBreather() {
  let last = Date.now();
  return async () => {
    if (Date.now() - last > 60) {
      await new Promise(resolve => setTimeout(resolve));
      last = Date.now();
    }
  };
}

// The samples of a PCM AST: {channels: [Int16Array], rate, looped, start, end, volume}, or null for anything else
function songSamples(bytes) {
  if (bytes.length < 0x40) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  const count = view.getUint16(0x0c), total = view.getUint32(0x14), rate = view.getUint32(0x10);
  // As many samples as the file can hold, at a rate a song has
  if (view.getUint32(0) !== 0x5354524d || view.getUint16(8) !== 1 || view.getUint16(0x0a) !== 16 || count < 1 ||
      count > 2 || !total || total > bytes.length / 2 / count || rate < 8000 || rate > 96000) {
    return null;
  }
  const channels = Array.from({ length: count }, () => new Int16Array(total));
  let at = 0x40, got = 0;
  while (at + 0x20 <= bytes.length && got < total) {
    const size = view.getUint32(at + 4);
    at += 0x20;
    if (view.getUint32(at - 0x20) !== 0x424c434b) {
      return null;
    }
    // A file may end a little before its last block does: silence there
    const samples = Math.min(size >> 1, total - got);
    if (at + size * count > bytes.length + 0x40) {
      return null;
    }
    for (const channel of channels) {
      const there = Math.min(samples, Math.max(0, bytes.length - at) >> 1);
      for (let i = 0; i < there; i++) {
        channel[got + i] = view.getInt16(at + i * 2);
      }
      at += size;
    }
    got += samples;
  }
  // A loop that ends nowhere in the song ends with it, as the game goes by where it starts
  const from = view.getUint32(0x18), to = view.getUint32(0x1c);
  const looped = view.getUint16(0x0e) !== 0 && from < got;
  return got ? { channels, rate, looped, start: looped ? from : 0,
                 end: looped && to > from && to <= got ? to : got, volume: bytes[0x28] } : null;
}

// count samples of a channel at ratio times its rate, through a windowed sinc that cuts off below the lower rate
async function songResampled(samples, ratio, count, breathe) {
  const out = new Float64Array(count);
  const cut = Math.min(1, ratio), reach = SONG_TAPS / cut;
  // The kernel by 512 steps a sample, with a Blackman window
  const steps = 512, table = new Float64Array(Math.ceil(reach * steps) + 2);
  for (let i = 0; i < table.length; i++) {
    const x = i / steps, turn = Math.PI * x * cut;
    const window = x < reach ? 0.42 + 0.5 * Math.cos(Math.PI * x / reach) + 0.08 * Math.cos(2 * Math.PI * x / reach)
      : 0;
    table[i] = cut * (turn ? Math.sin(turn) / turn : 1) * window;
  }
  for (let i = 0; i < count; i++) {
    const at = i / ratio;
    const first = Math.max(0, Math.ceil(at - reach)), last = Math.min(samples.length - 1, Math.floor(at + reach));
    let sum = 0;
    for (let k = first; k <= last; k++) {
      const x = Math.abs(at - k) * steps, low = Math.floor(x);
      sum += samples[k] * (table[low] + (table[low + 1] - table[low]) * (x - low));
    }
    out[i] = sum;
    if ((i & 0xfff) === 0) {
      await breathe();
    }
  }
  return out;
}

// numpy's rint: a half goes to the even number
function songRound(x) {
  const rounded = Math.round(x);
  return x - Math.floor(x) === 0.5 && rounded % 2 ? rounded - 1 : rounded;
}

// The frames of a channel's samples (a multiple of 16) from zero history, 9 bytes each, and the two samples after
// each frame as the DSP has them (the last, the one before). Each frame takes the pair and scale with the least error,
// leaving out those that would clamp, where the DSP's ucodes may differ, and only pair 0 on loopFrame, which then
// decodes the same from any history. The same choice as encoded_frames of geckokit's audio/stream.py makes.
async function songFrames(samples, loopFrame, breathe) {
  const frames = samples.length >> 4;
  const data = new Uint8Array(frames * 9), history = new Int16Array(frames * 2);
  const nibbles = new Int8Array(16), best = new Int8Array(16);
  let last = 0, penult = 0;
  for (let frame = 0; frame < frames; frame++) {
    const from = frame * 16, pairs = frame === loopFrame ? 1 : SONG_PAIRS.length;
    let least = Infinity, choice = 0, lastAfter = 0, penultAfter = 0;
    for (let pair = 0; pair < pairs; pair++) {
      const newer = SONG_PAIRS[pair][0], older = SONG_PAIRS[pair][1];
      for (let scale = 0; scale < SONG_SCALES; scale++) {
        const step = 1 << scale;
        let a = last, b = penult, error = 0, i = 0;
        for (; i < 16; i++) {
          const sample = samples[from + i], predicted = (newer * a + older * b) >> 11;
          const nibble = Math.max(-8, Math.min(7, songRound((sample - predicted) / step)));
          const y = nibble * step + predicted;
          if (y < -32768 || y > 32767) {
            break;
          }
          error += (y - sample) * (y - sample);
          if (error >= least) {
            break;    // it only grows, and the first of equals stays
          }
          nibbles[i] = nibble;
          b = a;
          a = y;
        }
        if (i === 16) {
          least = error;
          choice = scale << 4 | pair;
          best.set(nibbles);
          lastAfter = a;
          penultAfter = b;
        }
      }
    }
    data[frame * 9] = choice;
    for (let i = 0; i < 8; i++) {
      data[frame * 9 + 1 + i] = (best[i * 2] & 0xf) << 4 | (best[i * 2 + 1] & 0xf);
    }
    last = history[frame * 2] = lastAfter;
    penult = history[frame * 2 + 1] = penultAfter;
    if ((frame & 0x1ff) === 0) {
      await breathe();
    }
  }
  return { data, history };
}

// An ADPCM AST of channels of samples (a multiple of 16 each), looping from start to the end when looped, in jatast's
// layout (XAYRGA, MIT), which the game plays: each block's header holds every channel's history after the block,
// zeros in the last
async function songWritten(channels, start, looped, volume, breathe) {
  const count = channels[0].length, frames = count >> 4;
  const coded = [];
  for (const channel of channels) {
    coded.push(await songFrames(channel, looped ? start >> 4 : -1, breathe));
  }
  const parts = [];
  let size = 0;
  for (let first = 0; first < frames; first += SONG_FRAMES) {
    const end = Math.min(first + SONG_FRAMES, frames), room = ((end - first) * 9 + 31) & -32;
    const block = new Uint8Array(0x20 + room * channels.length), view = new DataView(block.buffer);
    view.setUint32(0, 0x424c434b);
    view.setUint32(4, room);
    coded.forEach((channel, i) => {
      if (end < frames) {
        view.setInt16(8 + i * 4, channel.history[(end - 1) * 2]);
        view.setInt16(10 + i * 4, channel.history[(end - 1) * 2 + 1]);
      }
      block.set(channel.data.subarray(first * 9, end * 9), 0x20 + room * i);
    });
    parts.push(block);
    size += block.length;
  }
  const out = new Uint8Array(0x40 + size), head = new DataView(out.buffer);
  head.setUint32(0, 0x5354524d);
  head.setUint32(4, size);
  head.setUint16(8, 0);
  head.setUint16(0x0a, 16);
  head.setUint16(0x0c, channels.length);
  head.setUint16(0x0e, looped ? 0xffff : 0);
  head.setUint32(0x10, SONG_RATE);
  head.setUint32(0x14, count);
  head.setUint32(0x18, start);
  head.setUint32(0x1c, count);
  head.setUint32(0x20, SONG_BYTES);
  out[0x28] = volume;
  let at = 0x40;
  for (const block of parts) {
    out.set(block, at);
    at += block.length;
  }
  return out;
}

// A song's AST as ADPCM at 32 kHz, or null for one that isn't PCM or is too short to loop by block
async function songAdpcm(bytes) {
  const song = songSamples(bytes);
  if (!song) {
    return null;
  }
  const breathe = songBreather();
  // The DSP loops on whole frames of 16. The pitch shifts by less than a thousandth of a semitone
  const span = song.end - song.start;
  const length = Math.max(16, Math.round(span * SONG_RATE / song.rate / 16) * 16);
  const ratio = length / span;
  let start = Math.round(song.start * ratio);
  // And it starts on a frame: the loop moves forward a little, so its first samples repeat after its end
  const shift = -start & 15, count = start + length;
  const block = SONG_FRAMES * 16;
  if (song.looped && Math.floor((start + shift) / block) >= Math.floor((count + shift - 1) / block)) {
    return null;
  }
  const channels = [];
  for (const channel of song.channels) {
    const float = await songResampled(channel.subarray(0, song.end), ratio, count, breathe);
    const samples = new Int16Array(count + shift);
    for (let i = 0; i < count; i++) {
      samples[i] = Math.max(-32768, Math.min(32767, Math.round(float[i])));
    }
    samples.set(samples.subarray(start, start + shift), count);
    channels.push(samples);
  }
  start += shift;
  return songWritten(channels, start, song.looped, song.volume, breathe);
}

if (typeof module !== "undefined") {
  module.exports = { songAdpcm, songFrames, songSamples };
}
