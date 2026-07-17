import * as THREE from 'three';
import type { ProjectModel } from '../core/model/types';

export interface ScreenPoint {
  x: number;
  y: number;
}

export function projectToScreen(
  worldPosition: THREE.Vector3,
  camera: THREE.Camera,
  width: number,
  height: number,
  target = new THREE.Vector3(),
): ScreenPoint | null {
  target.copy(worldPosition).project(camera);
  if (target.z < -1 || target.z > 1) return null;
  return {
    x: (target.x * 0.5 + 0.5) * width,
    y: (-target.y * 0.5 + 0.5) * height,
  };
}

export function pointToSegmentDistSq(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const lengthSquared = abx * abx + aby * aby;
  if (lengthSquared <= 1e-8) return (px - ax) ** 2 + (py - ay) ** 2;
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lengthSquared));
  return (px - ax - t * abx) ** 2 + (py - ay - t * aby) ** 2;
}

export function pickNode(
  model: ProjectModel,
  camera: THREE.Camera,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number,
): { nodeId: string; distSq: number } | null {
  const projected = new THREE.Vector3();
  const world = new THREE.Vector3();
  const radiusSquared = radius * radius;
  let best: { nodeId: string; distSq: number } | null = null;

  for (const node of model.nodes) {
    world.set(node.x, node.y, node.z);
    const screen = projectToScreen(world, camera, width, height, projected);
    if (!screen) continue;
    const distanceSquared = (screen.x - x) ** 2 + (screen.y - y) ** 2;
    if (distanceSquared > radiusSquared) continue;
    if (!best || distanceSquared < best.distSq) best = { nodeId: node.id, distSq: distanceSquared };
  }
  return best;
}

export function pickMember(
  model: ProjectModel,
  camera: THREE.Camera,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number,
): { memberId: string; distSq: number } | null {
  const nodeMap = new Map(model.nodes.map((node) => [node.id, node]));
  const projected = new THREE.Vector3();
  const world = new THREE.Vector3();
  const radiusSquared = radius * radius;
  let best: { memberId: string; distSq: number } | null = null;

  for (const member of model.members) {
    const nodeI = nodeMap.get(member.ni);
    const nodeJ = nodeMap.get(member.nj);
    if (!nodeI || !nodeJ) continue;
    world.set(nodeI.x, nodeI.y, nodeI.z);
    const start = projectToScreen(world, camera, width, height, projected);
    world.set(nodeJ.x, nodeJ.y, nodeJ.z);
    const end = projectToScreen(world, camera, width, height, projected);
    if (!start || !end) continue;
    const distanceSquared = pointToSegmentDistSq(x, y, start.x, start.y, end.x, end.y);
    if (distanceSquared > radiusSquared) continue;
    if (!best || distanceSquared < best.distSq) best = { memberId: member.id, distSq: distanceSquared };
  }
  return best;
}

export function hasOpenModalDialog(): boolean {
  return document.querySelector('[role="dialog"][aria-modal="true"]') !== null;
}
