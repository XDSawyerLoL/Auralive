export class WebLlmAdapter {
  constructor(webllm, {
    modelId = '',
    onProgress = null,
  } = {}) {
    if (!webllm?.CreateMLCEngine) {
      throw new Error('Module WebLLM invalide ou incomplet');
    }
    this.webllm = webllm;
    this.modelId = String(modelId || '');
    this.engine = null;
    this.onProgress = typeof onProgress === 'function' ? onProgress : null;
  }

  availableModels() {
    const rows = this.webllm?.prebuiltAppConfig?.model_list;
    if (!Array.isArray(rows)) return [];
    return rows
      .map((row) => ({
        id: String(row?.model_id || row?.model || row?.id || ''),
        vram_mb: Number(
          row?.vram_required_MB
          || row?.estimated_vram_mb
          || 0
        ),
      }))
      .filter((row) => row.id)
      .sort((a, b) => {
        if (a.vram_mb && b.vram_mb) return a.vram_mb - b.vram_mb;
        if (a.vram_mb) return -1;
        if (b.vram_mb) return 1;
        return a.id.localeCompare(b.id);
      });
  }

  models() {
    return this.engine && this.modelId ? [this.modelId] : [];
  }

  currentModel() {
    return this.engine ? this.modelId : '';
  }

  async load(modelId = '') {
    const selected = String(modelId || this.modelId || this.availableModels()[0]?.id || '');
    if (!selected) throw new Error('Aucun modèle WebLLM compatible disponible');
    this.modelId = selected;
    this.engine = await this.webllm.CreateMLCEngine(selected, {
      initProgressCallback: this.onProgress || undefined,
    });
    return selected;
  }

  async generate({
    messages = [],
    temperature = 0.35,
    maxTokens = 900,
    modelHint = '',
  } = {}) {
    if (!this.engine) {
      const requested = modelHint && this.availableModels().some((row) => row.id === modelHint)
        ? modelHint
        : this.modelId;
      await this.load(requested);
    }
    const response = await this.engine.chat.completions.create({
      messages: Array.isArray(messages) ? messages : [],
      temperature: Math.max(0, Math.min(Number(temperature || 0), 1.5)),
      max_tokens: Math.max(32, Math.min(Number(maxTokens || 900), 1800)),
    });
    return String(response?.choices?.[0]?.message?.content || '');
  }

  async unload() {
    try {
      await this.engine?.unload?.();
    } finally {
      this.engine = null;
    }
  }
}

export function createWebLlmAdapter(webllm, options = {}) {
  return new WebLlmAdapter(webllm, options);
}
