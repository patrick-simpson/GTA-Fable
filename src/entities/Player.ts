import * as THREE from 'three';
import { boxGeo, flatMat } from '../core/Materials';
import { PALETTE } from '../world/palette';
import { clamp, damp, pick } from '../utils/math';

/**
 * Procedural low-poly pedestrian with hip/shoulder pivot groups so limbs
 * swing in a simple sinusoidal walk cycle scaled by movement speed.
 */
export class Player {
  readonly group = new THREE.Group();

  private leftArm: THREE.Group;
  private rightArm: THREE.Group;
  private leftLeg: THREE.Group;
  private rightLeg: THREE.Group;
  private phase = 0;
  private swing = 0;

  constructor(rng: () => number) {
    const skin = flatMat(pick(rng, PALETTE.skinTones));
    const shirt = flatMat(pick(rng, PALETTE.shirtColors));
    const pants = flatMat(pick(rng, PALETTE.pantsColors));

    // Torso + head.
    const torso = new THREE.Mesh(boxGeo(0.5, 0.62, 0.28), shirt);
    torso.position.y = 1.12;
    this.group.add(torso);

    const head = new THREE.Mesh(boxGeo(0.3, 0.32, 0.28), skin);
    head.position.y = 1.62;
    this.group.add(head);

    const hair = new THREE.Mesh(boxGeo(0.32, 0.1, 0.3), pants);
    hair.position.y = 1.81;
    this.group.add(hair);

    // Limbs hang from pivot groups placed at the joint.
    this.leftArm = limb(0.14, 0.6, 0.14, shirt, skin, -0.34, 1.4);
    this.rightArm = limb(0.14, 0.6, 0.14, shirt, skin, 0.34, 1.4);
    this.leftLeg = limb(0.17, 0.8, 0.2, pants, pants, -0.14, 0.82);
    this.rightLeg = limb(0.17, 0.8, 0.2, pants, pants, 0.14, 0.82);
    this.group.add(this.leftArm, this.rightArm, this.leftLeg, this.rightLeg);
  }

  /** Drive the walk cycle from planar speed (m/s). */
  update(dt: number, speed: number): void {
    this.phase += dt * (2.2 + speed * 1.9);
    const targetSwing = clamp(speed / 4.5, 0, 1) * 0.75;
    this.swing = damp(this.swing, targetSwing, 10, dt);

    const s = Math.sin(this.phase) * this.swing;
    this.leftLeg.rotation.x = s;
    this.rightLeg.rotation.x = -s;
    this.leftArm.rotation.x = -s * 0.8;
    this.rightArm.rotation.x = s * 0.8;
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
  }
}

function limb(
  w: number,
  len: number,
  d: number,
  upperMat: THREE.Material,
  lowerMat: THREE.Material,
  x: number,
  jointY: number,
): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.set(x, jointY, 0);

  const upper = new THREE.Mesh(boxGeo(w, len * 0.55, d), upperMat);
  upper.position.y = -len * 0.275;
  pivot.add(upper);

  const lower = new THREE.Mesh(boxGeo(w * 0.9, len * 0.45, d * 0.9), lowerMat);
  lower.position.y = -len * 0.775;
  pivot.add(lower);

  return pivot;
}
