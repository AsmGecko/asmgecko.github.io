// The patcher on the page of a game (an empty .patcher box, with data-game, that this fills): pick your disc, and
// patcher-worker.js downloads the patch of the site after checking the disc and makes Ultra from it. Until then the
// page only reads the facts of the release, not the patch. Without one it only shows with ?patcher in the address,
// and asks for the patch file too. Double Dash has course packs on its disc as well (course-pak.js): the release's
// own, which is downloaded like the patch, the one the Pack Maker handed over (pack-maker.js) and pack files someone
// made. Course ZIPs go to the Pack Maker.
// Elements with data-soon show while there's no patch, those with data-ready once there is, and an element with
// data-fact shows that fact of data/<game>.json (the version, the hashes of the retail disc).
// The worker with the version this script has (stamp.py)
const WORKER = "../patcher-worker.js" + new URL(document.currentScript.src).search;
const DISC_NAMES = {
  GM4E01: "Mario Kart: Double Dash!! (USA)", GM4P01: "Mario Kart: Double Dash!! (Europe)",
  GM4J01: "Mario Kart: Double Dash!! (Japan)", GM4EJ8: "Mario Kart: Double Dash!! Ultra",
  G4QE01: "Super Mario Strikers (USA)", G4QP01: "Mario Smash Football (Europe)", G4QJ01: "Mario Strikers (Japan)",
  G4QEJ8: "Super Mario Strikers Ultra",
};

// The retail disc each game's patch needs
const RETAIL = { mkdd: "GM4E01", strikers: "G4QE01" };

const OPFS_NAME = "ultra.iso";  // where the ISO waits in the site's storage until it's saved
const PACK_CHECKED = "ultra-pack-checked";  // where the name of the stored course pack is kept once its hash was right

const nameOf = id => (DISC_NAMES[id] ? `${DISC_NAMES[id]}, ${id}` : id);
const gb = bytes => `${(bytes / 1e9).toFixed(2)} GB`;
const mb = bytes => `${Math.round(bytes / 1e6)} MB`;
const duration = seconds => (seconds < 60 ? `${Math.ceil(seconds)} s`
  : seconds < 3600 ? `${Math.ceil(seconds / 60)} min`
  : `${Math.floor(seconds / 3600)} h ${Math.ceil((seconds % 3600) / 60)} min`);

// The facts of the release of a game, data/<game>.json, or null
const factsOf = game => fetch(`../data/${game}.json`, { cache: "no-cache" }).then(r => r.json()).catch(() => null);

// Where a file of a release ({name, url}) is, its patch or its course pack: its URL, or else a copy in patches/ next
// to the site, which the release puts there and git leaves out, to try the site with the real files first. null when
// there's none
async function fileUrl(file) {
  if (file.url) {
    return file.url;
  }
  const local = `../patches/${encodeURIComponent(file.name)}`;
  return (await fetch(local, { method: "HEAD" }).then(r => r.ok).catch(() => false)) ? local : null;
}

