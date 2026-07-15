import * as THREE from 'three';

export type RenderQuality = 'cinematic' | 'performance';

export type RenderZombie = {
  id: number;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  type: 'walker' | 'runner' | 'brute' | 'toxic';
  phase: number;
  hit: number;
  dead: boolean;
  death: number;
};

export type RenderBarricade = {
  lane: number;
  x: number;
  planks: number;
  maxPlanks: number;
  hit: number;
  repair: number;
};

export type WorldSnapshot = {
  time: number;
  playerX: number;
  playerZ: number;
  aimX: number;
  aimY: number;
  recoil: number;
  muzzle: number;
  shake: number;
  intensity: number;
  weapon: 'carbine' | 'shotgun';
  zombies: RenderZombie[];
  barricades: RenderBarricade[];
};

export type RayHit = {
  zombieId: number;
  head: boolean;
  point: [number, number, number];
};

type ZombieVisual = {
  root: THREE.Group;
  head: THREE.Mesh;
  leftArm: THREE.Mesh;
  rightArm: THREE.Mesh;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  materials: THREE.MeshStandardMaterial[];
  targets: THREE.Mesh[];
};

type BarricadeVisual = {
  root: THREE.Group;
  planks: THREE.Mesh[];
  material: THREE.MeshStandardMaterial;
  repairLight: THREE.PointLight;
};

type ParticleEffect = {
  points: THREE.Points;
  life: number;
  maxLife: number;
  velocities: Float32Array;
};

const PALETTE = {
  fog: new THREE.Color('#07100f'),
  acid: new THREE.Color('#b8d84a'),
  bone: new THREE.Color('#d9dfd5'),
  blood: new THREE.Color('#8c1c16'),
  amber: new THREE.Color('#f09a38'),
};

const seeded = (seed: number) => {
  const value = Math.sin(seed * 91.173) * 43758.5453;
  return value - Math.floor(value);
};

