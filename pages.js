// The tabs on top of a game's pages, as the game's own course select has them: links between the page of the game
// and its patcher, with L and R to the tab before and after. On the patcher's page the address (#courses) says which
// panel shows.
(() => {
  const tabs = [...document.querySelectorAll(".pages .tab")];
  const panels = [...document.querySelectorAll("[data-panel]")];
  const show = () => {
    const wanted = location.hash.slice(1);
    const name = panels.some(panel => panel.dataset.panel === wanted) ? wanted : panels.length && panels[0].dataset.panel;
    panels.forEach(panel => { panel.hidden = panel.dataset.panel !== name; });
    tabs.forEach(tab => {
      if (panels.length && tab.hash) {
        tab.toggleAttribute("aria-current", tab.hash === `#${name}`);
      }
    });
    const at = tabs.findIndex(tab => tab.hasAttribute("aria-current"));
    document.querySelectorAll(".pages .key").forEach(key => {
      key.href = tabs[(at + Number(key.dataset.by) + tabs.length) % tabs.length].href;
    });
  };
  addEventListener("hashchange", show);
  show();
})();
