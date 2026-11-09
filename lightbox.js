// Every screenshot on the page of a game opens big when clicked: the ones in figures, the title screen and the
// screenshot in the Ultra menu's panel (ultra-menu.js makes those later, so clicks are caught on the document). Esc, a
// click or Backspace closes it.
(() => {
  const box = document.createElement("dialog");
  box.className = "lightbox";
  box.innerHTML = '<img alt=""><p></p>';
  document.body.append(box);
  const [image, caption] = box.children;
  const style = document.createElement("style");
  style.textContent = `
    .lightbox { border: 0; padding: 0; background: none; max-width: 100vw; max-height: 100vh; outline: none; }
    .lightbox::backdrop { background: #0a1030ee; }
    .lightbox img { display: block; max-width: calc(100vw - 32px); max-height: calc(100vh - 64px); margin: 0 auto; border-radius: 8px; cursor: zoom-out; }
    .lightbox p { margin: 8px 0 0; text-align: center; color: #a9b4d2; font: 14px/1.4 "Segoe UI", system-ui, sans-serif; }
    figure img, .hero .shot, .um-detail img { cursor: zoom-in; }
    .real a { cursor: zoom-in; }`;
  document.head.append(style);

  document.addEventListener("click", event => {
    const target = event.target.closest("figure img, .hero .shot, .um-detail img");
    if (!target || target.closest(".skin-group")) {
      return;
    }
    event.preventDefault();  // the figure of the real menu links to its picture
    image.src = target.currentSrc || target.src;
    image.alt = target.alt;
    caption.textContent = target.alt;
    box.showModal();
  });
  box.addEventListener("click", () => box.close());
  box.addEventListener("keydown", event => {
    if (event.key === "Backspace") {
      box.close();
    }
  });
})();
