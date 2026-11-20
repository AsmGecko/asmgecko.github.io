// The SD card downloads on a game's page: elements with data-download set to the game, data-file to the file in its
// release data (sd for Ultra, sdpack for the Retro Pack) and data-label to the button's text. Each ZIP is encrypted on
// the server with the site code (gate.js); patcher-worker.js downloads it into the site's storage in parts and
// decrypts it on the way, so a broken connection or a reload resumes where it stopped, then it's saved as a file.
// Elements with data-card show when the release has an SD card version, data-nocard ones when it doesn't. Loaded
// after patcher.js for factsOf, fileUrl, mb and WORKER.

// The two ways as tabs: the SD card version and the Ultra Patcher; a link to #patcher or #sd opens that one
function tabs() {
  const buttons = [...document.querySelectorAll("[role=tab]")];
  const show = id => buttons.forEach(button => {
    const on = button.getAttribute("aria-controls") === id;
    button.setAttribute("aria-selected", on);
    document.getElementById(button.getAttribute("aria-controls")).hidden = !on;
  });
  buttons.forEach(button => { button.onclick = () => show(button.getAttribute("aria-controls")); });
  const follow = () => {
    const id = location.hash === "#patcher" || document.getElementById("tab-sd").hidden ? "patcher" : "sd";
    show(id);
    if (location.hash === `#${id}`) {
      document.getElementById("install").scrollIntoView();
    }
  };
  window.addEventListener("hashchange", follow);
  follow();
}

// One download: the button, its progress and the saved file
function downloadBox(box, file, url, label) {
  box.innerHTML = `
    <button type="button" class="btn" data-d="go">${label}, ${mb(file.size)}</button>
    <a class="btn" data-d="save" hidden>Save the ZIP</a>
    <progress data-d="bar" max="1" value="0" hidden></progress>
    <p data-d="status" hidden></p>`;
  const part = name => box.querySelector(`[data-d=${name}]`);
  const say = (text, bad = false) => {
    part("status").textContent = text;
    part("status").className = bad ? "bad" : "";
    part("status").hidden = !text;
  };
  const stop = (text, bad = false) => {
    part("bar").hidden = true;
    part("go").disabled = false;
    say(text, bad);
  };
  part("go").onclick = async () => {
    const root = navigator.storage && navigator.storage.getDirectory
      ? await navigator.storage.getDirectory().catch(() => null) : null;
    if (!root) {
      return say("The download needs the browser's storage. Try a window that isn't private.", true);
    }
    const name = `${file.sha256}.zip`;
    part("go").disabled = true;
    part("bar").hidden = false;
    say("starting...");
    const worker = new Worker(WORKER);
    worker.onerror = event => {
      event.preventDefault();
      worker.terminate();
      stop("Something went wrong. Reload the page and try again.", true);
    };
    worker.onmessage = async ({ data }) => {
      if (data.error) {
        worker.terminate();
        return stop(data.error, true);
      }
      part("bar").value = data.downloaded / data.total;
      if (data.done) {
        worker.terminate();
        const save = part("save");
        URL.revokeObjectURL(save.href);
        save.href = URL.createObjectURL(await (await root.getFileHandle(name)).getFile());
        save.download = file.name;
        save.hidden = false;
        part("go").hidden = true;
        stop("Done! Unzip it onto your SD card.");
        return save.click();
      }
      say(data.checking ? "checking the download..."
        : data.retry ? `connection lost at ${mb(data.downloaded)} of ${mb(data.total)}, retrying in ${data.retry} s`
        : `${mb(data.downloaded)} of ${mb(data.total)}`);
    };
    worker.postMessage({ download: { url, name, size: file.size, sha256: file.sha256, what: "download",
                                     seal: { ...file.seal, code: ultraCode() } } });
  };
}

(async () => {
  const boxes = [...document.querySelectorAll("[data-download]")];
  if (!boxes.length) {
    return;
  }
  const facts = await factsOf(boxes[0].dataset.download);
  const url = facts && facts.sd ? await fileUrl(facts.sd) : null;
  document.querySelectorAll("[data-card]").forEach(el => { el.hidden = !url; });
  document.querySelectorAll("[data-nocard]").forEach(el => { el.hidden = Boolean(url); });
  tabs();
  if (!url) {
    return;
  }
  for (const box of boxes) {
    const file = facts[box.dataset.file];
    const fileLink = file === facts.sd ? url : file ? await fileUrl(file) : null;
    // A release without the file hides its step
    const step = box.closest("li") || box;
    step.hidden = !fileLink;
    if (fileLink) {
      downloadBox(box, file, fileLink, box.dataset.label);
    }
  }
})();
