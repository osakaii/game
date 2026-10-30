import * as THREE from 'three';

/**
 * Коробка со скруглёнными рёбрами — дёшево. RoundedBoxGeometry делит КАЖДУЮ грань сеткой (2s+1)²:
 * 108 треугольников при одном сегменте скругления, 300 при двух. Здесь грань — один плоский
 * прямоугольник (2 треугольника), ребро — полоска из seg четырёхугольников, угол — 1 или 4 треугольника:
 * 44 треугольника при seg = 1 и 92 при seg = 2. Глаз видит то же самое: скругление дают гладкие нормали
 * (вершина ребра смотрит наружу по дуге), а не густая сетка на плоской грани.
 *
 * Геометрия без индекса (её всё равно склеивают с другими), центр — в начале координат.
 */
export function bevelBoxGeometry(w: number, h: number, d: number, radius: number, seg: 1 | 2): THREE.BufferGeometry {
  const half = [w / 2, h / 2, d / 2];
  const r = Math.min(radius, half[0]!, half[1]!, half[2]!);
  const inner = half.map((v) => v - r);
  const positions: number[] = [];
  const normals: number[] = [];

  /** Треугольник; порядок вершин выворачиваем наружу — по средней нормали. */
  const tri = (p: number[][], n: number[][]) => {
    const [a, b, c] = p as [number[], number[], number[]];
    const ux = b[0]! - a[0]!, uy = b[1]! - a[1]!, uz = b[2]! - a[2]!;
    const vx = c[0]! - a[0]!, vy = c[1]! - a[1]!, vz = c[2]! - a[2]!;
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * cx + cy * cy + cz * cz < 1e-14) return; // вырожденный (ребро нулевой длины)
    const sx = n[0]![0]! + n[1]![0]! + n[2]![0]!;
    const sy = n[0]![1]! + n[1]![1]! + n[2]![1]!;
    const sz = n[0]![2]! + n[1]![2]! + n[2]![2]!;
    const order = cx * sx + cy * sy + cz * sz < 0 ? [0, 2, 1] : [0, 1, 2];
    for (const i of order) {
      positions.push(...p[i]!);
      normals.push(...n[i]!);
    }
  };
  const quad = (p: number[][], n: number[][]) => {
    tri([p[0]!, p[1]!, p[2]!], [n[0]!, n[1]!, n[2]!]);
    tri([p[0]!, p[2]!, p[3]!], [n[0]!, n[2]!, n[3]!]);
  };
  /** Точка на поверхности: «ядро» (внутренний прямоугольный параллелепипед) + радиус по нормали. */
  const at = (core: number[], n: number[]) => core.map((v, i) => v + r * n[i]!);

  // Шесть плоских граней.
  for (let axis = 0; axis < 3; axis++) {
    for (const sign of [-1, 1]) {
      const [u, v] = [0, 1, 2].filter((i) => i !== axis) as [number, number];
      const normal = [0, 0, 0];
      normal[axis] = sign;
      const corners = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([su, sv]) => {
        const q = [0, 0, 0];
        q[axis] = sign * half[axis]!;
        q[u] = su! * inner[u]!;
        q[v] = sv! * inner[v]!;
        return q;
      });
      quad(corners, [normal, normal, normal, normal]);
    }
  }
  if (r <= 0) return finish(positions, normals);

  // Двенадцать рёбер: полоски по дуге в seg шагов.
  for (let along = 0; along < 3; along++) {
    const [a0, a1] = [0, 1, 2].filter((i) => i !== along) as [number, number];
    for (const s of [-1, 1]) {
      for (const t of [-1, 1]) {
        for (let j = 0; j < seg; j++) {
          const arc = [j / seg, (j + 1) / seg].map((k) => {
            const n = [0, 0, 0];
            n[a0] = s * Math.cos((k * Math.PI) / 2);
            n[a1] = t * Math.sin((k * Math.PI) / 2);
            return n;
          }) as [number[], number[]];
          const p: number[][] = [];
          const n: number[][] = [];
          for (const [side, k] of [
            [-1, 0],
            [1, 0],
            [1, 1],
            [-1, 1],
          ] as const) {
            const core = [0, 0, 0];
            core[along] = side * inner[along]!;
            core[a0] = s * inner[a0]!;
            core[a1] = t * inner[a1]!;
            p.push(at(core, arc[k]));
            n.push(arc[k]);
          }
          quad(p, n);
        }
      }
    }
  }

  // Восемь углов: треугольник между тремя рёбрами (при seg = 2 — четыре, по серединам дуг).
  const unit = (v: number[]) => {
    const l = Math.hypot(v[0]!, v[1]!, v[2]!) || 1;
    return v.map((x) => x / l);
  };
  for (const x of [-1, 1]) {
    for (const y of [-1, 1]) {
      for (const z of [-1, 1]) {
        const core = [x * inner[0]!, y * inner[1]!, z * inner[2]!];
        const a = [x, 0, 0];
        const b = [0, y, 0];
        const c = [0, 0, z];
        const emit = (ns: number[][]) => tri(ns.map((n) => at(core, n)), ns);
        if (seg === 1) {
          emit([a, b, c]);
        } else {
          const ab = unit([x, y, 0]);
          const bc = unit([0, y, z]);
          const ca = unit([x, 0, z]);
          emit([a, ab, ca]);
          emit([ab, b, bc]);
          emit([ca, bc, c]);
          emit([ab, bc, ca]);
        }
      }
    }
  }
  return finish(positions, normals);
}

function finish(positions: number[], normals: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return geometry;
}