export class Game3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(72, 1, 0.06, 110);
  private readonly raycaster = new THREE.Raycaster();
  private readonly zombieVisuals = new Map<number, ZombieVisual>();
  private readonly barricadeVisuals = new Map<number, BarricadeVisual>();
  private readonly hitTargets: THREE.Mesh[] = [];
  private readonly effects: ParticleEffect[] = [];
  private readonly rain: THREE.Points;
  private readonly weapon = new THREE.Group();
  private readonly muzzleLight = new THREE.PointLight('#ff9f3d', 0, 7, 2);
  private readonly weaponMeshes: THREE.Mesh[] = [];
  private readonly clockDirection = new THREE.Vector3();
  private readonly quality: RenderQuality;
  private readonly shadows: boolean;
  private width = 1;
  private height = 1;

  constructor(canvas: HTMLCanvasElement, quality: RenderQuality, coarse: boolean) {
    this.quality = quality;
    this.shadows = quality === 'cinematic' && !coarse;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: quality === 'cinematic',
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = quality === 'cinematic' ? 1.12 : 1;
    this.renderer.shadowMap.enabled = this.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.background = new THREE.Color('#030706');
    this.scene.fog = new THREE.FogExp2(PALETTE.fog, quality === 'cinematic' ? 0.025 : 0.031);

    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.makeSky();
    this.makeLights();
    this.makeStreet();
    this.makeSafehouse();
    this.makeWeapon();
    this.rain = this.makeRain(coarse ? 280 : quality === 'cinematic' ? 980 : 460);
    this.scene.add(this.rain);
  }

  private makeSky() {
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color('#061114') },
        bottomColor: { value: new THREE.Color('#182220') },
      },
      vertexShader: `varying vec3 vWorldPosition; void main(){ vec4 worldPosition = modelMatrix * vec4(position, 1.0); vWorldPosition = worldPosition.xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 topColor; uniform vec3 bottomColor; varying vec3 vWorldPosition; void main(){ float h = normalize(vWorldPosition).y * .5 + .5; gl_FragColor = vec4(mix(bottomColor, topColor, smoothstep(.05, .82, h)), 1.0); }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(88, 18, 12), material);
    this.scene.add(sky);
  }

  private makeLights() {
    const hemi = new THREE.HemisphereLight('#8eaca6', '#111512', 1.25);
    this.scene.add(hemi);

    const moon = new THREE.DirectionalLight('#a9c8c7', 2.2);
    moon.position.set(-8, 14, 6);
    moon.castShadow = this.shadows;
    if (this.shadows) {
      moon.shadow.mapSize.set(1024, 1024);
      moon.shadow.camera.left = -14;
      moon.shadow.camera.right = 14;
      moon.shadow.camera.top = 14;
      moon.shadow.camera.bottom = -14;
      moon.shadow.camera.near = 1;
      moon.shadow.camera.far = 45;
    }
    this.scene.add(moon);

    for (const [x, z] of [[-5.4, -8], [5.2, -18], [-5.1, -31]] as const) {
      const light = new THREE.PointLight('#e4a14b', this.quality === 'cinematic' ? 18 : 10, 13, 2.2);
      light.position.set(x, 4.4, z);
      this.scene.add(light);
      const lamp = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.28, 0.18),
        new THREE.MeshBasicMaterial({ color: '#ffc56b' }),
      );
      lamp.position.copy(light.position);
      this.scene.add(lamp);
    }
  }

  private makeStreet() {
    const groundMaterial = new THREE.MeshStandardMaterial({ color: '#101716', roughness: 0.94, metalness: 0.04 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(62, 110), groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, -48);
    ground.receiveShadow = this.shadows;
    this.scene.add(ground);

    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 100),
      new THREE.MeshStandardMaterial({ color: '#151b1a', roughness: 0.9, metalness: 0.08 }),
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.012, -47);
    road.receiveShadow = this.shadows;
    this.scene.add(road);

    const lineMaterial = new THREE.MeshBasicMaterial({ color: '#69736d', transparent: true, opacity: 0.35 });
    for (let z = -9; z > -91; z -= 7) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 2.8), lineMaterial);
      line.rotation.x = -Math.PI / 2;
      line.position.set(0, 0.025, z);
      this.scene.add(line);
    }

    const curbMaterial = new THREE.MeshStandardMaterial({ color: '#29312e', roughness: 0.88 });
    for (const x of [-6.25, 6.25]) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.25, 100), curbMaterial);
      curb.position.set(x, 0.1, -47);
      curb.receiveShadow = this.shadows;
      this.scene.add(curb);
    }

    const buildingMaterials = [
      new THREE.MeshStandardMaterial({ color: '#111918', roughness: 0.86 }),
      new THREE.MeshStandardMaterial({ color: '#1b2220', roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: '#20231f', roughness: 0.94 }),
    ];
    const windowOn = new THREE.MeshBasicMaterial({ color: '#bb7130', transparent: true, opacity: 0.58 });
    const windowOff = new THREE.MeshBasicMaterial({ color: '#07100f' });
    for (let index = 0; index < 16; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const z = -7 - Math.floor(index / 2) * 11;
      const height = 5.5 + seeded(index + 2) * 8;
      const width = 5 + seeded(index + 11) * 3.6;
      const depth = 7 + seeded(index + 22) * 4;
      const building = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        buildingMaterials[index % buildingMaterials.length],
      );
      building.position.set(side * (8.4 + width * 0.24), height / 2 - 0.05, z);
      building.castShadow = this.shadows;
      building.receiveShadow = this.shadows;
      this.scene.add(building);

      for (let floor = 1.4; floor < height - 0.8; floor += 1.55) {
        for (const offset of [-0.9, 0.9]) {
          if (seeded(index * 17 + floor * 5 + offset) < 0.34) continue;
          const window = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.72), seeded(index * 8 + floor) > 0.83 ? windowOn : windowOff);
          window.position.set(
            side * (8.4 + width * 0.24 - side * (width / 2 + 0.006)),
            floor,
            z + offset,
          );
          window.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
          this.scene.add(window);
        }
      }
    }

    const wreckMaterial = new THREE.MeshStandardMaterial({ color: '#202825', roughness: 0.72, metalness: 0.38 });
    for (const [x, z, rotation] of [[-3.8, -18, -0.12], [3.5, -38, 0.22], [-3.4, -58, 0.08]] as const) {
      const wreck = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.72, 4.1), wreckMaterial);
      body.position.y = 0.65;
      wreck.add(body);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.72, 1.9), wreckMaterial);
      cabin.position.set(0, 1.22, -0.25);
      wreck.add(cabin);
      wreck.position.set(x, 0, z);
      wreck.rotation.y = rotation;
      this.scene.add(wreck);
    }
  }

  private makeSafehouse() {
    const concrete = new THREE.MeshStandardMaterial({ color: '#252d29', roughness: 0.92 });
    const metal = new THREE.MeshStandardMaterial({ color: '#303b37', roughness: 0.55, metalness: 0.55 });
    const back = new THREE.Mesh(new THREE.BoxGeometry(17, 0.65, 0.55), concrete);
    back.position.set(0, 2.85, -4.55);
    back.castShadow = this.shadows;
    this.scene.add(back);
    for (const x of [-5.25, -1.75, 1.75, 5.25]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.42, 5.6, 0.55), metal);
      post.position.set(x, 2.3, -4.55);
      post.castShadow = this.shadows;
      this.scene.add(post);
    }
    const lowWall = new THREE.Mesh(new THREE.BoxGeometry(17, 0.62, 0.78), concrete);
    lowWall.position.set(0, 0.28, -4.52);
    lowWall.receiveShadow = this.shadows;
    this.scene.add(lowWall);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(17, 0.25, 7.5), concrete);
    roof.position.set(0, 5.05, -1.2);
    roof.receiveShadow = this.shadows;
    this.scene.add(roof);

    for (const lane of [0, 1, 2]) {
      const x = (lane - 1) * 3.5;
      const root = new THREE.Group();
      root.position.set(x, 0, -4.28);
      const material = new THREE.MeshStandardMaterial({ color: '#684526', roughness: 0.86, metalness: 0.02, emissive: '#000000' });
      const planks: THREE.Mesh[] = [];
      const order = [2, 0, 4, 1, 3];
      order.forEach((slot, index) => {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(3.05, 0.3, 0.16), material);
        plank.position.set(0, 0.82 + slot * 0.43, 0);
        plank.rotation.z = (index % 2 === 0 ? -1 : 1) * (0.025 + index * 0.006);
        plank.castShadow = this.shadows;
        plank.receiveShadow = this.shadows;
        root.add(plank);
        planks.push(plank);
      });
      const repairLight = new THREE.PointLight('#b8d84a', 0, 4, 2);
      repairLight.position.set(0, 1.65, 0.8);
      root.add(repairLight);
      this.scene.add(root);
      this.barricadeVisuals.set(lane, { root, planks, material, repairLight });
    }

    const safeLight = new THREE.PointLight('#b8d84a', 9, 9, 2);
    safeLight.position.set(0, 3.4, -0.3);
    this.scene.add(safeLight);
  }

  private makeWeapon() {
    const gunMetal = new THREE.MeshStandardMaterial({ color: '#202a27', roughness: 0.38, metalness: 0.72 });
    const polymer = new THREE.MeshStandardMaterial({ color: '#0c1211', roughness: 0.75, metalness: 0.16 });
    const accent = new THREE.MeshStandardMaterial({ color: '#718c30', roughness: 0.62, metalness: 0.18 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 0.78), gunMetal);
    body.position.set(0, 0, -0.14);
    this.weapon.add(body);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.23, 0.35), polymer);
    stock.position.set(0, -0.02, 0.39);
    this.weapon.add(stock);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.72, 10), gunMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.045, -0.83);
    this.weapon.add(barrel);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.16), accent);
    sight.position.set(0, 0.16, -0.15);
    this.weapon.add(sight);
    const magazine = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.35, 0.2), polymer);
    magazine.position.set(0, -0.24, 0.02);
    magazine.rotation.x = -0.16;
    this.weapon.add(magazine);
    this.weaponMeshes.push(body, stock, barrel, sight, magazine);
    this.weapon.position.set(0.43, -0.36, -0.72);
    this.weapon.rotation.set(-0.04, -0.08, -0.035);
    this.muzzleLight.position.set(0, 0.04, -1.2);
    this.weapon.add(this.muzzleLight);
    this.camera.add(this.weapon);
  }

  private makeRain(count: number) {
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      positions[index * 3] = (seeded(index + 1) - 0.5) * 28;
      positions[index * 3 + 1] = seeded(index + 42) * 13;
      positions[index * 3 + 2] = -seeded(index + 99) * 62;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: '#c6d8d4', size: this.quality === 'cinematic' ? 0.045 : 0.032, transparent: true, opacity: 0.48, depthWrite: false });
    return new THREE.Points(geometry, material);
  }

  private makeZombie(zombie: RenderZombie): ZombieVisual {
    const root = new THREE.Group();
    const style = zombie.type === 'toxic'
      ? { body: '#344834', skin: '#829462', eyes: '#c9f04c', scale: 1 }
      : zombie.type === 'brute'
        ? { body: '#171d1c', skin: '#67675c', eyes: '#ff8c36', scale: 1.34 }
        : zombie.type === 'runner'
          ? { body: '#44211e', skin: '#826b61', eyes: '#ff573d', scale: 0.92 }
          : { body: '#27302e', skin: '#73776b', eyes: '#d0dd91', scale: 1 };
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: style.body, roughness: 0.82, emissive: '#000000' });
    const skinMaterial = new THREE.MeshStandardMaterial({ color: style.skin, roughness: 0.9, emissive: '#000000' });
    const eyeMaterial = new THREE.MeshStandardMaterial({ color: style.eyes, emissive: style.eyes, emissiveIntensity: 2.4, roughness: 0.3 });
    const materials = [bodyMaterial, skinMaterial, eyeMaterial];
    const targets: THREE.Mesh[] = [];
    const register = (mesh: THREE.Mesh, part: 'body' | 'head') => {
      mesh.userData.zombieId = zombie.id;
      mesh.userData.part = part;
      mesh.castShadow = this.shadows;
      mesh.receiveShadow = this.shadows;
      targets.push(mesh);
      this.hitTargets.push(mesh);
      return mesh;
    };

    const torso = register(new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.88, 0.36), bodyMaterial), 'body');
    torso.position.y = 1.18;
    torso.rotation.z = zombie.type === 'runner' ? -0.1 : 0;
    root.add(torso);
    const head = register(new THREE.Mesh(new THREE.IcosahedronGeometry(0.27, 1), skinMaterial), 'head');
    head.position.set(0, 1.88, -0.015);
    root.add(head);
    for (const x of [-0.09, 0.09]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), eyeMaterial);
      eye.position.set(x, 1.93, 0.24);
      root.add(eye);
    }

    const makeLimb = (x: number, y: number, length: number, width: number, material: THREE.Material) => {
      const limb = register(new THREE.Mesh(new THREE.BoxGeometry(width, length, width), material), 'body');
      limb.position.set(x, y, 0);
      root.add(limb);
      return limb;
    };
    const leftArm = makeLimb(-0.48, 1.2, 0.78, 0.17, skinMaterial);
    const rightArm = makeLimb(0.48, 1.2, 0.78, 0.17, skinMaterial);
    leftArm.rotation.x = -0.58;
    rightArm.rotation.x = -0.72;
    const leftLeg = makeLimb(-0.19, 0.43, 0.85, 0.2, bodyMaterial);
    const rightLeg = makeLimb(0.19, 0.43, 0.85, 0.2, bodyMaterial);
    root.scale.setScalar(style.scale);
    root.userData.zombieId = zombie.id;
    root.userData.dead = false;
    this.scene.add(root);
    return { root, head, leftArm, rightArm, leftLeg, rightLeg, materials, targets };
  }

  private removeZombie(id: number, visual: ZombieVisual) {
    this.scene.remove(visual.root);
    visual.targets.forEach((target) => {
      const index = this.hitTargets.indexOf(target);
      if (index >= 0) this.hitTargets.splice(index, 1);
    });
    const disposedMaterials = new Set<THREE.Material>();
    visual.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        if (disposedMaterials.has(material)) return;
        disposedMaterials.add(material);
        material.dispose();
      });
    });
    this.zombieVisuals.delete(id);
  }

  resize(width: number, height: number, pixelRatio: number) {
    if (width === this.width && height === this.height && this.renderer.getPixelRatio() === pixelRatio) return;
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }

  raycast(pellets: number, spread: number): RayHit[] {
    const hits: RayHit[] = [];
    this.camera.updateMatrixWorld(true);
    for (let pellet = 0; pellet < pellets; pellet += 1) {
      const offset = pellet === 0 ? new THREE.Vector2(0, 0) : new THREE.Vector2((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread);
      this.raycaster.setFromCamera(offset, this.camera);
      const intersections = this.raycaster.intersectObjects(this.hitTargets, false);
      const intersection = intersections.find((item) => {
        const id = item.object.userData.zombieId as number | undefined;
        return id !== undefined && !this.zombieVisuals.get(id)?.root.userData.dead;
      });
      if (!intersection) continue;
      hits.push({
        zombieId: intersection.object.userData.zombieId as number,
        head: intersection.object.userData.part === 'head',
        point: intersection.point.toArray() as [number, number, number],
      });
    }
    return hits;
  }

  getAimPoint(distance = 11) {
    this.camera.getWorldDirection(this.clockDirection);
    const point = this.camera.position.clone().addScaledVector(this.clockDirection, distance);
    return { x: point.x, z: -point.z };
  }

  addImpact(point: [number, number, number], headshot: boolean) {
    const count = headshot ? 18 : 11;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const speed = 0.5 + Math.random() * 1.5;
      velocities[index * 3] = (Math.random() - 0.5) * speed;
      velocities[index * 3 + 1] = Math.random() * speed;
      velocities[index * 3 + 2] = (Math.random() - 0.5) * speed;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: headshot ? PALETTE.acid : PALETTE.blood, size: headshot ? 0.075 : 0.055, transparent: true, opacity: 0.9, depthWrite: false });
    const points = new THREE.Points(geometry, material);
    points.position.fromArray(point);
    this.scene.add(points);
    this.effects.push({ points, life: 0.48, maxLife: 0.48, velocities });
  }

  addExplosion(x: number, z: number) {
    const count = this.quality === 'cinematic' ? 70 : 38;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 5;
      velocities[index * 3] = Math.cos(angle) * speed;
      velocities[index * 3 + 1] = 1.2 + Math.random() * 4.5;
      velocities[index * 3 + 2] = Math.sin(angle) * speed;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: PALETTE.amber, size: 0.14, transparent: true, opacity: 1, depthWrite: false });
    const points = new THREE.Points(geometry, material);
    points.position.set(x, 0.35, -z);
    this.scene.add(points);
    this.effects.push({ points, life: 0.78, maxLife: 0.78, velocities });
  }

  addRepairBurst(x: number) {
    const point: [number, number, number] = [x, 1.45, -4.1];
    this.addImpact(point, true);
  }

  private updateEffects(delta: number) {
    for (let effectIndex = this.effects.length - 1; effectIndex >= 0; effectIndex -= 1) {
      const effect = this.effects[effectIndex];
      effect.life -= delta;
      const position = effect.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let index = 0; index < position.count; index += 1) {
        const velocityIndex = index * 3;
        position.setXYZ(
          index,
          position.getX(index) + effect.velocities[velocityIndex] * delta,
          position.getY(index) + effect.velocities[velocityIndex + 1] * delta,
          position.getZ(index) + effect.velocities[velocityIndex + 2] * delta,
        );
        effect.velocities[velocityIndex + 1] -= 5.6 * delta;
      }
      position.needsUpdate = true;
      const material = effect.points.material as THREE.PointsMaterial;
      material.opacity = Math.max(0, effect.life / effect.maxLife);
      if (effect.life <= 0) {
        this.scene.remove(effect.points);
        effect.points.geometry.dispose();
        material.dispose();
        this.effects.splice(effectIndex, 1);
      }
    }
  }

  render(snapshot: WorldSnapshot, delta: number, motion: boolean) {
    const shake = motion ? snapshot.shake : 0;
    const bob = motion ? Math.sin(snapshot.time * 7.5) * 0.018 : 0;
    this.camera.position.set(
      snapshot.playerX + (Math.random() - 0.5) * shake * 0.055,
      1.68 + bob + (Math.random() - 0.5) * shake * 0.04,
      -snapshot.playerZ,
    );
    this.camera.rotation.y = -snapshot.aimX * 0.72;
    this.camera.rotation.x = -snapshot.aimY * 0.42 + snapshot.recoil * 0.012;
    this.weapon.position.y = -0.36 - snapshot.recoil * 0.055;
    this.weapon.position.z = -0.72 + snapshot.recoil * 0.055;
    this.weapon.scale.set(snapshot.weapon === 'shotgun' ? 1.14 : 1, snapshot.weapon === 'shotgun' ? 1.08 : 1, snapshot.weapon === 'shotgun' ? 1.22 : 1);
    this.muzzleLight.intensity = snapshot.muzzle * 34;

    const rainPosition = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let index = 0; index < rainPosition.count; index += 1) {
      let y = rainPosition.getY(index) - delta * (10 + (index % 7));
      if (y < 0.05) y = 8 + seeded(index + snapshot.time) * 6;
      rainPosition.setY(index, y);
    }
    rainPosition.needsUpdate = true;
    this.rain.position.x = snapshot.playerX * 0.2;

    const activeIds = new Set<number>();
    snapshot.zombies.forEach((zombie) => {
      activeIds.add(zombie.id);
      let visual = this.zombieVisuals.get(zombie.id);
      if (!visual) {
        visual = this.makeZombie(zombie);
        this.zombieVisuals.set(zombie.id, visual);
      }
      const gait = Math.sin(snapshot.time * (zombie.type === 'runner' ? 11 : 6.2) + zombie.phase);
      visual.root.position.set(zombie.x, zombie.dead ? Math.max(-0.8, -zombie.death * 0.55) : 0, -zombie.z);
      visual.root.userData.dead = zombie.dead;
      visual.root.rotation.z = zombie.dead ? Math.min(1.42, zombie.death * 2.2) * (zombie.x > 0 ? -1 : 1) : gait * 0.025;
      visual.root.rotation.y = zombie.dead ? zombie.death * 0.35 : 0;
      visual.leftLeg.rotation.x = zombie.dead ? 0 : gait * 0.55;
      visual.rightLeg.rotation.x = zombie.dead ? 0 : -gait * 0.55;
      visual.leftArm.rotation.x = zombie.dead ? -0.2 : -0.7 - gait * 0.24;
      visual.rightArm.rotation.x = zombie.dead ? 0.2 : -0.7 + gait * 0.24;
      visual.head.rotation.z = zombie.dead ? 0 : Math.sin(snapshot.time * 2.2 + zombie.phase) * 0.08;
      visual.materials.forEach((material, index) => {
        material.transparent = zombie.dead;
        material.opacity = zombie.dead ? Math.max(0.12, 1 - zombie.death * 0.68) : 1;
        if (index < 2) {
          material.emissive.set(zombie.hit > 0 ? '#a7c08e' : '#000000');
          material.emissiveIntensity = zombie.hit > 0 ? 1.4 : 0;
        }
      });
    });
    [...this.zombieVisuals.entries()].forEach(([id, visual]) => {
      if (!activeIds.has(id)) this.removeZombie(id, visual);
    });

    snapshot.barricades.forEach((barricade) => {
      const visual = this.barricadeVisuals.get(barricade.lane);
      if (!visual) return;
      visual.planks.forEach((plank, index) => {
        plank.visible = index < barricade.planks;
        const newest = index === barricade.planks - 1;
        const settle = newest && barricade.repair > 0 ? (1 - barricade.repair) * 0.18 : 0;
        plank.position.z = settle;
      });
      visual.material.emissive.set(barricade.hit > 0 ? '#5b1e12' : barricade.repair > 0 ? '#4b5b18' : '#000000');
      visual.material.emissiveIntensity = barricade.hit > 0 ? 1.5 : barricade.repair > 0 ? 0.75 : 0;
      visual.repairLight.intensity = barricade.repair > 0 ? 8 + Math.sin(snapshot.time * 18) * 3 : 0;
    });

    this.updateEffects(delta);
    const fog = this.scene.fog as THREE.FogExp2;
    fog.density = (this.quality === 'cinematic' ? 0.024 : 0.03) + snapshot.intensity * 0.004;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.effects.splice(0).forEach((effect) => {
      effect.points.geometry.dispose();
      (effect.points.material as THREE.Material).dispose();
    });
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Points)) return;
      object.geometry?.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => material?.dispose());
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
