// The Pack Maker of Double Dash (mkdd/pack-maker.html, the .maker box there): course ZIPs become a pack, with its cups
// as the cup select has them, four cups a page and four courses a cup, and its battle stages six a page. The pack is
// saved as a pak for an SD card, or handed to the patcher of the game's page through the site's storage. The pak and
// what the game takes of a ZIP are course-pak.js's.
(async () => {
  const box = document.querySelector(".maker");
  const part = name => box.querySelector(`[data-m=${name}]`);
  const made = (tag, text, set = {}) => Object.assign(document.createElement(tag), { textContent: text, ...set });
  const mb = bytes => `${Math.max(1, Math.round(bytes / 1e6))} MB`;
  const count = (number, one, more) => `${number} ${number === 1 ? one : more}`;
  const listed = words => (words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`
    : words[0] || "");
  const shown = word => word[0].toUpperCase() + word.slice(1);
  const pillText = console => (console === "WII" ? "Wii" : console);
  const phone = matchMedia("(max-width: 900px)");
  const opfs = navigator.storage && navigator.storage.getDirectory
    ? await navigator.storage.getDirectory().catch(() => null) : null;
  // The room the patcher has on the disc, with and without the Retro Pack, once the facts of the release are here
  let room = null;
  fetch("../data/mkdd.json").then(r => r.json()).then(facts => {
    room = { disc: DISC_SIZE - facts.release.size, retro: facts.pack ? facts.pack.size : 0 };
    showBottom();
  }).catch(() => {});

  // The pack: its cups ({name, courses, icon}), whole pages of them with an empty cup after the last, its stages, the
  // race courses that are in no cup yet (tray) and the ZIPs the game can't take (out: {name, why}). A course is
  // courseFile's with its preview to show (picture). An icon is {name, bytes, picture, art (iconArt's of the picture
  // it was made of, null for one of a pack opened), outline}. The cup the look of the cup select has picked is ringed.
  let pack, picked = null, page = 0, busy = 0, dirty = false, dragged = null, ringed = null;
  const fresh = () => ({ name: "", version: PACK_VERSION_NONE, cups: [], stages: [], tray: [], out: [] });
  const races = () => pack.cups.flatMap(cup => cup.courses);
  const all = () => [...races(), ...pack.stages, ...pack.tray];
  const lists = () => [...pack.cups.map(cup => cup.courses), pack.stages, pack.tray];
  const listOf = course => lists().find(list => list.includes(course));
  const cupOf = list => pack.cups.find(cup => cup.courses === list);
  const cupLabel = cup => cup.name.trim() || `Cup ${pack.cups.indexOf(cup) + 1}`;
  const pageName = () => pack.name.trim() || "Custom";
  const tidy = () => {
    const used = pack.cups.reduce((last, cup, i) => (cup.courses.length ? i : last), -1);
    const need = Math.max(1, Math.ceil((used + 2) / PAGE_CUPS)) * PAGE_CUPS;
    while (pack.cups.length < need) {
      pack.cups.push({ name: "", courses: [], icon: null });
    }
    while (pack.cups.length > need && pack.cups.slice(-PAGE_CUPS).every(cup => !cup.name.trim() && !cup.icon)) {
      pack.cups.length -= PAGE_CUPS;
    }
    page = Math.min(page, pack.cups.length / PAGE_CUPS - 1);
    picked = all().includes(picked) ? picked : null;
  };
  // Two cups of one name, the first of them not full: the game fills that one up with the other's courses
  const joinedCups = () => {
    const last = new Map();
    for (const cup of pack.cups.filter(one => one.courses.length)) {
      const before = last.get(cup.name.trim().toLowerCase());
      if (before && before.courses.length < CUP_COURSES) {
        return [before, cup];
      }
      last.set(cup.name.trim().toLowerCase(), cup);
    }
    return null;
  };
  const files = () => packFiles(pack);
  const pakOf = () => pakBlob(pakWhole(files()));
  const filled = () => races().length + pack.stages.length > 0;

  // A line of the check list that comes and goes: what's going on, or what went wrong
  const say = (text, bad = false) => {
    box.querySelectorAll("[data-m=status]").forEach(line => {
      line.textContent = text;
      line.className = text ? (bad ? "bad" : "wait") : "";
    });
  };

  // A course ZIP's preview as a picture to show, or nothing
  const pictureOf = async blob => {
    const pixels = await previewPixels(blob);
    if (!pixels) {
      return "";
    }
    const canvas = made("canvas", "", { width: pixels.width, height: pixels.height });
    canvas.getContext("2d").putImageData(new ImageData(pixels.rgba, pixels.width, pixels.height), 0, 0);
    return canvas.toDataURL("image/jpeg", 0.85);
  };
  // A cup's icon as the game draws it, and the picture of one a file has: the first frame, turned as the photo says,
  // and an SVG drawn big
  const iconShown = bytes => {
    const { width, height, rgba } = iconPixels(bytes);
    const canvas = made("canvas", "", { width, height });
    canvas.getContext("2d").putImageData(new ImageData(rgba, width, height), 0, 0);
    return canvas.toDataURL("image/png");
  };
  const iconMade = async (bytes, art, outline) => ({ name: await iconName(bytes), bytes, picture: iconShown(bytes),
                                                     art, outline });
  const pictureFile = async file => {
    let source;
    if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) {
      const doc = new DOMParser().parseFromString(await file.text(), "image/svg+xml");
      const svg = doc.documentElement;
      const box = (svg.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
      const [wide, high] = ["width", "height"].map(key => parseFloat(svg.getAttribute(key)));
      if (box.length !== 4 && wide > 0 && high > 0) {
        svg.setAttribute("viewBox", `0 0 ${wide} ${high}`);
      }
      const aspect = box.length === 4 && box[2] > 0 && box[3] > 0 ? box[2] / box[3]
        : wide > 0 && high > 0 ? wide / high : 1;
      const [width, height] = aspect >= 1 ? [384, Math.round(384 / aspect)] : [Math.round(384 * aspect), 384];
      svg.setAttribute("width", width);
      svg.setAttribute("height", height);
      const text = new XMLSerializer().serializeToString(doc);
      const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
      source = new Image(width, height);
      source.src = url;
      await source.decode().finally(() => URL.revokeObjectURL(url));
    } else {
      source = await createImageBitmap(file, { imageOrientation: "from-image", premultiplyAlpha: "none" });
    }
    // A huge picture comes down to a size the icon's own scaling then takes in a moment
    const most = Math.max(source.width, source.height), scale = Math.min(1, 1536 / most);
    const [width, height] = [source.width, source.height].map(side => Math.max(1, Math.round(side * scale)));
    if (scale < 1) {
      source = await createImageBitmap(source, { resizeWidth: width, resizeHeight: height, resizeQuality: "high" });
    }
    const canvas = made("canvas", "", { width, height });
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(source, 0, 0, width, height);
    return { width, height, rgba: context.getImageData(0, 0, width, height).data };
  };
  const iconFrom = async (cup, file) => {
    busy += 1;
    say(`reading ${file.name}...`);
    try {
      const art = iconArt(await pictureFile(file));
      if (!art) {
        throw new PatchError(`${file.name} has nothing to show.`);
      }
      cup.icon = await iconMade(iconBytes(art, true), art, true);
      ringed = cup;
      say("");
    } catch (error) {
      say(error instanceof PatchError ? error.message : `${file.name} can't be read as a picture.`, true);
    }
    busy -= 1;
    changed();
  };
  const imageDrag = e => [...e.dataTransfer.items]
    .some(item => item.kind === "file" && item.type.startsWith("image/"));
  // The game's own icon stays: a cup to stand for it, as the site shows no art of the game
  const gameIcon = () => {
    const icon = made("span", "", { className: "game" });
    icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v4a5 5 0 0 1-10 0z' +
      'M7 6H4v1a4 4 0 0 0 3.5 4M17 6h3v1a4 4 0 0 1-3.5 4M12 13v3M8.5 20h7l-1-4h-5z"/></svg>';
    return icon;
  };
  const thumb = (course, big = false) => {
    const frame = made("span", "", { className: `th${big ? " big" : ""}${course && course.picture ? "" : " none"}` });
    if (course && course.picture) {
      frame.append(made("img", "", { src: course.picture, alt: "", draggable: false }));
    }
    return frame;
  };

  // A course into a list at a place. A full cup gives the course at that place back to where this one came from
  const place = (course, to, at) => {
    const from = listOf(course), was = from.indexOf(course);
    from.splice(was, 1);
    at = Math.min(from === to && was < at ? at - 1 : at, to.length);
    if (cupOf(to) && to.length >= CUP_COURSES) {
      at = Math.min(at, to.length - 1);
      from.splice(was, 0, to[at]);
      to[at] = course;
    } else {
      to.splice(at, 0, course);
    }
    changed();
  };
  // A place up or down for the arrows: within its cup or the stages, then to the cup before or after
  const step = (course, by) => {
    const list = listOf(course), at = list.indexOf(course);
    const cup = pack.cups.indexOf(cupOf(list));
    if (list === pack.tray) {
      return pack.cups.find(one => one.courses.length < CUP_COURSES).courses;
    }
    if (at + by >= 0 && at + by < list.length) {
      return list;
    }
    return cup >= 0 && pack.cups[cup + by] ? pack.cups[cup + by].courses : null;
  };
  const move = (course, by) => {
    const list = listOf(course), to = step(course, by);
    if (to === list) {
      place(course, list, list.indexOf(course) + (by > 0 ? 2 : -1));
    } else {
      place(course, to, list === pack.tray || by < 0 ? to.length : 0);
    }
    page = cupOf(to) ? Math.floor(pack.cups.indexOf(cupOf(to)) / PAGE_CUPS) : page;
    showBoard();
    const again = box.querySelector(`[data-move="${all().indexOf(course)},${by}"]`);
    if (again && !again.disabled) {
      again.focus();
    }
  };

  // What a row says of its course: its console, name and maker, and for a race how long and how hard
  const fillRow = course => {
    const { name, author, console, length, difficulty } = course.texts;
    const pill = made("span", pillText(console), { className: `pill${console === NO_CONSOLE ? " fan" : ""}` });
    const title = made("span", "", { className: "name" });
    title.append(pill, name.trim() || course.info.title);
    const texts = made("span", "");
    texts.append(title, made("span", author.trim() ? `by ${author.trim()}` : "", { className: "by" }));
    const facts = made("span", "", { className: "facts" });
    facts.append(length ? shown(length) : "", made("br"), difficulty ? shown(difficulty) : "");
    course.row.querySelector(".texts").replaceChildren(...texts.childNodes);
    course.row.querySelector(".facts").replaceChildren(...facts.childNodes);
  };
  const drops = (el, takes, drop) => {
    el.ondragover = e => {
      if (dragged && takes(dragged)) {
        e.preventDefault();
        e.stopPropagation();
        el.classList.add("over");
      }
    };
    el.ondragleave = () => el.classList.remove("over");
    el.ondrop = e => {
      el.classList.remove("over");
      if (dragged && takes(dragged)) {
        e.preventDefault();
        e.stopPropagation();
        drop(dragged);
      }
    };
  };
  const courseRow = course => {
    const list = listOf(course);
    const row = course.row = made("div", "", { className: `course${course === picked ? " on" : ""}`, draggable: true,
                                               tabIndex: 0 });
    row.setAttribute("role", "button");
    row.setAttribute("aria-pressed", String(course === picked));
    const moves = made("span", "", { className: "move" });
    const arrows = list === pack.tray ? [[-1, "↑", "into a cup"]] : [[-1, "↑", "up"], [1, "↓", "down"]];
    for (const [by, arrow, word] of arrows) {
      const button = made("button", arrow, { type: "button", className: "quiet x", disabled: !step(course, by) });
      button.setAttribute("aria-label", `Move ${course.texts.name} ${word}`);
      button.dataset.move = `${all().indexOf(course)},${by}`;
      button.onclick = e => {
        e.stopPropagation();
        move(course, by);
      };
      moves.append(button);
    }
    row.append(made("span", "⋮⋮", { className: "grip" }), thumb(course), made("span", "", { className: "texts" }),
               made("span", "", { className: "facts" }), moves);
    fillRow(course);
    const pick = () => {
      picked = picked === course ? null : course;
      showBoard();
    };
    row.onclick = pick;
    row.onkeydown = e => {
      if (e.target === row && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        pick();
      }
    };
    row.ondragstart = e => {
      dragged = course;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", course.texts.name);
    };
    row.ondragend = () => { dragged = null; };
    drops(row, other => other !== course && other.info.stage === course.info.stage,
          other => place(other, list, list.indexOf(course)));
    return row;
  };
  const emptySlot = (list, stage) => {
    const slot = made("div", "Drop a course here", { className: "course empty" });
    drops(slot, other => other.info.stage === stage, other => place(other, list, list.length));
    return slot;
  };

  // The texts of the picked course to change, with its preview as the cup select shows it
  const field = (label, control) => {
    const wrap = made("label", label);
    wrap.append(control);
    return wrap;
  };
  const editor = course => {
    const edit = made("div", "", { className: "edit" });
    const retext = () => {
      fillRow(course);
      labels();
      showPicked();
      later();
    };
    const text = (key, hint) => {
      const input = made("input", "", { type: "text", maxLength: TEXT_MOST, value: course.texts[key],
                                        placeholder: hint });
      input.oninput = () => {
        course.texts[key] = input.value;
        retext();
      };
      return input;
    };
    const lab = made("div", "", { className: "lab" });
    const labels = () => {
      lab.replaceChildren(...["length", "difficulty"].map(key => {
        const label = made("span", course.texts[key]);
        label.prepend(made("b", course.texts[key] ? key : ""));
        return label;
      }));
    };
    const shot = made("div", "", { className: "shotwrap" });
    shot.append(thumb(course, true), lab);
    const consoles = made("select", "");
    consoles.append(made("option", "No console", { value: NO_CONSOLE }),
                    ...CONSOLES.slice(0, -1).map(pill => made("option", pillText(pill), { value: pill })));
    consoles.value = course.texts.console;
    consoles.onchange = () => {
      course.texts.console = consoles.value;
      retext();
    };
    const two = made("div", "", { className: "two" });
    two.append(field("Console", consoles), field("Made by", text("author", course.info.author)));
    edit.append(shot, field("Name", text("name", course.info.title)), two);
    // One of three, and none again with a click on the one that's on
    const choice = (key, words) => {
      const seg = made("div", "", { className: "seg" });
      seg.setAttribute("role", "group");
      seg.setAttribute("aria-label", shown(key));
      for (const word of words) {
        const button = made("button", shown(word), { type: "button" });
        button.setAttribute("aria-pressed", String(course.texts[key] === word));
        button.onclick = () => {
          course.texts[key] = course.texts[key] === word ? "" : word;
          seg.querySelectorAll("button").forEach(other => {
            other.setAttribute("aria-pressed", String(other === button && course.texts[key] === word));
          });
          retext();
        };
        seg.append(button);
      }
      const wrap = made("div", shown(key), { className: "field" });
      wrap.append(seg);
      return wrap;
    };
    if (!course.info.stage) {
      edit.append(choice("length", LENGTHS), choice("difficulty", DIFFICULTIES));
    }
    labels();
    const has = [course.info.music === "own" && "music", course.info.preview && "preview",
                 course.info.minimap && "minimap"].filter(Boolean);
    if (has.length) {
      edit.append(made("p", `● With its own ${listed(has)}.`, { className: "brings" }));
    }
    if (course.info.music === "wrong") {
      edit.append(made("p", "Its music can't play in the game. The game's own music plays instead.",
                       { className: "brings no" }));
    }
    const foot = made("div", "", { className: "foot" });
    const out = made("button", "Take out of the pack", { type: "button", className: "quiet" });
    out.onclick = () => {
      listOf(course).splice(listOf(course).indexOf(course), 1);
      changed();
    };
    foot.append(made("span", mb(course.blob.size)), out);
    edit.append(foot);
    return edit;
  };

  const showHead = () => {
    part("name-count").textContent = `${part("name").value.length} of ${CUP_TEXT_MOST}`;
    const stats = [];
    const stat = (number, text) => {
      const one = made("span", text);
      one.prepend(made("b", number));
      stats.push(one);
    };
    if (races().length) {
      const cups = pack.cups.filter(cup => cup.courses.length).length;
      stat(races().length, `${races().length === 1 ? "course" : "courses"} in ${count(cups, "cup", "cups")}`);
    }
    if (pack.stages.length) {
      stat(pack.stages.length, pack.stages.length === 1 ? "battle stage" : "battle stages");
    }
    if (filled()) {
      stat(mb(pakSize(pakWhole(files()))), "");
    }
    part("stats").replaceChildren(...(stats.length ? stats : [made("span", "No courses yet")]));
    const pages = pack.cups.length / PAGE_CUPS;
    const tabs = Array.from({ length: pages }, (_, i) => {
      const tab = made("button", pages > 1 ? `${pageName()} ${i + 1}` : pageName(), { type: "button" });
      tab.setAttribute("aria-pressed", String(i === page));
      tab.onclick = () => {
        page = i;
        showBoard();
      };
      // A course dropped on a page goes into its first cup with room
      const open = () => pack.cups.slice(i * PAGE_CUPS, (i + 1) * PAGE_CUPS)
        .find(cup => cup.courses.length < CUP_COURSES);
      drops(tab, other => !other.info.stage && open() && open().courses !== listOf(other), other => {
        page = i;
        place(other, open().courses, CUP_COURSES);
      });
      return tab;
    });
    if (pack.stages.length) {
      const tab = made("button", "Battle stages", { type: "button" });
      tab.onclick = () => part("battle").scrollIntoView({ behavior: "smooth", block: "nearest" });
      tabs.push(tab);
    }
    part("pages").replaceChildren(...tabs, made("small", "Four cups fill a page in the game."));
  };

  const cupBox = (cup, number) => {
    const el = made("div", "", { className: `cup${cup.courses.length % CUP_COURSES ? " short" : ""}` });
    const head = made("div", "", { className: "cup-head" });
    const name = made("input", "", { type: "text", maxLength: CUP_TEXT_MOST, value: cup.name,
                                     placeholder: `Cup ${number}` });
    name.setAttribute("aria-label", `Name of cup ${number}`);
    name.oninput = () => {
      cup.name = name.value;
      later();
    };
    // The icon: a picture dropped on the cup or picked with a click
    const icon = made("label", "", { className: `icon${cup.icon ? " own" : ""}`,
                                     title: "Drop a picture here or click for your own cup icon" });
    const input = made("input", "", { type: "file",
                                      accept: "image/png,image/jpeg,image/webp,image/gif,image/svg+xml" });
    input.setAttribute("aria-label", `Icon of cup ${number}`);
    input.onchange = () => {
      const [file] = input.files;
      input.value = "";
      if (file) {
        iconFrom(cup, file);
      }
    };
    icon.append(input, cup.icon ? made("img", "", { src: cup.icon.picture, alt: "", draggable: false }) : gameIcon(),
                made("b", "+", { ariaHidden: "true" }));
    el.ondragover = e => {
      if (!dragged && imageDrag(e)) {
        e.preventDefault();
        e.stopPropagation();
        el.classList.add("over");
      }
    };
    el.ondragleave = e => {
      if (!el.contains(e.relatedTarget)) {
        el.classList.remove("over");
      }
    };
    el.ondrop = e => {
      el.classList.remove("over");
      const file = [...e.dataTransfer.files].find(one => one.type.startsWith("image/"));
      if (!dragged && file) {
        e.preventDefault();
        e.stopPropagation();
        iconFrom(cup, file);
      }
    };
    head.append(icon, made("i", String(number)), name, made("small", `${cup.courses.length} of ${CUP_COURSES}`));
    if (cup.icon) {
      const tools = made("div", "", { className: "cup-tools" });
      if (cup.icon.art && cup.icon.art.clear) {
        const tick = made("input", "", { type: "checkbox", checked: cup.icon.outline });
        tick.onchange = async () => {
          const { art } = cup.icon;
          cup.icon = await iconMade(iconBytes(art, tick.checked), art, tick.checked);
          ringed = cup;
          changed();
        };
        const line = made("label", "Outline");
        line.prepend(tick);
        tools.append(line);
      }
      const reset = made("button", "Game's icon", { type: "button" });
      reset.onclick = () => {
        cup.icon = null;
        changed();
      };
      tools.append(reset);
      head.append(tools);
    }
    el.append(head);
    for (const course of cup.courses) {
      el.append(courseRow(course));
      if (course === picked && phone.matches) {
        el.append(editor(course));
      }
    }
    for (let slot = cup.courses.length; slot < CUP_COURSES; slot += 1) {
      el.append(emptySlot(cup.courses, false));
    }
    if (cup.courses.length % CUP_COURSES) {
      el.append(made("div", "Grand Prix needs four courses! Until then this cup is in Versus and Time Trials.", { className: "warn" }));
    }
    return el;
  };
  const showPicked = () => {
    const list = picked && listOf(picked);
    const where = !picked ? "" : list === pack.tray ? "Not in a cup yet"
      : list === pack.stages ? `Battle stage ${list.indexOf(picked) + 1}`
      : `${cupLabel(cupOf(list))}, course ${list.indexOf(picked) + 1}`;
    part("picked").hidden = !picked;
    part("picked").replaceChildren(picked ? picked.texts.name.trim() || picked.info.title : "",
                                   made("small", where));
  };
  // The page's cups as the cup select shows them, once one has its own icon: the picked one in its ring
  const showLook = cups => {
    const shown = cups.filter(cup => cup.courses.length || cup.icon);
    part("look").hidden = !shown.some(cup => cup.icon);
    const on = shown.includes(ringed) ? ringed : shown.find(cup => picked && cup.courses.includes(picked)) || shown[0];
    part("look-cups").replaceChildren(...shown.map(cup => {
      const one = made("button", "", { type: "button", className: `look-cup${cup === on ? " on" : ""}` });
      one.setAttribute("aria-label", cupLabel(cup));
      one.append(cup.icon ? made("img", "", { src: cup.icon.picture, alt: "" }) : gameIcon());
      one.onclick = () => {
        ringed = cup;
        showLook(cups);
      };
      return one;
    }));
    part("look-name").textContent = on ? cupLabel(on) : "";
  };
  // The cups of the page, the stages and what is in no cup yet
  const showBoard = () => {
    showHead();
    const cups = pack.cups.slice(page * PAGE_CUPS, (page + 1) * PAGE_CUPS);
    showLook(cups);
    part("cups").replaceChildren(...cups.map((cup, i) => cupBox(cup, page * PAGE_CUPS + i + 1)));
    part("battle").hidden = !pack.stages.length;
    const stagePages = [];
    for (let first = 0; first < pack.stages.length; first += PAGE_STAGES) {
      const stages = made("div", "", { className: "stages" });
      for (const stage of pack.stages.slice(first, first + PAGE_STAGES)) {
        stages.append(courseRow(stage), ...(stage === picked && phone.matches ? [editor(stage)] : []));
      }
      for (let slot = pack.stages.length; slot < first + PAGE_STAGES; slot += 1) {
        stages.append(emptySlot(pack.stages, true));
      }
      stagePages.push(stages);
    }
    part("stages").replaceChildren(...stagePages);
    showPicked();
    part("edit").replaceChildren(...(picked && !phone.matches ? [editor(picked)] : []));
    part("tray-count").textContent = pack.tray.length ? count(pack.tray.length, "course", "courses") : "";
    part("tray-head").hidden = !pack.tray.length && !pack.out.length;
    part("tray").replaceChildren(
      ...pack.tray.flatMap(course => [courseRow(course),
                                      ...(course === picked && phone.matches ? [editor(course)] : [])]),
      ...pack.out.map(zip => {
        const row = made("div", "", { className: "course bad" });
        const texts = made("span", "", { className: "texts" });
        texts.append(made("span", zip.name, { className: "name" }), made("span", zip.why, { className: "by" }));
        const gone = made("button", "×", { type: "button", className: "quiet x" });
        gone.setAttribute("aria-label", `Remove ${zip.name}`);
        gone.onclick = () => {
          pack.out = pack.out.filter(other => other !== zip);
          changed();
        };
        row.append(made("span", "", { className: "grip" }), thumb(null), texts, gone);
        return row;
      }));
    showBottom();
  };
  drops(part("tray-zone"), other => !other.info.stage && listOf(other) !== pack.tray,
        other => place(other, pack.tray, pack.tray.length));

  // The check list, the pack's code and whether it can be saved
  let codes = 0;
  function showBottom() {
    const lines = [];
    const line = (text, kind = "") => lines.push(made("div", text, { className: kind }));
    const used = pack.cups.filter(cup => cup.courses.length);
    const whole = used.filter(cup => cup.courses.length === CUP_COURSES).length;
    const short = used.filter(cup => cup.courses.length < CUP_COURSES).map(cupLabel);
    if (used.length) {
      line([whole ? `${count(whole, "cup is", "cups are")} ready for Grand Prix.` : "",
            short.length ? `${listed(short)} ${short.length === 1 ? "is" : "are"} in Versus and Time Trials.` : ""]
        .filter(Boolean).join(" "));
    }
    const joined = joinedCups();
    if (joined) {
      line(`${cupLabel(joined[0])} and ${cupLabel(joined[1])} have the same name, so the game makes one cup of ` +
           "them. Give each its own name!", "bad");
    }
    const many = races().length + pack.stages.length;
    if (many > COURSES_MOST) {
      line(`The game takes ${COURSES_MOST} courses, these are ${many}.`, "bad");
    } else if (filled()) {
      const size = pakSize(pakWhole(files()));
      line(`${mb(size)}.` + (!room ? "" : size <= room.disc - room.retro ? " Fits on the disc beside the Retro Pack!"
        : size <= room.disc ? " Fits on the disc without the Retro Pack."
        : " Too big for the disc, so it goes on your SD card!"));
    }
    const long = filled() && files()[0].blob.size >= PACK_INI_MOST;
    if (long) {
      line("The pack has more names and texts than the game reads. Take a few courses out!", "bad");
    }
    if (pack.tray.length) {
      line(`${count(pack.tray.length, "course is", "courses are")} not in a cup yet and ` +
           `${pack.tray.length === 1 ? "stays" : "stay"} out of the pack.`, "wait");
    }
    if (pack.out.length) {
      line(`${listed(pack.out.map(zip => zip.name))} ${pack.out.length === 1 ? "stays" : "stay"} out of the pack.`,
           "bad");
    }
    part("checks").replaceChildren(...lines);
    const can = filled() && !joined && !long && many <= COURSES_MOST && !busy;
    part("save").disabled = part("hand").disabled = !can;
    part("code").hidden = !can;
    if (can) {
      const mine = codes += 1;
      packCode(files()).then(code => {
        if (mine === codes) {
          part("code").replaceChildren("Pack code ", made("b", code));
        }
      });
    }
  }
  // After a text changed: the rows stay as they are, so the text keeps its cursor
  function later() {
    dirty = true;
    if (!busy) {
      say("");
    }
    showHead();
    showBottom();
  }
  function changed() {
    later();
    render();
  }
  function render() {
    tidy();
    const empty = !all().length && !pack.out.length;
    part("start").hidden = !empty;
    part("work").hidden = part("bottom").hidden = empty;
    if (part("name").value !== pack.name) {
      part("name").value = pack.name;
    }
    if (part("version").value !== pack.version) {
      part("version").value = pack.version;
    }
    if (empty) {
      showHead();
      part("ghost").replaceChildren(...pack.cups.slice(0, PAGE_CUPS).map((cup, i) => cupBox(cup, i + 1)));
    } else {
      showBoard();
    }
  }

  // Course ZIPs into the pack: a stage among the stages, a race course to wait for its cup
  const add = async zips => {
    busy += 1;
    showBottom();
    let wrong = "";
    for (const blob of zips) {
      try {
        say(`reading ${blob.name}...`);
        const course = await courseFile(blob, info => say(`packing the music of ${info.name}...`));
        const twice = all().find(other => sameName(other.name, course.name) || other.info.key === course.info.key);
        if (twice) {
          throw new PatchError(`${blob.name} is in the pack already${
            sameName(twice.name, course.name) ? "" : `, as ${twice.texts.name}`}.`);
        }
        course.picture = await pictureOf(course.blob);
        (course.info.stage ? pack.stages : pack.tray).push(course);
      } catch (error) {
        if (error.why) {
          pack.out = [...pack.out.filter(zip => zip.file !== blob.name),
                      { file: blob.name, name: error.subject, why: `${shown(error.why)}.` }];
        } else {
          wrong = error instanceof PatchError ? error.message : `${blob.name} can't be read.`;
        }
      }
      render();
    }
    busy -= 1;
    changed();
    say(wrong, true);
  };
  // A pack someone saved, in the place of this one. One from the site's storage is read whole, as that file may go
  const open = async (blob, stored = false) => {
    busy += 1;
    say(`opening ${stored ? "your pack" : blob.name}...`);
    try {
      const found = await packOf(await pakFiles(blob), blob.name);
      const courses = [...found.cups.flatMap(cup => cup.courses), ...found.stages, ...found.loose];
      for (const course of courses) {
        course.blob = stored ? new Blob([await course.blob.arrayBuffer()]) : course.blob;
        course.picture = await pictureOf(course.blob);
      }
      // Its icons stay as they are
      for (const cup of found.cups.filter(one => one.icon)) {
        cup.icon = { ...cup.icon, picture: iconShown(cup.icon.bytes), art: null, outline: null };
      }
      pack = { name: found.name.slice(0, CUP_TEXT_MOST), version: found.version,
               cups: found.cups.map(cup => ({ ...cup, name: cup.name.slice(0, CUP_TEXT_MOST) })),
               stages: [...found.stages, ...found.loose.filter(course => course.info.stage)],
               tray: found.loose.filter(course => !course.info.stage),
               out: found.out.map(error => ({ name: error.subject, why: `${shown(error.why)}.` })) };
      picked = ringed = null;
      page = 0;
      dirty = false;
      say("");
    } catch (error) {
      say(error instanceof PatchError ? error.message : `${blob.name} can't be read.`, true);
    }
    busy -= 1;
    render();
  };
  const take = picks => {
    const paks = picks.filter(file => file.name.toLowerCase().endsWith(".pak"));
    if (paks.length && (!all().length || confirm("Open this pack? You lose the one you're making."))) {
      return open(paks[0]);
    }
    return add(picks.filter(isZip));
  };

  pack = fresh();
  part("name").oninput = () => {
    pack.name = part("name").value;
    later();
  };
  // Digits and dots only, as the game takes them; an empty one saves as 1.0
  part("version").oninput = () => {
    part("version").value = part("version").value.replace(/[^0-9.]/g, "");
    pack.version = part("version").value;
    later();
  };
  box.querySelectorAll("input[type=file]").forEach(input => {
    input.onchange = () => {
      const picks = [...input.files];
      input.value = "";
      take(picks);
    };
  });
  box.querySelectorAll("[data-m=open]").forEach(button => { button.onclick = () => part("pak").click(); });
  part("new").onclick = () => {
    if (!all().length || !dirty || confirm("Start a new pack? You lose the one you're making.")) {
      pack = fresh();
      say("");
      render();
      dirty = false;
    }
  };
  // Files dropped anywhere on the box
  box.ondragover = e => {
    if (!dragged && e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      box.classList.add("drag");
    }
  };
  box.ondragleave = e => {
    if (!box.contains(e.relatedTarget)) {
      box.classList.remove("drag");
    }
  };
  box.ondrop = e => {
    box.classList.remove("drag");
    if (!dragged && e.dataTransfer.files.length) {
      e.preventDefault();
      take([...e.dataTransfer.files]);
    }
  };
  phone.onchange = render;
  window.onbeforeunload = e => {
    if (dirty && all().length) {
      e.preventDefault();
    }
  };

  const saveName = () => `${pack.name.replace(/[^A-Za-z0-9 _-]/g, "").trim() || "pack"}.pak`;
  part("save").onclick = () => {
    const link = made("a", "", { href: URL.createObjectURL(pakOf()), download: saveName() });
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 60000);
    dirty = false;
  };
  // To the patcher: the pack waits in the site's storage, where start.html finds it
  part("hand").onclick = async () => {
    busy += 1;
    showBottom();
    say("handing your pack to the Ultra Patcher...");
    try {
      const writable = await (await opfs.getFileHandle(MAKER_PAK, { create: true })).createWritable();
      await writable.write(pakOf());
      await writable.close();
      dirty = false;
      location.href = "start.html#patcher";
    } catch {
      if (opfs) {
        await opfs.removeEntry(MAKER_PAK).catch(() => {});
      }
      say("This browser can't hand your pack to the Ultra Patcher. Save the pack and drop it in there!", true);
    }
    busy -= 1;
    showBottom();
  };

  render();
  // What the patcher sent here: the pack to change, or course ZIPs for a new one
  if (opfs && location.hash === "#change") {
    const handed = await opfs.getFileHandle(MAKER_PAK).then(handle => handle.getFile()).catch(() => null);
    if (handed) {
      await open(handed, true);
    }
  } else if (opfs && location.hash === "#zips") {
    history.replaceState(null, "", location.pathname);
    const zips = [];
    try {
      const folder = await opfs.getDirectoryHandle(MAKER_ZIPS);
      for await (const handle of folder.values()) {
        const file = await handle.getFile();
        zips.push(new File([await file.arrayBuffer()], file.name));
      }
    } catch {
      // nothing there
    }
    await opfs.removeEntry(MAKER_ZIPS, { recursive: true }).catch(() => {});
    add(zips);
  }
})();
