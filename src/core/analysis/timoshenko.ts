/**
 * Timoshenko transverse-displacement shape functions at xi = x / L.
 * Returns [N1, N2, N3, N4] for [v_i, theta_i, v_j, theta_j].
 */
export function timoshenkoShapeFunctions(
  xi: number,
  length: number,
  phi: number
): [number, number, number, number] {
  const xi2 = xi * xi;
  const xi3 = xi2 * xi;
  const denominator = 1 + phi;
  return [
    (1 - 3 * xi2 + 2 * xi3 + phi * (1 - xi)) / denominator,
    length * (xi - 2 * xi2 + xi3 + (phi / 2) * (xi - xi2)) / denominator,
    (3 * xi2 - 2 * xi3 + phi * xi) / denominator,
    length * (-xi2 + xi3 + (phi / 2) * (xi2 - xi)) / denominator,
  ];
}
