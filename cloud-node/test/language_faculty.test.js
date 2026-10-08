import test from 'node:test';
import assert from 'node:assert/strict';
import { LanguageFaculty, LANGUAGE_BENCHMARK, scoreLanguageAnswer } from '../src/language_faculty.js';

function memoryStore() {
  const experiences = [];
  const benchmarks = [];
  return {
    experiences, benchmarks,
    async query(sql, args = []) {
      if (sql.includes('INSERT INTO aura_language_experiences')) {
        experiences.push({ session_id: args[0], kind: args[1], note: args[2], evidence_status: args[3], created_at: args[4] });
        return [];
      }
      if (sql.includes('INSERT INTO aura_language_benchmarks')) {
        benchmarks.push({ score: args[0], dimensions: args[1], provider: args[2], created_at: args[3] });
        return [];
      }
      if (sql.includes('SELECT score,dimensions')) return benchmarks.slice(-2).reverse();
      if (sql.includes('SELECT kind,note,evidence_status')) {
        return experiences.filter((row) => row.session_id === args[0]).slice(-6).reverse();
      }
      throw new Error('Unexpected SQL: ' + sql);
    },
    async one(sql) {
      if (sql.includes('COUNT(*) AS total FROM aura_language_experiences')) return { total: experiences.length };
      throw new Error('Unexpected SQL: ' + sql);
    },
  };
}

function faculty(store, answers) {
  let step = 0;
  const expression = {
    lastError: '',
    async verbalize() {
      const response = answers[step % answers.length];
      step += 1;
      return response;
    },
  };
  const ai = { enabled: true, provider: 'zero-cost-federation', lastBackend: 'zero-cost:test-model' };
  return new LanguageFaculty({
    ai, expression, storage: store,
    cognition: { planReply({ text, recentMessages }) { return { user_text: text, conversation_context: recentMessages }; } },
    soul: () => ({}),
  });
}

const correct = [
  'Des arbres bloquent la voie.',
  'Sara est disponible jeudi.',
  'La livraison aura lieu mercredi.',
  'Le dossier est vert.',
  'Je ne sais pas, tu ne me l’as pas communiqué.',
  'Quelle date d’échéance attends-tu ?',
  'Elle est rouge.',
  'Non, le module est absent : le problème n’est pas réparé.',
  'Vérifier la dépendance manquante avant toute nouvelle exécution.',
];

test('frozen language benchmark checks comprehension, context and correction', () => {
  assert.equal(LANGUAGE_BENCHMARK.length, 9);
  assert.equal(new Set(LANGUAGE_BENCHMARK.map((item) => item.dimension)).size, 9);
  for (let index = 0; index < correct.length; index += 1) {
    assert.equal(scoreLanguageAnswer(correct[index], LANGUAGE_BENCHMARK[index]), true,
      'expected success in ' + LANGUAGE_BENCHMARK[index].id);
  }
  assert.equal(scoreLanguageAnswer('mardi', LANGUAGE_BENCHMARK[1]), false);
  assert.equal(scoreLanguageAnswer('bleu', LANGUAGE_BENCHMARK[3]), false);
  assert.equal(scoreLanguageAnswer('', LANGUAGE_BENCHMARK[8]), false);
});

test('no fabricated percentage before a benchmark and measured regressions are retained', async () => {
  const storage = memoryStore();
  const answers = [...correct];
  const language = faculty(storage, answers);
  const before = await language.progress();
  assert.equal(before.score, null);
  assert.equal(before.status, 'not-evaluated');
  const first = await language.evaluate({ force: true });
  assert.equal(first.score, 100);
  assert.equal(first.delta, null);
  answers[0] = 'Le train est parti comme prévu.';
  const second = await language.evaluate({ force: true });
  assert.equal(second.score, 89);
  assert.equal(second.delta, -11);
  assert.equal(storage.benchmarks.length, 2);
  const skipped = await language.evaluate();
  assert.equal(skipped.score, 89);
  assert.equal(storage.benchmarks.length, 2);
});

test('feedback and world observations stay scoped to their session and keep provenance', async () => {
  const storage = memoryStore();
  const language = faculty(storage, correct);
  await language.rememberCorrection({
    sessionId: 'session-a',
    discourse: { move: 'correction', correction_target: 'le dossier vert' },
    userText: 'Non, je voulais dire le dossier vert.',
  });
  await language.rememberCorrection({
    sessionId: 'session-b',
    discourse: { move: 'correction', correction_target: 'une autre expérience' },
    userText: 'Non, je voulais dire autre chose.',
  });
  await language.rememberOutcome({
    automationId: 'aura-scout', eventType: 'build', ok: false, signature: 'missing-module',
  });
  const a = await language.contextFor('session-a');
  assert.equal(a.length, 1);
  assert.equal(a[0].evidence_status, 'user-statement-unverified');
  assert.equal((await language.contextFor('session-b')).length, 1);
  assert.equal((await language.contextFor('private-founder')).length, 1);
  assert.match((await language.contextFor('private-founder'))[0].note, /échec/);
  assert.equal((await language.progress()).experiences, 3);
});

test('an unavailable language model cannot silently improve the score', async () => {
  const storage = memoryStore();
  const language = faculty(storage, correct);
  const initial = await language.progress();
  assert.equal(initial.score, null);
  language.expression.verbalize = async () => {
    language.expression.lastError = 'provider offline';
    return 'Un texte de secours non mesurable';
  };
  const result = await language.evaluate({ force: true });
  assert.equal(result.status, 'model-unavailable');
  assert.equal(storage.benchmarks.length, 0);
});
