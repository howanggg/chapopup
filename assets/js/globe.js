/* Cha/Té tea globe: a relief model of the real Earth (NASA Blue Marble colours, NASA elevation data,
   4K elevation data with ridges and valleys shaded in, mountains raised so they catch the light) that you can turn, with a pin for each tea ritual. */
import * as THREE from "../vendor/three.module.min.js";
import { OrbitControls } from "../vendor/OrbitControls.js";

const C = window.CHATE;
const $ = (s) => document.querySelector(s);
const stage = $("#globe-stage"), canvas = $("#globe-canvas"), tip = $("#globe-tip");
const panel = $("#tea-panel"), list = $("#place-list");
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const COLORS = { cha: 0x8fc79a, te: 0xe9eef2, other: 0xe08a66, course: 0xc49a45 };
const EMBER = 0xff8a3c;
const RELIEF = 0.088; // how far the highest mountains rise, in Earth radii (exaggerated, like a relief globe)

function webglOK() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; }
}

/* lat/lon to a point on the unit sphere, matching three.js sphere UVs (u = 0 at longitude -180) */
function toVec(lat, lon, r = 1) {
  const phi = ((lon + 180) / 360) * Math.PI * 2, th = ((90 - lat) / 180) * Math.PI;
  return new THREE.Vector3(-Math.cos(phi) * Math.sin(th) * r, Math.cos(th) * r, Math.sin(phi) * Math.sin(th) * r);
}

/* ---------- list of places (works with or without WebGL) ---------- */
let select = () => {};
function renderList() {
  const l = window.LANG();
  list.innerHTML = C.teas.map((t) =>
    `<button type="button" data-id="${t.id}" aria-pressed="false"><i class="dot ${t.course ? "course" : t.word}"></i>${t[l].place}</button>`).join("");
}
list.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) select(b.dataset.id, true); });

