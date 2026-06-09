import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE } from './palette';
import {
  BLOCK,
  GRID,
  ROAD,
  SIDEWALK,
  blockMin,
  pointInBlock,
  roadCenter,
  type BlockInfo,
} from './CityLayout';
import { pick, randRange } from '../utils/math';
import type { CollisionWorld } from '../physics/Collision';
import type { Disposer } from '../core/Disposer';
import { paintGeometry } from './geometry';

interface Placement {
  x: number;
  z: number;
  rotY: number;
  scale: number;
}

/**
 * Street furniture and vegetation as InstancedMesh sets — lampposts, trees,
 * hydrants and benches add only ~8 draw calls for hundreds of objects.
 */
export function buildProps(
  blocks: BlockInfo[],
  rng: () => number,
  collision: CollisionWorld,
  disposer: Disposer,
): THREE.Group {
  const group = new THREE.Group();

  // ---- lamppost placements: along sidewalks, alternating road sides ----
  const lamps: Placement[] = [];
  const lampInset = ROAD / 2 - SIDEWALK / 2;
  for (let i = 0; i <= GRID; i++) {
    const c = roadCenter(i);
    for (let seg = 0; seg < GRID; seg++) {
      const mid = blockMin(seg) + BLOCK / 2;
      const side = (i + seg) % 2 === 0 ? 1 : -1;
      // Vertical road lamp (arm reaches over the road).
      lamps.push({ x: c + side * lampInset, z: mid, rotY: side > 0 ? Math.PI / 2 : -Math.PI / 2, scale: 1 });
      // Horizontal road lamp.
      lamps.push({ x: mid, z: c + side * lampInset, rotY: side > 0 ? Math.PI : 0, scale: 1 });
    }
  }
  for (const l of lamps) collision.addBox(l.x, l.z, 0.22, 0.22);

  // ---- trees: park gets a forest, sidewalks get occasional street trees ----
  const trees: Placement[] = [];
  for (const b of blocks) {
    if (b.type === 'park') {
      for (let i = 0; i < 26; i++) {
        const p = pointInBlock(rng, b, 3);
        // Keep the crossed paths clear.
        const cx = b.x0 + BLOCK / 2;
        const cz = b.z0 + BLOCK / 2;
        if (Math.abs(p.x - cx) < 2.2 || Math.abs(p.z - cz) < 2.2) continue;
        trees.push({ x: p.x, z: p.z, rotY: rng() * Math.PI * 2, scale: randRange(rng, 0.8, 1.5) });
      }
    } else if (rng() < 0.5) {
      // A couple of street trees on this block's sidewalk corners.
      const corner = pick(rng, [
        { x: b.x0 + 2, z: b.z0 + 2 },
        { x: b.x0 + BLOCK - 2, z: b.z0 + 2 },
        { x: b.x0 + 2, z: b.z0 + BLOCK - 2 },
        { x: b.x0 + BLOCK - 2, z: b.z0 + BLOCK - 2 },
      ]);
      trees.push({ x: corner.x, z: corner.z, rotY: rng() * Math.PI * 2, scale: randRange(rng, 0.7, 1.1) });
    }
  }
  for (const t of trees) collision.addBox(t.x, t.z, 0.4 * t.scale, 0.4 * t.scale);

  // ---- hydrants on random corners ----
  const hydrants: Placement[] = [];
  for (const b of blocks) {
    if (rng() < 0.3) {
      hydrants.push({ x: b.x0 + 1, z: b.z0 + 1, rotY: 0, scale: 1 });
    }
  }

  // ---- benches around the park and plaza ----
  const benches: Placement[] = [];
  for (const b of blocks) {
    if (b.type !== 'park' && b.type !== 'plaza') continue;
    const cx = b.x0 + BLOCK / 2;
    const cz = b.z0 + BLOCK / 2;
    const r = b.type === 'plaza' ? 6.5 : 9;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      benches.push({
        x: cx + Math.sin(a) * r,
        z: cz + Math.cos(a) * r,
        rotY: -a,
        scale: 1,
      });
    }
  }
  for (const bn of benches) collision.addBox(bn.x, bn.z, 0.8, 0.4);

  // ---- build instanced meshes ----
  // Lamppost: pole + arm + glowing head, merged per-part into one geometry.
  const lampGeo = mergeLampGeometry(disposer);
  group.add(instanced(lampGeo.geo, lampGeo.mat, lamps));

  const trunkGeo = disposer.geo(new THREE.CylinderGeometry(0.18, 0.26, 1.6, 6));
  trunkGeo.translate(0, 0.8, 0);
  group.add(instanced(trunkGeo, disposer.mat(new THREE.MeshLambertMaterial({ color: PALETTE.treeTrunk })), trees));

  const leafGeo = disposer.geo(new THREE.IcosahedronGeometry(1.35, 0));
  leafGeo.translate(0, 2.6, 0);
  leafGeo.scale(1, 1.25, 1);
  group.add(instanced(leafGeo, disposer.mat(new THREE.MeshLambertMaterial({ color: pick(rng, PALETTE.treeLeaves) })), trees));

  const hydrantGeo = disposer.geo(new THREE.CylinderGeometry(0.16, 0.2, 0.7, 6));
  hydrantGeo.translate(0, 0.35, 0);
  group.add(instanced(hydrantGeo, disposer.mat(new THREE.MeshLambertMaterial({ color: PALETTE.hydrant })), hydrants));

  const benchGeo = benchGeometry(disposer);
  group.add(instanced(benchGeo, disposer.mat(new THREE.MeshLambertMaterial({ vertexColors: true })), benches));

  return group;
}

