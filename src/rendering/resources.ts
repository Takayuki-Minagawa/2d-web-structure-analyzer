import * as THREE from 'three';

export function disposeObject(object: THREE.Object3D): void {
  while (object.children.length > 0) {
    const child = object.children[0];
    if (!child) break;
    object.remove(child);
    disposeObject(child);
  }

  if (
    object instanceof THREE.Mesh
    || object instanceof THREE.Points
    || object instanceof THREE.LineSegments
    || object instanceof THREE.Line
  ) {
    object.geometry.dispose();
    const material = object.material;
    if (Array.isArray(material)) material.forEach((item) => item.dispose());
    else material.dispose();
  }
}

export function clearGroup(group: THREE.Group): void {
  while (group.children.length > 0) {
    const child = group.children[0];
    if (!child) break;
    group.remove(child);
    disposeObject(child);
  }
}
