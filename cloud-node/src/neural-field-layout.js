export function neuralHash(value) {
  let h = 2166136261;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

export function initializeNeuralField(data, previous = null) {
  const previousById = Object.fromEntries((previous?.nodes || []).map((node) => [node.id, node]));
  const nodes = (data?.nodes || []).map((source, index) => {
    const prior = previousById[source.id];
    if (source.id === 'aura') {
      return { ...source, x: 0.5, y: 0.5, vx: 0, vy: 0, fixed: true };
    }
    if (prior) {
      return { ...source, x: prior.x, y: prior.y, vx: prior.vx || 0, vy: prior.vy || 0, fixed: false };
    }
    const seed = neuralHash(source.id);
    const seedY = neuralHash(source.id + ':y');
    let radius = 0.17 + seed * 0.095;
    if (source.role === 'product') radius = 0.34 + seed * 0.045;
    else if (source.role === 'fabric-capability') radius = 0.275 + seed * 0.038;
    const angle = seed * Math.PI * 2 + index * 0.31;
    return {
      ...source,
      x: 0.5 + Math.cos(angle) * radius + (seedY - 0.5) * 0.025,
      y: 0.5 + Math.sin(angle) * radius * 0.72 + (seed - 0.5) * 0.018,
      vx: 0,
      vy: 0,
      fixed: false,
    };
  });
  const byId = Object.fromEntries(nodes.map((node) => [node.id, node]));
  const links = (data?.links || [])
    .map((edge) => ({ ...edge, a: byId[edge.source], b: byId[edge.target] }))
    .filter((edge) => edge.a && edge.b);
  return { nodes, links, byId, raw: data };
}

export function stepNeuralField(field) {
  const nodes = field?.nodes || [];
  const links = field?.links || [];

  for (let i = 0; i < nodes.length; i += 1) {
    const a = nodes[i];
    if (a.fixed) continue;
    for (let j = i + 1; j < nodes.length; j += 1) {
      const b = nodes[j];
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 0.00008) {
        dx += (neuralHash(a.id + b.id) - 0.5) * 0.015;
        dy += (neuralHash(b.id + a.id) - 0.5) * 0.015;
        d2 = dx * dx + dy * dy;
      }
      const d = Math.sqrt(d2) || 0.001;
      const min = (a.role === 'product' || b.role === 'product') ? 0.075 : 0.058;
      const force = d < min ? 0.0055 : Math.min(0.0010, 0.00012 / d2);
      const fx = (dx / d) * force;
      const fy = (dy / d) * force;
      if (!a.fixed) { a.vx += fx; a.vy += fy; }
      if (!b.fixed) { b.vx -= fx; b.vy -= fy; }
    }
  }

  for (const edge of links) {
    const { a, b } = edge;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 0.001;
    const weight = Math.max(0.1, Math.min(1, Number(edge.weight) || 0.5));
    let target = 0.13;
    if (a.role === 'product' || b.role === 'product') target = 0.20;
    if (a.role === 'fabric-capability' || b.role === 'fabric-capability') target = 0.17;
    if (a.id === 'aura' || b.id === 'aura') target = 0.15;
    const force = (d - target) * (0.0028 + 0.0052 * weight);
    const fx = (dx / d) * force;
    const fy = (dy / d) * force;
    if (!a.fixed) { a.vx += fx; a.vy += fy; }
    if (!b.fixed) { b.vx -= fx; b.vy -= fy; }
  }

  for (const node of nodes) {
    if (node.fixed) {
      node.x = 0.5;
      node.y = 0.5;
      node.vx = 0;
      node.vy = 0;
      continue;
    }
    const dx = node.x - 0.5;
    const dy = node.y - 0.5;
    const d = Math.sqrt(dx * dx + dy * dy) || 0.001;
    let targetRadius = 0.19;
    if (node.role === 'product') targetRadius = 0.35;
    else if (node.role === 'fabric-capability') targetRadius = 0.285;
    else if (node.cluster === 'infrastructure') targetRadius = 0.255;
    const radial = (targetRadius - d) * 0.0019;
    node.vx += (dx / d) * -radial;
    node.vy += (dy / d) * -radial * 0.78;
    node.vx += (0.5 - node.x) * 0.00018;
    node.vy += (0.5 - node.y) * 0.00018;
    node.vx *= 0.84;
    node.vy *= 0.84;
    node.x += node.vx;
    node.y += node.vy;
    node.x = Math.max(0.05, Math.min(0.95, node.x));
    node.y = Math.max(0.07, Math.min(0.93, node.y));
  }
  return field;
}

export function settleNeuralField(field, iterations = 96) {
  for (let i = 0; i < iterations; i += 1) stepNeuralField(field);
  return field;
}

export const NEURAL_FIELD_LAYOUT_SCRIPT = [
  neuralHash.toString(),
  initializeNeuralField.toString(),
  stepNeuralField.toString(),
  settleNeuralField.toString(),
].join('\n');
