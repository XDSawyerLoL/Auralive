import fs from 'node:fs/promises';
import path from 'node:path';
import { CognitionEngine } from '../../cloud-node/src/cognition.js';
import { DialogueStateTracker } from '../../cloud-node/src/dialogue_model.js';

function arg(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || fallback) : fallback;
}

const outFile = path.resolve(arg('--out', 'artifacts/external/dialogue-heldout.json'));
const evaluatedSha = process.env.AURA_EVALUATED_SHA || process.env.GITHUB_SHA || '';
const engine = new CognitionEngine();
const tracker = new DialogueStateTracker();

const cases = [
  {
    id: 'reference-pronoun',
    text: 'Et ça, pourquoi ?',
    context: [{ role: 'assistant', content: 'Je stabilise Quantic Glide avant le build Android.' }],
    expectMove: 'reference_followup',
  },
  {
    id: 'bare-why',
    text: 'Pourquoi ?',
    context: [{ role: 'assistant', content: 'Je garde le déploiement en attente tant que les tests ne sont pas verts.' }],
    expectMove: 'clarification',
  },
  {
    id: 'explicit-correction',
    text: 'Non, je parle de la voix Mairaiy.',
    context: [{ role: 'assistant', content: 'Le dashboard est devenu plus simple.' }],
    expectMove: 'correction',
    correctionIncludes: 'voix mairaiy',
  },
  {
    id: 'new-short-topic',
    text: 'Et la voix Mairaiy, elle est prête ?',
    context: [{ role: 'assistant', content: 'Je stabilise Quantic Glide.' }],
    expectMove: 'question',
  },
  {
    id: 'acknowledgement',
    text: 'hmm',
    context: [{ role: 'assistant', content: 'Je travaille sur la certification live.' }],
    expectMove: 'acknowledgement',
  },
  {
    id: 'directive',
    text: 'Vérifie la certification et corrige ce qui bloque.',
    context: [{ role: 'assistant', content: 'La production est en cours de validation.' }],
    expectMove: 'directive',
  },
  {
    id: 'topic-continuity',
    text: 'Et pour Android ?',
    context: [{ role: 'assistant', content: 'Le build Android de Quantic Glide est encore en validation.' }],
    expectMove: 'question',
    minContinuity: 0.2,
  },
  {
    id: 'generic-question',
    text: 'Quel est le prochain risque majeur ?',
    context: [{ role: 'assistant', content: 'Je termine le chantier de production truth.' }],
    expectMove: 'question',
  },
  {
    id: 'clarify-meaning',
    text: "C'est-à-dire ?",
    context: [{ role: 'assistant', content: 'Le Cloud devient l’autorité canonique.' }],
    expectMove: 'clarification',
  },
  {
    id: 'correction-compact',
    text: 'Pas ça, je parle du maillage P2P.',
    context: [{ role: 'assistant', content: 'Le dialogue natif est actif.' }],
    expectMove: 'correction',
    correctionIncludes: 'maillage p2p',
  },
];

const results = [];
for (const item of cases) {
  const frame = tracker.analyze(item.text, item.context);
  let ok = frame.move === item.expectMove;
  if (item.correctionIncludes) ok = ok && frame.correction_target.toLowerCase().includes(item.correctionIncludes);
  if (item.minContinuity != null) ok = ok && frame.topic_continuity >= item.minContinuity;
  results.push({
    id: item.id,
    ok,
    expected_move: item.expectMove,
    actual_move: frame.move,
    correction_target: frame.correction_target,
    topic_continuity: frame.topic_continuity,
    topic_terms: frame.topic_terms,
  });
}

const behavioralCases = [
  {
    id: 'social-wellbeing-typo',
    input: {
      text: 'tu va bien.',
      soul: { organism: { mood: 'satisfaite', relationship: { social_curiosity: 0.8 }, executive: {} } },
      recentMessages: [{ role: 'assistant', content: 'Salut. Oui, je suis là.' }],
    },
    predicate: ({ plan, answer }) =>
      plan.act === 'report_internal_state'
      && /Ça va plutôt bien/.test(answer),
  },
  {
    id: 'social-curiosity-question',
    input: {
      text: 'tu a des questions?',
      soul: {
        current_intention: 'Faire avancer AURA',
        organism: {
          curiosite_sociale: 0.8,
          relationship: { social_curiosity: 0.8, last_open_thread: 'autonomie AURA' },
          executive: {},
        },
      },
      agenda: { current: 'Stabiliser AURA', next_action: 'Valider la production' },
      recentMessages: [{ role: 'assistant', content: 'Je travaille sur la production.' }],
    },
    predicate: ({ plan, answer }) =>
      plan.act === 'ask_user_from_curiosity'
      && /\?/.test(answer)
      && !/Tu fais référence/.test(answer),
  },
  {
    id: 'activity-typo',
    input: {
      text: 'tu fait quoi la ?',
      soul: { organism: { mood: 'engagée', relationship: {}, executive: {} } },
      agenda: { current: 'Certifier AURA 3.0', next_action: 'Valider le SHA live' },
      work: [{ title: 'Production Truth' }],
      recentMessages: [{ role: 'assistant', content: 'Je suis en train de travailler.' }],
    },
    predicate: ({ plan, answer }) =>
      plan.act === 'report_current_activity'
      && /Certifier AURA 3\.0/.test(answer),
  },
  {
    id: 'followup-clarification',
    input: {
      text: 'et donc ?',
      soul: { organism: { mood: 'engagée', relationship: {}, executive: {} } },
      agenda: { current: 'Certifier AURA 3.0', next_action: 'Valider le SHA live' },
      recentMessages: [{ role: 'assistant', content: 'Je vérifie le SHA réellement déployé.' }],
    },
    predicate: ({ plan, answer }) =>
      ['clarify_previous','reference_followup'].includes(plan.act)
      && !/Je te suis\. Je reste/i.test(answer),
  },
  {
    id: 'understanding-repair',
    input: {
      text: 'Non, je parle du moteur de dialogue.',
      soul: { organism: { relationship: {}, executive: {} } },
      recentMessages: [{ role: 'assistant', content: 'Le visuel est minimal.' }],
    },
    predicate: ({ plan, answer }) =>
      plan.act === 'repair_understanding'
      && /moteur de dialogue/i.test(answer),
  },
];

for (const item of behavioralCases) {
  const plan = engine.planReply({
    intentions: [], lessons: [], reflections: [], work: [],
    privateView: false, ...item.input,
  });
  const answer = engine.deterministicReply(plan);
  results.push({
    id: item.id,
    ok: Boolean(item.predicate({ plan, answer })),
    actual_move: plan.discourse?.move || '',
    act: plan.act,
    answer,
  });
}

const passed = results.filter((row) => row.ok).length;
const report = {
  schema: 'aura-dialogue-heldout-v1',
  generated_at: new Date().toISOString(),
  evaluated_aura_sha: evaluatedSha,
  cognition_version: CognitionEngine.VERSION,
  dialogue_version: DialogueStateTracker.VERSION,
  summary: {
    cases: results.length,
    passed,
    failed: results.length - passed,
    accuracy: results.length ? passed / results.length : 0,
  },
  results,
};

await fs.mkdir(path.dirname(outFile), { recursive: true });
await fs.writeFile(outFile, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(report.summary));
if (report.summary.accuracy < 0.90) process.exitCode = 1;
