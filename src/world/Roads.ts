import * as THREE from 'three';
import { GeometryBatch } from './geometry';
import { PALETTE } from './palette';
import {
  BLOCK,
  CITY_SIZE,
  DRIVE_HALF,
  GRID,
  HALF,
  ROAD,
  SIDEWALK,
  blockMin,
  roadCenter,
  type BlockInfo,
} from './CityLayout';
import type { Disposer } from '../core/Disposer';

/**
 * Ground, asphalt grid, sidewalks, park/plaza surfaces — all merged into a
 * single vertex-colored mesh — plus instanced lane dashes and crosswalk
 * stripes (two extra draw calls total).
 */
export function buildRoads(blocks: BlockInfo[], disposer: Disposer): THREE.Group {
  const group = new THREE.Group();
  const batch = new GeometryBatch();

  // Outskirts ground far past the city edge, slightly below everything.
  batch.plane(CITY_SIZE * 4, CITY_SIZE * 4, 0, -0.05, 0, PALETTE.groundOutskirts);
  // City base = one big asphalt slab; sidewalks and block surfaces sit on top.
  batch.plane(CITY_SIZE, CITY_SIZE, 0, 0, 0, PALETTE.asphalt);

  for (const b of blocks) {
    const cx = b.x0 + BLOCK / 2;
    const cz = b.z0 + BLOCK / 2;
    // Sidewalk plate extends past the block into the road strip.
    const plate = BLOCK + SIDEWALK * 2;
    batch.plane(plate, plate, cx, 0.04, cz, PALETTE.sidewalk);

    if (b.type === 'park') {
      batch.plane(BLOCK - 2, BLOCK - 2, cx, 0.08, cz, PALETTE.grass);
      // Crossed gravel paths.
      batch.plane(BLOCK - 2, 2.4, cx, 0.1, cz, PALETTE.parkPath);
      batch.plane(2.4, BLOCK - 2, cx, 0.1, cz, PALETTE.parkPath);
    } else if (b.type === 'plaza') {
      batch.plane(BLOCK - 2, BLOCK - 2, cx, 0.08, cz, PALETTE.plaza);
      // Fountain: two stacked basins + water disc.
      batch.cylinder(3.4, 3.8, 0.9, 12, cx, 0.45, cz, PALETTE.fountain);
      batch.cylinder(2.6, 2.6, 0.25, 12, cx, 1.0, cz, PALETTE.fountainWater);
      batch.cylinder(0.5, 0.7, 2.2, 8, cx, 1.4, cz, PALETTE.fountain);
    }
  }

  const groundGeo = disposer.geo(batch.build());
  const groundMat = disposer.mat(new THREE.MeshLambertMaterial({ vertexColors: true }));
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.matrixAutoUpdate = false;
  group.add(ground);

  group.add(buildLaneDashes(disposer));
  group.add(buildCrosswalks(disposer));
  return group;
}

function buildLaneDashes(disposer: Disposer): THREE.InstancedMesh {
  const positions: { x: number; z: number; rotY: number }[] = [];
  const dashLen = 2.6;
  const gap = 3.4;
  const step = dashLen + gap;

  for (let i = 0; i <= GRID; i++) {
    const c = roadCenter(i);
    for (let seg = 0; seg < GRID; seg++) {
      const a0 = blockMin(seg) + 1.5;
      const a1 = a0 + BLOCK - 3;
      for (let a = a0; a + dashLen <= a1; a += step) {
        positions.push({ x: c, z: a + dashLen / 2, rotY: 0 }); // vertical road
        positions.push({ x: a + dashLen / 2, z: c, rotY: Math.PI / 2 }); // horizontal road
      }
    }
  }

  const geo = disposer.geo(new THREE.PlaneGeometry(0.3, dashLen));
  geo.rotateX(-Math.PI / 2);
  const mat = disposer.mat(new THREE.MeshBasicMaterial({ color: PALETTE.lanePaint }));
  const mesh = new THREE.InstancedMesh(geo, mat, positions.length);
  const dummy = new THREE.Object3D();
  positions.forEach((p, idx) => {
    dummy.position.set(p.x, 0.02, p.z);
    dummy.rotation.set(0, p.rotY, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(idx, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function buildCrosswalks(disposer: Disposer): THREE.InstancedMesh {
  const stripes: { x: number; z: number; rotY: number }[] = [];
  const stripeCount = 5;
  const span = DRIVE_HALF * 2 - 1;
  const inset = ROAD / 2 + 0.9; // just outside the intersection square

  for (let i = 0; i <= GRID; i++) {
    for (let j = 0; j <= GRID; j++) {
      const ix = roadCenter(i);
      const iz = roadCenter(j);
      if (Math.abs(ix) > HALF || Math.abs(iz) > HALF) continue;
      for (let s = 0; s < stripeCount; s++) {
        const off = (s - (stripeCount - 1) / 2) * (span / stripeCount);
        // North / south crossings (stripes run east-west across vertical road).
        stripes.push({ x: ix + off, z: iz - inset, rotY: 0 });
        stripes.push({ x: ix + off, z: iz + inset, rotY: 0 });
        // East / west crossings.
        stripes.push({ x: ix - inset, z: iz + off, rotY: Math.PI / 2 });
        stripes.push({ x: ix + inset, z: iz + off, rotY: Math.PI / 2 });
      }
    }
  }

  const geo = disposer.geo(new THREE.PlaneGeometry(0.55, 1.7));
  geo.rotateX(-Math.PI / 2);
  const mat = disposer.mat(new THREE.MeshBasicMaterial({ color: PALETTE.crosswalk }));
  const mesh = new THREE.InstancedMesh(geo, mat, stripes.length);
  const dummy = new THREE.Object3D();
  stripes.forEach((p, idx) => {
    dummy.position.set(p.x, 0.025, p.z);
    dummy.rotation.set(0, p.rotY, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(idx, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}
