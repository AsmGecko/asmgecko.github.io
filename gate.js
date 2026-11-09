// The code of the first screen: no page shows before it, and the patcher puts it in the key of the patch. Loaded in
// the head, before the body
(() => {
  const CODE = "a2fd21f19fd5af3dee24833fb6e5d8fe7513456c6a5b5fd0f0953ca14443debe";  // SHA-256 of ultra: and the code
  const code = () => decodeURIComponent((document.cookie.match(/(?:^|; )ultra_pin=([^;]*)/) || [])[1] || "");
  globalThis.ultraCode = code;

  const hide = document.createElement("style");
  hide.textContent = "body > :not(#gate) { display: none !important; }";
  document.head.append(hide);

  const right = async text => {
    if (!globalThis.crypto || !crypto.subtle) {
      return false;
    }
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`ultra:${text}`));
    return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, "0")).join("") === CODE;
  };

  const ask = () => {
    const gate = document.createElement("div");
    gate.id = "gate";
    gate.innerHTML = `<style>
#gate { --bg: #0b1430; --surface: #121f48; --ink: #f1f4fc; --muted: #a9b4d2; --line: #26387a; --gold: #ffcf3a;
  --gold-deep: #ff9a00; --red: #ff6b6b; --display: "Arial Rounded MT Bold", "Trebuchet MS", "Segoe UI Black", sans-serif;
  position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 16px; background: var(--bg);
  color: var(--ink); font: 17px "Segoe UI", system-ui, -apple-system, sans-serif; color-scheme: dark; }
@media (prefers-color-scheme: light) {
  #gate { --bg: #eef2fa; --surface: #ffffff; --ink: #14203f; --muted: #56617d; --line: #d4dbeb; --gold: #b98200;
    --red: #c0392b; color-scheme: light; }
}
#gate * { box-sizing: border-box; }
#gate form { width: min(360px, 100%); background: var(--surface); border: 1px solid var(--line); border-radius: 16px;
  padding: 28px 24px; text-align: center; }
#gate h1 { font-family: var(--display); font-weight: 800; font-size: 40px; line-height: 1; margin: 0 0 8px; }
#gate h1 span { background: linear-gradient(180deg, #fff7a0, var(--gold) 45%, var(--gold-deep)); -webkit-background-clip: text;
  background-clip: text; color: transparent; }
@media (prefers-color-scheme: light) { #gate h1 span { background: none; color: var(--gold); } }
#gate p { margin: 0 0 18px; color: var(--muted); }
#gate input { width: 100%; font: 20px var(--display); letter-spacing: 0.05em; text-align: center; padding: 10px;
  border-radius: 10px; border: 2px solid var(--line); background: var(--bg); color: var(--ink); }
#gate input:focus { outline: none; border-color: var(--gold); }
#gate button { margin-top: 14px; width: 100%; font: 18px var(--display); padding: 12px; border: 0; border-radius: 999px;
  background: var(--gold); color: #0b1430; cursor: pointer; }
#gate .wrong { color: var(--red); margin: 12px 0 0; }
#gate .wrong[hidden] { display: none; }
</style>
<form>
  <h1><span>Ultra</span></h1>
  <p>Are you a friend?</p>
  <input name="code" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Code">
  <button>Let me in</button>
  <p class="wrong" hidden>That's not the code.</p>
</form>`;
    document.body.append(gate);
    const form = gate.querySelector("form");
    form.code.focus();
    form.onsubmit = async e => {
      e.preventDefault();
      const text = form.code.value.trim();
      if (await right(text)) {
        const secure = location.protocol === "https:" ? "; Secure" : "";
        document.cookie = `ultra_pin=${encodeURIComponent(text)}; path=/; max-age=31536000; SameSite=Lax${secure}`;
        gate.remove();
        hide.remove();
      } else {
        gate.querySelector(".wrong").hidden = false;
        form.code.select();
      }
    };
  };

  right(code()).then(open => {
    if (open) {
      hide.remove();
    } else if (document.body) {
      ask();
    } else {
      document.addEventListener("DOMContentLoaded", ask);
    }
  });
})();
