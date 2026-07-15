'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Game3D, type RayHit, type WorldSnapshot } from './game3d';

type Screen = 'menu' | 'playing' | 'paused' | 'dead' | 'victory';
type DifficultyId = 'survivor' | 'veteran' | 'nightmare';
type QualityId = 'auto' | 'cinematic' | 'performance';
type WeaponId = 'carbine' | 'shotgun';
type ZombieType = 'walker' | 'runner' | 'brute' | 'toxic';

type Zombie = {
  id: number;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  speed: number;
  type: ZombieType;
  lane: number;
  phase: number;
  hit: number;
  attack: number;
  dead: boolean;
  death: number;
};

type Barricade = {
  lane: number;
  x: number;
  planks: number;
  maxPlanks: number;
  plankHp: number;
  hit: number;
  repair: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
};

type Squadmate = {
  name: string;
  role: string;
  health: number;
  downed: boolean;
  assistCooldown: number;
};

type Runtime = {
  difficulty: DifficultyId;
  playerX: number;
  playerZ: number;
  aimX: number;
  aimY: number;
  health: number;
  stamina: number;
  distance: number;
  extracting: boolean;
  extractTime: number;
  time: number;
  score: number;
  kills: number;
  headshots: number;
  combo: number;
  comboTime: number;
  wave: number;
  waveBreak: number;
  spawnRemaining: number;
  intensity: number;
  spawnTimer: number;
  squadTimer: number;
  worldOffset: number;
  weapon: WeaponId;
  ammo: Record<WeaponId, number>;
  reserve: Record<WeaponId, number>;
  grenades: number;
  medkits: number;
  reloadingUntil: number;
  reloadStarted: number;
  lastShot: number;
  shake: number;
  recoil: number;
  muzzle: number;
  damageFlash: number;
  hitMarker: number;
  hitHeadshot: boolean;
  width: number;
  height: number;
  fps: number;
  fpsFrames: number;
  fpsTime: number;
  nextId: number;
  zombies: Zombie[];
  particles: Particle[];
  barricades: Barricade[];
  squad: Squadmate[];
  keys: Set<string>;
  moveX: number;
  moveY: number;
  sprintHeld: boolean;
  fireHeld: boolean;
  repairHeld: boolean;
  repairTarget: number;
  won: boolean;
};

type Hud = {
  health: number;
  stamina: number;
  distance: number;
  extracting: boolean;
  extractTime: number;
  time: number;
  score: number;
  kills: number;
  wave: number;
  waveBreak: number;
  alive: number;
  spawnRemaining: number;
  intensity: number;
  weapon: WeaponId;
  ammo: number;
  reserve: number;
  grenades: number;
  medkits: number;
  reloading: boolean;
  reloadProgress: number;
  combo: number;
  fps: number;
  squad: Squadmate[];
  barricades: Barricade[];
  repairTarget: number;
  damageFlash: number;
  hitMarker: number;
  hitHeadshot: boolean;
};

const DIFFICULTIES: Record<DifficultyId, { label: string; note: string; scalar: number; reward: number }> = {
  survivor: { label: 'SINH TỒN', note: 'Cân bằng cho lần đầu', scalar: 0.82, reward: 1 },
  veteran: { label: 'CỰU BINH', note: 'Đàn đông, sát thương cao', scalar: 1, reward: 1.4 },
  nightmare: { label: 'ÁC MỘNG', note: 'AI Director không khoan nhượng', scalar: 1.28, reward: 2 },
};

const WEAPONS: Record<WeaponId, { label: string; mag: number; fireDelay: number; reload: number }> = {
  carbine: { label: 'M4-C CARBINE', mag: 30, fireDelay: 0.105, reload: 1.55 },
  shotgun: { label: 'KSG-12', mag: 8, fireDelay: 0.62, reload: 1.85 },
};

const INITIAL_SQUAD: Squadmate[] = [
  { name: 'NAM', role: 'XUNG KÍCH', health: 100, downed: false, assistCooldown: 0 },
  { name: 'LINH', role: 'QUÂN Y', health: 92, downed: false, assistCooldown: 0 },
  { name: 'PHƯỚC', role: 'HỎA LỰC', health: 96, downed: false, assistCooldown: 0 },
];

