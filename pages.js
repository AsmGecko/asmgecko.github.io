// The tabs on top of a game's pages: links between the page of the game and its patcher, and on the patcher's page
// the panel named in the address (#courses). Your own courses only shows with ?courses for now.
(() => {
  const courses = new URLSearchParams(location.search).has("courses");
  const tabs = [...document.querySelectorAll(".pages a")];
  const panels = [...document.querySelectorAll("[data-panel]")];
  tabs.forEach(tab => {
    tab.hidden = "courses" in tab.dataset && !courses;
    if (courses && tab.hash) {
      tab.search = "?courses";
    }
  });
  if (!panels.length) {
    return;
  }
  const open = () => {
    const wanted = location.hash.slice(1);
    const name = panels.some(panel => panel.dataset.panel === wanted) && (wanted !== "courses" || courses) ? wanted
      : panels[0].dataset.panel;
    panels.forEach(panel => { panel.hidden = panel.dataset.panel !== name; });
    tabs.forEach(tab => {
      if (tab.hash) {
        tab.toggleAttribute("aria-current", tab.hash === `#${name}`);
      }
    });
  };
  addEventListener("hashchange", open);
  open();
})();
