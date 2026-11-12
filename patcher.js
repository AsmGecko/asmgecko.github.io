// The patcher on the page of a game (an empty .patcher box, with data-game, that this fills): pick your disc, and
// patcher-worker.js downloads the patch of the site after checking the disc and makes Ultra from it. Until then the page
// only reads the facts of the release, not the patch. Without one (the patches aren't public yet) it only shows with
// ?patcher in the address, and asks for the patch file too. Elements with data-soon show while there's no patch,
// those with data-ready once there is, and an element with data-fact shows that fact of data/<game>.json (the version,
// the hashes of the retail disc).
const DISC_NAMES = {
  GM4E01: "Mario Kart: Double Dash!! (USA)", GM4P01: "Mario Kart: Double Dash!! (Europe)",
  GM4J01: "Mario Kart: Double Dash!! (Japan)", GM4EJ8: "Mario Kart: Double Dash!! Ultra",
  G4QE01: "Super Mario Strikers (USA)", G4QP01: "Mario Smash Football (Europe)", G4QJ01: "Mario Strikers (Japan)",
  G4QEJ8: "Super Mario Strikers Ultra",
};

// The retail disc each game's patch needs
const RETAIL = { mkdd: "GM4E01", strikers: "G4QE01" };

const OPFS_NAME = "ultra.iso";  // where the ISO waits in the site's storage until it's saved
const OLD_OPFS_NAME = "ultra-edition.iso";  // what that was called, which a browser may still hold

const nameOf = id => (DISC_NAMES[id] ? `${DISC_NAMES[id]}, ${id}` : id);
const gb = bytes => `${(bytes / 1e9).toFixed(2)} GB`;
const mb = bytes => `${Math.round(bytes / 1e6)} MB`;
const duration = seconds => (seconds < 60 ? `${Math.ceil(seconds)} s`
  : seconds < 3600 ? `${Math.ceil(seconds / 60)} min`
  : `${Math.floor(seconds / 3600)} h ${Math.ceil((seconds % 3600) / 60)} min`);

// The facts of the release of a game, data/<game>.json, or null
const factsOf = (game, root) => fetch(`${root}data/${game}.json`).then(r => r.json()).catch(() => null);

// Where the patch of a game is: its URL once the patches are public, or else a patch in patches/ next to the site,
// which the release puts there and git leaves out, to try the site with the real patches
// first. null when there's none
async function patchUrl(game, root, facts = null) {
  facts = facts || await factsOf(game, root);
  if (!facts || !facts.patch) {
    return null;
  }
  if (facts.patch.url) {
    return facts.patch.url;
  }
  const local = `${root}patches/${encodeURIComponent(facts.patch.name)}`;
  return (await fetch(local, { method: "HEAD" }).then(r => r.ok).catch(() => false)) ? local : null;
}

// The box and its dialog, the same on every game's page
function fill(box) {
  const id = RETAIL[box.dataset.game];
  const game = box.dataset.game;
  box.innerHTML = `
      <div class="top"><span>Ultra Patcher</span></div>
      <div class="body">
        <label class="slot" data-p="slot">
          <span class="disc"></span>
          <span><b data-p="disc-name">Your disc</b><span data-p="disc-hint">A dump of ${nameOf(id)}: ISO, GCM, CISO, GCZ or RVZ. Drop it here or click.</span></span>
          <input type="file" accept=".iso,.gcm,.ciso,.gcz,.rvz" data-p="disc">
        </label>
        <label class="slot file" data-p="patch-step">
          <span><b>The patch</b><span>The .patch file of this game.</span></span>
          <input type="file" accept=".patch" data-p="patch">
        </label>
        <div class="lcd">
          <div data-p="disc-info"></div>
          <div data-p="patch-info"></div>
          <div data-p="status"></div>
        </div>
        <progress data-p="bar" max="1" value="0" hidden></progress>
        <div class="row">
          <div class="seg">
            <label><input type="radio" name="format-${game}" value="full" data-p="format" checked><span data-p="full">Full ISO</span></label>
            <label><input type="radio" name="format-${game}" value="compact" data-p="format"><span data-p="compact">Trimmed ISO</span></label>
          </div>
          <button data-p="go" disabled>Make Ultra</button>
          <a class="save" data-p="save" hidden>Save the ISO</a>
        </div>
      </div>
      <div class="foot">Needs the untouched USA disc, ${id}. <a href="#clean" data-p="clean">Is my dump clean?</a></div>`;
  box.insertAdjacentHTML("afterend", `
    <dialog class="check" id="clean">
     <div>
      <h3>Is my dump clean?</h3>
      <p>The patch needs the untouched USA disc, ${id}. If the patcher says your dump differs, check it: Dolphin verifies a dump under Properties, Verify. A clean one has these hashes.</p>
      <dl class="release">
        <dt>MD5</dt><dd class="hash" data-fact="retail.md5"></dd>
        <dt>SHA-1</dt><dd class="hash" data-fact="retail.sha1"></dd>
        <dt>CRC32</dt><dd class="hash" data-fact="retail.crc32"></dd>
      </dl>
      <form method="dialog"><button>Close</button></form>
     </div>
    </dialog>`);
}

