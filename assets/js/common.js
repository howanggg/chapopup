/* Cha/Té: header, footer and the English/French switch, shared by every page. */
(function () {
  const C = window.CHATE, L = window.CHATE_LOGO;
  const KEY = "chate-lang";
  const listeners = [];

  function initialLang() {
    const q = new URLSearchParams(location.search).get("lang");
    if (q === "fr" || q === "en") return q;
    try { const s = localStorage.getItem(KEY); if (s === "fr" || s === "en") return s; } catch (e) {}
    return (navigator.language || "").toLowerCase().startsWith("fr") ? "fr" : "en";
  }
  let lang = initialLang();

  const get = (path, l = lang) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), C[l]);
  window.T = (path) => get(path);
  window.LANG = () => lang;
  window.onLang = (fn) => { listeners.push(fn); fn(lang); };

  const markSVG = (cls = "") =>
    `<svg class="${cls}" viewBox="${L.viewBox}" aria-hidden="true"><path d="${L.cup}"/><path d="${L.stroke}"/></svg>`;
  const fullLogoSVG = (cls = "") =>
    `<svg class="${cls}" viewBox="${L.viewBox}" role="img" aria-label="Cha/Té"><path d="${L.cup}"/><path d="${L.stroke}"/><path d="${L.word}"/><path d="${L.tag}"/></svg>`;
  window.CHATE_SVG = { markSVG, fullLogoSVG };

  const here = ((location.pathname.split("/").pop() || "index").replace(/\?.*/, "").replace(/\.html$/, "") || "index") + ".html";

  /* Clean addresses on the live site: chapopup.fr, chapopup.fr/about ... (no ".html").
     Only on chapopup.fr, so local previews keep working with plain files. */
  if (/(^|\.)chapopup\.fr$/.test(location.hostname)) {
    const clean = (path) => path.replace(/(^|\/)index\.html$/, "$1").replace(/\.html$/, "");
    if (/\.html$/.test(location.pathname))
      history.replaceState(null, "", clean(location.pathname) + location.search + location.hash);
    document.addEventListener("click", (e) => {
      const a = e.target.closest && e.target.closest("a[href]");
      if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || a.target) return;
      const u = new URL(a.getAttribute("href"), location.href);
      if (u.origin !== location.origin || !/\.html$/.test(u.pathname)) return;
      e.preventDefault();
      location.href = clean(u.pathname) + u.search + u.hash;
    });
  }
  const pages = [["index.html", "home"], ["about.html", "about"], ["menu.html", "menu"], ["booking.html", "book"], ["partners.html", "partners"]];
  const globeIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9.2"/><path d="M2.8 12h18.4M12 2.8c2.6 2.6 3.9 5.6 3.9 9.2s-1.3 6.6-3.9 9.2M12 2.8C9.4 5.4 8.1 8.4 8.1 12s1.3 6.6 3.9 9.2"/></svg>`;

  function buildHeader() {
    const h = document.createElement("header");
    h.className = "site-top";
    h.innerHTML = `<div class="bar">
      <a class="brand" href="./">${markSVG()}<span>CHA / TÉ</span></a>
      <div class="top-right">
        <nav class="nav" id="site-nav" aria-label="Main">${pages.slice(1).map(([href, k]) =>
          `<a href="${href}" data-t="nav.${k}"${href === here ? ' aria-current="page"' : ""}></a>`).join("")}</nav>
        <button class="lang" type="button" data-lang-btn>${globeIcon}<span data-t="nav.langShort"></span><span class="sr-only" data-t="nav.lang"></span></button>
        <button class="menu-btn" type="button" aria-controls="site-nav" aria-expanded="false" aria-label="Menu">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 7h18M3 12h18M3 17h18"/></svg></button>
      </div></div>`;
    document.body.prepend(h);
    const btn = h.querySelector(".menu-btn"), nav = h.querySelector(".nav");
    btn.addEventListener("click", () => {
      const o = nav.classList.toggle("open");
      btn.setAttribute("aria-expanded", o);
    });
    h.querySelector("[data-lang-btn]").addEventListener("click", () => setLang(lang === "en" ? "fr" : "en"));
    // solid background once the page has scrolled (inner pages); home controls on-dark itself
    const onScroll = () => h.classList.toggle("solid", window.scrollY > 40 && !document.body.dataset.noSolid);
    addEventListener("scroll", onScroll, { passive: true }); onScroll();
    return h;
  }

  function buildFooter() {
    const c = C.contact;
    const f = document.createElement("footer");
    f.className = "site-foot";
    f.innerHTML = `<div class="wrap"><div class="grid">
      <div>${fullLogoSVG("logo")}<p data-t="footer.line"></p><p style="margin-top:.6rem" data-t="footer.when"></p></div>
      <div><h3 data-t="footer.write"></h3><p><a href="mailto:${c.email}">${c.email}</a></p>
        <p style="margin-top:.8rem">${c.address}</p></div>
      <div><h3 data-t="footer.follow"></h3><p><a href="${c.instagram}" target="_blank" rel="noopener">Instagram ${c.instagramHandle}</a></p></div>
    </div><p class="fine" data-t="footer.note"></p></div>`;
    document.body.append(f);
  }

  function apply() {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-t]").forEach((el) => {
      const v = get(el.dataset.t);
      if (typeof v === "string") el.innerHTML = v;
    });
    document.querySelectorAll("[data-t-aria]").forEach((el) => el.setAttribute("aria-label", get(el.dataset.tAria) || ""));
    listeners.forEach((fn) => fn(lang));
  }
  function setLang(l) {
    lang = l;
    try { localStorage.setItem(KEY, l); } catch (e) {}
    apply();
  }

  window.CHATE_TOP = buildHeader();
  buildFooter();
  apply();
})();
