export function sceneFeatures(data, proj) {
  return data.elements.filter(e => e.geometry?.length > 2).map(e => {
    const points = e.geometry.map(p => proj.toLocal([p.lon, p.lat]));
    const center = points.reduce((a, p) => ({ x: a.x + p.x / points.length, y: a.y + p.y / points.length }), { x: 0, y: 0 });
    const height = Number.parseFloat(e.tags?.height);
    return { id: e.id, points, center, tags: e.tags || {}, height: Number.isFinite(height) ? height : null };
  });
}

export function drawSceneMap(ctx, features, convert, scale) {
  for (const f of features) {
    ctx.beginPath(); f.points.forEach((p, i) => { const q = convert(p); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }); ctx.closePath();
    const parking = f.tags.amenity === 'parking';
    ctx.fillStyle = parking ? '#638d724f' : '#89968b66'; ctx.strokeStyle = parking ? '#b6e6b888' : '#8c9e9b66'; ctx.lineWidth = 1; ctx.fill(); ctx.stroke();
    if (parking && scale > .06) { const q = convert(f.center); ctx.font = '10px sans-serif'; ctx.fillStyle = '#c2efcf'; ctx.fillText('P', q.x, q.y); }
  }
}

export function drawScenePerspective(ctx, features, transform, screen, focal) {
  const shapes = [];
  function clip(points) {
    const output = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      if (a.z >= 1) output.push(a);
      if ((a.z < 1) !== (b.z < 1)) { const t = (1 - a.z) / (b.z - a.z); output.push({ s: a.s + (b.s - a.s) * t, z: 1, elevation: a.elevation + (b.elevation - a.elevation) * t }); }
    }
    return output;
  }
  for (const f of features) {
    const polygon = f.points.map(p => ({ ...transform(p), elevation: 0 }));
    const center = transform(f.center);
    if (center.z < -80 || center.z > 700) continue;
    const parking = f.tags.amenity === 'parking';
    // Unknown building heights stay as footprints. Do not invent floors,
    // facades, parking lines or bay dimensions from a schematic map.
    const base = clip(polygon);
    shapes.push({ points: base, color: parking ? '#748878' : '#8b948a', stroke: parking ? '#bed5ae' : '#b4beb5', depth: center.z });
    if (f.height) {
      for (let i = 1; i < polygon.length; i++) {
        const a = polygon[i - 1], b = polygon[i];
        shapes.push({ points: clip([a, b, { ...b, elevation: f.height }, { ...a, elevation: f.height }]), color: i % 2 ? '#b3b6ac' : '#969e99', stroke: '#d4d8cf', depth: (a.z + b.z) / 2 });
      }
      shapes.push({ points: clip(polygon.map(p => ({ ...p, elevation: f.height }))), color: '#b8bdb3', stroke: '#d4d8cf', depth: center.z });
    }
  }
  shapes.sort((a, b) => b.depth - a.depth);
  for (const shape of shapes) {
    if (shape.points.length < 3) continue;
    ctx.beginPath(); shape.points.forEach((p, i) => { const q = screen(p); q.y -= focal * (p.elevation || 0) / p.z; i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }); ctx.closePath(); ctx.fillStyle = shape.color; ctx.fill(); ctx.strokeStyle = shape.stroke; ctx.lineWidth = 1; ctx.stroke();
  }
}
