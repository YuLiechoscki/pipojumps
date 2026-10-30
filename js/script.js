/* =========================================================
   Pipo Runner – endless runner em HTML, CSS e JS puros
   ========================================================= */

// ---------- Constantes de ajuste ----------
const STAGE_W = 800, STAGE_H = 400;
const PLAYER = { x: 80, w: 44, h: 48, duckH: 32 };
const GRAVITY = 3000;
const FAST_FALL = 2.4;
const JUMP_SPEED = 850;
const START_SPEED = 520;
const SPEED_PER_LEVEL = 70;   // aumento de velocidade a cada nível
const MAX_SPEED = 1250;
const MENU_SPEED = 120;
const HIT_MARGIN = 6;
const POINTS_PER_LEVEL = 8;

// Personagens disponíveis no lobby (o visual de cada um está no CSS: data-skin)
const SKINS = [
  { id: 'pipo',   name: 'Pipo' },
  { id: 'rosa',   name: 'Rosinha' },
  { id: 'pingu',  name: 'Pingu' },
  { id: 'coelho', name: 'Coelho' },
  { id: 'gato',   name: 'Gatinho' },
  { id: 'robo',   name: 'Robô' },
];

// Obstáculos de chão: w e h são faixas [mín, máx] sorteadas a cada aparição.
// weight = chance relativa | min = nível mínimo para começar a aparecer
const GROUND_TYPES = [
  { cls: 'stump',  w: [30, 42],  h: [34, 46], weight: 3, min: 0 },
  { cls: 'tall',   w: [28, 36],  h: [54, 68], weight: 2, min: 0 },
  { cls: 'bush',   w: [48, 70],  h: [30, 40], weight: 3, min: 0 },
  { cls: 'rock',   w: [40, 56],  h: [22, 30], weight: 3, min: 0 },
  { cls: 'spikes', w: [56, 84],  h: [18, 24], weight: 2, min: 1 },
  { cls: 'log',    w: [80, 110], h: [26, 32], weight: 2, min: 1 },
  { cls: 'cactus', w: [28, 36],  h: [52, 66], weight: 2, min: 2 },
];
// Tipos que podem formar duplas
const CLUSTER_TYPES = GROUND_TYPES.filter((t) => ['stump', 'tall', 'rock', 'cactus'].includes(t.cls));
const TRIO_STUMP = { cls: 'stump', w: 36, h: 40 };

// Pássaros (y = altura do chão até a base | mul = velocidade extra)
const BIRDS = [
  { cls: 'bird',        w: 42, h: 26, y: 30, mul: 1.2,  weight: 4, min: 0 },   // abaixar
  { cls: 'bird purple', w: 42, h: 26, y: 6,  mul: 1.15, weight: 2, min: 2 },   // rente ao chão: pular
  { cls: 'bird blue',   w: 42, h: 26, y: 78, mul: 1.35, weight: 2, min: 3 },   // alto e rápido: NÃO pule
  { cls: 'bird gold',   w: 42, h: 26, y: 46, mul: 1.1,  weight: 2, min: 4,     // sobe e desce
    motion: { type: 'wave', amp: 20, period: 1.1 } },
];

// Obstáculos especiais
const SPECIALS = [
  { cls: 'ball',   w: 30, h: 30, y: 0, mul: 1,    weight: 3, min: 3,
    motion: { type: 'bounce', amp: 62, period: 0.75 } },
];

// ---------- Elementos da página ----------
const $ = (id) => document.getElementById(id);
const stage = $('stage'), player = $('player'), obstacleLayer = $('obstacles');
const scoreEl = $('score'), bestEl = $('best'), levelEl = $('level');
const banner = $('level-banner'), skinNameEl = $('skin-name');
const startScreen = $('start-screen'), overScreen = $('over-screen');
const dotsEl = $('skin-dots');
const ghostPrev = $('ghost-prev'), ghostNext = $('ghost-next');
SKINS.forEach(() => dotsEl.appendChild(document.createElement('i')));

// ---------- Estado do jogo ----------
let state = 'menu';
let score = 0, best = loadBest();
let skinIndex = loadSkin();
let level = 0;
let speed = MENU_SPEED;
let playerY = 0, playerVy = 0;
let ducking = false, duckPointer = null;
let obstacles = [];
let distanceToNext = 0;
let scroll = { g: 0, h1: 0, h2: 0 };
let clouds = [];
let bannerTimer = null;
let lastTime = performance.now();

