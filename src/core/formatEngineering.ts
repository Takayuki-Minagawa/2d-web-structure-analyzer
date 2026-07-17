export interface EngineeringFormatOptions {
  significantDigits?: number;
  zeroTolerance?: number;
  fixedDecimals?: number;
}

/** Consistent compact formatting for engineering values across UI and reports. */
export function formatEngineering(
  value: number,
  options: EngineeringFormatOptions = {},
): string {
  if (!Number.isFinite(value)) return String(value);
  const digits = options.significantDigits ?? 4;
  const zeroTolerance = options.zeroTolerance ?? 1e-12;
  if (Math.abs(value) <= zeroTolerance) return '0';
  const absolute = Math.abs(value);
  if (absolute >= 1e5 || absolute < 1e-3) return value.toExponential(options.fixedDecimals ?? Math.max(1, digits - 1));
  if (options.fixedDecimals !== undefined) return value.toFixed(options.fixedDecimals);
  const integerDigits = Math.max(1, Math.floor(Math.log10(absolute)) + 1);
  const decimals = Math.max(0, digits - integerDigits);
  return value.toFixed(decimals).replace(/\.?0+$/, '');
}
