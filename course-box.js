// The box for your own courses on the Double Dash page (an empty .own box that this fills): pick your Ultra ISO and
// course ZIPs, and course-pak.js puts them on the disc. Nothing leaves the browser.
(() => {
  const box = document.querySelector(".own");
  if (!box) {
    return;
  }
  const ULTRA = "GM4EJ8";
  const megabytes = bytes => `${Math.round(bytes / 1e6)} MB`;
  box.innerHTML = `
      <div class="top"><span>Your own courses</span></div>
      <div class="body">
        <label class="slot" data-o="iso-slot">
          <span class="disc"></span>
          <span><b data-o="iso-name">Your Ultra ISO</b><span data-o="iso-hint">The ISO the Ultra Patcher made. Drop it here or click.</span></span>
          <input type="file" accept=".iso,.gcm" data-o="iso">
        </label>
        <label class="slot file" data-o="zip-slot">
          <span><b>Course ZIPs</b><span>As many as you like. Drop them here or click.</span></span>
          <input type="file" accept=".zip" multiple data-o="zips" disabled>
        </label>
        <ul class="own-list" data-o="list"></ul>
        <div class="lcd"><div data-o="status"></div></div>
        <div class="row">
          <span></span>
          <button data-o="save" disabled>Save the ISO</button>
        </div>
      </div>
      <div class="foot">Your courses show in the OWN tab of the course select, in Versus and Battle.</div>`;
  const part = name => box.querySelector(`[data-o=${name}]`);
  const say = (text, bad = false) => {
    part("status").textContent = text;
    part("status").className = bad ? "bad" : "";
  };
  let iso = null;
  let courses = [];  // {name, blob, title, author}

  const show = async () => {
    part("list").replaceChildren(...courses.map((course, i) => {
      const row = document.createElement("li");
      const name = document.createElement("b");
      const by = document.createElement("span");
      const remove = document.createElement("button");
      name.textContent = course.title;
      by.textContent = `${course.author ? `by ${course.author}, ` : ""}${megabytes(course.blob.size)}`;
      remove.textContent = "×";
      remove.title = `Take ${course.title} off`;
      remove.onclick = () => {
        courses.splice(i, 1);
        show();
      };
      row.append(name, by, remove);
      return row;
    }));
    const room = iso ? await courseRoom(iso, courses) : 0;
    part("save").disabled = !iso || room < 0;
    if (iso) {
      say(room < 0 ? `These courses are ${megabytes(-room)} too big for the disc.`
        : `${courses.length} ${courses.length === 1 ? "course" : "courses"}, room for ${megabytes(room)} more.`, room < 0);
    }
  };

  // The courses of the files that are ones, and what's wrong with the last that isn't
  const add = async files => {
    let wrong = "";
    for (const blob of files) {
      try {
        const info = await courseInfo(blob);
        courses = courses.filter(course => course.name !== blob.name);
        courses.push({name: blob.name, blob, title: info.name, author: info.author});
      } catch (error) {
        wrong = error instanceof CoursePakError ? error.message : `${blob.name} can't be read.`;
      }
    }
    await show();
    if (wrong) {
      say(wrong, true);
    }
  };

  const pick = async file => {
    iso = null;
    courses = [];
    part("zips").disabled = true;
    box.classList.remove("loaded");
    try {
      const id = new TextDecoder().decode(await file.slice(0, 6).arrayBuffer());
      if (id !== ULTRA) {
        throw new CoursePakError("This is not an Ultra ISO of Double Dash. Make one with the Ultra Patcher!");
      }
      for (const course of await readCourses(file)) {
        const info = await courseInfo(course.blob).catch(() => ({name: course.name, author: ""}));
        courses.push({...course, title: info.name, author: info.author});
      }
      iso = file;
      part("zips").disabled = false;
      box.classList.add("loaded");
      part("iso-name").textContent = file.name;
      part("iso-hint").textContent = `${megabytes(file.size)}. Click to pick another.`;
    } catch (error) {
      say(error instanceof CoursePakError ? error.message : "This file can't be read.", true);
    }
    await show();
  };

  part("iso").onchange = e => e.target.files[0] && pick(e.target.files[0]);
  part("zips").onchange = e => {
    add([...e.target.files]);
    e.target.value = "";
  };
  [["iso-slot", files => pick(files[0])], ["zip-slot", files => iso && add(files)]].forEach(([name, take]) => {
    const slot = part(name);
    slot.ondragover = e => {
      e.preventDefault();
      slot.classList.add("drag");
    };
    slot.ondragleave = () => slot.classList.remove("drag");
    slot.ondrop = e => {
      e.preventDefault();
      slot.classList.remove("drag");
      if (e.dataTransfer.files.length) {
        take([...e.dataTransfer.files]);
      }
    };
  });
  part("save").onclick = async () => {
    // As big as it came: a full disc stays one
    const made = await writeCourses(iso, courses, iso.size >= PAK_DISC_SIZE);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(made);
    link.download = iso.name;
    link.click();
    say(`Saved with ${courses.length} ${courses.length === 1 ? "course" : "courses"}!`);
  };
})();