// ---------- Recorde e personagem salvos ----------
function loadBest() {
  try { return Number(localStorage.getItem('pipoBest')) || 0; } catch { return 0; }
}
function saveBest(value) {
  try { localStorage.setItem('pipoBest', value); } catch { /* ignora */ }
}
function loadSkin() {
  try {
    const i = SKINS.findIndex((s) => s.id === localStorage.getItem('pipoSkin'));
    return i >= 0 ? i : 0;
  } catch { return 0; }
}
function saveSkin(id) {
  try { localStorage.setItem('pipoSkin', id); } catch { /* ignora */ }
}

// ---------- Escolha de personagem ----------
function applySkin(animate) {
  const skin = SKINS[skinIndex];
  player.dataset.skin = skin.id;
  skinNameEl.textContent = skin.name;
  saveSkin(skin.id);
  [...dotsEl.children].forEach((d, i) => d.classList.toggle('on', i === skinIndex));
  const n = SKINS.length;
  ghostPrev.firstElementChild.dataset.skin = SKINS[(skinIndex - 1 + n) % n].id;
  ghostNext.firstElementChild.dataset.skin = SKINS[(skinIndex + 1) % n].id;
  if (animate) {
    player.classList.remove('pop');
    void player.offsetWidth;            // reinicia a animação
    player.classList.add('pop');
  }
}
player.addEventListener('animationend', (e) => {
  if (e.animationName === 'pop') player.classList.remove('pop');
});

function changeSkin(dir) {
  if (state !== 'menu') return;
  skinIndex = (skinIndex + dir + SKINS.length) % SKINS.length;
  applySkin(true);
}

$('skin-prev').addEventListener('click', (e) => { e.currentTarget.blur(); changeSkin(-1); });
$('skin-next').addEventListener('click', (e) => { e.currentTarget.blur(); changeSkin(1); });
ghostPrev.addEventListener('click', (e) => { e.currentTarget.blur(); changeSkin(-1); });
ghostNext.addEventListener('click', (e) => { e.currentTarget.blur(); changeSkin(1); });

// ---------- Escala do palco ----------
function fitStage() {
  const s = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
  stage.style.transform = `translate(-50%, -50%) scale(${s})`;
}

// ---------- Nuvens ----------
function createClouds() {
  for (let i = 0; i < 4; i++) {
    const el = document.createElement('div');
    el.className = 'cloud';
    el.style.width = 70 + Math.random() * 60 + 'px';
    el.style.top = 20 + Math.random() * 90 + 'px';
    $('clouds').appendChild(el);
    clouds.push({ el, x: i * 220 + Math.random() * 100 });
  }
}

// ---------- Aviso de nível ----------
function showBanner(text) {
  banner.textContent = text;
  banner.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => banner.classList.remove('show'), 1400);
}

function checkLevel() {
  const lv = Math.floor(score / POINTS_PER_LEVEL);
  if (lv > level) {
    level = lv;
    levelEl.textContent = level + 1;
    stage.classList.toggle('night', level % 2 === 1);
    showBanner('NÍVEL ' + (level + 1) + ' · mais rápido!');
  }
}

// ---------- Fluxo das telas ----------
function startGame() {
  clearObstacles();
  score = 0; level = 0; speed = START_SPEED;
  playerY = 0; playerVy = 0;
  distanceToNext = 0;
  scoreEl.textContent = 0;
  levelEl.textContent = 1;
  bestEl.textContent = best;
  clearTimeout(bannerTimer);
  banner.classList.remove('show');
  stage.classList.remove('menu', 'over', 'night');
  startScreen.classList.remove('visible');
  overScreen.classList.remove('visible');
  state = 'playing';
}

function gameOver() {
  state = 'over';
  const isRecord = score > best;
  if (isRecord) { best = score; saveBest(best); }
  $('final-score').textContent = score;
  $('final-best').textContent = best;
  $('new-record').style.visibility = isRecord ? 'visible' : 'hidden';
  bestEl.textContent = best;
  stage.classList.add('over', 'shake');
  setTimeout(() => stage.classList.remove('shake'), 400);
  overScreen.classList.add('visible');
}

function clearObstacles() {
  obstacles.forEach((o) => o.el.remove());
  obstacles = [];
}

// ---------- Entrada do jogador ----------
const JUMP_KEYS = ['ArrowUp', 'Space', 'KeyW'];
const DUCK_KEYS = ['ArrowDown', 'KeyS'];