function showReady(ready) {
  document.querySelectorAll("[data-soon]").forEach(el => { el.hidden = ready; });
  document.querySelectorAll("[data-ready]").forEach(el => { el.hidden = !ready; });
}

(async () => {
  const box = document.querySelector(".patcher");
  if (!box) {
    return;
  }
  fill(box);
  const facts = await factsOf(box.dataset.game, "../");
  document.querySelectorAll("[data-fact]").forEach(el => {
    const value = el.dataset.fact.split(".").reduce((o, key) => (o ? o[key] : null), facts);
    if (value != null) {
      el.textContent = value;
    }
  });
  const url = await patchUrl(box.dataset.game, "../", facts);
  showReady(Boolean(url));
  if (!url && !new URLSearchParams(location.search).has("patcher")) {
    return;
  }
  box.hidden = false;
  const part = name => box.querySelector(`[data-p=${name}]`);
  // A line of the readout: green when it's fine, blue while something's going on, red when it's wrong
  const say = (el, text, bad = false, wait = false) => {
    el.textContent = text;
    el.className = text ? (bad ? "bad" : wait ? "wait" : "") : "";
  };
  // The slot shows the disc once one is picked
  const slot = { name: part("disc-name").textContent, hint: part("disc-hint").textContent };
  const showDisc = picked => {
    box.classList.toggle("loaded", Boolean(picked));
    part("disc-name").textContent = picked ? nameOf(picked.id) : slot.name;
    part("disc-hint").textContent = picked ? `${picked.kind}, ${gb(picked.size)}. Click to pick another.` : slot.hint;
  };
  // A file dropped on a slot goes into its input
  box.querySelectorAll(".slot").forEach(el => {
    const input = el.querySelector("input");
    el.ondragover = e => { e.preventDefault(); el.classList.add("drag"); };
    el.ondragleave = () => el.classList.remove("drag");
    el.ondrop = e => {
      e.preventDefault();
      el.classList.remove("drag");
      if (input.disabled || !e.dataTransfer.files.length) {
        return;  // while the ISO is being made, or a drop that isn't a file
      }
      input.files = e.dataTransfer.files;
      input.dispatchEvent(new Event("change"));
    };
  });
  const clean = document.getElementById("clean");
  part("clean").onclick = e => { e.preventDefault(); clean.showModal(); };
  clean.onclick = e => { if (e.target === clean) { clean.close(); } };  // a click on the backdrop closes it
  part("patch-step").hidden = Boolean(url);
  let disc = null, patch = null, manifest = null, running = false;
  // The two sizes of the ISO, once the patch is known
  const showSizes = () => {
    part("full").textContent = `Full ISO, ${gb(isoSize(manifest, true))}`;
    part("compact").textContent = `Trimmed ISO, ${gb(isoSize(manifest, false))}`;
  };
  const label = () => manifest.name.replace(/(\.trim)?\.iso$/, "");

  // The patch of the site goes into the site's storage before anything is made (the worker's download), kept by its
  // hash, so a broken connection or a reload goes on where it was and making the other ISO needs no download. Without
  // that storage (a private window) the patch is read as it downloads, while the ISO is made
  const opfs = navigator.storage && navigator.storage.getDirectory
    ? await navigator.storage.getDirectory().catch(() => null) : null;  // none in a private window of Firefox
  let stored = null, downloader = null;
  if (opfs) {
    // What a run of before left: the ISO, and patches of other releases
    const keep = facts && facts.patch ? `${facts.patch.sha256}.patch` : null;
    const names = [];
    try {
      for await (const name of opfs.keys()) {
        names.push(name);
      }
    } catch {
      names.push(OPFS_NAME, OLD_OPFS_NAME);  // a browser that can't list them still loses the ISO
    }
    for (const name of names.filter(n => n === OPFS_NAME || n === OLD_OPFS_NAME || (n.endsWith(".patch") && n !== keep))) {
      await opfs.removeEntry(name).catch(() => {});
    }
  }
  if (url) {
    // What the page knows of the patch before downloading it is in the facts of the release
    patch = url;
    manifest = { name: facts.release.name, source: facts.retail, target: facts.release };
    showSizes();
    if (opfs) {
      stored = { name: `${facts.patch.sha256}.patch`, size: facts.patch.size, have: 0 };
      stored.have = await opfs.getFileHandle(stored.name).then(handle => handle.getFile()).then(file => file.size)
        .catch(() => 0);
    }
    showPatch();
    if (stored && stored.have && stored.have < stored.size) {
      download();  // one that broke off before goes on by itself
    }
  }

  function showPatch() {
    const info = part("patch-info");
    if (!stored || stored.have >= stored.size) {
      say(info, `${label()}. Ready to patch!`);
    } else if (!downloader) {
      say(info, `${label()}, ${mb(stored.size)}. Ready to patch!`);
    }
  }

  function ready() {
    return !stored || stored.have >= stored.size;
  }

  // What the site may still keep in its storage
  async function room() {
    const { quota, usage } = navigator.storage.estimate
      ? await navigator.storage.estimate().catch(() => ({ quota: Infinity, usage: 0 })) : { quota: Infinity, usage: 0 };
    return quota - usage;
  }

  // The patch into the site's storage, with how far it is, how fast and how long it takes yet
  async function download() {
    if (downloader) {
      return;
    }
    downloader = {};  // taken while the room is looked at, so a second check() doesn't start one too
    const info = part("patch-info"), bar = part("bar");
    const need = stored.size - stored.have;
    if (await room() < need) {
      downloader = null;
      say(info, `There's no room for the patch: the browser needs ${gb(need)} free. Free some disk space and ` +
                "reload the page.", true);
      return;
    }
    downloader = new Worker("../patcher-worker.js");
    const samples = [];
    bar.hidden = false;
    const done = () => {
      downloader.terminate();
      downloader = null;
      bar.hidden = true;
    };
    // Without storage in the worker either, the patch is read as it downloads
    const without = () => {
      done();
      stored = null;
      showPatch();
      check();
    };
    downloader.onerror = event => {
      event.preventDefault();
      without();
    };
    downloader.onmessage = ({ data }) => {
      if (data.error) {
        if (data.storage) {
          return without();
        }
        done();
        part("patch-step").hidden = false;
        return say(info, `${data.error} Or download the patch yourself and pick the .patch file here.`, true);
      }
      stored.have = data.downloaded;
      bar.value = data.downloaded / data.total;
      if (data.done) {
        done();
        showPatch();
        return check();
      }
      if (data.checking) {
        return say(info, "checking the patch...", false, true);
      }
      if (data.retry) {
        samples.length = 0;
        return say(info, `connection lost at ${mb(data.downloaded)} of ${mb(data.total)}, retrying in ${data.retry} s`, false, true);
      }
      // The speed over the last ten seconds or so, from the start again when the patch does
      const now = Date.now();
      if (samples.length && data.downloaded < samples[samples.length - 1][1]) {
        samples.length = 0;
      }
      samples.push([now, data.downloaded]);
      while (samples.length > 2 && now - samples[1][0] >= 10000) {
        samples.shift();
      }
      const [then, from] = samples[0];
      const speed = now - then >= 2000 ? (data.downloaded - from) / ((now - then) / 1000) : 0;
      const left = speed ? duration((data.total - data.downloaded) / speed) : "";
      const pace = speed ? `, ${(speed / 1e6).toFixed(1)} MB/s, ${left} left` : "";
      say(info, `downloading the patch: ${mb(data.downloaded)} of ${mb(data.total)}${pace}`, false, true);
    };
    downloader.postMessage({ download: { url, name: stored.name, size: stored.size, sha256: facts.patch.sha256 } });
  }

  function check() {
    const info = part("disc-info");
    const right = disc && manifest && disc.id === manifest.source.id;
    if (disc && manifest && disc.id === manifest.target.id) {
      say(info, "This is already Ultra.", true);
    } else if (disc && manifest && !right) {
      say(info, `This is ${nameOf(disc.id)}. The patch is for ${nameOf(manifest.source.id)}.`, true);
    } else if (disc) {
      say(info, disc.text);
    }
    if (right && !ready()) {
      download();
    }
    part("go").disabled = running || !right || !ready();
  }

  part("disc").onchange = async e => {
    disc = null;
    const file = e.target.files[0];
    if (!file) {
      showDisc(null);
      return check();
    }
    try {
      const opened = await openDisc(file);
      disc = { file, id: opened.id, text: `disc ${opened.id} ${opened.kind}, ${gb(file.size)}: looks good!` };
      showDisc({ id: opened.id, kind: opened.kind, size: file.size });
    } catch (error) {
      showDisc(null);
      say(part("disc-info"), error instanceof PatchError ? error.message : `Can't read it: ${error.message}`, true);
    }
    check();
  };

  part("patch").onchange = async e => {
    patch = manifest = stored = null;
    const file = e.target.files[0];
    if (file) {
      try {
        manifest = (await readManifest(file)).manifest;
        patch = file;
        showSizes();
        say(part("patch-info"), `${label()}, for ${nameOf(manifest.source.id)}. Ready to patch!`);
      } catch (error) {
        say(part("patch-info"), error instanceof PatchError ? error.message : `Can't read it: ${error.message}`, true);
      }
    }
    check();
  };

  part("go").onclick = async () => {
    const full = box.querySelector("[data-p=format]:checked").value === "full";
    const name = full ? manifest.name.replace(/\.trim\.iso$/, ".iso") : manifest.name;
    running = true;
    part("go").disabled = true;
    let out = {};
    if (window.showSaveFilePicker) {
      try {
        out.handle = await showSaveFilePicker({ suggestedName: name,
          types: [{ description: "GameCube disc", accept: { "application/octet-stream": [".iso"] } }] });
      } catch (error) {
        if (error.name === "AbortError") {
          running = false;  // the person closed the picker
          return check();
        }
      }
    }
    if (!out.handle && opfs) {
      out.opfs = OPFS_NAME;
      await opfs.removeEntry(OPFS_NAME).catch(() => {});
      if (await room() < isoSize(manifest, full)) {
        running = false;
        say(part("status"), `There's no room for this ISO: the browser needs ${gb(isoSize(manifest, full))} free. ` +
                            (full ? "Pick the trimmed ISO, or free" : "Free") + " some disk space.", true);
        return check();
      }
    }
    part("disc").disabled = part("patch").disabled = true;
    box.querySelectorAll("[data-p=format]").forEach(el => { el.disabled = true; });
    part("save").hidden = true;
    const bar = part("bar");
    bar.hidden = false;
    bar.value = 0;
    say(part("status"), "starting...", false, true);
    const worker = new Worker("../patcher-worker.js");
    const stop = error => {
      worker.terminate();
      running = false;
      part("disc").disabled = part("patch").disabled = false;
      box.querySelectorAll("[data-p=format]").forEach(el => { el.disabled = false; });
      if (error) {
        bar.hidden = true;
        say(part("status"), error, true);
      }
      check();
    };
    worker.onerror = event => {
      event.preventDefault();
      stop(`Something went wrong: ${event.message || "the patcher didn't start"}. Reload the page and try again.`);
    };
    worker.onmessageerror = () => stop("Something went wrong. Reload the page and try again.");
    worker.onmessage = ({ data }) => {
      if (data.total) {
        bar.value = data.written / data.total;
        say(part("status"), `writing ${gb(data.written)} of ${gb(data.total)}`, false, true);
        return;
      }
      if (data.damaged) {
        // A stored patch that's damaged goes, and comes again
        say(part("patch-info"), "The download was damaged. Downloading it again...", true);
        stored.have = 0;
        opfs.removeEntry(stored.name).catch(() => {}).then(() => stop(data.error));
        return;
      }
      stop(data.error);
      if (data.error) {
        return;
      }
      if (data.done.saved) {
        say(part("status"), "Done! Have fun! :D");
      } else {
        const link = part("save");
        URL.revokeObjectURL(link.href);
        link.href = URL.createObjectURL(data.done.file);
        link.download = name;
        link.hidden = false;
        say(part("status"), "Done! Save the ISO and have fun! :D");
      }
    };
    worker.postMessage({ disc: disc.file, patch: stored ? { stored: stored.name } : patch, full, out,
                         code: ultraCode() });
  };
})();
