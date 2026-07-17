export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface MemberLocalAxes {
  localX: Vector3;
  localY: Vector3;
  localZ: Vector3;
  length: number;
  /** Direction-cosine matrix with local X/Y/Z axes as row vectors. */
  lambda: Float64Array;
}

/** Switch the reference vector before it becomes nearly parallel to local X. */
export const LOCAL_AXIS_VERTICAL_THRESHOLD = 0.95;

function normalize(vector: Vector3): Vector3 | null {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  if (!Number.isFinite(length) || length <= 0) return null;
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
}

function cross(a: Vector3, b: Vector3): Vector3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function rotateTransverseAxes(
  localY: Vector3,
  localZ: Vector3,
  codeAngle: number
): { localY: Vector3; localZ: Vector3 } {
  if (codeAngle === 0) return { localY, localZ };

  const theta = codeAngle * Math.PI / 180;
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);
  return {
    localY: {
      x: localY.x * cosTheta + localZ.x * sinTheta,
      y: localY.y * cosTheta + localZ.y * sinTheta,
      z: localY.z * cosTheta + localZ.z * sinTheta,
    },
    localZ: {
      x: -localY.x * sinTheta + localZ.x * cosTheta,
      y: -localY.y * sinTheta + localZ.y * cosTheta,
      z: -localY.z * sinTheta + localZ.z * cosTheta,
    },
  };
}

/**
 * Compute the right-handed local axes and direction-cosine matrix for a member.
 * Returns null for zero-length/non-finite geometry or a non-finite code angle.
 */
export function computeMemberLocalAxes(
  nodeI: Vector3,
  nodeJ: Vector3,
  codeAngle: number
): MemberLocalAxes | null {
  if (!Number.isFinite(codeAngle)) return null;

  const delta = {
    x: nodeJ.x - nodeI.x,
    y: nodeJ.y - nodeI.y,
    z: nodeJ.z - nodeI.z,
  };
  const length = Math.hypot(delta.x, delta.y, delta.z);
  const localX = normalize(delta);
  if (!localX || !Number.isFinite(length)) return null;

  const reference = Math.abs(localX.z) > LOCAL_AXIS_VERTICAL_THRESHOLD
    ? { x: 1, y: 0, z: 0 }
    : { x: 0, y: 0, z: 1 };
  const localYBase = normalize(cross(reference, localX));
  if (!localYBase) return null;
  const localZBase = normalize(cross(localX, localYBase));
  if (!localZBase) return null;

  const { localY, localZ } = rotateTransverseAxes(localYBase, localZBase, codeAngle);
  const lambda = new Float64Array([
    localX.x, localX.y, localX.z,
    localY.x, localY.y, localY.z,
    localZ.x, localZ.y, localZ.z,
  ]);
  return { localX, localY, localZ, length, lambda };
}