function jump() {
  if (state !== 'playing' || playerY > 0) return;
  playerVy = JUMP_SPEED;
}

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (state === 'menu') {
    if (e.code === 'ArrowLeft'  || e.code === 'KeyA') changeSkin(-1);
    if (e.code === 'ArrowRight' || e.code === 'KeyD') changeSkin(1);
  }
  if (JUMP_KEYS.includes(e.code) && state === 'playing') { e.preventDefault(); jump(); }
  if (DUCK_KEYS.includes(e.code)) { e.preventDefault(); ducking = true; }
});
window.addEventListener('keyup', (e) => {
  if (DUCK_KEYS.includes(e.code)) ducking = false;
});

stage.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button')) return;
  const rect = stage.getBoundingClientRect();
  const relX = (e.clientX - rect.left) / rect.width;
  if (relX < 0.35) { ducking = true; duckPointer = e.pointerId; }
  else jump();
});
function stopPointerDuck(e) {
  if (e.pointerId === duckPointer) { ducking = false; duckPointer = null; }
}
window.addEventListener('pointerup', stopPointerDuck);
window.addEventListener('pointercancel', stopPointerDuck);

$('play-btn').addEventListener('click', (e) => { e.currentTarget.blur(); startGame(); });
$('retry-btn').addEventListener('click', (e) => { e.currentTarget.blur(); startGame(); });

// ---------- Utilidades de sorteio ----------
const rand = (a, b) => a + Math.random() * (b - a);
const irand = (a, b) => Math.round(rand(a, b));

// Só sorteia entre os tipos já liberados no nível atual
function pickWeighted(list) {
  const pool = list.filter((t) => level >= (t.min || 0));
  let r = Math.random() * pool.reduce((sum, t) => sum + t.weight, 0);
  for (const t of pool) { r -= t.weight; if (r <= 0) return t; }
  return pool[pool.length - 1];
}

// Sorteia largura e altura dentro da faixa do tipo
const makeType = (t) => ({ ...t, w: irand(t.w[0], t.w[1]), h: irand(t.h[0], t.h[1]) });

// Obstáculos mais rápidos nascem mais à direita, para chegar no mesmo tempo que um normal
const farX = (mul) => PLAYER.x + mul * (STAGE_W + 20 - PLAYER.x);

// ---------- Criação de obstáculos ----------
function addObstacle(type, x, points) {
  const el = document.createElement('div');
  el.className = 'obstacle ' + type.cls;
  el.style.width = type.w + 'px';
  el.style.height = type.h + 'px';
  if (type.y) el.style.bottom = `calc(var(--ground-h) + ${type.y}px)`;
  obstacleLayer.appendChild(el);
  const o = {
    el, x, y: type.y || 0, by: 0, w: type.w, h: type.h, points,
    mul: type.mul || 1, motion: type.motion || null,
    phase: Math.random(), age: 0, counted: false,
  };
  o.by = motionOffset(o);
  obstacles.push(o);
}

// Movimento vertical (bola quicando / pássaro ondulando)
function motionOffset(o) {
  const m = o.motion;
  if (!m) return 0;
  const t = o.age / m.period + o.phase;
  return m.type === 'bounce'
    ? m.amp * Math.abs(Math.sin(Math.PI * t))
    : m.amp * Math.sin(2 * Math.PI * t);
}

function spawnSingle() {
  const t = makeType(pickWeighted(GROUND_TYPES));
  addObstacle(t, STAGE_W + 20, 1);
  return t.w;
}

function spawnCluster() {
  const x = STAGE_W + 20;
  if (level >= 4 && Math.random() < 0.35) {
    // trio de tocos
    const i1 = 16 + Math.random() * 8, i2 = 16 + Math.random() * 8;
    addObstacle(TRIO_STUMP, x, 0);
    addObstacle(TRIO_STUMP, x + TRIO_STUMP.w + i1, 0);
    addObstacle(TRIO_STUMP, x + TRIO_STUMP.w * 2 + i1 + i2, 1);
    return TRIO_STUMP.w * 3 + i1 + i2;
  }
  const a = makeType(pickWeighted(CLUSTER_TYPES));
  const b = makeType(pickWeighted(CLUSTER_TYPES));
  const inner = 14 + Math.random() * 14;
  addObstacle(a, x, 0);
  addObstacle(b, x + a.w + inner, 1);
  return a.w + inner + b.w;
}

function spawnBird() {
  const t = pickWeighted(BIRDS);
  addObstacle(t, farX(t.mul), 1);
  return t.w;
}

function spawnSpecial() {
  const t = pickWeighted(SPECIALS);
  addObstacle(t, farX(t.mul), 1);
  return t.w;
}

