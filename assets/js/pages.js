/* Cha/Té inner pages: fill lists from content.js, in the chosen language. */
(function () {
  const C = window.CHATE, L = window.CHATE_LOGO;
  const $ = (s) => document.querySelector(s);
  const mailto = (key) => `mailto:${C.contact.email}?subject=${encodeURIComponent(T(key))}`;

  // a faint ink ensō behind every page title
  const wash = $("#wash");
  if (wash) { wash.setAttribute("viewBox", L.viewBox); wash.innerHTML = `<path d="${L.stroke}"/>`; }

  window.onLang((lang) => {
    document.querySelectorAll("[data-mail]").forEach((a) => (a.href = mailto(a.dataset.mail)));
    document.querySelectorAll("[data-insta]").forEach((a) => { a.href = C.contact.instagram; a.target = "_blank"; a.rel = "noopener"; });
    document.querySelectorAll("[data-addr]").forEach((el) => (el.textContent = C.contact.address));
    document.querySelectorAll("[data-maps]").forEach((a) => (a.href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(C.contact.address)));

    const cards = (el, items) => {
      if (!el) return;
      const ph = (el.dataset.photos || "").split(" ").filter(Boolean);
      el.innerHTML = items.map((w, i) => `<div class="card${ph[i] ? " has-ph" : ""}">${ph[i] ? `<figure class="ph"><img src="assets/img/${ph[i]}" alt="" loading="lazy" decoding="async"></figure>` : ""}<h3>${w.title}</h3><p>${w.text}</p></div>`).join("");
    };
    cards($("#ways"), T("menu.ways") || []);
    cards($("#offer"), T("partners.offer") || []);

    const story = $("#about-story");
    if (story) story.innerHTML = T("about.story").map((p) => `<p>${p}</p>`).join("");

    const hours = $("#hours");
    if (hours) hours.innerHTML = T("booking.hours").map((h) => `<div><dt>${h.when}</dt><dd>${h.what}</dd></div>`).join("");

    const book = $("#book-online");
    if (book && C.contact.bookingUrl) {
      book.href = C.contact.bookingUrl; book.removeAttribute("aria-disabled"); book.target = "_blank"; book.rel = "noopener";
      $("#book-soon").hidden = true;
    }

    const name = (c) => (lang === "fr" ? C.places[c].fr : c);
    const team = $("#team");
    if (team) team.innerHTML = `<ul>${C.team.map((p) =>
      `<li><b>${p.name}${p.role ? `<small>${p.role[lang] || p.role.en}</small>` : ""}</b><span>${p.from.map(name).join(", ")}${p.heritage ? ` · ${T("about.heritage")}${lang === "fr" ? " : " : ": "}${p.heritage.map(name).join(", ")}` : ""}</span></li>`).join("")}</ul>`;

    const map = $("#dotmap");
    if (map) {
      map.querySelectorAll(".pin").forEach((p) => p.remove());
      const nat = new Set(), her = new Set();
      C.team.forEach((p) => { p.from.forEach((c) => nat.add(c)); (p.heritage || []).forEach((c) => her.add(c)); });
      [...nat, ...[...her].filter((c) => !nat.has(c))].forEach((c) => {
        const [lon, lat] = C.places[c].at;
        const el = document.createElement("div");
        el.className = "pin" + (nat.has(c) ? "" : " her") + (C.places[c].label ? " l-" + C.places[c].label : "");
        el.style.left = ((lon + 180) / 360) * 100 + "%";
        el.style.top = ((80 - lat) / 140) * 100 + "%";
        el.innerHTML = `<i></i><span>${name(c)}</span>`;
        map.append(el);
      });
    }
  });
})();
