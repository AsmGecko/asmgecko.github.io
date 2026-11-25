// The patcher's work away from the page (patcher.js), one job per worker. A download brings a file of the release (its
// patch, or its sealed course pack, which is opened on the way) into the site's own storage (OPFS) in parts, so a
// broken connection or a reload goes on where it was, and says how far it is. Making gets the disc, the patch (the
// stored one, a picked file, or a URL to read as it downloads when there's no storage), the files of the disc's course
// pak, whether it's a full disc and where to write it, and says how far it is, the end or what went wrong. It writes
// to the file the person picked when the browser can, otherwise to a file in OPFS, and only as a last resort into
// memory.
importScripts(...["vendor/fzstd.js", "patcher-key.js", "patcher-core.js", "course-pak.js"].map(file => file + location.search));

const PART = 8 << 20;     // bytes of a download per request
const HEAD = 1 << 12;     // bytes at the start of a sealed file that its seal has the SHA-256 of (PROBE of delta.py)
const SHOW_EVERY = 250;   // ms between two messages of how far a download is
const RETRY_MAX = 30;     // seconds to wait at most before trying a broken download again

// Bytes into a file of OPFS at at: a write may take only part of them, and none when the disk is full
function writeAt(access, bytes, at) {
  for (let done = 0; done < bytes.length;) {
    let count = 0;
    try {
      count = access.write(bytes.subarray(done), { at: at + done });
    } catch (error) {
      if (error.name !== "QuotaExceededError") {
        throw error;
      }
    }
    if (!count) {
      throw new PatchError("There's no room left on the disk: free some space and try again.");
    }
    done += count;
  }
}

async function sinkFor(out) {
  if (out.handle) {
    const writable = await out.handle.createWritable();
    return {
      write: bytes => writable.write(bytes),
      close: () => writable.close(),
      abort: () => writable.abort(),
      done: async () => ({ saved: out.handle.name }),
    };
  }
  // Writing a file of OPFS in place only works in a worker, so only here it shows whether the browser can
  if (out.opfs && self.FileSystemSyncAccessHandle) {
    const opened = await (async () => {
      const root = await navigator.storage.getDirectory();
      const handle = await root.getFileHandle(out.opfs, { create: true });
      return { root, handle, access: await handle.createSyncAccessHandle() };
    })().catch(() => null);  // a private window can have no storage: then memory
    if (opened) {
      return opfsSink(opened, out.opfs);
    }
  }
  // Memory, put into a Blob every so often, which the browser may keep on disk
  let blob = new Blob(), pending = [], size = 0;
  const flush = () => {
    blob = new Blob([blob, ...pending]);
    pending = [];
    size = 0;
  };
  return {
    write: async bytes => {
      pending.push(bytes);
      size += bytes.length;
      if (size >= 64 << 20) {
        flush();
      }
    },
    close: async () => flush(),
    abort: async () => { blob = new Blob(); pending = []; },
    done: async () => ({ file: blob }),
  };
}

function opfsSink({ root, handle, access }, name) {
  access.truncate(0);
  let at = 0;
  return {
    write: async bytes => {
      writeAt(access, bytes, at);
      at += bytes.length;
    },
    close: async () => { access.flush(); access.close(); },
    abort: async () => { access.close(); await root.removeEntry(name); },
    done: async () => ({ file: await handle.getFile() }),
  };
}

// A wait that ends early when the connection comes back
const sleep = seconds => new Promise(resolve => {
  const timer = setTimeout(resolve, seconds * 1000);
  self.addEventListener("online", () => { clearTimeout(timer); resolve(); }, { once: true });
});

// The start and the total of a Content-Range, "bytes start-end/total". A host on another origin has to expose it
// (Access-Control-Expose-Headers: Content-Range), or it reads as missing
function rangeOf(response) {
  const match = /^bytes (\d+)-\d+\/(\d+)$/.exec(response.headers.get("Content-Range") || "");
  return match ? { start: Number(match[1]), total: Number(match[2]) } : null;
}