const EMPTY_HUD: Hud = {
  health: 100,
  stamina: 100,
  distance: 260,
  extracting: false,
  extractTime: 25,
  time: 0,
  score: 0,
  kills: 0,
  wave: 1,
  waveBreak: 0,
  alive: 0,
  spawnRemaining: 12,
  intensity: 0,
  weapon: 'carbine',
  ammo: 30,
  reserve: 180,
  grenades: 2,
  medkits: 2,
  reloading: false,
  reloadProgress: 0,
  combo: 0,
  fps: 60,
  squad: INITIAL_SQUAD,
  barricades: [-3.5, 0, 3.5].map((x, lane) => ({ lane, x, planks: 5, maxPlanks: 5, plankHp: 58, hit: 0, repair: 0 })),
  repairTarget: -1,
  damageFlash: 0,
  hitMarker: 0,
  hitHeadshot: false,
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const formatTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;

function makeRuntime(difficulty: DifficultyId): Runtime {
  return {
    difficulty,
    playerX: 0,
    playerZ: 1.15,
    aimX: 0,
    aimY: 0,
    health: 100,
    stamina: 100,
    distance: 260,
    extracting: false,
    extractTime: 25,
    time: 0,
    score: 0,
    kills: 0,
    headshots: 0,
    combo: 0,
    comboTime: 0,
    wave: 1,
    waveBreak: 0,
    spawnRemaining: 12,
    intensity: 0,
    spawnTimer: 0.2,
    squadTimer: 0.65,
    worldOffset: 0,
    weapon: 'carbine',
    ammo: { carbine: 30, shotgun: 8 },
    reserve: { carbine: 180, shotgun: 48 },
    grenades: 2,
    medkits: 2,
    reloadingUntil: 0,
    reloadStarted: 0,
    lastShot: -1,
    shake: 0,
    recoil: 0,
    muzzle: 0,
    damageFlash: 0,
    hitMarker: 0,
    hitHeadshot: false,
    width: 1280,
    height: 720,
    fps: 60,
    fpsFrames: 0,
    fpsTime: 0,
    nextId: 1,
    zombies: [],
    particles: [],
    barricades: [-3.5, 0, 3.5].map((x, lane) => ({ lane, x, planks: 5, maxPlanks: 5, plankHp: 58, hit: 0, repair: 0 })),
    squad: INITIAL_SQUAD.map((mate) => ({ ...mate })),
    keys: new Set(),
    moveX: 0,
    moveY: 0,
    sprintHeld: false,
    fireHeld: false,
    repairHeld: false,
    repairTarget: -1,
    won: false,
  };
}

function projectZombie(zombie: Zombie, runtime: Runtime, width: number, height: number) {
  const horizon = height * 0.39;
  const depth = Math.max(0.45, zombie.z);
  const floorScale = 1 / (1 + depth * 0.1);
  const bodyHeight = clamp((height * 1.58) / (depth + 1.55), 24, height * 0.76);
  const bottom = horizon + (height - horizon) * floorScale;
  const center = width / 2 - runtime.aimX * width * 0.07;
  const x = center + (zombie.x - runtime.playerX) * bodyHeight * 0.47;
  return { x, bottom, height: bodyHeight, centerY: bottom - bodyHeight * 0.56, radius: bodyHeight * 0.27 };
}

function drawZombie(ctx: CanvasRenderingContext2D, zombie: Zombie, runtime: Runtime, width: number, height: number) {
  const projected = projectZombie(zombie, runtime, width, height);
  const h = projected.height;
  const phase = Math.sin(runtime.time * (zombie.type === 'runner' ? 9 : 5) + zombie.phase);
  const deadTilt = zombie.dead ? clamp(zombie.death * 2.4, 0, 1) * 1.25 : 0;
  const palette = zombie.type === 'toxic'
    ? { body: '#334532', skin: '#83945f', glow: '#b8d84a' }
    : zombie.type === 'brute'
      ? { body: '#171b1b', skin: '#5b5b50', glow: '#e9822b' }
      : zombie.type === 'runner'
        ? { body: '#351b18', skin: '#756055', glow: '#e95d36' }
        : { body: '#202727', skin: '#6b6d61', glow: '#c8d787' };

  ctx.save();
  ctx.translate(projected.x, projected.bottom);
  ctx.rotate(deadTilt * (zombie.x > runtime.playerX ? 1 : -1));
  ctx.globalAlpha = clamp((46 - zombie.z) / 8, 0.18, 1) * (zombie.dead ? 1 - zombie.death * 0.8 : 1);
  ctx.shadowColor = zombie.hit > 0 ? '#f5fff0' : 'rgba(0,0,0,.65)';
  ctx.shadowBlur = zombie.hit > 0 ? h * 0.16 : h * 0.08;

  ctx.strokeStyle = '#101414';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2, h * (zombie.type === 'brute' ? 0.13 : 0.08));
  ctx.beginPath();
  ctx.moveTo(-h * 0.09, -h * 0.38);
  ctx.lineTo(-h * (0.12 + phase * 0.02), 0);
  ctx.moveTo(h * 0.08, -h * 0.38);
  ctx.lineTo(h * (0.13 - phase * 0.02), 0);
  ctx.stroke();

  const torsoWidth = h * (zombie.type === 'brute' ? 0.38 : 0.27);
  const torsoGradient = ctx.createLinearGradient(-torsoWidth, -h * 0.78, torsoWidth, -h * 0.3);
  torsoGradient.addColorStop(0, '#0c1010');
  torsoGradient.addColorStop(0.45, palette.body);
  torsoGradient.addColorStop(1, '#080a0a');
  ctx.fillStyle = zombie.hit > 0 ? '#8a9580' : torsoGradient;
  ctx.beginPath();
  ctx.roundRect(-torsoWidth / 2, -h * 0.77, torsoWidth, h * 0.43, h * 0.06);
  ctx.fill();

  ctx.strokeStyle = palette.skin;
  ctx.lineWidth = Math.max(2, h * 0.07);
  ctx.beginPath();
  ctx.moveTo(-torsoWidth * 0.42, -h * 0.68);
  ctx.lineTo(-h * (0.24 + phase * 0.035), -h * 0.4);
  ctx.moveTo(torsoWidth * 0.42, -h * 0.68);
  ctx.lineTo(h * (0.25 - phase * 0.035), -h * 0.43);
  ctx.stroke();

  ctx.fillStyle = zombie.hit > 0 ? '#d7ddc7' : palette.skin;
  ctx.beginPath();
  ctx.ellipse(0, -h * 0.86, h * (zombie.type === 'brute' ? 0.14 : 0.115), h * 0.13, phase * 0.04, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = palette.glow;
  ctx.shadowColor = palette.glow;
  ctx.shadowBlur = h * 0.1;
  ctx.fillRect(-h * 0.055, -h * 0.885, h * 0.028, Math.max(1, h * 0.012));
  ctx.fillRect(h * 0.025, -h * 0.885, h * 0.028, Math.max(1, h * 0.012));

  if (zombie.type === 'toxic') {
    ctx.globalAlpha *= 0.22;
    ctx.fillStyle = '#b8d84a';
    ctx.beginPath();
    ctx.arc(0, -h * 0.56, h * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }

  if (!zombie.dead && zombie.hp < zombie.maxHp && zombie.z < 12) {
    ctx.globalAlpha = 0.85;
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#171d1e';
    ctx.fillRect(-h * 0.19, -h * 1.08, h * 0.38, Math.max(3, h * 0.026));
    ctx.fillStyle = '#b8d84a';
    ctx.fillRect(-h * 0.19, -h * 1.08, h * 0.38 * clamp(zombie.hp / zombie.maxHp, 0, 1), Math.max(3, h * 0.026));
  }
  ctx.restore();
}

function drawWorld(
  ctx: CanvasRenderingContext2D,
  runtime: Runtime,
  width: number,
  height: number,
  background: HTMLImageElement | null,
  reducedMotion: boolean,
  quality: QualityId,
) {
  const horizon = height * 0.39;
  const shakeX = reducedMotion ? 0 : (Math.random() - 0.5) * runtime.shake * 12;
  const shakeY = reducedMotion ? 0 : (Math.random() - 0.5) * runtime.shake * 9;
  ctx.save();
  ctx.translate(shakeX, shakeY);

  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#05090a');
  sky.addColorStop(0.52, '#12201f');
  sky.addColorStop(1, '#080b0d');
  ctx.fillStyle = sky;
  ctx.fillRect(-20, -20, width + 40, height + 40);

  if (background?.complete && background.naturalWidth) {
    const scale = Math.max(width / background.naturalWidth, height / background.naturalHeight);
    const drawWidth = background.naturalWidth * scale;
    const drawHeight = background.naturalHeight * scale;
    const parallax = runtime.playerX * width * 0.008 + runtime.aimX * width * 0.018;
    ctx.save();
    ctx.globalAlpha = 0.66;
    ctx.filter = 'saturate(.78) brightness(.54) contrast(1.12)';
    ctx.drawImage(background, (width - drawWidth) / 2 - parallax, (height - drawHeight) / 2, drawWidth, drawHeight);
    ctx.restore();
  }

  const sceneShade = ctx.createLinearGradient(0, 0, 0, height);
  sceneShade.addColorStop(0, 'rgba(3,6,7,.28)');
  sceneShade.addColorStop(0.48, 'rgba(4,8,8,.2)');
  sceneShade.addColorStop(1, 'rgba(2,3,3,.84)');
  ctx.fillStyle = sceneShade;
  ctx.fillRect(-20, -20, width + 40, height + 40);

  const roadCenter = width / 2 - runtime.aimX * width * 0.07;
  const road = ctx.createLinearGradient(0, horizon, 0, height);
  road.addColorStop(0, 'rgba(20,34,32,.32)');
  road.addColorStop(1, 'rgba(5,9,9,.88)');
  ctx.fillStyle = road;
  ctx.beginPath();
  ctx.moveTo(roadCenter - width * 0.1, horizon);
  ctx.lineTo(roadCenter + width * 0.1, horizon);
  ctx.lineTo(width * 0.98, height);
  ctx.lineTo(width * 0.02, height);
  ctx.closePath();
  ctx.fill();

  ctx.lineWidth = 1;
  for (let i = 0; i < 18; i += 1) {
    const z = ((i * 2.4 + runtime.worldOffset) % 42) + 1;
    const p = 1 / (1 + z * 0.105);
    const y = horizon + (height - horizon) * p;
    const halfWidth = width * (0.1 + 0.4 * p);
    ctx.strokeStyle = `rgba(177,216,74,${0.025 + p * 0.09})`;
    ctx.beginPath();
    ctx.moveTo(roadCenter - halfWidth, y);
    ctx.lineTo(roadCenter + halfWidth, y);
    ctx.stroke();

    if (i % 3 === 0) {
      const markWidth = Math.max(1, 5 * p);
      ctx.fillStyle = `rgba(215,224,201,${0.06 + p * 0.22})`;
      ctx.fillRect(roadCenter - markWidth / 2, y, markWidth, Math.max(2, 22 * p));
    }
  }

  ctx.strokeStyle = 'rgba(190,216,191,.08)';
  for (let i = -5; i <= 5; i += 1) {
    ctx.beginPath();
    ctx.moveTo(roadCenter + i * width * 0.019, horizon);
    ctx.lineTo(roadCenter + i * width * 0.11, height);
    ctx.stroke();
  }

  const beaconPulse = 0.7 + Math.sin(runtime.time * 3.4) * 0.22;
  ctx.save();
  ctx.globalAlpha = runtime.extracting ? 0.9 : beaconPulse;
  ctx.shadowColor = '#b8d84a';
  ctx.shadowBlur = quality === 'performance' ? 10 : 28;
  ctx.strokeStyle = '#b8d84a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(roadCenter, horizon + 24, 8, Math.PI * 0.25, Math.PI * 1.75);
  ctx.stroke();
  ctx.fillStyle = '#d9ee78';
  ctx.font = `700 ${Math.max(10, height * 0.018)}px Arial`;
  ctx.textAlign = 'center';
  ctx.fillText(runtime.extracting ? 'GIỮ VỊ TRÍ' : `${Math.ceil(runtime.distance)}m`, roadCenter, horizon + 52);
  ctx.restore();

  [...runtime.zombies]
    .sort((a, b) => b.z - a.z)
    .forEach((zombie) => drawZombie(ctx, zombie, runtime, width, height));

  runtime.particles.forEach((particle) => {
    ctx.globalAlpha = clamp(particle.life / particle.max, 0, 1);
    ctx.fillStyle = particle.color;
    ctx.shadowColor = particle.color;
    ctx.shadowBlur = quality === 'performance' ? 0 : particle.size * 2;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size * (particle.life / particle.max), 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  const rainCount = reducedMotion ? 22 : quality === 'cinematic' ? 150 : quality === 'performance' ? 46 : 92;
  ctx.strokeStyle = 'rgba(194,218,215,.22)';
  ctx.lineWidth = quality === 'cinematic' ? 1.2 : 1;
  for (let i = 0; i < rainCount; i += 1) {
    const seed = i * 91.731;
    const x = (seed * 13 + runtime.time * (260 + (i % 7) * 24)) % (width + 140) - 70;
    const y = (seed * 7 + runtime.time * (580 + (i % 5) * 34)) % (height + 100) - 50;
    const length = 8 + (i % 9) * 2.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - length * 0.28, y + length);
    ctx.stroke();
  }

  ctx.save();
  ctx.translate(width * 0.73, height * (0.92 + runtime.recoil * 0.012));
  ctx.rotate(-0.13 + runtime.recoil * 0.025);
  const weaponGradient = ctx.createLinearGradient(0, -height * 0.22, width * 0.34, 0);
  weaponGradient.addColorStop(0, '#4c5754');
  weaponGradient.addColorStop(0.24, '#171d1c');
  weaponGradient.addColorStop(0.7, '#080b0b');
  weaponGradient.addColorStop(1, '#36423e');
  ctx.fillStyle = weaponGradient;
  ctx.shadowColor = 'rgba(0,0,0,.8)';
  ctx.shadowBlur = 24;
  ctx.beginPath();
  ctx.moveTo(-width * 0.06, 0);
  ctx.lineTo(width * 0.04, -height * 0.18);
  ctx.lineTo(width * 0.3, -height * 0.13);
  ctx.lineTo(width * 0.37, -height * 0.055);
  ctx.lineTo(width * 0.33, height * 0.06);
  ctx.lineTo(width * 0.04, height * 0.08);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(184,216,74,.35)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#0a0d0d';
  ctx.fillRect(width * 0.08, -height * 0.25, width * 0.08, height * 0.12);
  ctx.strokeStyle = '#58645f';
  ctx.strokeRect(width * 0.08, -height * 0.25, width * 0.08, height * 0.12);
  if (runtime.muzzle > 0) {
    ctx.globalAlpha = runtime.muzzle;
    const flash = ctx.createRadialGradient(width * 0.37, -height * 0.06, 0, width * 0.37, -height * 0.06, width * 0.1);
    flash.addColorStop(0, '#fffbd0');
    flash.addColorStop(0.25, '#ffb32e');
    flash.addColorStop(1, 'rgba(255,85,0,0)');
    ctx.fillStyle = flash;
    ctx.beginPath();
    ctx.arc(width * 0.37, -height * 0.06, width * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.restore();

  const crossX = width / 2 + runtime.aimX * width * 0.23;
  const crossY = height / 2 + runtime.aimY * height * 0.18;
  ctx.save();
  ctx.translate(crossX, crossY);
  ctx.strokeStyle = runtime.hitMarker > 0 ? (runtime.hitHeadshot ? '#d9ee78' : '#fff') : 'rgba(239,242,226,.88)';
  ctx.lineWidth = runtime.hitHeadshot ? 2.6 : 1.5;
  const gap = 9 + runtime.recoil * 6;
  const line = 7;
  ctx.beginPath();
  ctx.moveTo(-gap - line, 0); ctx.lineTo(-gap, 0);
  ctx.moveTo(gap, 0); ctx.lineTo(gap + line, 0);
  ctx.moveTo(0, -gap - line); ctx.lineTo(0, -gap);
  ctx.moveTo(0, gap); ctx.lineTo(0, gap + line);
  ctx.stroke();
  if (runtime.hitMarker > 0) {
    const d = 11;
    ctx.beginPath();
    ctx.moveTo(-d, -d); ctx.lineTo(-d / 2, -d / 2);
    ctx.moveTo(d, -d); ctx.lineTo(d / 2, -d / 2);
    ctx.moveTo(-d, d); ctx.lineTo(-d / 2, d / 2);
    ctx.moveTo(d, d); ctx.lineTo(d / 2, d / 2);
    ctx.stroke();
  }
  ctx.restore();

  if (runtime.damageFlash > 0) {
    const damage = ctx.createRadialGradient(width / 2, height / 2, height * 0.18, width / 2, height / 2, height * 0.75);
    damage.addColorStop(0, 'rgba(140,0,0,0)');
    damage.addColorStop(1, `rgba(166,20,14,${runtime.damageFlash * 0.68})`);
    ctx.fillStyle = damage;
    ctx.fillRect(0, 0, width, height);
  }

  const vignette = ctx.createRadialGradient(width / 2, height / 2, height * 0.24, width / 2, height / 2, height * 0.82);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,.72)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

function hudFromRuntime(runtime: Runtime): Hud {
  const weapon = WEAPONS[runtime.weapon];
  const reloadProgress = runtime.reloadingUntil > runtime.time
    ? clamp(1 - (runtime.reloadingUntil - runtime.time) / weapon.reload, 0, 1)
    : 0;
  return {
    health: runtime.health,
    stamina: runtime.stamina,
    distance: runtime.distance,
    extracting: runtime.extracting,
    extractTime: runtime.extractTime,
    time: runtime.time,
    score: runtime.score,
    kills: runtime.kills,
    wave: runtime.wave,
    waveBreak: runtime.waveBreak,
    alive: runtime.zombies.filter((zombie) => !zombie.dead).length,
    spawnRemaining: runtime.spawnRemaining,
    intensity: runtime.intensity,
    weapon: runtime.weapon,
    ammo: runtime.ammo[runtime.weapon],
    reserve: runtime.reserve[runtime.weapon],
    grenades: runtime.grenades,
    medkits: runtime.medkits,
    reloading: runtime.reloadingUntil > runtime.time,
    reloadProgress,
    combo: runtime.combo,
    fps: runtime.fps,
    squad: runtime.squad.map((mate) => ({ ...mate })),
    barricades: runtime.barricades.map((barricade) => ({ ...barricade })),
    repairTarget: runtime.repairTarget,
    damageFlash: runtime.damageFlash,
    hitMarker: runtime.hitMarker,
    hitHeadshot: runtime.hitHeadshot,
  };
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Game3D | null>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const backgroundRef = useRef<HTMLImageElement | null>(null);
  const screenRef = useRef<Screen>('menu');
  const soundRef = useRef(true);
  const audioRef = useRef<AudioContext | null>(null);
  const lastHudRef = useRef(0);
  const joystickRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const joystickThumbRef = useRef<HTMLSpanElement>(null);
  const lookRef = useRef<{ id: number; x: number; y: number } | null>(null);

  const [screen, setScreen] = useState<Screen>('menu');
  const [difficulty, setDifficulty] = useState<DifficultyId>('veteran');
  const [quality, setQuality] = useState<QualityId>('auto');
  const [sound, setSound] = useState(true);
  const [motion, setMotion] = useState(true);
  const [hud, setHud] = useState<Hud>(EMPTY_HUD);
  const [bestScore, setBestScore] = useState(0);
  const [showBriefing, setShowBriefing] = useState(true);
  const [coarse, setCoarse] = useState(false);

  useEffect(() => { screenRef.current = screen; }, [screen]);
  useEffect(() => { soundRef.current = sound; }, [sound]);

  useEffect(() => {
    const image = new Image();
    image.src = `${import.meta.env.BASE_URL}dead-sector-menu-bg.png`;
    image.onload = () => { backgroundRef.current = image; };
    const media = window.matchMedia('(pointer: coarse)');
    const syncPointer = () => setCoarse(media.matches);
    syncPointer();
    media.addEventListener('change', syncPointer);
    const saved = Number(window.localStorage.getItem('dead-sector-best') || 0);
    window.setTimeout(() => setBestScore(saved), 0);
    return () => media.removeEventListener('change', syncPointer);
  }, []);

  const initAudio = useCallback(() => {
    if (!audioRef.current) {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) audioRef.current = new AudioContextClass();
    }
    void audioRef.current?.resume();
  }, []);

  const playSound = useCallback((kind: 'shot' | 'shotgun' | 'hit' | 'empty' | 'reload' | 'heal' | 'boom' | 'repair' | 'ui') => {
    if (!soundRef.current) return;
    const audio = audioRef.current;
    if (!audio) return;
    const now = audio.currentTime;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const filter = audio.createBiquadFilter();
    const settings = {
      shot: [92, 0.06, 0.22], shotgun: [58, 0.13, 0.34], hit: [310, 0.045, 0.08],
      empty: [780, 0.035, 0.06], reload: [180, 0.08, 0.08], heal: [520, 0.16, 0.08],
      boom: [42, 0.28, 0.42], repair: [240, 0.11, 0.12], ui: [620, 0.06, 0.07],
    }[kind];
    oscillator.type = kind === 'boom' || kind === 'shotgun' ? 'sawtooth' : kind === 'shot' ? 'square' : 'sine';
    oscillator.frequency.setValueAtTime(settings[0], now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(24, settings[0] * 0.45), now + settings[1]);
    filter.type = 'lowpass';
    filter.frequency.value = kind === 'hit' ? 1600 : 760;
    gain.gain.setValueAtTime(settings[2], now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + settings[1]);
    oscillator.connect(filter).connect(gain).connect(audio.destination);
    oscillator.start(now);
    oscillator.stop(now + settings[1] + 0.01);
  }, []);

  const vibrate = useCallback((pattern: number | number[]) => {
    if (coarse && motion && navigator.vibrate) navigator.vibrate(pattern);
  }, [coarse, motion]);

  const spawnZombie = useCallback((runtime: Runtime, forcedType?: ZombieType) => {
    const scalar = DIFFICULTIES[runtime.difficulty].scalar;
    const roll = Math.random();
    const type = forcedType ?? (runtime.wave >= 4 && roll > 0.91 ? 'brute' : runtime.wave >= 3 && roll > 0.8 ? 'toxic' : roll > 0.62 ? 'runner' : 'walker');
    const baseHp = type === 'brute' ? 260 : type === 'toxic' ? 96 : type === 'runner' ? 62 : 82;
    const speed = type === 'brute' ? 0.48 : type === 'runner' ? 1.4 : type === 'toxic' ? 0.76 : 0.7;
    const lane = Math.floor(Math.random() * runtime.barricades.length);
    const barricade = runtime.barricades[lane];
    runtime.zombies.push({
      id: runtime.nextId++,
      x: barricade.x + (Math.random() - 0.5) * 1.3,
      z: 24 + Math.random() * 20,
      hp: baseHp * scalar,
      maxHp: baseHp * scalar,
      speed: speed * (0.9 + runtime.wave * 0.045) * scalar,
      type,
      lane,
      phase: Math.random() * Math.PI * 2,
      hit: 0,
      attack: 0,
      dead: false,
      death: 0,
    });
  }, []);

  const createImpact = useCallback((runtime: Runtime, x: number, y: number, color = '#d9ee78', count = 9) => {
    for (let i = 0; i < count; i += 1) {
      const life = 0.16 + Math.random() * 0.26;
      runtime.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 180,
        vy: (Math.random() - 0.5) * 180 - 34,
        life,
        max: life,
        size: 1.5 + Math.random() * 3.5,
        color,
      });
    }
  }, []);

  const beginReload = useCallback(() => {
    const runtime = runtimeRef.current;
    if (!runtime || screenRef.current !== 'playing') return;
    const spec = WEAPONS[runtime.weapon];
    if (runtime.reloadingUntil > runtime.time || runtime.ammo[runtime.weapon] >= spec.mag || runtime.reserve[runtime.weapon] <= 0) return;
    runtime.reloadStarted = runtime.time;
    runtime.reloadingUntil = runtime.time + spec.reload;
    playSound('reload');
  }, [playSound]);

  const shoot = useCallback(() => {
    const runtime = runtimeRef.current;
    if (!runtime || screenRef.current !== 'playing') return;
    const spec = WEAPONS[runtime.weapon];
    if (runtime.reloadingUntil > runtime.time || runtime.time - runtime.lastShot < spec.fireDelay) return;
    if (runtime.ammo[runtime.weapon] <= 0) {
      runtime.lastShot = runtime.time;
      playSound('empty');
      beginReload();
      return;
    }

    runtime.lastShot = runtime.time;
    runtime.repairHeld = false;
    runtime.ammo[runtime.weapon] -= 1;
    runtime.recoil = runtime.weapon === 'shotgun' ? 1.25 : Math.min(1, runtime.recoil + 0.42);
    runtime.shake = runtime.weapon === 'shotgun' ? 0.9 : 0.35;
    runtime.muzzle = 1;
    playSound(runtime.weapon === 'shotgun' ? 'shotgun' : 'shot');
    vibrate(runtime.weapon === 'shotgun' ? 26 : 8);

    const pellets = runtime.weapon === 'shotgun' ? 7 : 1;
    const rayHits: RayHit[] = engineRef.current?.raycast(pellets, runtime.weapon === 'shotgun' ? 0.085 : 0.008 + runtime.recoil * 0.003) ?? [];
    const damageMap = new Map<number, { damage: number; head: boolean; point: [number, number, number] }>();
    rayHits.forEach((rayHit) => {
      const zombie = runtime.zombies.find((item) => item.id === rayHit.zombieId);
      if (!zombie || zombie.dead) return;
      const base = runtime.weapon === 'shotgun' ? 24 : 36;
      const range = Math.max(0, zombie.z - runtime.playerZ);
      const falloff = runtime.weapon === 'shotgun' ? clamp(1.18 - range / 29, 0.34, 1) : clamp(1.1 - range / 105, 0.72, 1);
      const amount = base * falloff * (rayHit.head ? 2.15 : 1);
      const previous = damageMap.get(zombie.id);
      damageMap.set(zombie.id, {
        damage: (previous?.damage ?? 0) + amount,
        head: (previous?.head ?? false) || rayHit.head,
        point: rayHit.point,
      });
    });

    damageMap.forEach((hit, id) => {
      const zombie = runtime.zombies.find((item) => item.id === id);
      if (!zombie || zombie.dead) return;
      zombie.hp -= hit.damage;
      zombie.hit = 0.09;
      runtime.hitMarker = 0.12;
      runtime.hitHeadshot = hit.head;
      engineRef.current?.addImpact(hit.point, hit.head);
      playSound('hit');
      if (zombie.hp <= 0) {
        zombie.dead = true;
        zombie.death = 0;
        const multiplier = DIFFICULTIES[runtime.difficulty].reward;
        const points = (zombie.type === 'brute' ? 300 : zombie.type === 'toxic' ? 170 : zombie.type === 'runner' ? 125 : 100) * (hit.head ? 1.5 : 1) * multiplier;
        runtime.score += Math.round(points * (1 + Math.min(1.5, runtime.combo * 0.08)));
        runtime.kills += 1;
        if (hit.head) runtime.headshots += 1;
        runtime.combo += 1;
        runtime.comboTime = 3.5;
      }
    });

    if (runtime.ammo[runtime.weapon] === 0) window.setTimeout(beginReload, 180);
  }, [beginReload, playSound, vibrate]);

  const throwGrenade = useCallback(() => {
    const runtime = runtimeRef.current;
    if (!runtime || screenRef.current !== 'playing' || runtime.grenades <= 0) return;
    runtime.grenades -= 1;
    runtime.shake = 1.8;
    const target = engineRef.current?.getAimPoint(10) ?? { x: runtime.playerX, z: runtime.playerZ + 9 };
    const targetX = clamp(target.x, -6, 6);
    const targetZ = clamp(target.z, 5.5, 22);
    let hits = 0;
    runtime.zombies.forEach((zombie) => {
      if (zombie.dead) return;
      const distance = Math.hypot(zombie.x - targetX, (zombie.z - targetZ) * 0.48);
      if (distance < 4.7) {
        zombie.hp -= 175 * (1 - distance / 6);
        zombie.hit = 0.16;
        if (zombie.hp <= 0) {
          zombie.dead = true;
          zombie.death = 0;
          runtime.kills += 1;
          runtime.score += 180;
        }
        hits += 1;
      }
    });
    engineRef.current?.addExplosion(targetX, targetZ);
    playSound('boom');
    vibrate([35, 24, 45]);
  }, [playSound, vibrate]);

  const consumeMedkit = useCallback(() => {
    const runtime = runtimeRef.current;
    if (!runtime || screenRef.current !== 'playing' || runtime.medkits <= 0 || runtime.health >= 98) return;
    runtime.medkits -= 1;
    runtime.health = Math.min(100, runtime.health + 52);
    playSound('heal');
    vibrate([12, 35, 12]);
  }, [playSound, vibrate]);

  const switchWeapon = useCallback((weapon: WeaponId) => {
    const runtime = runtimeRef.current;
    if (!runtime || runtime.weapon === weapon) return;
    runtime.weapon = weapon;
    runtime.reloadingUntil = 0;
    runtime.fireHeld = false;
    playSound('ui');
  }, [playSound]);

  const assistSquad = useCallback((index: number) => {
    const runtime = runtimeRef.current;
    if (!runtime || screenRef.current !== 'playing') return;
    const mate = runtime.squad[index];
    if (!mate || mate.assistCooldown > 0 || (!mate.downed && mate.health > 58)) return;
    mate.health = Math.min(100, mate.health + (mate.downed ? 46 : 28));
    mate.downed = false;
    mate.assistCooldown = 12;
    playSound('heal');
  }, [playSound]);

  const updateRuntime = useCallback((runtime: Runtime, delta: number, budget: number) => {
    const scalar = DIFFICULTIES[runtime.difficulty].scalar;
    runtime.time += delta;
    runtime.fpsFrames += 1;
    runtime.fpsTime += delta;
    if (runtime.fpsTime >= 0.6) {
      runtime.fps = Math.round(runtime.fpsFrames / runtime.fpsTime);
      runtime.fpsFrames = 0;
      runtime.fpsTime = 0;
    }

    if (runtime.reloadingUntil > 0 && runtime.time >= runtime.reloadingUntil) {
      const spec = WEAPONS[runtime.weapon];
      const needed = spec.mag - runtime.ammo[runtime.weapon];
      const loaded = Math.min(needed, runtime.reserve[runtime.weapon]);
      runtime.ammo[runtime.weapon] += loaded;
      runtime.reserve[runtime.weapon] -= loaded;
      runtime.reloadingUntil = 0;
    }

    const keyForward = (runtime.keys.has('KeyW') || runtime.keys.has('ArrowUp') ? 1 : 0) - (runtime.keys.has('KeyS') || runtime.keys.has('ArrowDown') ? 1 : 0);
    const keyStrafe = (runtime.keys.has('KeyD') || runtime.keys.has('ArrowRight') ? 1 : 0) - (runtime.keys.has('KeyA') || runtime.keys.has('ArrowLeft') ? 1 : 0);
    const forward = clamp(keyForward - runtime.moveY, -1, 1);
    const strafe = clamp(keyStrafe + runtime.moveX, -1, 1);
    const wantsSprint = runtime.sprintHeld || runtime.keys.has('ShiftLeft') || runtime.keys.has('ShiftRight');
    const sprinting = wantsSprint && Math.hypot(forward, strafe) > 0.18 && runtime.stamina > 1;
    const pace = sprinting ? 1.65 : 1;
    runtime.stamina = sprinting ? Math.max(0, runtime.stamina - delta * 23) : Math.min(100, runtime.stamina + delta * 15);
    runtime.playerX = clamp(runtime.playerX + strafe * delta * 3.25 * pace, -4.8, 4.8);
    runtime.playerZ = clamp(runtime.playerZ + forward * delta * 2.45 * pace, 0.35, 2.55);
    runtime.worldOffset += Math.hypot(strafe, forward) * delta * pace;

    runtime.barricades.forEach((barricade) => {
      barricade.hit = Math.max(0, barricade.hit - delta);
      if (barricade.lane !== runtime.repairTarget) barricade.repair = Math.max(0, barricade.repair - delta * 1.8);
    });
    runtime.repairTarget = -1;
    if (runtime.repairHeld) {
      const nearest = [...runtime.barricades]
        .filter((barricade) => barricade.planks < barricade.maxPlanks)
        .sort((a, b) => Math.abs(a.x - runtime.playerX) - Math.abs(b.x - runtime.playerX))[0];
      if (nearest && Math.abs(nearest.x - runtime.playerX) < 1.45 && runtime.playerZ > 0.72) {
        runtime.repairTarget = nearest.lane;
        nearest.repair += delta / 1.08;
        if (nearest.repair >= 1) {
          nearest.planks += 1;
          nearest.plankHp = 58;
          nearest.repair = 0;
          runtime.score += 45 + runtime.wave * 4;
          runtime.reserve.carbine = Math.min(360, runtime.reserve.carbine + 2);
          engineRef.current?.addRepairBurst(nearest.x);
          playSound('repair');
          vibrate(12);
        }
      }
    }

    const aliveBeforeUpdate = runtime.zombies.filter((zombie) => !zombie.dead).length;
    if (runtime.waveBreak > 0) {
      runtime.waveBreak = Math.max(0, runtime.waveBreak - delta);
      if (runtime.waveBreak === 0) {
        runtime.wave += 1;
        runtime.spawnRemaining = 9 + runtime.wave * 4;
        runtime.spawnTimer = 0.2;
        runtime.reserve.carbine = Math.min(360, runtime.reserve.carbine + 24);
        runtime.reserve.shotgun = Math.min(96, runtime.reserve.shotgun + 8);
        if (runtime.wave % 3 === 0) runtime.medkits = Math.min(4, runtime.medkits + 1);
        if (runtime.wave % 2 === 0) runtime.grenades = Math.min(4, runtime.grenades + 1);
        playSound('ui');
      }
    } else {
      runtime.spawnTimer -= delta;
      if (runtime.spawnRemaining > 0 && runtime.spawnTimer <= 0 && aliveBeforeUpdate < budget) {
        const burst = runtime.wave >= 5 && runtime.intensity > 0.62 ? 2 : 1;
        for (let index = 0; index < Math.min(burst, runtime.spawnRemaining); index += 1) {
          spawnZombie(runtime, runtime.wave % 5 === 0 && runtime.spawnRemaining === 1 ? 'brute' : undefined);
          runtime.spawnRemaining -= 1;
        }
        runtime.spawnTimer = clamp((1.85 - runtime.wave * 0.075 - runtime.intensity * 0.45) / scalar, 0.34, 1.9);
      }
      if (runtime.spawnRemaining <= 0 && aliveBeforeUpdate === 0) {
        runtime.waveBreak = 7;
        runtime.score += runtime.wave * 350;
      }
    }

    runtime.zombies.forEach((zombie) => {
      zombie.hit = Math.max(0, zombie.hit - delta);
      if (zombie.dead) {
        zombie.death += delta;
        return;
      }
      const barricade = runtime.barricades[zombie.lane] ?? runtime.barricades[1];
      const targetX = zombie.z > 4.35 ? barricade.x : runtime.playerX;
      const lanePull = clamp((targetX - zombie.x) * delta * (zombie.z > 4.35 ? 0.38 : 0.72), -0.72 * delta, 0.72 * delta);
      zombie.x += lanePull;
      zombie.attack -= delta;

      const barrierLine = 4.72;
      if (zombie.z > barrierLine) {
        zombie.z -= zombie.speed * delta;
      } else if (barricade.planks > 0 && zombie.z > 3.9) {
        zombie.z = Math.max(4.38, zombie.z);
        if (zombie.attack <= 0) {
          const plankDamage = (zombie.type === 'brute' ? 31 : zombie.type === 'runner' ? 14 : zombie.type === 'toxic' ? 18 : 12) * scalar;
          barricade.plankHp -= plankDamage;
          barricade.hit = 0.22;
          zombie.attack = zombie.type === 'runner' ? 0.62 : zombie.type === 'brute' ? 1.18 : 0.9;
          runtime.shake = Math.max(runtime.shake, zombie.type === 'brute' ? 0.72 : 0.2);
          if (barricade.plankHp <= 0) {
            barricade.planks = Math.max(0, barricade.planks - 1);
            barricade.plankHp = 58;
            barricade.hit = 0.55;
            playSound('hit');
            vibrate(zombie.type === 'brute' ? [18, 20, 18] : 9);
          }
        }
      } else {
        zombie.z -= zombie.speed * delta;
      }

      if (zombie.z < runtime.playerZ + 1.08 && Math.abs(zombie.x - runtime.playerX) < (zombie.type === 'brute' ? 1.7 : 1.18) && zombie.attack <= 0) {
        const damage = (zombie.type === 'brute' ? 19 : zombie.type === 'runner' ? 10 : zombie.type === 'toxic' ? 13 : 8) * scalar;
        runtime.health = Math.max(0, runtime.health - damage);
        runtime.damageFlash = 1;
        runtime.shake = 1.2;
        zombie.attack = zombie.type === 'runner' ? 0.72 : 1.08;
        zombie.z += 0.5;
        vibrate([18, 26, 18]);
      }
    });
    runtime.zombies = runtime.zombies.filter((zombie) => zombie.z > runtime.playerZ - 1.8 && (!zombie.dead || zombie.death < 1.25));

    const pressure = clamp(runtime.zombies.filter((zombie) => !zombie.dead && zombie.z < 11).length / 10, 0, 1);
    const breach = 1 - runtime.barricades.reduce((sum, barricade) => sum + barricade.planks, 0) / runtime.barricades.reduce((sum, barricade) => sum + barricade.maxPlanks, 0);
    const targetIntensity = runtime.waveBreak > 0 ? 0.08 : clamp(pressure * 0.68 + breach * 0.3 + runtime.wave * 0.025 + (100 - runtime.health) * 0.002, 0, 1);
    runtime.intensity += (targetIntensity - runtime.intensity) * delta * 1.8;

    runtime.squadTimer -= delta;
    runtime.squad.forEach((mate) => { mate.assistCooldown = Math.max(0, mate.assistCooldown - delta); });
    if (runtime.squadTimer <= 0) {
      runtime.squadTimer = 0.48 + Math.random() * 0.48;
      const active = runtime.squad.filter((mate) => !mate.downed);
      const target = runtime.zombies.filter((zombie) => !zombie.dead).sort((a, b) => a.z - b.z)[0];
      if (target && active.length) {
        target.hp -= 7 + active.length * 3 + Math.random() * 6;
        if (target.hp <= 0) {
          target.dead = true;
          target.death = 0;
          runtime.kills += 1;
          runtime.score += 70;
        }
      }
      if (runtime.zombies.some((zombie) => !zombie.dead && zombie.z < 3.8) && Math.random() < 0.34 * scalar) {
        const candidates = runtime.squad.filter((mate) => !mate.downed);
        const mate = candidates[Math.floor(Math.random() * candidates.length)];
        if (mate) {
          mate.health = Math.max(0, mate.health - (5 + Math.random() * 8) * scalar);
          mate.downed = mate.health <= 0;
        }
      }
    }

    runtime.particles.forEach((particle) => {
      particle.life -= delta;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vy += 180 * delta;
    });
    runtime.particles = runtime.particles.filter((particle) => particle.life > 0).slice(-180);

    runtime.recoil = Math.max(0, runtime.recoil - delta * 5.8);
    runtime.shake = Math.max(0, runtime.shake - delta * 4.5);
    runtime.muzzle = Math.max(0, runtime.muzzle - delta * 18);
    runtime.damageFlash = Math.max(0, runtime.damageFlash - delta * 2.7);
    runtime.hitMarker = Math.max(0, runtime.hitMarker - delta);
    runtime.comboTime -= delta;
    if (runtime.comboTime <= 0) runtime.combo = 0;
    if (runtime.fireHeld) shoot();
  }, [playSound, shoot, spawnZombie, vibrate]);

  const startGame = useCallback(() => {
    initAudio();
    const runtime = makeRuntime(difficulty);
    runtimeRef.current = runtime;
    for (let i = 0; i < 5; i += 1) spawnZombie(runtime, i === 4 && difficulty !== 'survivor' ? 'runner' : undefined);
    runtime.spawnRemaining -= 5;
    setHud(hudFromRuntime(runtime));
    setShowBriefing(true);
    setScreen('playing');
    playSound('ui');
    window.setTimeout(() => setShowBriefing(false), 3700);
  }, [difficulty, initAudio, playSound, spawnZombie]);

  useEffect(() => {
    if (screen !== 'playing') return;
    const canvas = canvasRef.current;
    const runtime = runtimeRef.current;
    if (!canvas || !runtime) return;

    let frame = 0;
    let previous = performance.now();
    const hardware = navigator.hardwareConcurrency || 4;
    const autoLow = coarse && hardware <= 6;
    const budget = quality === 'performance' || (quality === 'auto' && autoLow) ? 24 : quality === 'cinematic' ? 46 : 34;
    const resolvedQuality = quality === 'cinematic' && !autoLow ? 'cinematic' : 'performance';
    let engine: Game3D | null = null;
    let fallbackContext: CanvasRenderingContext2D | null = null;
    try {
      engine = new Game3D(canvas, resolvedQuality, coarse);
    } catch (error) {
      console.warn('WebGL unavailable, using Canvas 2D compatibility renderer.', error);
      fallbackContext = canvas.getContext('2d', { alpha: false });
    }
    if (!engine && !fallbackContext) return;
    engineRef.current = engine;

    const loop = (now: number) => {
      const delta = Math.min(0.034, Math.max(0.001, (now - previous) / 1000));
      previous = now;
      const rect = canvas.getBoundingClientRect();
      const dprCap = quality === 'performance' || (quality === 'auto' && autoLow) ? 1 : quality === 'cinematic' ? 2 : 1.55;
      const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
      engine?.resize(rect.width, rect.height, dpr);
      runtime.width = rect.width;
      runtime.height = rect.height;
      updateRuntime(runtime, delta, budget);
      const snapshot: WorldSnapshot = {
        time: runtime.time,
        playerX: runtime.playerX,
        playerZ: runtime.playerZ,
        aimX: runtime.aimX,
        aimY: runtime.aimY,
        recoil: runtime.recoil,
        muzzle: runtime.muzzle,
        shake: runtime.shake,
        intensity: runtime.intensity,
        weapon: runtime.weapon,
        zombies: runtime.zombies,
        barricades: runtime.barricades,
      };
      if (engine) {
        engine.render(snapshot, delta, motion);
      } else if (fallbackContext) {
        const pixelWidth = Math.max(1, Math.round(rect.width * dpr));
        const pixelHeight = Math.max(1, Math.round(rect.height * dpr));
        if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
          canvas.width = pixelWidth;
          canvas.height = pixelHeight;
        }
        fallbackContext.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawWorld(fallbackContext, runtime, rect.width, rect.height, backgroundRef.current, !motion, resolvedQuality);
      }

      if (now - lastHudRef.current > 90) {
        lastHudRef.current = now;
        setHud(hudFromRuntime(runtime));
      }
      if (runtime.health <= 0) {
        runtime.fireHeld = false;
        const nextBest = Math.max(bestScore, runtime.score);
        setBestScore(nextBest);
        window.localStorage.setItem('dead-sector-best', String(nextBest));
        setScreen('dead');
        return;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      if (engineRef.current === engine) engineRef.current = null;
      engine?.dispose();
    };
  }, [bestScore, coarse, motion, quality, screen, updateRuntime]);

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      const runtime = runtimeRef.current;
      if (event.code === 'Escape') {
        event.preventDefault();
        setScreen((current) => current === 'playing' ? 'paused' : current === 'paused' ? 'playing' : current);
        return;
      }
      if (!runtime || screenRef.current !== 'playing') return;
      runtime.keys.add(event.code);
      if (event.code === 'KeyE') runtime.repairHeld = true;
      if (event.repeat) return;
      if (event.code === 'KeyR') beginReload();
      if (event.code === 'Digit1') switchWeapon('carbine');
      if (event.code === 'Digit2') switchWeapon('shotgun');
      if (event.code === 'KeyG') throwGrenade();
      if (event.code === 'KeyH' || event.code === 'KeyQ') consumeMedkit();
    };
    const keyUp = (event: KeyboardEvent) => {
      const runtime = runtimeRef.current;
      runtime?.keys.delete(event.code);
      if (runtime && event.code === 'KeyE') runtime.repairHeld = false;
    };
    const pointerUp = () => {
      if (!runtimeRef.current) return;
      runtimeRef.current.fireHeld = false;
      runtimeRef.current.repairHeld = false;
      runtimeRef.current.sprintHeld = false;
    };
    const visibility = () => { if (document.hidden && screenRef.current === 'playing') setScreen('paused'); };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('pointerup', pointerUp);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('pointerup', pointerUp);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [beginReload, consumeMedkit, switchWeapon, throwGrenade]);

  const aimAtPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const runtime = runtimeRef.current;
    if (!runtime || event.pointerType === 'touch') return;
    const rect = event.currentTarget.getBoundingClientRect();
    runtime.aimX = clamp(((event.clientX - rect.left) / rect.width - 0.5) * 2, -1, 1);
    runtime.aimY = clamp(((event.clientY - rect.top) / rect.height - 0.5) * 2, -1, 1);
  };

  const fullscreen = () => {
    initAudio();
    if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.();
    else void document.exitFullscreen?.();
  };

  const backToMenu = () => {
    if (runtimeRef.current) runtimeRef.current.fireHeld = false;
    setScreen('menu');
  };

  if (screen === 'menu') {
    return (
      <main className="menu-screen">
        <div className="menu-backdrop" aria-hidden="true" />
        <div className="rain-layer" aria-hidden="true" />
        <header className="menu-header">
          <div className="brand-lockup">
            <span className="eyebrow">TRUE WEBGL 3D · ENDLESS SURVIVAL FPS</span>
            <h1>DEAD SECTOR<span>:</span> OUTBREAK</h1>
            <p>ĐÓNG BARRICADE <i /> GIỮ SAFEHOUSE <i /> SỐNG QUA VÔ HẠN WAVE</p>
          </div>
          <div className="menu-squad" aria-label="Đội hình AI">
            {['NAM', 'LINH', 'PHƯỚC', 'BẠN'].map((name, index) => (
              <div className={`menu-survivor survivor-${index + 1}`} key={name}>
                <div className="portrait"><span>{name.slice(0, 1)}</span></div>
                <strong>{name}</strong>
                <div className="mini-health"><span /></div>
              </div>
            ))}
          </div>
        </header>

        <section className="mission-panel">
          <span className="panel-kicker">ENDLESS 01 · SAFEHOUSE QUẬN ĐEN</span>
          <div className="mission-objective"><b>▥</b><div><small>MỤC TIÊU</small><strong>GIỮ BARRICADE</strong></div></div>
          <p>Bảo vệ 3 cửa sổ bằng 15 tấm ván. Zombie sẽ phá từng tấm — áp sát và giữ E hoặc nút SỬA VÁN để đóng lại.</p>
          <div className="mission-meta">
            <span><b>3</b> BARRICADE</span>
            <span><b>15</b> TẤM VÁN</span>
            <span><b>∞</b> WAVE</span>
          </div>
        </section>

        <section className="launch-panel">
          <div className="difficulty-select" role="group" aria-label="Chọn độ khó">
            {(Object.keys(DIFFICULTIES) as DifficultyId[]).map((id) => (
              <button className={difficulty === id ? 'active' : ''} key={id} onClick={() => { setDifficulty(id); playSound('ui'); }}>
                <strong>{DIFFICULTIES[id].label}</strong><span>{DIFFICULTIES[id].note}</span>
              </button>
            ))}
          </div>
          <button className="start-button" onClick={startGame}>
            <span className="start-icon">▶</span>
            <span><small>3D WEBGL · AI DIRECTOR VÔ HẠN</small>BẮT ĐẦU SINH TỒN</span>
          </button>
          <div className="quick-settings">
            <label>ĐỒ HỌA
              <select value={quality} onChange={(event) => setQuality(event.target.value as QualityId)}>
                <option value="auto">TỰ ĐỘNG</option>
                <option value="cinematic">ĐIỆN ẢNH</option>
                <option value="performance">HIỆU NĂNG</option>
              </select>
            </label>
            <button aria-pressed={sound} onClick={() => { initAudio(); setSound((value) => !value); }}>ÂM THANH {sound ? 'BẬT' : 'TẮT'}</button>
            <button aria-pressed={motion} onClick={() => setMotion((value) => !value)}>RUNG CAMERA {motion ? 'BẬT' : 'TẮT'}</button>
            <button onClick={fullscreen}>TOÀN MÀN HÌNH</button>
          </div>
        </section>

        <footer className="menu-footer">
          <span className="online-dot" /> PUBLIC BUILD · AI SQUAD SẴN SÀNG
          <span>BEST SCORE {bestScore.toLocaleString('vi-VN').padStart(6, '0')}</span>
          <span>{coarse ? 'JOYSTICK · KÉO NGẮM · GIỮ SỬA VÁN' : 'WASD · CHUỘT · E SỬA VÁN · R / G / H'}</span>
        </footer>
      </main>
    );
  }

  const outcome = screen === 'dead' || screen === 'victory';
  const totalPlanks = hud.barricades.reduce((sum, barricade) => sum + barricade.planks, 0);
  const maxPlanks = hud.barricades.reduce((sum, barricade) => sum + barricade.maxPlanks, 0) || 15;
  return (
    <main className="game-screen">
      <canvas
        ref={canvasRef}
        className="game-canvas"
        aria-label="Màn chơi bắn zombie góc nhìn thứ nhất"
        onPointerMove={aimAtPointer}
        onPointerDown={(event) => {
          if (event.pointerType !== 'touch' && screenRef.current === 'playing') {
            initAudio();
            if (runtimeRef.current) runtimeRef.current.fireHeld = true;
            shoot();
          }
        }}
        onContextMenu={(event) => event.preventDefault()}
      />
      <div className="film-grain" aria-hidden="true" />
      <div className={`aim-reticle ${hud.hitMarker > 0 ? hud.hitHeadshot ? 'headshot' : 'hit' : ''}`} aria-hidden="true"><i /><i /><i /><i /></div>
      <div className="damage-vignette" style={{ opacity: hud.damageFlash }} aria-hidden="true" />

      <header className="combat-topbar">
        <div className="combat-brand"><span>DEAD SECTOR</span><small>OUTBREAK</small></div>
        <div className="objective-card">
          <span className="objective-diamond">▥</span>
          <div><small>{hud.waveBreak > 0 ? 'THỜI GIAN GIA CỐ' : 'ENDLESS SURVIVAL'}</small><strong>{hud.waveBreak > 0 ? `WAVE ${hud.wave} SẠCH · WAVE SAU ${Math.ceil(hud.waveBreak)}s` : `BẢO VỆ VÁN · ${hud.alive + hud.spawnRemaining} ZOMBIE CÒN LẠI`}</strong></div>
          <div className="objective-progress"><span style={{ width: `${totalPlanks / maxPlanks * 100}%` }} /></div>
        </div>
        <div className="combat-stats"><span>WAVE <b>{hud.wave}</b></span><span>KILLS <b>{hud.kills}</b></span><span>VÁN <b>{totalPlanks}/{maxPlanks}</b></span><span>{formatTime(hud.time)}</span><em className={`threat threat-${Math.max(1, Math.ceil(hud.intensity * 3))}`}>THREAT</em></div>
        <div className="top-actions">
          <button aria-label={sound ? 'Tắt âm thanh' : 'Bật âm thanh'} onClick={() => setSound((value) => !value)}>{sound ? '◖))' : '◖×'}</button>
          <button aria-label="Toàn màn hình" onClick={fullscreen}>⛶</button>
          <button aria-label="Tạm dừng" onClick={() => setScreen('paused')}>Ⅱ</button>
        </div>
      </header>

      <aside className="squad-hud" aria-label="Tình trạng đồng đội">
        {hud.squad.map((mate, index) => (
          <button className={mate.downed ? 'downed' : mate.health < 35 ? 'critical' : ''} key={mate.name} onClick={() => assistSquad(index)} disabled={!mate.downed && mate.health > 58}>
            <span className={`squad-avatar avatar-${index + 1}`}>{mate.name.slice(0, 1)}</span>
            <span className="squad-copy"><small>{mate.role}</small><strong>{mate.name}</strong><i><b style={{ width: `${mate.health}%` }} /></i></span>
            {(mate.downed || mate.health <= 58) && <em>{mate.downed ? 'CỨU' : '+'}</em>}
          </button>
        ))}
      </aside>

      <aside className="barricade-hud" aria-label="Tình trạng barricade">
        {hud.barricades.map((barricade) => (
          <div className={`${barricade.planks === 0 ? 'breached' : ''} ${hud.repairTarget === barricade.lane ? 'repairing' : ''}`} key={barricade.lane}>
            <small>CỬA {barricade.lane + 1}</small>
            <span>{Array.from({ length: barricade.maxPlanks }, (_, index) => <i className={index < barricade.planks ? 'intact' : ''} key={index} />)}</span>
            <b>{barricade.planks === 0 ? 'BREACH' : `${barricade.planks}/${barricade.maxPlanks}`}</b>
            {hud.repairTarget === barricade.lane && <em style={{ width: `${barricade.repair * 100}%` }} />}
          </div>
        ))}
      </aside>

      {showBriefing && screen === 'playing' && (
        <div className="briefing-toast">
          <span>▥</span><div><small>MỤC TIÊU ENDLESS</small><strong>GIỮ 3 BARRICADE · ĐÓNG LẠI VÁN</strong><p>Áp sát cửa · Giữ E hoặc nút SỬA VÁN · Sống lâu nhất có thể</p></div>
        </div>
      )}

      {totalPlanks < maxPlanks && screen === 'playing' && (
        <div className={`repair-prompt ${hud.repairTarget >= 0 ? 'active' : ''}`}>
          <b>{hud.repairTarget >= 0 ? 'ĐANG ĐÓNG VÁN' : coarse ? 'ĐẾN GẦN CỬA · GIỮ SỬA VÁN' : 'ĐẾN GẦN CỬA · GIỮ [E] ĐÓNG VÁN'}</b>
          <span><i style={{ width: `${hud.repairTarget >= 0 ? (hud.barricades[hud.repairTarget]?.repair ?? 0) * 100 : 0}%` }} /></span>
        </div>
      )}

      {hud.combo >= 3 && screen === 'playing' && <div className="combo-badge">x{hud.combo} <span>COMBO</span></div>}

      <section className="health-hud">
        <div className="health-number"><span>✚</span><strong>{Math.ceil(hud.health)}</strong></div>
        <div className="vitals"><small>TÌNH TRẠNG</small><div className="health-track"><i style={{ width: `${hud.health}%` }} /></div><div className="stamina-track"><i style={{ width: `${hud.stamina}%` }} /></div></div>
        <div className="inventory-pills">
          <button onClick={consumeMedkit} disabled={hud.medkits <= 0}><b>H</b> MEDKIT ×{hud.medkits}</button>
          <button onClick={throwGrenade} disabled={hud.grenades <= 0}><b>G</b> LỰU ĐẠN ×{hud.grenades}</button>
        </div>
      </section>

      <section className="weapon-hud">
        {hud.reloading && <div className="reload-meter"><span style={{ width: `${hud.reloadProgress * 100}%` }} /></div>}
        <small>{hud.reloading ? 'ĐANG NẠP ĐẠN' : WEAPONS[hud.weapon].label}</small>
        <div className="ammo-readout"><strong>{hud.ammo.toString().padStart(2, '0')}</strong><span>/ {hud.reserve}</span></div>
        <div className="weapon-tabs">
          <button className={hud.weapon === 'carbine' ? 'active' : ''} onClick={() => switchWeapon('carbine')}><b>1</b> CARBINE</button>
          <button className={hud.weapon === 'shotgun' ? 'active' : ''} onClick={() => switchWeapon('shotgun')}><b>2</b> SHOTGUN</button>
        </div>
      </section>

      <div className="performance-chip">{quality.toUpperCase()} · {hud.fps} FPS</div>

      <div
        className="mobile-move-zone"
        aria-label="Cần điều khiển di chuyển"
        onPointerDown={(event) => {
          joystickRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const start = joystickRef.current;
          const runtime = runtimeRef.current;
          if (!start || start.id !== event.pointerId || !runtime) return;
          runtime.moveX = clamp((event.clientX - start.x) / 54, -1, 1);
          runtime.moveY = clamp((event.clientY - start.y) / 54, -1, 1);
          if (joystickThumbRef.current) joystickThumbRef.current.style.transform = `translate(${runtime.moveX * 30}px, ${runtime.moveY * 30}px)`;
        }}
        onPointerUp={() => {
          joystickRef.current = null;
          if (runtimeRef.current) { runtimeRef.current.moveX = 0; runtimeRef.current.moveY = 0; }
          if (joystickThumbRef.current) joystickThumbRef.current.style.transform = 'translate(0, 0)';
        }}
      >
        <span ref={joystickThumbRef} />
      </div>

      <div
        className="mobile-look-zone"
        aria-label="Kéo để ngắm"
        onPointerDown={(event) => {
          lookRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const last = lookRef.current;
          const runtime = runtimeRef.current;
          if (!last || last.id !== event.pointerId || !runtime) return;
          runtime.aimX = clamp(runtime.aimX + (event.clientX - last.x) / 260, -1, 1);
          runtime.aimY = clamp(runtime.aimY + (event.clientY - last.y) / 220, -1, 1);
          last.x = event.clientX; last.y = event.clientY;
        }}
        onPointerUp={() => { lookRef.current = null; }}
      />

      <div className="mobile-actions">
        <button className="action-small reload-action" aria-label="Nạp đạn" onClick={beginReload}>↻<small>NẠP</small></button>
        <button className="action-small sprint-action" aria-label="Chạy nước rút" onPointerDown={() => { if (runtimeRef.current) runtimeRef.current.sprintHeld = true; }} onPointerUp={() => { if (runtimeRef.current) runtimeRef.current.sprintHeld = false; }}>»<small>CHẠY</small></button>
        <button className="action-small repair-action" aria-label="Giữ để sửa ván" onPointerDown={(event) => { event.stopPropagation(); if (runtimeRef.current) runtimeRef.current.repairHeld = true; }} onPointerUp={() => { if (runtimeRef.current) runtimeRef.current.repairHeld = false; }} onPointerCancel={() => { if (runtimeRef.current) runtimeRef.current.repairHeld = false; }}>▥<small>SỬA VÁN</small></button>
        <button className="fire-action" aria-label="Bắn" onPointerDown={(event) => { event.stopPropagation(); initAudio(); if (runtimeRef.current) runtimeRef.current.fireHeld = true; shoot(); }} onPointerUp={() => { if (runtimeRef.current) runtimeRef.current.fireHeld = false; }}><span>●</span><small>BẮN</small></button>
      </div>

      {(screen === 'paused' || outcome) && (
        <div className="pause-layer" role="dialog" aria-modal="true" aria-label={screen === 'paused' ? 'Game tạm dừng' : 'Kết quả nhiệm vụ'}>
          <div className={`pause-card ${screen}`}>
            <span className="pause-kicker">{screen === 'victory' ? 'KHU VỰC ĐÃ ĐƯỢC KIỂM SOÁT' : screen === 'dead' ? 'TỔ ĐỘI THẤT BẠI' : 'TẠM DỪNG'}</span>
            <h2>{screen === 'victory' ? 'SƠ TÁN THÀNH CÔNG' : screen === 'dead' ? 'BẠN ĐÃ BỊ HẠ' : 'NHIỆM VỤ ĐANG CHỜ'}</h2>
            {outcome ? (
              <div className="result-grid">
                <span><small>ĐIỂM</small><b>{hud.score.toLocaleString('vi-VN')}</b></span>
                <span><small>TIÊU DIỆT</small><b>{hud.kills}</b></span>
                <span><small>WAVE ĐẠT ĐƯỢC</small><b>{hud.wave}</b></span>
                <span><small>KỶ LỤC</small><b>{bestScore.toLocaleString('vi-VN')}</b></span>
              </div>
            ) : (
              <div className="pause-settings">
                <label>CHẤT LƯỢNG<select value={quality} onChange={(event) => setQuality(event.target.value as QualityId)}><option value="auto">TỰ ĐỘNG</option><option value="cinematic">ĐIỆN ẢNH</option><option value="performance">HIỆU NĂNG</option></select></label>
                <button aria-pressed={sound} onClick={() => setSound((value) => !value)}>ÂM THANH <b>{sound ? 'BẬT' : 'TẮT'}</b></button>
                <button aria-pressed={motion} onClick={() => setMotion((value) => !value)}>RUNG CAMERA <b>{motion ? 'BẬT' : 'TẮT'}</b></button>
              </div>
            )}
            <div className="pause-actions">
              {screen === 'paused' && <button className="primary" onClick={() => setScreen('playing')}>TIẾP TỤC</button>}
              {outcome && <button className="primary" onClick={startGame}>CHƠI LẠI</button>}
              <button onClick={fullscreen}>TOÀN MÀN HÌNH</button>
              <button onClick={backToMenu}>VỀ SẢNH CHỜ</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
