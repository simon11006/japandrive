// Every render mesh and vehicle samples the same triangular ground surface.
// It matches the 25 m terrain lattice exactly, including triangle diagonals.
export function groundSurface(elevation, cell = 25) {
  const samples = new Map();
  const at = (x, y) => {
    const key = x + ":" + y;
    if (!samples.has(key)) samples.set(key, Number(elevation({ x: x * cell, y: y * cell })) || 0);
    return samples.get(key);
  };
  const height = (p) => {
    const x = Math.floor(p.x / cell),
      y = Math.floor(p.y / cell),
      u = p.x / cell - x,
      v = p.y / cell - y,
      a = at(x, y),
      b = at(x + 1, y),
      c = at(x + 1, y + 1),
      d = at(x, y + 1);
    return u >= v ? a * (1 - u) + b * (u - v) + c * v : a * (1 - v) + c * u + d * (v - u);
  };
  function clip(subject, triangle) {
    let poly = subject;
    const cross = (a, b, p) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    const orient = Math.sign(cross(triangle[0], triangle[1], triangle[2])) || 1;
    for (let i = 0; i < 3 && poly.length; i++) {
      const a = triangle[i],
        b = triangle[(i + 1) % 3],
        out = [];
      for (let j = 0; j < poly.length; j++) {
        const p = poly[j],
          q = poly[(j + 1) % poly.length],
          cp = cross(a, b, p) * orient,
          cq = cross(a, b, q) * orient,
          insideP = cp >= -1e-8,
          insideQ = cq >= -1e-8;
        if (insideP) out.push(p);
        if (insideP !== insideQ) {
          const t = cp / (cp - cq);
          out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
        }
      }
      poly = out;
    }
    return poly;
  }
  const clipRow = (poly, edge, above) => {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i],
        q = poly[(i + 1) % poly.length],
        a = above ? p.y >= edge : p.y <= edge,
        b = above ? q.y >= edge : q.y <= edge;
      if (a) out.push(p);
      if (a !== b) {
        const t = (edge - p.y) / (q.y - p.y);
        out.push({ x: p.x + (q.x - p.x) * t, y: edge });
      }
    }
    return out;
  };
  const drape = (polygon, lift = 0) => {
    const out = [],
      ys = polygon.map((p) => p.y / cell);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.floor(Math.max(...ys)); y++) {
      const band = clipRow(clipRow(polygon, y * cell, true), (y + 1) * cell, false);
      if (band.length < 3) continue;
      const xs = band.map((p) => p.x / cell);
      for (let x = Math.floor(Math.min(...xs)); x <= Math.floor(Math.max(...xs)); x++) {
        const a = { x: x * cell, y: y * cell },
          b = { x: (x + 1) * cell, y: y * cell },
          c = { x: (x + 1) * cell, y: (y + 1) * cell },
          d = { x: x * cell, y: (y + 1) * cell };
        for (const triangle of [
          [a, b, c],
          [a, c, d],
        ]) {
          const poly = clip(band, triangle);
          for (let i = 1; i < poly.length - 1; i++) {
            const area =
              (poly[i].x - poly[0].x) * (poly[i + 1].y - poly[0].y) -
              (poly[i].y - poly[0].y) * (poly[i + 1].x - poly[0].x);
            if (Math.abs(area) < 1e-8) continue;
            for (const p of [poly[0], poly[i + 1], poly[i]])
              out.push({ x: p.x, y: p.y, height: height(p) + lift });
          }
        }
      }
    }
    return out;
  };
  return { height, drape, cell, clear: () => samples.clear() };
}
export function ribbonSections(points, width, offset = 0) {
  const edges = points.slice(1).map((b, i) => {
    const a = points[i],
      d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.y - a.y) / d, y: -(b.x - a.x) / d };
  });
  const sides = points.map((p, i) => {
    const a = edges[Math.max(0, i - 1)],
      b = edges[Math.min(edges.length - 1, i)];
    if (!a || !b) return [p, p];
    let nx = a.x + b.x,
      ny = a.y + b.y,
      len = Math.hypot(nx, ny);
    if (len < 0.05) {
      nx = b.x;
      ny = b.y;
      len = 1;
    }
    nx /= len;
    ny /= len;
    const miter = Math.min(2, 1 / Math.max(0.5, nx * b.x + ny * b.y));
    return [-width / 2 + offset, width / 2 + offset].map((side) => ({
      x: p.x + nx * side * miter,
      y: p.y + ny * side * miter,
    }));
  });
  return points.slice(1).map((_, i) => [sides[i][0], sides[i][1], sides[i + 1][1], sides[i + 1][0]]);
}
export function surfacePose(height, position, heading, length = 3, width = 1.6) {
  const f = { x: Math.sin(heading), y: -Math.cos(heading) },
    r = { x: Math.cos(heading), y: Math.sin(heading) };
  const sample = (along, side) =>
    height({ x: position.x + f.x * along + r.x * side, y: position.y + f.y * along + r.y * side });
  const fl = sample(length / 2, -width / 2),
    fr = sample(length / 2, width / 2),
    bl = sample(-length / 2, -width / 2),
    br = sample(-length / 2, width / 2);
  return {
    height: (fl + fr + bl + br) / 4,
    pitch: Math.atan2((fl + fr - bl - br) / 2, length),
    roll: Math.atan2((fr + br - fl - bl) / 2, width),
  };
}