function instanced(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  placements: Placement[],
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(placements.length, 1));
  const dummy = new THREE.Object3D();
  placements.forEach((p, i) => {
    dummy.position.set(p.x, 0, p.z);
    dummy.rotation.set(0, p.rotY, 0);
    dummy.scale.setScalar(p.scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.count = placements.length;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false; // instances span the whole city
  return mesh;
}

function mergeLampGeometry(disposer: Disposer): { geo: THREE.BufferGeometry; mat: THREE.Material } {
  // Vertex-colored so pole and glowing head live in one instanced mesh.
  const pole = new THREE.CylinderGeometry(0.09, 0.13, 5.6, 6);
  pole.translate(0, 2.8, 0);
  paintGeometry(pole, PALETTE.lampPole);

  const arm = new THREE.BoxGeometry(0.12, 0.12, 1.6);
  arm.translate(0, 5.5, 0.8);
  paintGeometry(arm, PALETTE.lampPole);

  const head = new THREE.BoxGeometry(0.3, 0.18, 0.7);
  head.translate(0, 5.42, 1.45);
  paintGeometry(head, PALETTE.lampHead);

  const merged = disposer.geo(mergeParts([pole, arm, head]));
  const mat = disposer.mat(new THREE.MeshLambertMaterial({ vertexColors: true }));
  return { geo: merged, mat };
}

function benchGeometry(disposer: Disposer): THREE.BufferGeometry {
  const seat = new THREE.BoxGeometry(1.6, 0.08, 0.5);
  seat.translate(0, 0.45, 0);
  paintGeometry(seat, PALETTE.bench);

  const back = new THREE.BoxGeometry(1.6, 0.45, 0.08);
  back.translate(0, 0.75, -0.24);
  paintGeometry(back, PALETTE.bench);

  const legL = new THREE.BoxGeometry(0.08, 0.45, 0.45);
  legL.translate(-0.65, 0.22, 0);
  paintGeometry(legL, PALETTE.lampPole);

  const legR = new THREE.BoxGeometry(0.08, 0.45, 0.45);
  legR.translate(0.65, 0.22, 0);
  paintGeometry(legR, PALETTE.lampPole);

  return disposer.geo(mergeParts([seat, back, legL, legR]));
}

function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  for (const p of parts) p.deleteAttribute('uv');
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('merge failed');
  for (const p of parts) p.dispose();
  return merged;
}
