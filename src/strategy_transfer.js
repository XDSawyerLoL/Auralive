function normalizeFeatures(features = {}) {
  if (Array.isArray(features)) {
    return [...new Set(features.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean))].sort();
  }
  return Object.entries(features && typeof features === 'object' ? features : {})
    .filter(([, value]) => Boolean(value))
    .map(([key]) => String(key).trim().toLowerCase())
    .filter(Boolean)
    .sort();
}

function similarity(a, b) {
  const left = new Set(a);
  const right = new Set(b);
  const union = new Set([...left, ...right]);
  if (!union.size) return 0;
  let intersection = 0;
  for (const item of left) if (right.has(item)) intersection += 1;
  return intersection / union.size;
}

export class StrategyTransferEngine {
  constructor() {
    this.episodes = [];
  }

  learn({ domain = '', features = {}, action = '', reward = 0, evidence = '' } = {}) {
    const episode = {
      domain: String(domain || '').trim().toLowerCase(),
      features: normalizeFeatures(features),
      action: String(action || '').trim(),
      reward: Number(reward || 0),
      evidence: String(evidence || '').slice(0, 1000),
    };
    if (!episode.action || !episode.features.length) throw new Error('episode de transfert invalide');
    this.episodes.push(episode);
    return episode;
  }

  recommend(features = {}, { excludeDomain = '', minimumSimilarity = 0.5 } = {}) {
    const target = normalizeFeatures(features);
    const excluded = String(excludeDomain || '').trim().toLowerCase();
    const ranked = this.episodes
      .filter((episode) => !excluded || episode.domain !== excluded)
      .map((episode) => {
        const structuralSimilarity = similarity(target, episode.features);
        const rewardWeight = Math.max(-1, Math.min(1, episode.reward));
        return {
          ...episode,
          structural_similarity: structuralSimilarity,
          score: structuralSimilarity * 0.8 + Math.max(0, rewardWeight) * 0.2,
        };
      })
      .filter((episode) => episode.structural_similarity >= minimumSimilarity && episode.reward > 0)
      .sort((a, b) => b.score - a.score);

    if (!ranked.length) {
      return { transferred: false, action: '', structural_similarity: 0, source_domain: '' };
    }
    const top = ranked[0];
    return {
      transferred: true,
      action: top.action,
      structural_similarity: Number(top.structural_similarity.toFixed(4)),
      source_domain: top.domain,
      evidence: top.evidence,
    };
  }
}