// The box and its dialog, the same on every game's page
function fill(box) {
  const id = RETAIL[box.dataset.game];
  const game = box.dataset.game;
  box.innerHTML = `
      <div class="top"><span>Ultra Patcher</span></div>
      <div class="body">
        <label class="slot">
          <span class="disc"></span>
          <span><b data-p="disc-name">Your disc</b><span data-p="disc-hint">Your own copy of ${nameOf(id)}. Drop it here or click.</span></span>
          <input type="file" accept=".iso,.gcm,.ciso,.gcz,.rvz" data-p="disc">
        </label>
        <label class="slot file" data-p="patch-step">
          <span><b>The patch</b><span>The .patch file of this game.</span></span>
          <input type="file" accept=".patch" data-p="patch">
        </label>
        <div class="packs"${game === "mkdd" ? "" : " hidden"}>
          <b>Course packs</b>
          <div class="pack-row" data-p="pack-step" hidden>
            <span><b>Retro Pack</b><small data-p="pack-about"></small></span>
            <div class="seg">
              <label><input type="radio" name="pack-${game}" value="disc" data-p="pack-mode" checked><span>On the disc</span></label>
              <label><input type="radio" name="pack-${game}" value="out" data-p="pack-mode"><span>Leave out</span></label>
            </div>
            <div class="lcd"><div data-p="pack-info"></div></div>
          </div>
          <div class="pack-rows" data-p="pack-rows"></div>
          <label class="slot thin">
            <span><b>Add a pack</b><span>Optional: a pack file from a friend or from the Pack Maker. Drop it here or click.</span></span>
            <input type="file" accept=".pak,.zip" multiple data-p="courses">
          </label>
          <span class="hint" data-p="zips" hidden></span>
          <div class="meter" data-p="meter" hidden>
            <div class="bar" data-p="meter-bar"></div>
            <div class="key" data-p="meter-key"></div>
          </div>
        </div>
        <div class="lcd">
          <div data-p="disc-info"></div>
          <div data-p="patch-info"></div>
          <div data-p="courses-info"></div>
          <div data-p="status"></div>
        </div>
        <progress data-p="bar" max="1" value="0" hidden></progress>
        <div class="row">
          <div class="seg">
            <label><input type="radio" name="format-${game}" value="full" data-p="format" checked><span data-p="full">Full size</span></label>
            <label><input type="radio" name="format-${game}" value="compact" data-p="format"><span data-p="compact">Trimmed</span></label>
          </div>
          <button data-p="go" disabled>Make Ultra</button>
          <a class="save" data-p="save" hidden>Save the game</a>
        </div>
      </div>
      <div class="foot">Needs the untouched USA game, ${id}. <a href="#clean" data-p="clean">Is my copy untouched?</a></div>`;
  box.insertAdjacentHTML("afterend", `
    <dialog class="check" id="clean">
     <div>
      <h3>Is my copy untouched?</h3>
      <p>The patch needs the untouched USA game, ${id}. If the patcher says your copy differs, Dolphin can check it under Properties, Verify. An untouched one has these hashes.</p>
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
  const facts = await factsOf(box.dataset.game);
  document.querySelectorAll("[data-fact]").forEach(el => {
    const value = el.dataset.fact.split(".").reduce((o, key) => (o ? o[key] : null), facts);
    if (value != null) {
      el.textContent = value;
    }
  });
  const url = facts && facts.patch ? await fileUrl(facts.patch) : null;
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
  const made = (tag, text, set = {}) => Object.assign(document.createElement(tag), { textContent: text, ...set });
  // The slot shows the disc once one is picked
  const slot = { name: part("disc-name").textContent, hint: part("disc-hint").textContent };
  const showDisc = picked => {
    box.classList.toggle("loaded", Boolean(picked));
    part("disc-name").textContent = picked ? nameOf(picked.id) : slot.name;
    part("disc-hint").textContent = picked ? `${gb(picked.size)}. Click to pick another.` : slot.hint;
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
  // Packs to add to the disc: {name (its file's), files (pakFiles'), size, about (pakAbout's), code (packCode's),
  // handed (by the Pack Maker, which is first then), beside (pakBeside's: its files as they go on the disc)}
  let packs = [], opening = 0;
  // The patch and the course pack of the release as the site's storage has them: {facts (the release's of the file),
  // url, name (in the storage), have (bytes of it there)}. The patch is null when it isn't stored: a picked file, or
  // no storage. The pack also has files (pakFiles' once it's here) and mode (on the "disc" or
  // left "out"), and is null without one or without storage for it
  let stored = null, included = null;
  let downloader = null;  // the download that's going on: {file (one of those two), worker}
  const whole = file => file.have >= file.facts.size;
  const ready = () => !stored || whole(stored);
  const right = () => Boolean(disc && manifest && disc.id === manifest.source.id);
  // What goes into the disc's pak: the release's pack, then the others
  const onDisc = () => (included && included.mode === "disc" && included.files ? included.files : []);
  const packed = () => [...onDisc(), ...packs.flatMap(pack => pack.beside)];
  const files = () => (packed().length ? pakWhole(packed()) : []);
  // What the pak takes, also of the release's pack while it isn't here yet
  const pakRoom = () => (packed().length ? pakSize(files()) : 0) +
                        (included && included.mode === "disc" && !included.files ? included.facts.size : 0);
  // Each pack's files beside those before it, again after any of them changed
  const join = async () => {
    const before = [...onDisc()];
    for (const pack of packs) {
      pack.beside = await pakBeside(pack.files, pack.name, before);
      before.push(...pack.beside);
    }
  };
  // The two sizes of the ISO, once the patch is known
  const showSizes = () => {
    part("full").textContent = `Full size, ${gb(isoSize(manifest, true))}`;
    part("compact").textContent = `Trimmed, ${gb(isoSize(manifest, false) + pakRoom())}`;
  };
  const label = () => manifest.name.replace(/(\.trim)?\.iso$/, "");

  // The patch of the site goes into the site's storage before anything is made (the worker's download), kept by its
  // hash, so a broken connection or a reload goes on where it was and making the other ISO needs no download. Without
  // that storage (a private window) the patch is read as it downloads, while the ISO is made
  const opfs = navigator.storage && navigator.storage.getDirectory
    ? await navigator.storage.getDirectory().catch(() => null) : null;  // none in a private window of Firefox
  const storedName = (file, suffix) => `${file.sha256}.${suffix}`;
  const storedOf = async (file, from, suffix) => {
    const name = storedName(file, suffix);
    const have = await opfs.getFileHandle(name).then(handle => handle.getFile()).then(found => found.size)
      .catch(() => 0);
    return { facts: file, url: from, name, have };
  };
  if (opfs) {
    // What a run of before left: the ISO, and the files of other releases
    const keep = [facts && facts.patch && storedName(facts.patch, "patch"),
                  facts && facts.pack && storedName(facts.pack, "pak"),
                  facts && facts.sd && storedName(facts.sd, "zip"), MAKER_PAK];  // the zip from download.js
    const names = [];
    try {
      for await (const name of opfs.keys()) {
        names.push(name);
      }
    } catch {
      names.push(OPFS_NAME);  // a browser that can't list them still loses the ISO
    }
    for (const name of names.filter(n => !keep.includes(n))) {
      await opfs.removeEntry(name, { recursive: true }).catch(() => {});
    }
  }
  if (url) {
    // What the page knows of the patch before downloading it is in the facts of the release
    patch = url;
    manifest = { name: facts.release.name, source: facts.retail, target: facts.release };
    showSizes();
    stored = opfs ? await storedOf(facts.patch, url, "patch") : null;
    showPatch();
    if (stored && stored.have && !whole(stored)) {
      downloadPatch();  // one that broke off before goes on by itself
    }
    const packUrl = opfs && facts.pack ? await fileUrl(facts.pack) : null;
    if (packUrl) {
      included = { ...await storedOf(facts.pack, packUrl, "pak"), files: null, mode: "disc" };
      showSizes();
    }
  }

  function showPatch() {
    const info = part("patch-info");
    if (ready()) {
      say(info, `${label()}. Ready to patch!`);
    } else if (!downloader) {
      say(info, `${label()}, ${mb(stored.facts.size)}. Ready to patch!`);
    }
  }

  // What the site may still keep in its storage
  async function room() {
    const { quota, usage } = navigator.storage.estimate
      ? await navigator.storage.estimate().catch(() => ({ quota: Infinity, usage: 0 })) : { quota: Infinity, usage: 0 };
    return quota - usage;
  }

  // The name of the stored pack once its hash was right, or nothing: one that only has its size isn't trusted
  const keepChecked = name => {
    try {
      name ? localStorage.setItem(PACK_CHECKED, name) : localStorage.removeItem(PACK_CHECKED);
    } catch {
      // nowhere to keep it: the pack is checked again next time
    }
  };
  const packChecked = () => {
    try {
      return localStorage.getItem(PACK_CHECKED) === included.name;
    } catch {
      return false;
    }
  };

  function stopDownload() {
    if (downloader.worker) {
      downloader.worker.terminate();
    }
    downloader = null;
    part("bar").hidden = true;
  }

  // A file of the release into the site's storage, with how far it is, how fast and how long it takes yet on info, its
  // line of the readout. onFail gets why and what to say of it: no "room", no "storage" in the worker either (nothing
  // to say then), or the "server"
  async function download(file, { what, info, seal = null, onDone, onFail }) {
    if (downloader) {
      return;
    }
    const mine = downloader = { file, worker: null };  // taken while the room is looked at, so no second one starts
    const need = file.facts.size - file.have;
    const short = await room() < need;
    if (downloader !== mine) {
      return;  // stopped meanwhile
    }
    if (short) {
      downloader = null;
      return onFail("room", `There's no room for the ${what}: the browser needs ${gb(need)} free. Free some disk ` +
                            "space and reload the page.");
    }
    const worker = mine.worker = new Worker(WORKER);
    const bar = part("bar"), samples = [];
    bar.hidden = false;
    const fail = (why, text) => {
      stopDownload();
      onFail(why, text);
    };
    worker.onerror = event => {
      event.preventDefault();
      if (downloader === mine) {
        fail("storage");
      }
    };
    worker.onmessage = ({ data }) => {
      if (downloader !== mine) {
        return;  // a last word of one that was stopped
      }
      if (data.error) {
        if (whole(file)) {
          file.have = 0;  // all there but not the release's: the worker threw it away
        }
        return fail(data.storage ? "storage" : "server", data.error);
      }
      file.have = data.downloaded;
      bar.value = data.downloaded / data.total;
      if (data.done) {
        stopDownload();
        return onDone();
      }
      if (data.checking) {
        return say(info, `checking the ${what}...`, false, true);
      }
      if (data.retry) {
        samples.length = 0;
        return say(info, `connection lost at ${mb(data.downloaded)} of ${mb(data.total)}, retrying in ` +
                         `${data.retry} s`, false, true);
      }
      // The speed over the last ten seconds or so, from the start again when the download does
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
      say(info, `downloading the ${what}: ${mb(data.downloaded)} of ${mb(data.total)}${pace}`, false, true);
    };
    worker.postMessage({ download: { url: file.url, name: file.name, size: file.facts.size,
                                     sha256: file.facts.sha256, what, seal } });
  }

  function downloadPatch() {
    download(stored, {
      what: "patch", info: part("patch-info"),
      onDone: () => {
        showPatch();
        update();
      },
      onFail: (why, text) => {
        if (why === "storage") {
          stored = null;  // the patch is read as it downloads
          showPatch();
          return update();
        }
        if (why === "server") {
          part("patch-step").hidden = false;
          text += " Or download the patch yourself and pick the .patch file here.";
        }
        say(part("patch-info"), text, true);
      },
    });
  }

  // The release's pack, which is left out when it can't come. On the server it's sealed like the patch, and it's
  // stored open. One that's all there from before only has its hash checked
  function downloadPack() {
    keepChecked(null);
    download(included, {
      what: "Retro Pack", info: part("pack-info"),
      seal: { ...included.facts.seal, source: manifest.source, disc: disc.file, code: ultraCode() },
      onDone: () => {
        keepChecked(included.name);
        say(part("pack-info"), "");
        openIncluded();
      },
      onFail: (why, text) => {
        if (why === "storage") {
          included = null;
          return refresh();
        }
        included.mode = "out";
        refresh();
        say(part("pack-info"), text, true);
      },
    });
  }

  // The release's pack is in the storage: its files, for the disc
  async function openIncluded() {
    try {
      const file = await (await opfs.getFileHandle(included.name)).getFile();
      included.files = await pakFiles(file, true);
    } catch (error) {
      included.mode = "out";
      included.have = 0;
      await opfs.removeEntry(included.name).catch(() => {});
    }
    refresh();
  }

  // Starts what the right disc still needs, one at a time: the patch, then the release's pack
  function fetchNeeded() {
    if (!right() || downloader) {
      return;
    }
    if (!ready()) {
      downloadPatch();
    } else if (included && included.mode !== "out" && !included.files) {
      // Stored whole and checked by a visit before, or to come now
      whole(included) && packChecked() ? openIncluded() : downloadPack();
    }
  }

  // Says what's wrong with the disc or the packs, and whether the ISO can be made
  function check() {
    const info = part("disc-info"), about = part("courses-info");
    if (disc && manifest && disc.id === manifest.target.id) {
      say(info, "This is already Ultra.", true);
    } else if (disc && manifest && !right()) {
      say(info, `This is ${nameOf(disc.id)}. The patch is for ${nameOf(manifest.source.id)}.`, true);
    } else if (disc) {
      say(info, disc.text);
    }
    const wanted = included && included.mode !== "out" && !included.files;
    const room = manifest ? DISC_SIZE - manifest.target.size - pakRoom() : 0;
    const many = packed().filter(isZip).length, inis = packed().filter(isIni).length;
    if (many && room < 0) {
      say(about, `These packs are ${mb(-room)} too big for the disc.`, true);
    } else if (many > COURSES_MOST) {
      say(about, `The game takes ${COURSES_MOST} courses, these are ${many}.`, true);
    } else if (inis > PACKS_MOST) {
      say(about, `The game takes ${PACKS_MOST} packs, these are ${inis}.`, true);
    }
    part("go").disabled = running || !right() || !ready() || wanted || opening > 0 || room < 0 ||
                          many > COURSES_MOST || inis > PACKS_MOST;
  }

  // After something changed: fetch what's needed now, and say where things stand
  function update() {
    fetchNeeded();
    check();
  }

  // The same after a change to the packs, with their rows and the sizes first
  let joins = 0;
  async function refresh() {
    const mine = joins += 1;
    await join();
    if (mine !== joins) {
      return;  // changed again meanwhile
    }
    showPack();
    showPacks();
    if (manifest) {
      showSizes();
    }
    update();
  }

  const count = (number, one, more) => (number ? `${number} ${number === 1 ? one : more}` : "");
  const packRow = pack => {
    const row = made("div", "", { className: "pack-row" });
    const name = made("b", pack.about.name);
    const acts = made("span", "", { className: "acts" });
    if (pack.handed) {
      acts.append(made("a", "Open in the Pack Maker", { className: "quiet", href: "pack-maker.html#change" }));
    }
    const remove = made("button", "×", { type: "button", className: "quiet x", disabled: running });
    remove.setAttribute("aria-label", `Remove ${pack.about.name}`);
    remove.onclick = () => {
      packs = packs.filter(other => other !== pack);
      if (pack.handed) {
        opfs.removeEntry(MAKER_PAK).catch(() => {});
      }
      refresh();
    };
    acts.append(remove);
    const races = count(pack.about.races, "course", "courses");
    const about = [races && pack.about.cups ? `${races} in ${count(pack.about.cups, "cup", "cups")}` : races,
                   count(pack.about.stages, "battle stage", "battle stages"), mb(pack.size), `pack code ${pack.code}`];
    const texts = made("span", "");
    texts.append(name, made("small", about.filter(Boolean).join(", ")));
    row.append(texts, acts);
    return row;
  };
  // The release's pack and where it goes
  const showPack = () => {
    part("pack-step").hidden = !included;
    if (!included) {
      return;
    }
    part("pack-about").textContent = [count(included.facts.courses, "course", "courses"),
                                      count(included.facts.stages, "battle stage", "battle stages"),
                                      mb(included.facts.size)].filter(Boolean).join(", ");
    box.querySelectorAll("[data-p=pack-mode]").forEach(el => {
      el.checked = el.value === included.mode;
      el.disabled = running;
    });
  };
  box.querySelectorAll("[data-p=pack-mode]").forEach(el => {
    el.onchange = () => {
      included.mode = el.value;
      if (included.mode === "out" && downloader && downloader.file === included) {
        stopDownload();  // what's here stays, for when it's wanted again
        say(part("pack-info"), "");
      }
      refresh();
    };
  });
  showPack();
  // The packs' rows, how much of the disc's room each takes and how many courses they are
  const METER = ["#3c5aa8", "#ffcf3a", "#6edcff", "#3fd27a", "#ff8ad1", "#ff9a4a"];
  const showPacks = () => {
    part("pack-rows").replaceChildren(...packs.map(packRow));
    const retro = included && included.mode === "disc" ? included : null;
    const parts = [...(retro ? [["Retro Pack", retro.facts.size]] : []),
                   ...packs.map(pack => [pack.about.name, pakSize(pakWhole(pack.beside)) - PAK_HEAD])];
    const room = manifest ? DISC_SIZE - manifest.target.size : 0;
    const left = room - pakRoom();
    part("meter").hidden = !manifest || !parts.length;
    part("meter-bar").replaceChildren(...parts.map(([, size], i) => {
      const piece = made("i", "");
      piece.style.width = `${size / Math.max(room, room - left) * 100}%`;
      piece.style.background = METER[i % METER.length];
      return piece;
    }));
    part("meter-key").replaceChildren(
      ...parts.map(([name], i) => {
        const key = made("span", name);
        key.style.setProperty("--c", METER[i % METER.length]);
        return key;
      }),
      made("b", left < 0 ? `${mb(-left)} too big for the disc` : `${mb(left)} left on the disc`,
           { className: left < 0 ? "bad" : "" }));
    const races = (retro ? retro.facts.courses : 0) + packs.reduce((sum, pack) => sum + pack.about.races, 0);
    const stages = (retro ? retro.facts.stages : 0) + packs.reduce((sum, pack) => sum + pack.about.stages, 0);
    const courses = [count(races, "course", "courses"), count(stages, "battle stage", "battle stages")]
      .filter(Boolean).join(" and ");
    say(part("courses-info"), opening ? "opening the pack..." : parts.length && courses
      ? `${count(parts.length, "pack", "packs")}, ${courses} on the disc.` : "", false, opening > 0);
  };
  // A pack file among the others, in the place of one of its name
  const addPack = async (blob, handed = false) => {
    const found = await pakFiles(blob);
    const name = handed ? "Your pack.pak" : blob.name;
    const pack = { name, files: found, size: blob.size, about: await pakAbout(found, name),
                   code: await packCode(found), handed, beside: [] };
    const others = packs.filter(other => other.name !== name);
    packs = handed ? [pack, ...others] : [...others, pack];
  };
  // Course ZIPs wait in the site's storage for the Pack Maker, which makes a pack of them
  const handZips = async zips => {
    const hint = part("zips");
    let kept = false;
    try {
      await opfs.removeEntry(MAKER_ZIPS, { recursive: true }).catch(() => {});
      const folder = await opfs.getDirectoryHandle(MAKER_ZIPS, { create: true });
      for (const zip of zips) {
        const writable = await (await folder.getFileHandle(zip.name, { create: true })).createWritable();
        await writable.write(zip);
        await writable.close();
      }
      kept = true;
    } catch {
      // no storage, or no room in it: the ZIPs are dropped there again
    }
    const link = made("a", "Make one in the Pack Maker!", { href: "pack-maker.html" });
    if (kept) {
      Object.assign(link, { textContent: `Make one with your ${count(zips.length, "ZIP", "ZIPs")}!`, hash: "zips" });
    }
    hint.replaceChildren("Course ZIPs go into a pack first. ", link);
    hint.hidden = false;
  };
  part("courses").onchange = async e => {
    const picked = [...e.target.files];
    e.target.value = "";
    let wrong = "";
    opening += 1;
    showPacks();
    for (const blob of picked.filter(file => !isZip(file))) {
      try {
        await addPack(blob);
      } catch (error) {
        wrong = error instanceof PatchError ? error.message : `${blob.name} can't be read.`;
      }
    }
    opening -= 1;
    if (picked.some(isZip)) {
      await handZips(picked.filter(isZip));
    }
    await refresh();
    if (wrong) {
      say(part("courses-info"), wrong, true);
    }
  };
  // The pack the Pack Maker handed over is in the site's storage
  const openHanded = async () => {
    const handed = await opfs.getFileHandle(MAKER_PAK).then(handle => handle.getFile()).catch(() => null);
    if (handed) {
      opening += 1;
      showPacks();
      await addPack(handed, true).catch(() => opfs.removeEntry(MAKER_PAK).catch(() => {}));
      opening -= 1;
      refresh();
    }
  };
  if (opfs && box.dataset.game === "mkdd") {
    openHanded();
  }

  part("disc").onchange = async e => {
    disc = null;
    if (downloader && downloader.file === included) {
      stopDownload();  // the pack opens with the disc's key, so it starts again for another disc
    }
    const file = e.target.files[0];
    if (!file) {
      showDisc(null);
      return update();
    }
    try {
      const opened = await openDisc(file);
      disc = { file, id: opened.id, text: `disc ${opened.id}, ${gb(file.size)}: looks good!` };
      showDisc({ id: opened.id, size: file.size });
    } catch (error) {
      showDisc(null);
      say(part("disc-info"), error instanceof PatchError ? error.message : `Can't read it: ${error.message}`, true);
    }
    update();
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
    update();
  };

  // While the ISO is made nothing can be picked or changed
  const lock = on => {
    running = on;
    part("disc").disabled = part("patch").disabled = part("courses").disabled = on;
    box.querySelectorAll("[data-p=format]").forEach(el => { el.disabled = on; });
    refresh();
  };

  part("go").onclick = async () => {
    const full = box.querySelector("[data-p=format]:checked").value === "full";
    const name = full ? manifest.name.replace(/\.trim\.iso$/, ".iso") : manifest.name;
    running = true;
    part("go").disabled = true;
    const out = {};
    if (window.showSaveFilePicker) {
      try {
        out.handle = await showSaveFilePicker({ suggestedName: name,
          types: [{ description: "GameCube disc", accept: { "application/octet-stream": [".iso"] } }] });
      } catch (error) {
        if (error.name === "AbortError") {
          running = false;  // the person closed the picker
          return update();
        }
      }
    }
    if (!out.handle && opfs) {
      out.opfs = OPFS_NAME;
      await opfs.removeEntry(OPFS_NAME).catch(() => {});
      const need = isoSize(manifest, full) + (full ? 0 : pakRoom());
      if (await room() < need) {
        running = false;
        say(part("status"), `There's no room for it: the browser needs ${gb(need)} free. ` +
                            (full ? "Pick Trimmed, or free" : "Free") + " some disk space.", true);
        return update();
      }
    }
    lock(true);
    part("save").hidden = true;
    const bar = part("bar");
    bar.hidden = false;
    bar.value = 0;
    say(part("status"), "starting...", false, true);
    const worker = new Worker(WORKER);
    const stop = error => {
      worker.terminate();
      if (error) {
        bar.hidden = true;
        say(part("status"), error, true);
      }
      lock(false);
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
        say(part("status"), "Done! Save it and have fun! :D");
      }
    };
    worker.postMessage({ disc: disc.file, patch: stored ? { stored: stored.name } : patch, full, out,
                         code: ultraCode(), courses: files() });
  };
})();
