/* Cha/Té home: one pinned stage. Scrolling moves a single eased timeline:
   the ink logo is drawn, the camera moves in on its cup, the paper becomes an ink painting
   of the tea room, the painting soaks into the real photograph, the camera pulls back.
   Clicking the teapot (or the gold button) plays a short film of the tea being poured. */
(function () {
  const L = window.CHATE_LOGO;
  document.body.dataset.noSolid = "1";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s) => document.querySelector(s);
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const map = (v, a, b) => clamp((v - a) / (b - a));
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------------- logo parts ---------------- */
  const svg = $("#hero-logo"), washSvg = $("#logo-wash");
  svg.setAttribute("viewBox", L.viewBox);
  washSvg.setAttribute("viewBox", L.viewBox);
  $("#p-cup").setAttribute("d", L.cup);
  $("#p-stroke").setAttribute("d", L.stroke);
  $("#p-wash").setAttribute("d", L.stroke);
  $("#p-halo").setAttribute("d", L.stroke);
  const halo = $("#p-halo"), puffEl = $("#logo-puff");
  $("#p-word").setAttribute("d", L.word);
  $("#p-tag").setAttribute("d", L.tag);
  const maskPath = $("#mask-path");
  maskPath.setAttribute("d", L.center);
  const centerLen = maskPath.getTotalLength();
  const wordWipe = $("#word-wipe");
  const strokeG = $("#logo-stroke"), wordG = $("#logo-word");

  let running = false, last = 0;
  const t0 = performance.now();

  /* ---------------- cup copy ---------------- */
  let lastCup = -1;
  const paras = $("#cup-paras");
  window.onLang(() => { paras.innerHTML = T("home.cupText").map((p) => `<p>${p}</p>`).join(""); lastCup = -1; kick(); });

  /* ---------------- doors ---------------- */
  const doors = $("#door-grid");
  window.onLang(() => {
    doors.innerHTML = T("home.doors").map((d) =>
      `<a class="door" href="${d.href}"><svg class="enso" viewBox="${L.viewBox}" aria-hidden="true"><path d="${L.stroke}"/></svg><h3>${d.title}</h3><p>${d.text}</p></a>`).join("");
  });

  /* ---------------- elements ---------------- */
  const story = $("#ink"), stick = $("#ink .stick"), inkLayer = $("#ink-layer"), cupLayer = $("#cup");
  const top = window.CHATE_TOP;
  const zoomEl = $("#logo-zoom"), cupG = $("#logo-cup");
  const copy = $(".hero-copy"), hint = $(".scroll-hint"), shade = $(".scene-shade");
  const mtn = [...document.querySelectorAll(".mtn")], mists = [...document.querySelectorAll(".mist")];
  const scene = $("#scene"), imgbox = $("#imgbox"), cupCopy = $(".cup-copy"), pourBtn = $("#pour-btn");
  const doorsEl = $(".doors"), globeEl = $("#globe");

  // share of the scroll given to the ink act (the rest is the tea room)
  const SPLIT = 360 / 620;

  /* ---------------- layout numbers, measured once per resize (never while animating) ---------------- */
  // where things sit in the two photos, in image pixels. cup = [centre x, rim y, width]
  const PHOTO = {
    land: { w: 2400, h: 1350, pot: [1483, 365, 862, 602], cup: [1315, 742, 514], img: "cup-teapot.jpg", paint: "paint-land.jpg", order: "order-land.png", video: "pour-land.mp4" },
    port: { w: 1530, h: 2720, pot: [778, 579, 729, 532], cup: [522, 842, 481], img: "cup-teapot-portrait.jpg", paint: "paint-port.jpg", order: "order-port.png", video: "pour-port.mp4" }
  };
  const START = 1.5; // how far the camera is pushed in when the tea room first appears
  const portraitMQ = matchMedia("(max-aspect-ratio: 4/5)");
  let photo = PHOTO.land, box = { x: 0, y: 0, w: 1, h: 1, s: 1 };
  let vw = 1, vh = 1, cupPct = [55, 47], zoomT = { dx: 0, dy: 0, s: 4.5 };
  const potHit = $("#pot-hit");
  const pct = (v, total) => (v / total * 100).toFixed(3) + "%";
  function place(el, r) {
    el.style.left = pct(r[0], photo.w); el.style.top = pct(r[1], photo.h);
    el.style.width = pct(r[2], photo.w); el.style.height = pct(r[3], photo.h);
  }

  /* ---------------- painting → photograph ----------------
     One WebGL quad. An "order" map says which parts turn real first (the cup, the teapot, the table,
     and last the empty paper), so the change spreads like ink soaking through paper. */
  const fx = (() => {
    const cvs = $("#fx");
    let gl = null, uT = null, uAsp = null, loaded = "", ok = false, lastT = -1;
    const tex = [];
    const VS = "attribute vec2 a;varying vec2 v;void main(){v=vec2(a.x*.5+.5,.5-a.y*.5);gl_Position=vec4(a,0.,1.);}";
    const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v;uniform sampler2D A,B,O;uniform float t;
float hash(vec2 p){p=fract(p*vec2(.1031,.1030));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}
void main(){
  float o=texture2D(O,v).r+(hash(gl_FragCoord.xy)-.5)*.014;
  float m=t*1.5-.25-o;
  float a=smoothstep(0.,.11,m);
  float wet=smoothstep(-.2,0.,m);
  vec3 pa=texture2D(A,v).rgb*mix(vec3(1.),vec3(.3,.265,.23),wet*wet);
  gl_FragColor=vec4(mix(pa,texture2D(B,v).rgb,a),1.);
}`;
    function setup() {
      try { gl = cvs.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false }); } catch (e) { gl = null; }
      if (!gl) return;
      const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); return o; };
      const pr = gl.createProgram();
      gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { gl = null; return; }
      gl.useProgram(pr);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(pr, "a"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      ["A", "B", "O"].forEach((n, i) => gl.uniform1i(gl.getUniformLocation(pr, n), i));
      uT = gl.getUniformLocation(pr, "t"); uAsp = gl.getUniformLocation(pr, "asp");
      tex.length = 0;
    }
    function load(ph) {
      if (!gl || loaded === ph.img) return;
      loaded = ph.img; ok = false;
      let n = 0;
      [ph.paint, ph.img, ph.order].forEach((f, i) => {
        const im = new Image();
        im.onload = () => {
          if (!gl || loaded !== ph.img) return;
          gl.activeTexture(gl.TEXTURE0 + i);
          tex[i] = tex[i] || gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, tex[i]);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, im);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          if (++n === 3) { gl.uniform1f(uAsp, ph.w / ph.h); ok = true; lastT = -1; kick(); }
        };
        im.src = "assets/img/" + f;
      });
    }
    function size(w, h) {
      if (!gl) return;
      // sharp enough for the pushed-in view, but never more than about 2.4 million pixels
      const k = Math.min(1, Math.sqrt(2.4e6 / (w * h)));
      const cw = Math.max(2, Math.round(w * k)), ch = Math.max(2, Math.round(h * k));
      if (cvs.width !== cw || cvs.height !== ch) { cvs.width = cw; cvs.height = ch; }
      gl.viewport(0, 0, cw, ch); lastT = -1;
    }
    function draw(t) {
      if (!gl || !ok) return false;
      if (t !== lastT) { gl.uniform1f(uT, t); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); lastT = t; }
      return true;
    }
    if (!reduce) {
      setup();
      cvs.addEventListener("webglcontextlost", (e) => { e.preventDefault(); ok = false; });
      cvs.addEventListener("webglcontextrestored", () => { loaded = ""; setup(); load(photo); size(cvs.width, cvs.height); });
    }
    return { cvs, load, size, draw, redraw() { lastT = -1; } };
  })();

  function measure() {
    vw = stick.clientWidth; vh = stick.clientHeight;
    // photo: same maths as object-fit:cover
    photo = portraitMQ.matches ? PHOTO.port : PHOTO.land;
    const s = Math.max(vw / photo.w, vh / photo.h);
    box = { w: photo.w * s, h: photo.h * s, s };
    box.x = (vw - box.w) / 2; box.y = (vh - box.h) / 2;
    imgbox.style.width = box.w + "px"; imgbox.style.height = box.h + "px";
    imgbox.style.transform = `translate(${box.x}px, ${box.y}px)`;
    place(potHit, photo.pot);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    fx.load(photo); fx.size(Math.min(photo.w, box.w * START * dpr), Math.min(photo.h, box.h * START * dpr));
    const cs = getComputedStyle(scene);
    cupPct = [parseFloat(cs.getPropertyValue("--cup-x")) || 55, parseFloat(cs.getPropertyValue("--cup-y")) || 47];
    // where the real cup's rim sits on screen while the camera is pushed in
    const ox = (parseFloat(cs.getPropertyValue("--zoom-x")) || 55) / 100 * vw, oy = (parseFloat(cs.getPropertyValue("--zoom-y")) || 52) / 100 * vh;
    const tx = ox + (box.x + photo.cup[0] * box.s - ox) * START, ty = oy + (box.y + photo.cup[1] * box.s - oy) * START;
    // the drawn cup in the logo (zoom switched off while we measure): it travels to the real one
    const keep = zoomEl.style.transform; zoomEl.style.transform = "none";
    const sr = stick.getBoundingClientRect(), cr = cupG.getBoundingClientRect(), zr = zoomEl.getBoundingClientRect();
    zoomEl.style.transformOrigin = `${(cr.left - zr.left + cr.width / 2).toFixed(1)}px ${(cr.top - zr.top).toFixed(1)}px`;
    zoomEl.style.transform = keep;
    zoomT = { dx: tx - (cr.left - sr.left + cr.width / 2), dy: ty - (cr.top - sr.top), s: Math.max(1, photo.cup[2] * box.s * START / Math.max(1, cr.width)) };
    if (inkOff) { inkOff = false; } // force a clean repaint of the ink layer state
  }

  /* ---------------- the eased timeline ---------------- */
  let S = 0, target = 0, px = 0, pxT = 0, autoSteam = reduce ? 1 : 0;
  let masked = true, inkOff = false, cupOn = null, washOn = null, ready = null, fxOn = null, roomOn = false;
  const rawProg = () => {
    const r = story.getBoundingClientRect(), span = story.offsetHeight - vh;
    return span > 0 ? clamp(-r.top / span) : 0;
  };

  function frame() {
    // read first, write after: no forced layout while scrolling
    const doorsTop = doorsEl.getBoundingClientRect().top, globeTop = globeEl.getBoundingClientRect().top;
    const p = reduce ? 0.63 : map(S, 0, SPLIT), q = reduce ? 0.7 : map(S, SPLIT, 1);

    // ---- act 1: the ink
    const inkVisible = p < 0.87;
    if (inkVisible === inkOff) { inkOff = !inkVisible; inkLayer.style.visibility = inkVisible || reduce ? "" : "hidden"; }
    if (inkVisible || reduce) {
      // 1. only the cup is there (it settles in on load)  2. scrolling lets its steam rise as one ink line,
      //    which keeps going round into the ensō  3. the name is brushed in
      const cupIn = reduce ? 1 : ease(map(p, 0, 0.04) * 0.4 + 0.6 * autoSteam);
      cupG.style.opacity = (0.2 + 0.8 * cupIn).toFixed(3);
      const x = map(p, 0.005, 0.46);
      const drawn = reduce ? 1 : 1 - Math.pow(1 - x, 1.7) * (1 - x * 0.35);
      const word = ease(map(p, 0.46, 0.56));
      // once the stroke and the name are fully brushed in, drop the masks: plain shapes zoom cheaply
      const needMask = drawn < 0.9995 || word < 0.9995;
      if (needMask !== masked) {
        masked = needMask;
        if (masked) { strokeG.setAttribute("mask", "url(#stroke-mask)"); wordG.setAttribute("mask", "url(#word-mask)"); }
        else { strokeG.removeAttribute("mask"); wordG.removeAttribute("mask"); }
      }
      if (masked) {
        maskPath.setAttribute("stroke-dashoffset", (1 - Math.min(1, drawn * 1.002)).toFixed(4));
        // 4. the name is brushed in
        wordWipe.setAttribute("width", (860 * word).toFixed(1));
      }
      // the steam's soft head rides the tip of the line, then thins away as the circle closes
      const puffA = drawn > 0.002 && drawn < 0.999 ? Math.min(1, drawn * 14) * (1 - Math.pow(drawn, 6)) : 0;
      if (puffA > 0) {
        const pt = maskPath.getPointAtLength(drawn * centerLen);
        puffEl.setAttribute("cx", pt.x.toFixed(1)); puffEl.setAttribute("cy", pt.y.toFixed(1));
        puffEl.setAttribute("r", (46 + 26 * (1 - drawn)).toFixed(1));
      }
      puffEl.setAttribute("opacity", (puffA * 0.9).toFixed(3));
      // a misty halo around the fresh line, so it reads as vapour; it clears once the name arrives
      halo.style.display = word < 0.999 ? "" : "none";
      halo.setAttribute("opacity", (0.32 * (1 - word)).toFixed(3));
      // the ink soaks into the paper around the finished circle
      const wash = ease(map(p, 0.4, 0.56)) * (1 - map(p, 0.62, 0.68));
      if ((wash > 0.004) !== washOn) { washOn = wash > 0.004; washSvg.style.visibility = washOn ? "" : "hidden"; }
      if (washOn) washSvg.style.opacity = (wash * 0.3).toFixed(3);
      // 5. the line under it
      const c = ease(map(p, 0.54, 0.62)) * (1 - map(p, 0.64, 0.7));
      copy.style.opacity = c.toFixed(3);
      copy.style.transform = `translate3d(0, ${((1 - c) * 16).toFixed(1)}px, 0)`;
      hint.style.opacity = (1 - map(p, 0.02, 0.08)).toFixed(3);
      // 6. the camera moves in until the drawn cup sits exactly on the cup of the tea room
      const z = easeIO(map(p, 0.66, 0.86));
      zoomEl.style.transform = z > 0 ? `translate3d(${(z * zoomT.dx).toFixed(1)}px, ${(z * zoomT.dy).toFixed(1)}px, 0) scale(${(1 + z * (zoomT.s - 1)).toFixed(4)})` : "none";
      wordG.style.opacity = (1 - map(p, 0.66, 0.72)).toFixed(3);
      strokeG.style.opacity = (1 - map(p, 0.69, 0.79)).toFixed(3);
      // mountains: slow parallax, a little pointer
      const k = [0.04, 0.1];
      mtn.forEach((m, i) => { m.style.transform = `translate3d(${(px * (i + 1) * -6).toFixed(1)}px, ${(-p * k[i] * vh).toFixed(1)}px, 0) scale(${(1 + p * k[i] * 0.8).toFixed(4)})`; });
      mists[0].style.translate = `0 ${(-p * 12).toFixed(2)}vh`;
      mists[1].style.translate = `0 ${(-p * 26).toFixed(2)}vh`;
    }

    // ---- the paper becomes an ink painting of the tea room, the painting becomes the photograph
    const show = reduce ? 1 : easeIO(map(p, 0.72, 0.86));
    const rev = reduce ? 1 : map(p, 0.86, 1);
    if ((show > 0) !== cupOn) { cupOn = show > 0; cupLayer.style.visibility = cupOn ? "visible" : "hidden"; fx.redraw(); }
    if (cupOn) {
      cupLayer.style.opacity = show.toFixed(3);
      const useFx = rev < 1 && fx.draw(rev);
      if (useFx !== fxOn) { fxOn = useFx; fx.cvs.style.visibility = useFx ? "visible" : "hidden"; }
      shade.style.opacity = easeIO(map(rev, 0.35, 1)).toFixed(3);
      // ---- act 2: the camera pulls back
      const sc = START - 0.44 * easeIO(map(q, 0, 0.32)) - 0.06 * map(q, 0.32, 1);
      scene.style.transform = `scale(${sc.toFixed(4)})`;
      cupCopy.classList.toggle("in", q > 0.16);
      const n = q < 0.16 ? 0 : q < 0.32 ? 1 : q < 0.48 ? 2 : 3;
      if (n !== lastCup) { [...paras.children].forEach((el, i) => el.classList.toggle("in", i < n)); lastCup = n; }
      const r = q > 0.3;
      if (r !== ready) { ready = r; cupLayer.classList.toggle("ready", r); potHit.disabled = !r; if (r) setVid(); }
    }
    roomOn = cupOn && rev > 0.7;

    // header colour: light text over the tea room and the globe
    top.classList.toggle("on-dark", rev > 0.5 && doorsTop > 40);
    top.classList.toggle("solid", doorsTop < 40 || globeTop < 60);
  }

  /* One loop: it eases the timeline toward the scroll position, so a mouse wheel's steps
     become one continuous glide. It stops by itself when everything has settled. */
  function tick(t) {
    const dt = Math.min(64, t - last) || 16; last = t;
    target = rawProg();
    const k = 1 - Math.exp(-dt / 130);
    S += (target - S) * k;
    px += (pxT - px) * k;
    if (Math.abs(target - S) < 0.00015) S = target;
    if (!reduce && autoSteam < 1) autoSteam = ease(clamp((t - t0 - 150) / 1400));
    frame();
    if (S !== target || Math.abs(pxT - px) > 0.002 || (!reduce && autoSteam < 1)) requestAnimationFrame(tick);
    else running = false;
  }
  function kick() { if (!running) { running = true; last = performance.now(); requestAnimationFrame(tick); } }
  addEventListener("scroll", kick, { passive: true });
  addEventListener("resize", () => { measure(); kick(); });
  addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") { pxT = e.clientX / innerWidth - 0.5; kick(); } }, { passive: true });
  portraitMQ.addEventListener && portraitMQ.addEventListener("change", () => { measure(); kick(); });

  measure();
  S = target = rawProg(); // a reload half-way down starts in place, without replaying
  frame();
  kick();
  // fonts and images can nudge the layout after first paint
  addEventListener("load", () => { measure(); kick(); });
  // decode the big photos ahead of time so the change of scene never waits on them
  document.querySelectorAll(".scene-img, .mtn img").forEach((im) => im.decode && im.decode().catch(() => {}));

  /* ---------------- steam over the real cup ---------------- */
  const cv = $("#steam"), ctx = cv.getContext("2d");
  const SR = 0.5; // steam is soft, so half resolution is plenty and much lighter to draw
  let W = 0, H = 0, parts = [], steamOn = false, boost = 0;
  function size() { W = cv.clientWidth; H = cv.clientHeight; cv.width = Math.max(1, W * SR); cv.height = Math.max(1, H * SR); }
  const puff = (strong) => {
    const [cx, cy] = cupPct;
    parts.push({ x: (cx / 100) * W + (Math.random() - 0.5) * W * 0.06, y: (cy / 100) * H - Math.random() * H * 0.02, vx: (Math.random() - 0.5) * 0.5, vy: -(0.6 + Math.random() * 0.5) * (strong ? 1.5 : 1), r: 10 + Math.random() * 10, life: 0, max: 200 + Math.random() * 120, seed: Math.random() * 100, a: strong ? 0.036 : 0.03 });
  };
  function steam(t) {
    if (!steamOn) return;
    ctx.setTransform(SR, 0, 0, SR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const cap = boost > 0 ? 52 : 38;
    if (parts.length < cap && Math.random() < (boost > 0 ? 0.4 : 0.22)) puff(boost > 0);
    parts = parts.filter((p) => p.life < p.max);
    for (const p of parts) {
      p.life++;
      const a = p.life / p.max;
      p.x += p.vx + Math.sin(t / 900 + p.seed + p.life / 40) * 0.35 + px * 0.4;
      p.y += p.vy * (1 - a * 0.4);
      p.r += 0.45;
      const alpha = Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, a))), 1.6) * p.a;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      g.addColorStop(0, `rgba(240,232,215,${alpha.toFixed(4)})`);
      g.addColorStop(1, "rgba(240,232,215,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    requestAnimationFrame(steam);
  }
  function steamCheck() {
    const want = roomOn && !reduce && story.getBoundingClientRect().bottom > 0;
    if (want && !steamOn) { steamOn = true; size(); requestAnimationFrame(steam); }
    else if (!want && steamOn) steamOn = false;
  }
  addEventListener("scroll", steamCheck, { passive: true });
  addEventListener("resize", () => { if (steamOn) size(); });
  setInterval(steamCheck, 600);

  /* ---------------- click to pour ----------------
     A short film made from this very photograph: it starts and ends on the same picture,
     so it fades in over the photo, plays, and fades away again without a seam. */
  const vid = $("#pour-video");
  let pouring = false, vidSrc = "";
  function setVid() {
    const src = "assets/video/" + photo.video;
    if (vidSrc !== src) { vidSrc = src; vid.preload = "auto"; vid.src = src; vid.load(); }
  }
  function stopPour(done) {
    vid.classList.remove("on");
    cupLayer.classList.remove("pouring");
    if (done) {
      cupLayer.classList.add("poured");
      const sp = pourBtn.querySelector("span"); sp.dataset.t = "home.pourAgain"; sp.textContent = T("home.pourAgain");
    }
    boost = 0; pouring = false;
  }
  function pour() {
    if (pouring || !ready) return;
    pouring = true;
    setVid();
    cupLayer.classList.add("pouring");
    try { vid.currentTime = 0; } catch (e) {}
    const pr = vid.play();
    if (pr && pr.catch) pr.catch(() => stopPour(false));
  }
  vid.addEventListener("playing", () => { if (pouring) vid.classList.add("on"); });
  vid.addEventListener("ended", () => stopPour(true));
  vid.addEventListener("error", () => { if (pouring) stopPour(false); });
  pourBtn.addEventListener("click", pour);
  potHit.addEventListener("click", pour);
  potHit.disabled = true;
})();
