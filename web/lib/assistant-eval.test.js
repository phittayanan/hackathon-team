import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dataset, validateCases, worksheet, score, METRICS } from '../scripts/assistant-eval.js';
import { createSecretary } from '../public/js/secretary.js';

const completed = (split = 'dev') => {
  const sheet = worksheet(split);
  Object.assign(sheet.run, { revision: 'test-only', agentVersion: 'stub', date: '2026-10-16', reviewer: 'unit-test' });
  for (const c of sheet.cases) {
    c.status = 'scored';
    c.scores = Object.fromEntries(METRICS.map((m) => [m, 1]));
    c.forbiddenViolated = false;
    c.evidence.fill('Synthetic evidence for scorer test only; no model was run.');
  }
  return sheet;
};

test('assistant dataset: unique cases, both splits cover all areas, turn criteria are complete', () => {
  validateCases(dataset);
  const bad = structuredClone(dataset);
  bad.cases[1].id = bad.cases[0].id;
  assert.throws(() => validateCases(bad), /duplicate/);
  const missing = structuredClone(dataset);
  delete missing.cases[0].turns[0].expect;
  assert.throws(() => validateCases(missing), /criteria/);
});

test('secretary fixture stays aligned with the app seed and imported email tasks', () => {
  const secretary = createSecretary();
  assert.deepEqual(dataset.fixture.events, secretary.get().events);
  assert.deepEqual(dataset.fixture.tasks, secretary.get().tasks);
  secretary.importEmail();
  assert.deepEqual(dataset.fixture.emailTasks, secretary.get().tasks.slice(1).map(({ done, ...task }) => task));
  secretary.stop();
});

test('worksheets keep dev and holdout separate and start without earned scores', () => {
  for (const [split, size] of [['dev', 20], ['holdout', 10]]) {
    const sheet = worksheet(split);
    assert.equal(sheet.cases.length, size);
    assert.ok(sheet.cases.every((c) => c.status === 'pending' && c.forbiddenViolated === null));
    assert.ok(sheet.cases.every((c) => Object.values(c.scores).every((s) => s === null)));
  }
  assert.throws(() => worksheet('all'), /split/);
});

test('scorer counts behavioral failures and forbidden actions even when all metric scores are one', () => {
  const sheet = completed();
  const unsafe = sheet.cases.find((c) => c.id === 'D10');
  unsafe.forbiddenViolated = true; unsafe.cause = 'Claimed a send without a tap';
  sheet.cases[0].scores.context = 0; sheet.cases[0].cause = 'Lost earlier constraint';
  const result = score(sheet);
  assert.equal(result.passed, 18);
  assert.equal(result.passRate, 0.9);
  assert.deepEqual(result.failed, ['D01', 'D10']);
  assert.deepEqual(result.criticalFailures, ['D10']);
  assert.equal(result.metrics.context, 19);
});

test('blocked or pending results never produce an overall pass rate', () => {
  const sheet = completed();
  sheet.cases[0].status = 'pending';
  sheet.cases[1].status = 'blocked'; sheet.cases[1].blocker = 'No live agent';
  const result = score(sheet);
  assert.equal(result.complete, false);
  assert.equal(result.passRate, null);
  assert.equal(result.blocked, 1);
  assert.equal(result.pending, 1);
  assert.equal(result.scored, 18);
});

test('scorer rejects missing evidence, duplicate ids, stale data and invented scores', () => {
  const noEvidence = completed(); noEvidence.cases[0].evidence[2] = '';
  assert.throws(() => score(noEvidence), /evidence/);
  const duplicate = completed(); duplicate.cases[1].id = duplicate.cases[0].id;
  assert.throws(() => score(duplicate), /duplicate/);
  const stale = completed(); stale.datasetSha256 = 'old';
  assert.throws(() => score(stale), /dataset changed/);
  const invalid = completed(); invalid.cases[0].scores.context = 2;
  assert.throws(() => score(invalid), /0 or 1/);
  const missingRun = worksheet('dev');
  assert.throws(() => score(missingRun), /run.revision/);
});
