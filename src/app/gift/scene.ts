import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export type GiftPhase = "idle" | "opening" | "open";

export interface GiftSceneOptions {
  ringText: string;
  onPhase?: (phase: GiftPhase) => void;
  onCardClick?: () => void;
}

export interface GiftScene {
  open: () => void;
  dispose: () => void;
}

/* ───────────────────────── helpers ───────────────────────── */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const prog = (t: number, start: number, dur: number) => clamp01((t - start) / dur);
const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
const easeInOutCubic = (x: number) =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const easeOutBack = (x: number) => {
  const c1 = 1.4;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
const rand = (a: number, b: number) => a + Math.random() * (b - a);

function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  return { c, ctx };
}

/** Heart path centred on (cx, cy), total height ≈ s */
function heartPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  const x = cx;
  const y = cy - s * 0.5;
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.3);
  ctx.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.3);
  ctx.bezierCurveTo(x - s * 0.5, y + s * 0.62, x, y + s * 0.78, x, y + s);
  ctx.bezierCurveTo(x, y + s * 0.78, x + s * 0.5, y + s * 0.62, x + s * 0.5, y + s * 0.3);
  ctx.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.3);
  ctx.closePath();
}

function heartShape() {
  const s = new THREE.Shape();
  const x = 0;
  const y = 0;
  s.moveTo(x + 5, y + 5);
  s.bezierCurveTo(x + 5, y + 5, x + 4, y, x, y);
  s.bezierCurveTo(x - 6, y, x - 6, y + 7, x - 6, y + 7);
  s.bezierCurveTo(x - 6, y + 11, x - 3, y + 15.4, x + 5, y + 19);
  s.bezierCurveTo(x + 12, y + 15.4, x + 16, y + 11, x + 16, y + 7);
  s.bezierCurveTo(x + 16, y + 7, x + 16, y, x + 10, y);
  s.bezierCurveTo(x + 7, y, x + 5, y + 5, x + 5, y + 5);
  return s;
}

/** Puffy 3D heart, ≈1 unit tall, centred, pointing down */
function heartGeometry() {
  const g = new THREE.ExtrudeGeometry(heartShape(), {
    depth: 3,
    bevelEnabled: true,
    bevelThickness: 2.5,
    bevelSize: 2,
    bevelSegments: 4,
    curveSegments: 18,
  });
  g.rotateZ(Math.PI);
  g.center();
  g.scale(1 / 21, 1 / 21, 1 / 21);
  return g;
}

/** Closed 3D heart-outline curve, tip at origin, pointing up (height ≈ 1.8·size) */
function heartLoopCurve(size: number) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < 64; i++) {
    const t = (i / 64) * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    pts.push(new THREE.Vector3((x / 16) * size, ((y + 17) / 16) * size, 0));
  }
  return new THREE.CatmullRomCurve3(pts, true, "centripetal");
}

/* ───────────────────────── textures ───────────────────────── */

