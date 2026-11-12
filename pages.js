// The tabs on top of a game's pages: links between the page of the game and its patcher. On the patcher's page the
// address (#courses) says which panel shows.
(() => {
  const tabs = [...document.querySelectorAll(".pages > a")];
  const panels = [...document.querySelectorAll("[data-panel]")];
  const show = () => {
    const wanted = location.hash.slice(1);
    const name = panels.some(panel => panel.dataset.panel === wanted) ? wanted : panels[0].dataset.panel;
    panels.forEach(panel => { panel.hidden = panel.dataset.panel !== name; });
    tabs.forEach(tab => {
      if (tab.hash) {
        tab.toggleAttribute("aria-current", tab.hash === `#${name}`);
      }
    });
  };
  if (panels.length) {
    addEventListener("hashchange", show);
    show();
  }
})();