// The file at job.url into the file job.name of OPFS until it has job.size bytes, from where the file ends. A part
// that breaks off is asked again from where it broke, waiting longer each time it fails in a row. With job.seal
// ({disc, code, source, salt, probes, head}) the file at the URL is sealed and the one in OPFS is open. Without
// probes there's no disc or source and only the code is needed (the SD card ZIP from download.js)
async function fill(job, handle) {
  const access = await handle.createSyncAccessHandle();
  try {
    // Safari before 17 has getSize, truncate, flush and close return a promise, so they're awaited
    let at = await access.getSize(), wait = 1, shown = 0;
    if (at > job.size) {
      await access.truncate(0);
      at = 0;
    }
    // A sealed file is opened as it comes in, from where the file ends
    const opener = from => (job.key ? chachaCipher(job.key, from) : null);
    const headRight = async () => {
      const head = new Uint8Array(Math.min(HEAD, job.size));
      await access.read(head, { at: 0 });
      return await sha256(new Blob([head])) === job.seal.head;
    };
    // What's there of it may have been opened with another disc: then it starts over
    if (job.key && at && !(at >= HEAD && await headRight())) {
      await access.truncate(0);
      at = 0;
    }
    let open = opener(at), headed = at >= HEAD;
    postMessage({ downloaded: at, total: job.size });
    while (at < job.size) {
      let response;
      try {
        response = await fetch(job.url, { headers: { Range: `bytes=${at}-${Math.min(at + PART, job.size) - 1}` },
                                          cache: "no-store" });
      } catch {
        response = null;  // no connection
      }
      if (response && response.status !== 200 && response.status !== 206 && response.status < 500) {
        throw new PatchError(`The ${job.what} couldn't be downloaded (${response.status}). Reload the page and try ` +
                             "again.");
      }
      const range = response && response.status === 206 ? rangeOf(response) : null;
      if (range && range.start !== at) {
        throw new PatchError(`The server sent the wrong part of the ${job.what}. Reload the page and try again.`);
      }
      if (range && range.total !== job.size) {
        throw new PatchError(`There's a new ${job.what} on the server. Reload the page.`);
      }
      if (response && response.status === 200) {
        await access.truncate(0);  // a server that doesn't do parts sends all of it
        at = 0;
        open = opener(0);
        headed = false;
      }
      if (response && response.ok) {
        try {
          const reader = response.body.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
            if (at + value.length > job.size) {
              throw new PatchError(`The ${job.what} on the server is bigger than this release's. Reload the page.`);
            }
            if (open) {
              open(value);
            }
            writeAt(access, value, at);
            at += value.length;
            wait = 1;
            if (open && !headed && at >= Math.min(HEAD, job.size)) {
              // With another disc it's noise, which its first bytes tell
              if (!await headRight()) {
                await access.truncate(0);
                throw new PatchError(job.seal.source ? WRONG_DUMP(job.seal.source.id)
                  : "The code doesn't open this download. Reload the page and try again.");
              }
              headed = true;
            }
            if (Date.now() - shown >= SHOW_EVERY) {
              shown = Date.now();
              postMessage({ downloaded: at, total: job.size });
            }
          }
          if (response.status === 206 || at === job.size) {
            continue;  // a part that ends early is asked again from there right away, a whole that does waits
          }
        } catch (error) {
          if (!(error instanceof TypeError)) {
            throw error;  // a broken connection is a TypeError in every browser, anything else is ours
          }
        }
      }
      // Broken off or a server error: wait and ask again from here
      postMessage({ downloaded: at, total: job.size, retry: wait });
      await sleep(wait);
      wait = Math.min(wait * 2, RETRY_MAX);
    }
    await access.flush();
  } finally {
    await access.close();
  }
}

// The download, checked against the SHA-256 of the facts of its release once it's all there, also when it was all
// there already. One that isn't right (two releases pieced together, or a part that came in wrong) goes and comes
// again, once
async function download(job) {
  const root = await navigator.storage.getDirectory();
  if (job.seal) {
    job.key = await sealKey(job.seal.disc ? await openDisc(job.seal.disc) : null, job.seal, job.seal.code);
  }
  for (let tries = 0; ; tries++) {
    const handle = await root.getFileHandle(job.name, { create: true });
    await fill(job, handle);
    postMessage({ downloaded: job.size, total: job.size, checking: true });
    if (await sha256(await handle.getFile()) === job.sha256) {
      break;
    }
    await root.removeEntry(job.name);
    if (tries) {
      throw new PatchError(`The ${job.what} on the server doesn't match this release. Reload the page and try again.`);
    }
  }
  postMessage({ downloaded: job.size, total: job.size, done: true });
}

// The ISO of a patch, from job.patch: the name of the stored patch in OPFS, a picked file, or the URL of the patch to
// read as it downloads
async function make(job) {
  let sink;
  try {
    const source = await openDisc(job.disc);
    let manifest, data;
    if (typeof job.patch === "string") {
      const response = await fetch(job.patch);
      if (!response.ok) {
        throw new PatchError("The patch couldn't be downloaded. Reload the page and try again.");
      }
      ({ manifest, data } = await readManifestFrom(response.body));
    } else {
      const file = job.patch.stored
        ? await (await (await navigator.storage.getDirectory()).getFileHandle(job.patch.stored)).getFile()
        : job.patch;
      const read = await readManifest(file);
      manifest = read.manifest;
      data = file.slice(read.start).stream();
    }
    ({ manifest, data } = await unseal(source, manifest, data, job.code));
    const courses = job.courses || [];
    let shown = 0;
    // A trimmed ISO grows by its courses, a full one has them in its padding
    const total = isoSize(manifest, job.full) + (job.full || !courses.length ? 0 : pakSize(courses));
    // Counted where the bytes go out, as the courses are written after the patch's last part
    const out = await sinkFor(job.out);
    let written = 0;
    const counted = { ...out, write: async bytes => {
      await out.write(bytes);
      written += bytes.length;
      if (written - shown >= 16 << 20 || written === total) {
        shown = written;
        postMessage({ written: Math.min(written, total), total });
      }
    } };
    sink = courseSink(counted, courses, job.full);
    await makeIso(source, manifest, data, sink, job.full);
    postMessage({ done: await sink.done() });
  } catch (error) {
    if (sink) {
      await sink.abort().catch(() => {});
    }
    postMessage({ error: error instanceof PatchError ? error.message : `Something went wrong: ${error.message}`,
                  damaged: Boolean(job.patch && job.patch.stored) && error instanceof DamagedPatch });
  }
}

onmessage = ({ data: job }) => {
  if (!job.download) {
    return make(job);
  }
  return download(job.download).catch(error => {
    postMessage({ error: error instanceof PatchError ? error.message : `The download stopped: ${error.message}`,
                  storage: !(error instanceof PatchError) });
  });
};
