const SUFFIX = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp"];

export function fmt(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "0";
  const sign = n < 0 ? "-" : "";
  let v = Math.abs(n);
  if (v < 10) return sign + v.toFixed(1);
  if (v < 1000) return sign + Math.floor(v).toString();
  let i = 0;
  while (v >= 1000 && i < SUFFIX.length - 1) {
    v /= 1000;
    i += 1;
  }
  const d = v >= 100 ? 0 : v >= 10 ? 1 : digits;
  const s = v.toFixed(d).replace(/\.0+$/, "");
  return sign + s + SUFFIX[i];
}

export function fmtRate(n: number): string {
  return fmt(n) + "/s";
}

export function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
