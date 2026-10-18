import type { PlanetDef } from "./types";
import { fbm, lerpC, rgb } from "./noise";

const cache = new Map<string, HTMLCanvasElement>();

function sphereNormal(u: number, v: number): [number, number, number] | null {
  const x = u * 2 - 1;
  const y = v * 2 - 1;
  const r2 = x * x + y * y;
  if (r2 > 1) return null;
  const z = Math.sqrt(1 - r2);
  return [x, y, z];
}

export function planetTexture(def: PlanetDef, px = 160): HTMLCanvasElement {
  const key = `${def.id}:${def.seed}:${px}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = px;
  c.height = px;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  const img = ctx.createImageData(px, px);
  const d = img.data;
  const pal = def.palette;
  const light = [-0.45, -0.35, 0.82];
  const seed = def.seed * 0.17;

  for (let j = 0; j < px; j++) {
    for (let i = 0; i < px; i++) {
      const nrm = sphereNormal((i + 0.5) / px, (j + 0.5) / px);
      const o = (j * px + i) * 4;
      if (!nrm) {
        d[o + 3] = 0;
        continue;
      }
      const [x, y, z] = nrm;
      const ndl = Math.max(0, x * light[0] + y * light[1] + z * light[2]);
      const wrap = 0.18 + ndl * 0.92;
      const rim = Math.pow(1 - Math.max(0, z), 1.8);
      let col: [number, number, number];

      if (def.gas) {
        const bands = Math.sin(y * 9 + fbm(x + seed, y * 3, z + seed, 3) * 2.2);
        const t = 0.5 + 0.5 * bands;
        col = lerpC(pal.ocean, pal.land, t);
        const storm = fbm(x * 2 + seed, y * 4, z * 2, 4);
        if (storm > 0.72) col = lerpC(col, pal.land2, (storm - 0.72) * 3);
      } else {
        const n = fbm(x * 2.2 + seed, y * 2.2, z * 2.2 + seed, 5);
        const ridge = Math.abs(n - 0.5) * 2;
        if (n > pal.threshold) {
          col = lerpC(pal.land, pal.land2, ridge);
        } else {
          col = pal.ocean;
          if (n > pal.threshold - 0.04) col = lerpC(pal.ocean, pal.land, (n - (pal.threshold - 0.04)) / 0.04);
        }
        if (pal.lava && n > 0.62 && ridge > 0.55) {
          col = lerpC(col, pal.lava, (ridge - 0.55) * 2);
        }
        const ice = Math.abs(y);
        if (ice > 0.78) col = lerpC(col, pal.ice, (ice - 0.78) / 0.22);
      }

      col = [col[0] * wrap, col[1] * wrap, col[2] * wrap];
      const spec = Math.pow(ndl, 18) * (def.gas ? 18 : 10);
      col = [col[0] + spec + pal.atmo[0] * rim * 0.25, col[1] + spec + pal.atmo[1] * rim * 0.25, col[2] + spec + pal.atmo[2] * rim * 0.28];

      d[o] = Math.max(0, Math.min(255, col[0]));
      d[o + 1] = Math.max(0, Math.min(255, col[1]));
      d[o + 2] = Math.max(0, Math.min(255, col[2]));
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  if (def.clouds) {
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    const clouds = ctx.getImageData(0, 0, px, px);
    const cd = clouds.data;
    for (let j = 0; j < px; j++) {
      for (let i = 0; i < px; i++) {
        const nrm = sphereNormal((i + 0.5) / px, (j + 0.5) / px);
        if (!nrm) continue;
        const [x, y, z] = nrm;
        const n = fbm(x * 3.4 + seed + 9, y * 2.2, z * 3.4, 4);
        if (n > 0.58) {
          const a = Math.min(0.55, (n - 0.58) * 2.2);
          const o = (j * px + i) * 4;
          cd[o] = cd[o] * (1 - a) + pal.cloud[0] * a;
          cd[o + 1] = cd[o + 1] * (1 - a) + pal.cloud[1] * a;
          cd[o + 2] = cd[o + 2] * (1 - a) + pal.cloud[2] * a;
        }
      }
    }
    ctx.putImageData(clouds, 0, 0);
    ctx.restore();
  }

  cache.set(key, c);
  return c;
}

export function drawAtmosphere(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  atmo: [number, number, number],
  owned: boolean,
  tint?: [number, number, number],
) {
  const col = tint ?? atmo;
  const g = ctx.createRadialGradient(x, y, r * 0.86, x, y, r * 1.38);
  g.addColorStop(0, rgb(col, 0));
  g.addColorStop(0.55, rgb(col, owned ? 0.28 : 0.12));
  g.addColorStop(1, rgb(col, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.38, 0, Math.PI * 2);
  ctx.fill();
}

export function drawRings(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  t: number,
  front: boolean,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.35);
  ctx.scale(1, 0.28);
  ctx.strokeStyle = front ? "rgba(200,210,220,0.28)" : "rgba(200,210,220,0.12)";
  ctx.lineWidth = r * 0.18;
  ctx.beginPath();
  if (front) ctx.arc(0, 0, r * 1.55, 0.05, Math.PI - 0.05);
  else ctx.arc(0, 0, r * 1.55, Math.PI + 0.05, Math.PI * 2 - 0.05);
  ctx.stroke();
  ctx.strokeStyle = front ? "rgba(160,175,190,0.18)" : "rgba(160,175,190,0.08)";
  ctx.lineWidth = r * 0.08;
  ctx.beginPath();
  if (front) ctx.arc(0, 0, r * 1.78, 0.08, Math.PI - 0.08);
  else ctx.arc(0, 0, r * 1.78, Math.PI + 0.08, Math.PI * 2 - 0.08);
  ctx.stroke();
  void t;
  ctx.restore();
}
