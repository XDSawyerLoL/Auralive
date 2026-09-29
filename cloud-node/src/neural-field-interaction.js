export function installNeuralInteraction(canvas, state, onFocus) {
  const locate = (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / Math.max(1, rect.width);
    const y = (event.clientY - rect.top) / Math.max(1, rect.height);
    let best = null;
    let bestDistance = Infinity;
    for (const node of state.field?.nodes || []) {
      const dx = node.x - x;
      const dy = node.y - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const hit = node.id === 'aura' ? 0.07 : node.role === 'product' ? 0.025 : 0.035;
      if (d <= hit && d < bestDistance) {
        best = node;
        bestDistance = d;
      }
    }
    return { node: best, x, y };
  };

  canvas.addEventListener('mousemove', (event) => {
    const hit = locate(event);
    state.hovered = hit.node?.id || '';
    canvas.style.cursor = hit.node ? 'crosshair' : 'default';
    if (typeof onFocus === 'function') onFocus(hit.node || null, hit.x, hit.y);
  });
  canvas.addEventListener('mouseleave', () => {
    state.hovered = '';
    if (typeof onFocus === 'function') onFocus(null, 0, 0);
  });
}

export const NEURAL_FIELD_INTERACTION_SCRIPT = installNeuralInteraction.toString();