let current = null;
function showPanel(t) {
  const l = window.LANG(), d = t[l];
  $("#tea-word").textContent = `${T("home.panelWord")} · ${t.say}`;
  $("#tea-place").textContent = d.place;
  $("#tea-teas").textContent = d.teas;
  $("#tea-ritual").textContent = d.ritual;
  $("#tea-fact").textContent = d.fact;
  panel.hidden = false;
  panel.style.animation = "none"; panel.offsetHeight; panel.style.animation = "";
  list.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.id === t.id));
}
let onClose = () => {};
$("#tea-close").addEventListener("click", () => { panel.hidden = true; current = null; list.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", "false")); onClose(); });
window.onLang(() => { renderList(); if (current) showPanel(current); });

if (!webglOK()) {
  $("#globe-fallback").hidden = false;
  canvas.hidden = true;
  select = (id) => { current = C.teas.find((t) => t.id === id); showPanel(current); };
} else {
  init();
}

function init() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(1.75, devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  const DIST = 2.85; // close: the Earth is bigger than the frame, like a model on a desk
  camera.position.copy(toVec(24, 96, DIST)); // start over Asia, where tea began

  const tl = new THREE.TextureLoader();
  const tex = (f, srgb = false) => { const t = tl.load("assets/earth/" + f); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy()); return t; };

  // a few faint stars in a deep navy night
  const stars = new THREE.Mesh(new THREE.SphereGeometry(40, 48, 32), new THREE.MeshBasicMaterial({ map: tex("night-sky.png", true), side: THREE.BackSide, color: 0x4a5266 }));
  scene.add(stars);

  // the Earth: real colours, real elevation pushed out of the sphere
  const earth = new THREE.Group();
  scene.add(earth);
  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(1, 720, 360),
    new THREE.MeshPhongMaterial({
      map: tex("earth-color.jpg", true),
      displacementMap: tex("earth-height.jpg"),
      displacementScale: RELIEF,
      normalMap: tex("earth-normal.jpg"),
      normalScale: new THREE.Vector2(1.25, 1.25),
      specularMap: tex("earth-spec.jpg"),
      specular: new THREE.Color(0x4f6274),
      shininess: 64
    })
  );
  earth.add(globe);
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.012, 96, 72), new THREE.MeshLambertMaterial({ map: tex("earth_clouds_1024.png", true), transparent: true, opacity: 0.2, depthWrite: false }));
  earth.add(clouds);

  // a thin rim of air, only at the very edge
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.06, 64, 48), new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: "varying vec3 vN; void main(){ vN = normalize(normalMatrix*normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }",
    fragmentShader: "varying vec3 vN; void main(){ float f = pow(clamp(0.62 - dot(vN, vec3(0.,0.,1.)), 0., 1.), 3.5); gl_FragColor = vec4(0.5,0.68,0.95,1.0) * f * 0.7; }"
  }));
  scene.add(atmo);

  // light: a warm lamp raking in from the upper left so every range throws a shadow, a cool glow from behind
  scene.add(new THREE.HemisphereLight(0x7f96c4, 0x2a2018, 1.05));
  const key = new THREE.DirectionalLight(0xffdcb8, 3.0);
  const rim = new THREE.DirectionalLight(0x6f9cff, 1.1);
  scene.add(key, rim);

  // dust in the lamp light
  const glow = glowTex();
  const N = 420, dpos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(1.12 + Math.random() * 1.5);
    dpos.set([v.x, v.y, v.z], i * 3);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dpos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ map: glow, size: 0.022, sizeAttenuation: true, color: 0xffe2c0, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(dust);

  function glowTex() {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const x = c.getContext("2d"), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, "rgba(255,255,255,.45)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  // pins: black map pins pushed into the model, a small coloured head, and a warm light at the foot
  const pins = [], hits = [];
  function buildPins(heightAt) {
    const headGeo = new THREE.SphereGeometry(0.0085, 20, 14);
    const hitGeo = new THREE.SphereGeometry(0.05, 8, 6);
    const stickMat = new THREE.MeshPhongMaterial({ color: 0x0c0d0c, shininess: 90, specular: 0x666666 });
    const up = new THREE.Vector3(0, 1, 0);
    C.teas.forEach((t, i) => {
      const col = COLORS[t.course ? "course" : t.word];
      const g = new THREE.Group();
      const n = toVec(t.at[0], t.at[1], 1).normalize();
      const ground = 1 + heightAt(t.at[0], t.at[1]) * RELIEF;
      const len = 0.085 + (i % 3) * 0.012;
      // each pin leans a little, as if pushed in by hand
      const lean = new THREE.Vector3(Math.sin(i * 12.9898) * 0.16, 0, Math.cos(i * 78.233) * 0.16);
      const dir = n.clone().add(lean.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, n))).normalize();
      const foot = n.clone().multiplyScalar(ground - 0.01);
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.0017, 0.0011, len, 8), stickMat);
      stick.position.copy(foot).addScaledVector(dir, len / 2);
      stick.quaternion.setFromUnitVectors(up, dir);
      const head = new THREE.Mesh(headGeo, new THREE.MeshPhongMaterial({ color: col, emissive: col, emissiveIntensity: 0.3, shininess: 120, specular: 0xffffff }));
      head.position.copy(foot).addScaledVector(dir, len);
      const ember = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: EMBER, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
      ember.position.copy(n.clone().multiplyScalar(ground + 0.006));
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: col, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.position.copy(head.position);
      const hit = new THREE.Mesh(hitGeo, new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.copy(foot).addScaledVector(dir, len * 0.6);
      hit.userData.t = t;
      g.add(stick, head, ember, halo, hit);
      earth.add(g);
      pins.push({ t, head, ember, halo, n, g, phase: i * 1.7 });
      hits.push(hit);
    });
  }
  // read the elevation under each pin from the same relief image the model uses
  const reliefImg = new Image();
  reliefImg.onload = () => {
    let data = null, w = 0, h = 0;
    try {
      const c = document.createElement("canvas"); w = c.width = 1024; h = c.height = 512;
      const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(reliefImg, 0, 0, w, h);
      data = x.getImageData(0, 0, w, h).data;
    } catch (e) {}
    buildPins((lat, lon) => {
      if (!data) return 0.3;
      const px = Math.min(w - 1, Math.floor(((lon + 180) / 360) * w)), py = Math.min(h - 1, Math.floor(((90 - lat) / 180) * h));
      return data[(py * w + px) * 4] / 255;
    });
  };
  reliefImg.onerror = () => buildPins(() => 0.3);
  reliefImg.src = "assets/earth/earth-height.jpg";

  const controls = new OrbitControls(camera, canvas);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.rotateSpeed = 0.32;
  controls.minPolarAngle = 0.5; controls.maxPolarAngle = Math.PI - 0.5;
  controls.autoRotate = !reduce;
  controls.autoRotateSpeed = 0.28;
  let idle;
  controls.addEventListener("start", () => { controls.autoRotate = false; canvas.classList.add("drag"); clearTimeout(idle); fly = null; });
  controls.addEventListener("end", () => { canvas.classList.remove("drag"); idle = setTimeout(() => { if (!current) controls.autoRotate = !reduce; }, 7000); });
  onClose = () => { clearTimeout(idle); idle = setTimeout(() => { if (!current) controls.autoRotate = !reduce; }, 2500); };

  // fly the camera to a place
  let fly = null;
  select = (id, fromList) => {
    const p = pins.find((x) => x.t.id === id);
    if (!p) return;
    current = p.t;
    showPanel(p.t);
    controls.autoRotate = false;
    // look from slightly south of the pin so it stands up against the horizon instead of pointing at the lens
    const to = toVec(Math.max(-60, p.t.at[0] - 14), p.t.at[1], 1).normalize();
    fly = { from: camera.position.clone().normalize(), to, t0: performance.now(), dur: reduce ? 1 : 1500 };
    if (fromList && innerWidth < 760) stage.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };

  // hover and click
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  let downAt = null, hovered = null;
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(mouse, camera);
    const hit = ray.intersectObjects([globe, ...hits], false)[0];
    return hit && hit.object.userData.t ? { t: hit.object.userData.t, x: e.clientX - r.left, y: e.clientY - r.top } : null;
  }
  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    const h = pick(e);
    hovered = h && h.t;
    canvas.classList.toggle("hover", !!h);
    if (h) { tip.hidden = false; tip.textContent = h.t[window.LANG()].place; tip.style.left = h.x + "px"; tip.style.top = h.y + "px"; }
    else tip.hidden = true;
  });
  canvas.addEventListener("pointerleave", () => { tip.hidden = true; hovered = null; });
  canvas.addEventListener("pointerdown", (e) => { downAt = [e.clientX, e.clientY]; });
  canvas.addEventListener("pointerup", (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
    const h = pick(e);
    if (h) select(h.t.id);
  });

  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const edge = Math.tan(Math.asin(1 / DIST)); // angular radius of the Earth from the camera
    if (w / h < 0.9) {
      // phones: the Earth is a little wider than the screen, centred, sitting in the upper part
      camera.fov = Math.min(70, THREE.MathUtils.radToDeg(2 * Math.atan((edge * h) / (1.22 * w))));
      camera.setViewOffset(w, h, 0, h * 0.1, w, h);
    } else {
      // wide screens: the Earth fills the height and sits left of centre, leaving room for the story on the right
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(edge / 1.16));
      camera.setViewOffset(w, h, w * 0.1, -h * 0.06, w, h);
    }
    camera.updateProjectionMatrix();
  }
  addEventListener("resize", resize);
  resize();

  // render only while the globe is on screen
  let visible = false;
  new IntersectionObserver(([e]) => { const was = visible; visible = e.isIntersecting; if (visible && !was) requestAnimationFrame(loop); }, { rootMargin: "100px" }).observe(stage);

  const section = $("#globe");
  const Y = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3(), right = new THREE.Vector3();
  function loop(t) {
    if (!visible) return;
    // scroll entrance: the Earth rises and grows as the section arrives
    const r = section.getBoundingClientRect();
    const enter = Math.min(1, Math.max(0, 1 - r.top / innerHeight));
    const e = 1 - Math.pow(1 - enter, 3);
    earth.scale.setScalar(0.8 + 0.2 * e);
    atmo.scale.setScalar(0.8 + 0.2 * e);
    earth.position.y = (1 - e) * -0.45;
    atmo.position.y = earth.position.y;

    if (fly) {
      const k = Math.min(1, (t - fly.t0) / fly.dur), s = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      camera.position.copy(tmp.copy(fly.from).lerp(fly.to, s).normalize().multiplyScalar(DIST));
      if (k >= 1) fly = null;
    }
    controls.update();
    clouds.rotation.y += 0.00008;
    dust.rotation.y = t * 0.00002; dust.rotation.x = Math.sin(t * 0.00005) * 0.08;

    // the lamp stays up and to the left of the viewer, the cool light behind on the right
    const camN = tmp.copy(camera.position).normalize().clone();
    right.crossVectors(Y, camN).normalize();
    key.position.copy(camN).multiplyScalar(0.95).addScaledVector(right, -0.85).addScaledVector(Y, 0.6);
    rim.position.copy(camN).multiplyScalar(-0.7).addScaledVector(right, 1.0).addScaledVector(Y, -0.2);

    pins.forEach((p) => {
      const facing = p.n.dot(camN);
      p.g.visible = facing > -0.2;
      const sel = current && current.id === p.t.id, hov = hovered && hovered.id === p.t.id;
      const breathe = reduce ? 1 : 0.85 + 0.15 * Math.sin(t / 700 + p.phase);
      p.head.scale.setScalar(sel ? 1.8 : hov ? 1.5 : 1);
      p.head.material.emissiveIntensity = sel || hov ? 0.9 : 0.3;
      p.ember.scale.setScalar((sel ? 0.19 + 0.03 * Math.sin(t / 240) : hov ? 0.13 : 0.075) * breathe);
      p.halo.material.opacity = sel ? 0.9 : hov ? 0.6 : 0;
      p.halo.scale.setScalar(0.07);
    });
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
}
