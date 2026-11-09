// The Ultra menu of a game as a page you can try: L and R turn the pages, the arrows step a row. The look is the
// page's own CSS; this only fills the [data-um] parts of root. A row is {name, values, about or abouts (the line the game
// shows, one per value), text or texts (the longer story of the site), icon or icons (per value), shot or shots (per
// value), stock (the value of a new save), start (what the page shows first), fixed (above the list, the game mode),
// counts (a count, which stops at its ends instead of going round), colors (per value, the top and bottom of its letters),
// summary (its name in the line of what's on, as the game has it, where its name alone doesn't say which page)}.
function ultraMenu(root, { pages, img = "", icons = "", alts = {}, resets = [], phone = "(max-width: 760px)" }) {
  const part = name => root.querySelector(`[data-um=${name}]`);
  const state = new Map();
  const all = pages.flatMap(p => p.rows);
  all.forEach(r => state.set(r, r.start ?? r.stock ?? 0));
  let page = 0, chosen = 0;
  const small = matchMedia(phone);
  // The rows that show their story under them on a phone, the first one to start with
  const open = new Set([all[0]]);

  const value = r => r.values[state.get(r)];
  const about = r => (r.abouts ? r.abouts[state.get(r)] : r.about);
  const text = r => (r.texts ? r.texts[state.get(r)] : r.text);
  const shot = r => (r.shots && r.shots[value(r)]) || r.shot;
  const icon = r => (r.icons ? r.icons[state.get(r)] : r.icon);
  const kind = v => (v === "on" ? " v-on" : v === "off" ? " v-off" : "");

  function turn(by) {
    page = (page + by + pages.length) % pages.length;
    chosen = 0;
    render();
    const tabs = part("tabs");
    if (tabs) {
      const tab = tabs.children[page];
      tabs.scrollLeft = tab.offsetLeft - (tabs.clientWidth - tab.clientWidth) / 2;
    }
  }

  function step(r, by) {
    const n = r.values.length, next = state.get(r) + by;
    state.set(r, r.counts ? Math.min(Math.max(next, 0), n - 1) : (next + n) % n);
    render();
  }

  // Beside the menu: the screenshot (or a card with the icon), the name, the story and every value. Under an open row
  // on a phone: the screenshot when there is one and the story, the arrows show the values there
  function detail(r, full) {
    const el = document.createElement("div");
    el.className = "um-detail";
    const picture = shot(r);
    if (picture) {
      const image = new Image();
      image.src = img + picture;
      image.alt = alts[picture] || "";
      el.append(image);
    } else if (full) {
      const card = document.createElement("div");
      card.className = "um-card";
      card.innerHTML = `${r.icon ? `<img src="${icons + icon(r)}" alt="">` : ""}<span></span>`;
      card.querySelector("span").textContent = r.fixed || r.texts ? value(r) : r.name;
      el.append(card);
    }
    if (full) {
      const h = document.createElement("h3");
      h.textContent = r.fixed || r.texts ? `${r.name}: ${value(r)}` : r.name;
      el.append(h);
    }
    const story = document.createElement("p");
    story.className = "um-text";
    story.textContent = text(r) || "";
    el.append(story);
    if (full) {
      const values = document.createElement("p");
      values.className = "um-values";
      values.textContent = r.values.join(" · ");
      el.append(values);
    }
    return el;
  }

  // A row with colors shows each value in its own, from the top of the letters to the bottom
  function tint(r) {
    const c = r.colors && r.colors[state.get(r)];
    return c ? ` style="--top: ${c[0]}; --bottom: ${c[1]}"` : "";
  }

  function row(r, i) {
    const el = document.createElement("div");
    const v = value(r);
    const end = by => (r.counts && state.get(r) === (by < 0 ? 0 : r.values.length - 1) ? " um-end" : "");
    el.className = "um-row" + (r.fixed ? " um-fixed" : "") + (i === chosen ? " um-on" : "");
    el.innerHTML = (r.icon ? `<img class="um-icon" src="${icons + icon(r)}" alt="">` : "")
      + `<span class="um-name">${r.name}</span>`
      + `<span class="um-value"><button class="um-arrow${end(-1)}" data-by="-1" aria-label="Previous value">◀</button>`
      + `<span class="um-pill${state.get(r) !== (r.stock || 0) ? " um-set" : ""}${kind(v)}"${tint(r)}>${v}</span>`
      + `<button class="um-arrow${end(1)}" data-by="1" aria-label="Next value">▶</button></span>`;
    el.onmouseenter = () => {
      if (!small.matches && chosen !== i) {
        chosen = i;
        render();
      }
    };
    el.onclick = e => {
      const pill = !small.matches && e.target.classList.contains("um-pill") && chosen === i;
      const by = Number(e.target.dataset.by || (pill ? 1 : 0));
      chosen = i;
      if (by) {
        step(r, by);
      } else {
        // On a phone a tap opens the story under a row and the next one closes it
        if (small.matches && !open.delete(r)) {
          open.add(r);
        }
        render();
      }
    };
    return el;
  }

  function render() {
    const p = pages[page];
    const tabs = part("tabs");
    if (tabs) {
      tabs.replaceChildren(...pages.map((q, i) => {
        const b = document.createElement("button");
        b.className = "um-tab";
        b.textContent = q.name;
        b.setAttribute("aria-selected", i === page);
        b.onclick = () => turn(i - page);
        return b;
      }));
    }
    if (part("header")) {
      part("header").textContent = p.header || p.name;
    }
    const fixed = part("fixed");
    const list = part("rows");
    list.innerHTML = "";
    p.rows.forEach((r, i) => {
      if (r.fixed && fixed) {
        return;
      }
      list.append(row(r, i));
      if (open.has(r) && small.matches) {
        list.append(detail(r));
      }
    });
    if (fixed) {
      fixed.innerHTML = "";
      const top = p.rows[0];
      if (top.fixed) {
        fixed.append(row(top, 0));
        const a = document.createElement("p");
        a.className = "um-fixed-about";
        a.textContent = about(top);
        fixed.append(a);
        if (open.has(top) && small.matches) {
          fixed.append(detail(top));
        }
      }
      fixed.hidden = !top.fixed;
      fixed.classList.toggle("um-on", chosen === 0);
    }
    const r = p.rows[chosen];
    // The game mode has its own line under it, so the bottom says what the row is for
    part("about").textContent = r.fixed && fixed ? r.about : about(r);
    const panel = part("panel");
    if (panel) {
      panel.replaceChildren(detail(r, true));
    }
    const summary = part("summary");
    if (summary) {
      const on = all.filter(q => (!resets.length || resets.some(x => x.rows.includes(q))) && state.get(q) !== (q.stock || 0));
      const label = q => q.summary ?? q.name;
      summary.textContent = on.length
        ? on.map(q => (q.fixed ? value(q) : q.values.length === 2 ? label(q) : `${label(q)} ${value(q)}`)).join(" · ")
        : "Everything as Nintendo made it";
    }
  }

  part("prev").onclick = () => turn(-1);
  part("next").onclick = () => turn(1);
  const reset = part("reset");
  if (reset) {
    reset.onclick = () => {
      resets.forEach(p => p.rows.forEach(r => state.set(r, r.stock || 0)));
      render();
    };
  }
  root.tabIndex = 0;
  root.addEventListener("keydown", e => {
    const rows = pages[page].rows;
    const keys = {
      ArrowDown: () => { chosen = (chosen + 1) % rows.length; render(); },
      ArrowUp: () => { chosen = (chosen + rows.length - 1) % rows.length; render(); },
      ArrowLeft: () => step(rows[chosen], -1),
      ArrowRight: () => step(rows[chosen], 1),
      l: () => turn(-1),
      r: () => turn(1),
      x: () => reset && reset.click(),
    };
    const key = keys[e.key.length === 1 ? e.key.toLowerCase() : e.key];
    if (key && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      key();
    }
  });
  small.addEventListener("change", render);
  render();
}