function spawnObstacle() {
  const lv = level;
  const birdP    = Math.min(0.30, 0.06 + lv * 0.04);
  const specialP = lv >= 3 ? Math.min(0.20, 0.06 + (lv - 3) * 0.03) : 0;
  const clusterP = Math.min(0.40, 0.06 + lv * 0.05);
  const r = Math.random();

  let span;
  if (r < birdP) span = spawnBird();
  else if (r < birdP + specialP) span = spawnSpecial();
  else if (r < birdP + specialP + clusterP) span = spawnCluster();
  else span = spawnSingle();

  // Quanto maior o nível, menor o espaço entre obstáculos
  const tight = Math.max(0.7, 0.95 - lv * 0.04);
  let gap = speed * (tight + Math.random() * 0.5) + 60;
  if (Math.random() < 0.15) gap *= 1.35;
  distanceToNext = span + gap;
}

// ---------- Colisão ----------
function hitsPlayer(o) {
  const h = (ducking && playerY === 0) ? PLAYER.duckH : PLAYER.h;
  const px1 = PLAYER.x + HIT_MARGIN,  px2 = PLAYER.x + PLAYER.w - HIT_MARGIN;
  const py1 = playerY + HIT_MARGIN,   py2 = playerY + h - HIT_MARGIN;
  const ox1 = o.x + 3,                ox2 = o.x + o.w - 3;
  const base = o.y + o.by;            // altura atual da base do obstáculo
  const oy1 = base > 0 ? base + 3 : 0;
  const oy2 = base + o.h - 3;
  return px1 < ox2 && px2 > ox1 && py1 < oy2 && py2 > oy1;
}

// ---------- Atualização por quadro ----------
function update(dt) {
  // acelera suavemente até a velocidade do nível atual
  const target = Math.min(START_SPEED + level * SPEED_PER_LEVEL, MAX_SPEED);
  speed += (target - speed) * Math.min(1, dt * 2);

  if (playerY > 0 || playerVy > 0) {
    const g = (ducking && playerVy < 0) ? GRAVITY * FAST_FALL : GRAVITY;
    playerVy -= g * dt;
    playerY += playerVy * dt;
    if (playerY <= 0) { playerY = 0; playerVy = 0; }
  }

  distanceToNext -= speed * dt;
  if (distanceToNext <= -3) spawnObstacle();

  for (const o of obstacles) {
    o.x -= speed * o.mul * dt;
    o.age += dt;
    if (o.motion) o.by = motionOffset(o);
    if (!o.counted && o.x + o.w < PLAYER.x) {
      o.counted = true;
      if (o.points) {
        score += o.points;
        scoreEl.textContent = score;
        checkLevel();
      }
    }
    if (hitsPlayer(o)) { gameOver(); return; }
  }

  obstacles = obstacles.filter((o) => {
    if (o.x + o.w < -20) { o.el.remove(); return false; }
    return true;
  });
}

// ---------- Desenho ----------
function render() {
  player.style.transform = `translateY(${-playerY}px)`;
  player.classList.toggle('airborne', playerY > 0);
  player.classList.toggle('ducking', ducking && playerY === 0 && state === 'playing');
  for (const o of obstacles) o.el.style.transform = `translate(${o.x}px, ${-o.by}px)`;
}

function scrollScenery(dt) {
  scroll.g  -= speed * dt;
  scroll.h1 -= speed * 0.15 * dt;
  scroll.h2 -= speed * 0.35 * dt;
  stage.style.setProperty('--g',  (scroll.g  % 70)  + 'px');
  stage.style.setProperty('--h1', (scroll.h1 % 400) + 'px');
  stage.style.setProperty('--h2', (scroll.h2 % 300) + 'px');
  for (const c of clouds) {
    c.x -= speed * 0.02 * dt;
    if (c.x < -160) c.x = STAGE_W + Math.random() * 100;
    c.el.style.transform = `translateX(${c.x}px)`;
  }
}

// ---------- Loop principal ----------
function frame(now) {
  const dt = Math.min((now - lastTime) / 900, 0.033);
  lastTime = now;

  if (state === 'menu') speed = MENU_SPEED;
  if (state === 'playing') update(dt);
  if (state !== 'over') scrollScenery(dt);
  render();

  requestAnimationFrame(frame);
}

// ---------- Início ----------
bestEl.textContent = best;
applySkin(false);
createClouds();
fitStage();
window.addEventListener('resize', fitStage);
requestAnimationFrame(frame);