function boxFaceTexture(withHearts: boolean) {
  const { c, ctx } = makeCanvas(512, 512);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, "#f0185a");
  g.addColorStop(1, "#b80a40");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  if (withHearts) {
    const spots: [number, number, string][] = [
      [118, 150, "#ffd9e8"],
      [394, 150, "#e64bb0"],
      [118, 372, "#e64bb0"],
      [394, 372, "#ffd9e8"],
    ];
    for (const [x, y, col] of spots) {
      ctx.save();
      ctx.shadowColor = "rgba(90,0,30,0.45)";
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 5;
      heartPath(ctx, x, y, 92);
      const hg = ctx.createRadialGradient(x - 18, y - 22, 4, x, y, 60);
      hg.addColorStop(0, "#ffffff");
      hg.addColorStop(0.35, col);
      hg.addColorStop(1, col);
      ctx.fillStyle = hg;
      ctx.fill();
      ctx.restore();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function radialTexture(stops: [number, string][], size = 128) {
  const { c, ctx } = makeCanvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) g.addColorStop(o, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function backgroundTexture() {
  const { c, ctx } = makeCanvas(1024, 1024);
  const g = ctx.createRadialGradient(512, 430, 40, 512, 512, 760);
  g.addColorStop(0, "#5a1129");
  g.addColorStop(0.35, "#2e0716");
  g.addColorStop(0.75, "#12030a");
  g.addColorStop(1, "#070105");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 1024);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function wingTexture() {
  const { c, ctx } = makeCanvas(256, 256);
  // Upper (front) wing is drawn at the top of the canvas; the body is on the left edge.
  const fill = ctx.createRadialGradient(10, 130, 10, 60, 128, 240);
  fill.addColorStop(0, "#ffffff");
  fill.addColorStop(0.45, "#ffd0e3");
  fill.addColorStop(1, "#ea5d9c");
  ctx.lineJoin = "round";
  // upper wing
  ctx.beginPath();
  ctx.moveTo(6, 122);
  ctx.bezierCurveTo(40, 40, 160, -6, 238, 18);
  ctx.bezierCurveTo(262, 60, 236, 112, 168, 132);
  ctx.bezierCurveTo(110, 146, 50, 140, 6, 134);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = "#3c0f2c";
  ctx.stroke();
  // lower wing
  ctx.beginPath();
  ctx.moveTo(6, 136);
  ctx.bezierCurveTo(90, 140, 200, 160, 196, 214);
  ctx.bezierCurveTo(186, 254, 120, 252, 70, 226);
  ctx.bezierCurveTo(30, 200, 10, 170, 6, 136);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.stroke();
  // veins
  ctx.strokeStyle = "rgba(60,15,44,0.55)";
  ctx.lineWidth = 2.5;
  for (const [x, y] of [
    [220, 30],
    [200, 90],
    [150, 120],
    [170, 200],
    [110, 230],
  ]) {
    ctx.beginPath();
    ctx.moveTo(8, 132);
    ctx.quadraticCurveTo((x as number) * 0.5, (y as number) * 0.9 + 10, x as number, y as number);
    ctx.stroke();
  }
  // white edge dots
  ctx.fillStyle = "#ffffff";
  for (const [x, y] of [
    [228, 32],
    [236, 62],
    [222, 94],
    [186, 210],
    [160, 238],
    [120, 240],
  ]) {
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function letterTexture(ch: string) {
  const { c, ctx } = makeCanvas(160, 200);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "600 150px 'Cormorant Garamond', 'Cinzel', Georgia, 'Times New Roman', serif";
  const g = ctx.createLinearGradient(0, 30, 0, 175);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.45, "#d9d6e2");
  g.addColorStop(0.55, "#8c8798");
  g.addColorStop(1, "#f4f1f8");
  ctx.shadowColor = "rgba(0,0,0,0.7)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#2a1a26";
  ctx.strokeText(ch, 80, 112);
  ctx.shadowColor = "transparent";
  ctx.fillStyle = g;
  ctx.fillText(ch, 80, 112);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function cardTexture() {
  // Little envelope with a red heart seal
  const { c, ctx } = makeCanvas(360, 240);
  const W = 360;
  const H = 240;
  const body = ctx.createLinearGradient(0, 0, 0, H);
  body.addColorStop(0, "#fffaf2");
  body.addColorStop(1, "#f3e4cc");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.roundRect(6, 6, W - 12, H - 12, 14);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#d9b25f";
  ctx.stroke();
  // bottom folds
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(185,140,70,0.55)";
  ctx.beginPath();
  ctx.moveTo(10, H - 10);
  ctx.lineTo(W / 2, H * 0.52);
  ctx.lineTo(W - 10, H - 10);
  ctx.stroke();
  // top flap
  ctx.beginPath();
  ctx.moveTo(8, 10);
  ctx.lineTo(W / 2, H * 0.6);
  ctx.lineTo(W - 8, 10);
  ctx.closePath();
  const flap = ctx.createLinearGradient(0, 0, 0, H * 0.6);
  flap.addColorStop(0, "#fbefdc");
  flap.addColorStop(1, "#ead3ad");
  ctx.fillStyle = flap;
  ctx.fill();
  ctx.strokeStyle = "rgba(185,140,70,0.8)";
  ctx.stroke();
  // wax seal
  const cx = W / 2;
  const cy = H * 0.58;
  ctx.save();
  ctx.shadowColor = "rgba(120,0,20,0.5)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  const seal = ctx.createRadialGradient(cx - 12, cy - 14, 4, cx, cy, 44);
  seal.addColorStop(0, "#ef4a5f");
  seal.addColorStop(0.6, "#b3102a");
  seal.addColorStop(1, "#7d0819");
  ctx.fillStyle = seal;
  ctx.beginPath();
  ctx.arc(cx, cy, 42, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  heartPath(ctx, cx, cy + 2, 40);
  ctx.fillStyle = "#f6d27a";
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/* ───────────────────────── geometry builders ───────────────────────── */

function roseHeadGeometry() {
  const layers = [
    { n: 3, r: 0.03, h: 0.3, w: 0.22, tilt: 0.08 },
    { n: 5, r: 0.08, h: 0.38, w: 0.3, tilt: 0.3 },
    { n: 6, r: 0.13, h: 0.44, w: 0.38, tilt: 0.62 },
    { n: 7, r: 0.17, h: 0.46, w: 0.44, tilt: 1.0 },
  ];
  const parts: THREE.BufferGeometry[] = [];
  layers.forEach((L, li) => {
    for (let i = 0; i < L.n; i++) {
      const g = new THREE.PlaneGeometry(1, 1, 6, 6);
      g.translate(0, 0.5, 0);
      const pos = g.attributes.position;
      for (let k = 0; k < pos.count; k++) {
        const x = pos.getX(k);
        const y = pos.getY(k);
        const width = 0.35 + 0.65 * Math.sin(Math.min(1, y * 1.15) * Math.PI * 0.62);
        const px = x * width;
        const pz = -(px * px) * 1.5 + y * y * 0.3;
        pos.setXYZ(k, px * L.w, y * L.h, pz * L.w);
      }
      g.rotateX(L.tilt);
      g.translate(0, 0, L.r);
      g.rotateY((i / L.n) * Math.PI * 2 + li * 0.55);
      parts.push(g.toNonIndexed());
      g.dispose();
    }
  });
  const bud = new THREE.SphereGeometry(0.06, 10, 8).toNonIndexed();
  bud.translate(0, 0.18, 0);
  // drop attributes not shared by both kinds of parts
  bud.deleteAttribute("uv");
  for (const p of parts) p.deleteAttribute("uv");
  parts.push(bud);
  const merged = mergeGeometries(parts)!;
  merged.computeVertexNormals();
  parts.forEach((p) => p.dispose());
  return merged;
}

function petalGeometry() {
  const g = new THREE.PlaneGeometry(0.17, 0.2, 4, 4);
  const pos = g.attributes.position;
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k);
    const y = pos.getY(k);
    pos.setZ(k, -(x * x) * 6 + y * y * 2);
    pos.setX(k, x * (0.7 + 0.3 * Math.cos(y * 6)));
  }
  g.computeVertexNormals();
  return g;
}

function leafGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(0.09, 0.12, 0, 0.3);
  s.quadraticCurveTo(-0.09, 0.12, 0, 0);
  const g = new THREE.ShapeGeometry(s, 8);
  const pos = g.attributes.position;
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k);
    const y = pos.getY(k);
    pos.setZ(k, -x * x * 4 + y * y * 0.4);
  }
  g.computeVertexNormals();
  return g;
}

/* ───────────────────────── scene ───────────────────────── */

export function createGiftScene(container: HTMLElement, opts: GiftSceneOptions): GiftScene {
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(o: T) => {
    disposables.push(o);
    return o;
  };

  /* renderer */
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.touchAction = "none";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = track(backgroundTexture());
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.45;
  track(envRT);
  pmrem.dispose();

  const timer = new THREE.Timer();
  timer.connect(document);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 3.4, 9.5);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.3, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.minDistance = 5.5;
  controls.maxDistance = 20;
  controls.minPolarAngle = 0.35;
  controls.maxPolarAngle = 1.48;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.45;
  controls.rotateSpeed = 0.6;

  /* lights */
  scene.add(new THREE.AmbientLight(0xffd6e4, 0.12));
  scene.add(new THREE.HemisphereLight(0xffe0ec, 0x2a0010, 0.4));
  const key = new THREE.DirectionalLight(0xfff1f6, 2.0);
  key.position.set(4, 9, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -4;
  key.shadow.camera.right = 4;
  key.shadow.camera.top = 4;
  key.shadow.camera.bottom = -4;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 25;
  key.shadow.bias = -0.0008;
  key.shadow.radius = 4;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xff6fa5, 1.6);
  rim.position.set(-6, 3, -5);
  scene.add(rim);
  const front = new THREE.PointLight(0xff9fc3, 2.5, 14, 1.4);
  front.position.set(0, 2.5, 5);
  scene.add(front);
  const innerLight = new THREE.PointLight(0xffc4d6, 0, 4, 1.6);
  innerLight.position.set(0, 1.6, 0);
  scene.add(innerLight);

  /* materials */
  const gold = track(
    new THREE.MeshStandardMaterial({ color: 0xf2c25a, metalness: 1, roughness: 0.22 }),
  );
  const ribbonMat = track(
    new THREE.MeshStandardMaterial({ color: 0xb98d3a, metalness: 0.75, roughness: 0.38 }),
  );
  const faceHearts = track(boxFaceTexture(true));
  const facePlain = track(boxFaceTexture(false));
  const boxMat = track(
    new THREE.MeshPhysicalMaterial({
      map: faceHearts,
      roughness: 0.42,
      clearcoat: 0.55,
      clearcoatRoughness: 0.35,
    }),
  );
  const boxPlainMat = track(
    new THREE.MeshPhysicalMaterial({
      map: facePlain,
      roughness: 0.42,
      clearcoat: 0.55,
      clearcoatRoughness: 0.35,
    }),
  );
  const hiddenMat = track(new THREE.MeshBasicMaterial({ visible: false }));
  const innerMat = track(
    new THREE.MeshStandardMaterial({ color: 0xff7aa8, roughness: 0.7, side: THREE.BackSide }),
  );

  /* ── pedestal ── */
  const pedestal = new THREE.Group();
  scene.add(pedestal);
  const pedMat = track(
    new THREE.MeshPhysicalMaterial({
      color: 0xf2408a,
      emissive: 0xa0103f,
      emissiveIntensity: 0.22,
      roughness: 0.28,
      clearcoat: 1,
      clearcoatRoughness: 0.15,
    }),
  );
  const ped = new THREE.Mesh(track(new THREE.CylinderGeometry(3, 3.05, 0.5, 96)), pedMat);
  ped.position.y = -0.25;
  ped.receiveShadow = true;
  pedestal.add(ped);
  const baseMat = track(
    new THREE.MeshStandardMaterial({ color: 0x3a0a1c, roughness: 0.4, metalness: 0.3 }),
  );
  const base = new THREE.Mesh(track(new THREE.CylinderGeometry(3.25, 3.35, 0.25, 96)), baseMat);
  base.position.y = -0.62;
  pedestal.add(base);
  for (const [r, y, tube] of [
    [3.0, 0, 0.055],
    [3.05, -0.5, 0.05],
    [3.3, -0.5, 0.04],
    [3.35, -0.74, 0.04],
  ] as const) {
    const ring = new THREE.Mesh(track(new THREE.TorusGeometry(r, tube, 12, 128)), gold);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    pedestal.add(ring);
  }
  const glowTex = track(
    radialTexture([
      [0, "rgba(255,220,235,0.4)"],
      [0.45, "rgba(255,120,180,0.2)"],
      [1, "rgba(255,60,140,0)"],
    ]),
  );
  const glow = new THREE.Mesh(
    track(new THREE.CircleGeometry(2.95, 64)),
    track(
      new THREE.MeshBasicMaterial({
        map: glowTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    ),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.004;
  pedestal.add(glow);

  /* ── gift box body (open top) ── */
  const BOX_W = 2;
  const BOX_H = 1.8;
  const gift = new THREE.Group();
  scene.add(gift);

  const body = new THREE.Mesh(track(new THREE.BoxGeometry(BOX_W, BOX_H, BOX_W)), [
    boxMat,
    boxMat,
    hiddenMat,
    boxPlainMat,
    boxMat,
    boxMat,
  ]);
  body.position.y = BOX_H / 2;
  body.castShadow = true;
  gift.add(body);
  const inner = new THREE.Mesh(
    track(new THREE.BoxGeometry(BOX_W - 0.04, BOX_H - 0.02, BOX_W - 0.04)),
    [innerMat, innerMat, hiddenMat, innerMat, innerMat, innerMat],
  );
  inner.position.y = BOX_H / 2 + 0.01;
  gift.add(inner);

  const RIB = 0.3;
  const stripV = track(new THREE.BoxGeometry(RIB, BOX_H, 0.012));
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(stripV, ribbonMat);
    const a = (i * Math.PI) / 2;
    s.position.set(Math.sin(a) * (BOX_W / 2 + 0.006), BOX_H / 2, Math.cos(a) * (BOX_W / 2 + 0.006));
    s.rotation.y = a;
    gift.add(s);
  }

  /* ── lid (hinged at the back) ── */
  const LID_W = 2.16;
  const LID_H = 0.42;
  const lidPivot = new THREE.Group();
  const LID_BOTTOM = BOX_H - 0.2;
  lidPivot.position.set(LID_W / 2, LID_BOTTOM, 0);
  gift.add(lidPivot);
  const lid = new THREE.Group();
  lid.position.set(-LID_W / 2, 0, 0);
  lidPivot.add(lid);
  const lidMesh = new THREE.Mesh(track(new THREE.BoxGeometry(LID_W, LID_H, LID_W)), boxPlainMat);
  lidMesh.position.y = LID_H / 2;
  lidMesh.castShadow = true;
  lid.add(lidMesh);
  const lidTopStripA = new THREE.Mesh(track(new THREE.BoxGeometry(LID_W + 0.01, 0.012, RIB)), ribbonMat);
  lidTopStripA.position.y = LID_H + 0.006;
  lid.add(lidTopStripA);
  const lidTopStripB = new THREE.Mesh(track(new THREE.BoxGeometry(RIB, 0.012, LID_W + 0.01)), ribbonMat);
  lidTopStripB.position.y = LID_H + 0.007;
  lid.add(lidTopStripB);
  const lidStrip = track(new THREE.BoxGeometry(RIB, LID_H, 0.012));
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(lidStrip, ribbonMat);
    const a = (i * Math.PI) / 2;
    s.position.set(Math.sin(a) * (LID_W / 2 + 0.006), LID_H / 2, Math.cos(a) * (LID_W / 2 + 0.006));
    s.rotation.y = a;
    lid.add(s);
  }

  // golden heart "crown" bow
  const bow = new THREE.Group();
  bow.position.y = LID_H;
  lid.add(bow);
  const bigLoop = track(new THREE.TubeGeometry(heartLoopCurve(0.27), 120, 0.03, 8, true));
  const smallLoop = track(new THREE.TubeGeometry(heartLoopCurve(0.19), 100, 0.026, 8, true));
  for (let i = 0; i < 4; i++) {
    const big = new THREE.Mesh(bigLoop, gold);
    big.rotation.set(0.55, Math.PI / 4 + (i * Math.PI) / 2, 0, "YXZ");
    big.castShadow = true;
    bow.add(big);
    const small = new THREE.Mesh(smallLoop, gold);
    small.rotation.set(0.95, (i * Math.PI) / 2, 0, "YXZ");
    bow.add(small);
  }
  const knot = new THREE.Mesh(track(new THREE.SphereGeometry(0.1, 20, 16)), gold);
  knot.position.y = 0.05;
  bow.add(knot);
  const heartGeo = track(heartGeometry());
  const gemMat = track(
    new THREE.MeshPhysicalMaterial({
      color: 0xe0102f,
      emissive: 0x7a0010,
      emissiveIntensity: 0.6,
      roughness: 0.12,
      clearcoat: 1,
    }),
  );
  const gem = new THREE.Mesh(heartGeo, gemMat);
  gem.scale.setScalar(0.24);
  gem.position.y = 0.26;
  bow.add(gem);

  /* ── padlock + key ── */
  const lockAssembly = new THREE.Group();
  lockAssembly.position.set(0, LID_BOTTOM - 0.16, BOX_W / 2 + 0.07);
  gift.add(lockAssembly);
  const fadeMats: THREE.Material[] = [];
  const lockGold = track(gold.clone());
  lockGold.transparent = true;
  fadeMats.push(lockGold);
  const lockBody = new THREE.Mesh(track(new THREE.BoxGeometry(0.34, 0.3, 0.1)), lockGold);
  lockBody.castShadow = true;
  lockAssembly.add(lockBody);
  const shackle = new THREE.Mesh(
    track(new THREE.TorusGeometry(0.11, 0.026, 10, 24, Math.PI)),
    lockGold,
  );
  shackle.position.y = 0.15;
  lockAssembly.add(shackle);
  const holeMat = track(new THREE.MeshBasicMaterial({ color: 0x1a0508, transparent: true }));
  fadeMats.push(holeMat);
  const hole = new THREE.Mesh(track(new THREE.CircleGeometry(0.03, 16)), holeMat);
  hole.position.set(0, 0.02, 0.051);
  lockAssembly.add(hole);
  const slot = new THREE.Mesh(track(new THREE.PlaneGeometry(0.02, 0.06)), holeMat);
  slot.position.set(0, -0.02, 0.051);
  lockAssembly.add(slot);

  const keyMat = track(gold.clone());
  keyMat.transparent = true;
  fadeMats.push(keyMat);
  const keyGroup = new THREE.Group(); // origin = shaft tip, shaft along +z
  const shaft = new THREE.Mesh(track(new THREE.CylinderGeometry(0.014, 0.014, 0.32, 10)), keyMat);
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = 0.16;
  keyGroup.add(shaft);
  const bitGeo = track(new THREE.BoxGeometry(0.012, 0.05, 0.03));
  for (const z of [0.04, 0.1]) {
    const bit = new THREE.Mesh(bitGeo, keyMat);
    bit.position.set(0, -0.03, z);
    keyGroup.add(bit);
  }
  const bowRing = new THREE.Mesh(track(new THREE.TorusGeometry(0.075, 0.02, 10, 28)), keyMat);
  bowRing.position.z = 0.4;
  bowRing.rotation.x = Math.PI / 2;
  bowRing.rotation.z = Math.PI / 2;
  keyGroup.add(bowRing);
  const keyHeart = new THREE.Mesh(heartGeo, keyMat);
  keyHeart.scale.setScalar(0.08);
  keyHeart.position.z = 0.4;
  keyHeart.rotation.y = Math.PI / 2;
  keyGroup.add(keyHeart);
  keyGroup.visible = false;
  lockAssembly.add(keyGroup);
  const keyStart = new THREE.Vector3(2.6, 1.3, 2.2);
  const keyEnd = new THREE.Vector3(0, 0.02, 0.0);

  /* ── bouquet ── */
  const bouquet = new THREE.Group();
  const BOUQUET_START = -0.95;
  const BOUQUET_END = 0.95;
  bouquet.position.y = BOUQUET_START;
  bouquet.scale.setScalar(0.78); // fits inside the box while hidden
  gift.add(bouquet);

  const roseGeo = track(roseHeadGeometry());
  const roseMat = track(
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, side: THREE.DoubleSide }),
  );
  const ROSE_N = 26;
  const roses = new THREE.InstancedMesh(roseGeo, roseMat, ROSE_N);
  roses.frustumCulled = false;
  roses.castShadow = true;
  bouquet.add(roses);
  const dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  const domeCenter = new THREE.Vector3(0, 2.0, 0);
  const roseColors = [0xa80a22, 0xc40f2a, 0x8e0719, 0xb80d26, 0xd2142f];
  const stemParts: THREE.BufferGeometry[] = [];
  const tie = new THREE.Vector3(0, 0.75, 0);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < ROSE_N; i++) {
    const v = i / (ROSE_N - 1);
    const polar = Math.acos(1 - v * (1 - Math.cos(1.25)));
    const az = i * golden;
    const dir = new THREE.Vector3(
      Math.sin(polar) * Math.cos(az),
      Math.cos(polar),
      Math.sin(polar) * Math.sin(az),
    );
    const p = domeCenter.clone().addScaledVector(dir, 0.72);
    dummy.position.copy(p);
    dummy.quaternion.setFromUnitVectors(up, dir);
    dummy.scale.setScalar(rand(0.82, 0.98));
    dummy.updateMatrix();
    roses.setMatrixAt(i, dummy.matrix);
    roses.setColorAt(i, new THREE.Color(roseColors[i % roseColors.length]));
    const start = p.clone().addScaledVector(dir, -0.04);
    const mid = start.clone().lerp(tie, 0.5).add(new THREE.Vector3(dir.x * 0.12, 0, dir.z * 0.12));
    const bottom = new THREE.Vector3(-dir.x * 0.16, 0.0, -dir.z * 0.16);
    const curve = new THREE.CatmullRomCurve3([start, mid, tie, bottom]);
    stemParts.push(new THREE.TubeGeometry(curve, 20, 0.017, 5, false));
  }
  roses.instanceMatrix.needsUpdate = true;
  if (roses.instanceColor) roses.instanceColor.needsUpdate = true;
  const stemGeo = track(mergeGeometries(stemParts)!);
  stemParts.forEach((s) => s.dispose());
  const stemMat = track(new THREE.MeshStandardMaterial({ color: 0x3f8f3a, roughness: 0.6 }));
  bouquet.add(new THREE.Mesh(stemGeo, stemMat));
  const leafGeo = track(leafGeometry());
  const leafMat = track(
    new THREE.MeshStandardMaterial({ color: 0x4caf50, roughness: 0.5, side: THREE.DoubleSide }),
  );
  const LEAF_N = 16;
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, LEAF_N);
  leaves.frustumCulled = false;
  for (let i = 0; i < LEAF_N; i++) {
    const a = (i / LEAF_N) * Math.PI * 2 + rand(-0.2, 0.2);
    const y = rand(1.05, 1.45);
    const r = 0.18 + (y - 1.0) * 0.55;
    dummy.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    dummy.rotation.set(0, 0, 0);
    dummy.lookAt(Math.cos(a) * 3, y + 1.4, Math.sin(a) * 3);
    dummy.rotateX(Math.PI / 2);
    dummy.scale.setScalar(rand(0.9, 1.3));
    dummy.updateMatrix();
    leaves.setMatrixAt(i, dummy.matrix);
  }
  bouquet.add(leaves);
  const bowTie = new THREE.Mesh(
    track(new THREE.TorusGeometry(0.1, 0.035, 10, 24)),
    track(new THREE.MeshStandardMaterial({ color: 0xffb3c9, roughness: 0.35, metalness: 0.2 })),
  );
  bowTie.rotation.x = Math.PI / 2;
  bowTie.position.copy(tie);
  bouquet.add(bowTie);

  // envelope (clickable) — always kept on the side of the bouquet that faces the camera
  const card = new THREE.Group();
  card.position.set(0, 1.45, 0.95);
  bouquet.add(card);
  const cardMat = track(
    new THREE.MeshStandardMaterial({
      map: track(cardTexture()),
      roughness: 0.75,
      side: THREE.DoubleSide,
      color: 0xd8d0c8,
    }),
  );
  const cardMesh = new THREE.Mesh(track(new THREE.PlaneGeometry(0.72, 0.48)), cardMat);
  card.add(cardMesh);
  const cardHit = new THREE.Mesh(track(new THREE.PlaneGeometry(1.0, 0.8)), hiddenMat);
  card.add(cardHit);
  const camLocal = new THREE.Vector3();

  /* ── orbiting text ring ── */
  const ring = new THREE.Group();
  ring.position.y = 2.75;
  ring.visible = false;
  gift.add(ring);
  const chars = Array.from(opts.ringText);
  const step = (Math.PI * 2) / (chars.length + 4);
  const letterGeo = track(new THREE.PlaneGeometry(0.62, 0.78));
  const letterMats: THREE.MeshBasicMaterial[] = [];
  const RING_R = 3.0;
  chars.forEach((ch, i) => {
    if (ch === " ") return;
    const m = track(
      new THREE.MeshBasicMaterial({
        map: track(letterTexture(ch)),
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        color: 0xd8d4de,
      }),
    );
    letterMats.push(m);
    const mesh = new THREE.Mesh(letterGeo, m);
    const a = (i - (chars.length - 1) / 2) * step;
    mesh.position.set(Math.sin(a) * RING_R, 0, Math.cos(a) * RING_R);
    mesh.rotation.y = a;
    ring.add(mesh);
  });

  /* ── butterflies ── */
  const wingTex = track(wingTexture());
  const wingMat = track(
    new THREE.MeshStandardMaterial({
      map: wingTex,
      transparent: true,
      alphaTest: 0.2,
      side: THREE.DoubleSide,
      roughness: 0.6,
      emissive: 0x6a1a3a,
      emissiveIntensity: 0.08,
    }),
  );
  const wingGeo = track(new THREE.PlaneGeometry(1, 1));
  wingGeo.translate(0.5, 0, 0);
  wingGeo.rotateX(Math.PI / 2);
  const bodyGeo = track(new THREE.CapsuleGeometry(0.035, 0.42, 4, 8));
  bodyGeo.rotateX(Math.PI / 2);
  const bodyMat = track(new THREE.MeshStandardMaterial({ color: 0x2a0a1e, roughness: 0.5 }));
  function makeButterfly() {
    const g = new THREE.Group();
    const left = new THREE.Group();
    const right = new THREE.Group();
    const lw = new THREE.Mesh(wingGeo, wingMat);
    lw.scale.x = -1;
    left.add(lw);
    right.add(new THREE.Mesh(wingGeo, wingMat));
    g.add(left, right, new THREE.Mesh(bodyGeo, bodyMat));
    g.scale.setScalar(0.55);
    scene.add(g);
    return { g, left, right };
  }
  const butterflies = [makeButterfly(), makeButterfly()];
  const perch = new THREE.Vector3(0.72, LID_BOTTOM + LID_H + 0.02, 0.55);
  const tmpV = new THREE.Vector3();
  const tmpV2 = new THREE.Vector3();
  function butterflyPath(i: number, time: number, out: THREE.Vector3) {
    const w = i === 0 ? 0.32 : 0.24;
    const ph = i === 0 ? 0 : 2.4;
    const R = i === 0 ? 3.1 : 3.8;
    out.set(
      Math.cos(time * w + ph) * R,
      (i === 0 ? 2.6 : 3.3) + Math.sin(time * w * 2.3 + ph) * 0.7,
      Math.sin(time * w + ph) * R * 0.8,
    );
    return out;
  }

  /* ── particles ── */
  const dotTex = track(
    radialTexture(
      [
        [0, "rgba(255,255,255,1)"],
        [0.25, "rgba(255,230,240,0.85)"],
        [1, "rgba(255,200,220,0)"],
      ],
      64,
    ),
  );
  function sparkleLayer(n: number, size: number, color: number) {
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = rand(-14, 14);
      pos[i * 3 + 1] = rand(-5, 10);
      pos[i * 3 + 2] = rand(-12, 5);
    }
    const g = track(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const m = track(
      new THREE.PointsMaterial({
        size,
        map: dotTex,
        color,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    const p = new THREE.Points(g, m);
    scene.add(p);
    return p;
  }
  const sparklesA = sparkleLayer(500, 0.07, 0xffffff);
  const sparklesB = sparkleLayer(350, 0.1, 0xffc6dc);

  // magic dust from the box
  const DUST_N = 260;
  const dustPos = new Float32Array(DUST_N * 3);
  const dustVel = new Float32Array(DUST_N * 3);
  const dustLife = new Float32Array(DUST_N);
  const dustGeo = track(new THREE.BufferGeometry());
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(
    dustGeo,
    track(
      new THREE.PointsMaterial({
        size: 0.08,
        map: dotTex,
        color: 0xffd98a,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    ),
  );
  dust.visible = false;
  dust.frustumCulled = false;
  scene.add(dust);
  const spawnDust = (i: number) => {
    dustPos[i * 3] = rand(-0.85, 0.85);
    dustPos[i * 3 + 1] = BOX_H - rand(0, 0.3);
    dustPos[i * 3 + 2] = rand(-0.85, 0.85);
    dustVel[i * 3] = rand(-0.35, 0.35);
    dustVel[i * 3 + 1] = rand(0.6, 2.0);
    dustVel[i * 3 + 2] = rand(-0.35, 0.35);
    dustLife[i] = rand(0.6, 2.6);
  };
  for (let i = 0; i < DUST_N; i++) spawnDust(i);

  // floating hearts
  const HEART_N = 70;
  const heartMat = track(
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 }),
  );
  const hearts = new THREE.InstancedMesh(heartGeo, heartMat, HEART_N);
  hearts.frustumCulled = false;
  scene.add(hearts);
  const heartColors = [0xff3d6e, 0xff8fb0, 0xffd3e0, 0xe5243b, 0xff5d8f];
  type P = { p: THREE.Vector3; v: THREE.Vector3; r: THREE.Euler; rs: THREE.Vector3; s: number; life: number; age: number; alive: boolean };
  const heartState: P[] = [];
  for (let i = 0; i < HEART_N; i++) {
    hearts.setColorAt(i, new THREE.Color(heartColors[i % heartColors.length]));
    heartState.push({
      p: new THREE.Vector3(),
      v: new THREE.Vector3(),
      r: new THREE.Euler(),
      rs: new THREE.Vector3(),
      s: 0,
      life: 1,
      age: 0,
      alive: false,
    });
    dummy.scale.setScalar(0);
    dummy.updateMatrix();
    hearts.setMatrixAt(i, dummy.matrix);
  }
  if (hearts.instanceColor) hearts.instanceColor.needsUpdate = true;
  const spawnHeart = (h: P, burst: boolean) => {
    h.p.set(rand(-0.8, 0.8), BOX_H + rand(-0.2, 0.4), rand(-0.8, 0.8));
    const out = burst ? rand(0.6, 1.8) : rand(0.2, 0.7);
    const a = rand(0, Math.PI * 2);
    h.v.set(Math.cos(a) * out, burst ? rand(1.6, 3.2) : rand(0.6, 1.3), Math.sin(a) * out);
    h.r.set(rand(-0.4, 0.4), rand(0, Math.PI * 2), rand(-0.4, 0.4));
    h.rs.set(rand(-1, 1), rand(-2, 2), rand(-1, 1));
    h.s = rand(0.13, 0.3);
    h.life = rand(3.5, 6.5);
    h.age = 0;
    h.alive = true;
  };

  // falling rose petals (always)
  const PETAL_N = 70;
  const petalMat = track(
    new THREE.MeshStandardMaterial({ color: 0xd0142f, roughness: 0.5, side: THREE.DoubleSide, emissive: 0x3a0008 }),
  );
  const petals = new THREE.InstancedMesh(track(petalGeometry()), petalMat, PETAL_N);
  petals.frustumCulled = false;
  scene.add(petals);
  const petalState = Array.from({ length: PETAL_N }, () => ({
    p: new THREE.Vector3(rand(-9, 9), rand(-3, 9), rand(-7, 4)),
    v: new THREE.Vector3(rand(-0.2, 0.2), rand(-0.55, -0.25), rand(-0.1, 0.1)),
    r: new THREE.Euler(rand(0, 6), rand(0, 6), rand(0, 6)),
    rs: new THREE.Vector3(rand(-1.5, 1.5), rand(-1.5, 1.5), rand(-1.5, 1.5)),
    ph: rand(0, 10),
  }));

  /* ── post-processing ── */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.38, 0.45, 0.9);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  /* ── sizing ── */
  let distFactor = 1;
  const resize = () => {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    distFactor = camera.aspect < 1 ? Math.min(1.9, Math.max(1, (1 / camera.aspect) * 0.8)) : 1;
  };
  resize();
  // start at the right distance for this screen shape
  camera.position.sub(controls.target).setLength(9.5 * distFactor).add(controls.target);
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  /* ── interaction ── */
  let phase: GiftPhase = "idle";
  let openStart = -1;
  const setPhase = (p: GiftPhase) => {
    phase = p;
    opts.onPhase?.(p);
  };
  const open = () => {
    if (phase !== "idle") return;
    openStart = timer.getElapsed();
    keyGroup.visible = true;
    setPhase("opening");
  };

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pick = (e: PointerEvent, targets: THREE.Object3D[]) => {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObjects(targets, true).length > 0;
  };
  let downX = 0;
  let downY = 0;
  const onDown = (e: PointerEvent) => {
    downX = e.clientX;
    downY = e.clientY;
  };
  const onUp = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 8) return; // it was a drag
    if (phase === "idle") open();
    else if (phase === "open" && pick(e, [cardHit, roses])) opts.onCardClick?.();
  };
  const onMove = (e: PointerEvent) => {
    if (e.buttons) return;
    const over = phase === "idle" || (phase === "open" && pick(e, [cardHit, roses]));
    renderer.domElement.style.cursor = over ? "pointer" : "grab";
  };
  renderer.domElement.addEventListener("pointerdown", onDown);
  renderer.domElement.addEventListener("pointerup", onUp);
  renderer.domElement.addEventListener("pointermove", onMove);

  /* ── animation ── */
  const camOffset = new THREE.Vector3();
  let userZoomed = false;
  let lastHeartSpawn = 0;
  let burstDone = false;
  const lockBase = lockAssembly.position.clone();
  const lidBaseY = lidPivot.position.y;

  const tick = (now: number) => {
    timer.update(now);
    const dt = Math.min(timer.getDelta(), 0.05);
    const time = timer.getElapsed();
    const t = openStart >= 0 ? time - openStart : -1;

    // idle life
    gem.rotation.y = time * 0.9;
    gemMat.emissiveIntensity = 0.5 + Math.sin(time * 3) * 0.25;
    if (t < 0) {
      lockAssembly.rotation.z = Math.sin(time * 1.6) * 0.06;
      gift.position.y = Math.sin(time * 1.2) * 0.03;
    }

    // opening sequence
    let openAmt = 0;
    if (t >= 0) {
      gift.position.y *= 0.95;
      // key flies in
      const k1 = easeInOutCubic(prog(t, 0, 1.2));
      keyGroup.position.lerpVectors(keyStart, keyEnd, k1);
      keyGroup.position.y += Math.sin(k1 * Math.PI) * 0.6;
      keyGroup.rotation.y = (1 - k1) * -1.2;
      keyGroup.rotation.x = (1 - k1) * 0.4;
      // turn
      keyGroup.rotation.z = easeOutBack(prog(t, 1.25, 0.5)) * (Math.PI / 2);
      lockAssembly.rotation.z = 0;
      // unlock
      shackle.position.y = 0.15 + easeOutBack(prog(t, 1.75, 0.25)) * 0.09;
      // fall
      const f = prog(t, 2.0, 0.9);
      lockAssembly.position.set(lockBase.x, lockBase.y - f * f * 2.2, lockBase.z + f * 0.7);
      lockAssembly.rotation.x = f * 1.6;
      for (const m of fadeMats) m.opacity = 1 - f;
      lockAssembly.visible = f < 1;
      // lid opens
      const l = prog(t, 2.5, 1.3);
      lidPivot.rotation.z = -1.85 * easeOutCubic(l);
      lidPivot.position.y = lidBaseY + Math.sin(l * Math.PI) * 0.3;
      openAmt = l;
      innerLight.intensity = 2.5 * prog(t, 2.6, 0.8);
      dust.visible = t > 2.7;
      // bouquet rises
      const b = easeOutCubic(prog(t, 3.0, 2.4));
      bouquet.position.y = THREE.MathUtils.lerp(BOUQUET_START, BOUQUET_END, b);
      bouquet.rotation.y = (1 - b) * -1.4;
      bouquet.scale.setScalar(THREE.MathUtils.lerp(0.78, 1, b));
      // text ring
      const r = prog(t, 4.6, 1.6);
      ring.visible = r > 0;
      ring.scale.setScalar(0.4 + 0.6 * easeOutCubic(r));
      for (const m of letterMats) m.opacity = r;
      // camera framing
      const c = easeInOutCubic(prog(t, 2.5, 3.2));
      controls.target.y = THREE.MathUtils.lerp(1.3, 2.0, c);
      if (t > 3.2 && !burstDone) {
        burstDone = true;
        let n = 0;
        for (const h of heartState) if (!h.alive && n++ < 34) spawnHeart(h, true);
      }
      if (phase === "opening" && t > 6.2) setPhase("open");
    }

    // camera distance easing
    const baseDist = (t >= 0 ? THREE.MathUtils.lerp(9.5, 11.8, easeInOutCubic(prog(t, 2.5, 3.2))) : 9.5) * distFactor;
    camOffset.subVectors(camera.position, controls.target);
    const d = camOffset.length();
    if (!userZoomed) camOffset.setLength(d + (baseDist - d) * 0.04);
    camera.position.copy(controls.target).add(camOffset);

    // ring spin + card pulse
    ring.rotation.y -= dt * 0.38;
    ring.position.y = 2.75 + Math.sin(time * 0.8) * 0.08;
    const pulse = phase === "open" ? 1 + Math.sin(time * 4) * 0.08 : 1;
    card.scale.setScalar(pulse);
    // keep the envelope in front of the bouquet, facing the viewer
    bouquet.updateMatrixWorld();
    camLocal.copy(camera.position);
    bouquet.worldToLocal(camLocal);
    const az = Math.atan2(camLocal.x, camLocal.z);
    card.position.set(Math.sin(az) * 0.95, 1.55 + Math.sin(time * 2) * 0.03, Math.cos(az) * 0.95);
    card.lookAt(camera.position);

    // dust
    if (dust.visible) {
      const fade = t > 9 ? 0.35 : 1;
      for (let i = 0; i < DUST_N; i++) {
        dustLife[i] -= dt;
        if (dustLife[i] <= 0 && Math.random() < fade) spawnDust(i);
        dustVel[i * 3 + 1] *= 0.995;
        dustPos[i * 3] += dustVel[i * 3] * dt;
        dustPos[i * 3 + 1] += dustVel[i * 3 + 1] * dt;
        dustPos[i * 3 + 2] += dustVel[i * 3 + 2] * dt;
      }
      dustGeo.attributes.position.needsUpdate = true;
    }

    // hearts
    if (t > 3.2 && time - lastHeartSpawn > 0.22) {
      lastHeartSpawn = time;
      const h = heartState.find((x) => !x.alive);
      if (h) spawnHeart(h, false);
    }
    for (let i = 0; i < HEART_N; i++) {
      const h = heartState[i];
      if (!h.alive) continue;
      h.age += dt;
      if (h.age > h.life) {
        h.alive = false;
        dummy.scale.setScalar(0);
      } else {
        h.v.y = Math.max(0.35, h.v.y - dt * 0.9);
        h.v.x *= 0.995;
        h.v.z *= 0.995;
        h.p.addScaledVector(h.v, dt);
        h.p.x += Math.sin(time * 2 + i) * dt * 0.25;
        h.r.x += h.rs.x * dt;
        h.r.y += h.rs.y * dt;
        h.r.z += h.rs.z * dt;
        const grow = Math.min(1, h.age * 3) * Math.min(1, (h.life - h.age) * 1.5);
        dummy.position.copy(h.p);
        dummy.rotation.copy(h.r);
        dummy.scale.setScalar(h.s * grow);
      }
      dummy.updateMatrix();
      hearts.setMatrixAt(i, dummy.matrix);
    }
    hearts.instanceMatrix.needsUpdate = true;

    // petals
    for (let i = 0; i < PETAL_N; i++) {
      const s = petalState[i];
      s.p.addScaledVector(s.v, dt);
      s.p.x += Math.sin(time * 0.8 + s.ph) * dt * 0.3;
      s.r.x += s.rs.x * dt;
      s.r.y += s.rs.y * dt;
      s.r.z += s.rs.z * dt;
      if (s.p.y < -4) {
        s.p.set(rand(-9, 9), rand(8, 10), rand(-7, 4));
      }
      dummy.position.copy(s.p);
      dummy.rotation.copy(s.r);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      petals.setMatrixAt(i, dummy.matrix);
    }
    petals.instanceMatrix.needsUpdate = true;

    // sparkles twinkle + drift
    (sparklesA.material as THREE.PointsMaterial).opacity = 0.55 + Math.sin(time * 1.7) * 0.35;
    (sparklesB.material as THREE.PointsMaterial).opacity = 0.55 + Math.cos(time * 1.3) * 0.35;
    sparklesA.rotation.y = time * 0.01;
    sparklesB.rotation.y = -time * 0.008;

    // butterflies
    butterflies.forEach((b, i) => {
      const flapSpeed = i === 0 && (t < 0 || t < 2.6) ? 4 : 15;
      const flap = Math.sin(time * flapSpeed + i) * (flapSpeed > 5 ? 0.95 : 0.5) + 0.25;
      b.right.rotation.z = flap;
      b.left.rotation.z = -flap;
      butterflyPath(i, time, tmpV);
      butterflyPath(i, time + 0.05, tmpV2);
      if (i === 0) {
        const takeOff = t < 0 ? 0 : easeInOutCubic(prog(t, 2.6, 2.0));
        const perchWorld = perch.clone().add(gift.position);
        tmpV.lerpVectors(perchWorld, tmpV, takeOff);
        tmpV2.lerpVectors(perchWorld.clone().add(new THREE.Vector3(-0.05, 0, 0.02)), tmpV2, takeOff);
      }
      b.g.position.copy(tmpV);
      b.g.position.y += Math.sin(time * flapSpeed) * 0.02;
      b.g.lookAt(tmpV2.x, tmpV2.y, tmpV2.z);
    });

    // gentle lid wobble feeling of "open" state
    if (openAmt >= 1) lidPivot.rotation.z = -1.85 + Math.sin(time * 1.1) * 0.02;

    controls.update();
    composer.render();
  };

  const onWheel = () => {
    userZoomed = true;
  };
  renderer.domElement.addEventListener("wheel", onWheel, { passive: true });
  renderer.setAnimationLoop(tick);

  return {
    open,
    dispose: () => {
      renderer.setAnimationLoop(null);
      timer.dispose();
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("wheel", onWheel);
      controls.dispose();
      composer.dispose();
      roses.dispose();
      hearts.dispose();
      petals.dispose();
      leaves.dispose();
      for (const d of disposables) d.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
