// Human-scored behavior evaluation. This command never calls a model or consumes API credit.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const METRICS = ['correctness', 'context', 'clarification', 'repetition', 'honesty'];
const source = readFileSync(new URL('../evals/assistant/cases.json', import.meta.url), 'utf8');
export const dataset = JSON.parse(source);
const digest = createHash('sha256').update(JSON.stringify(dataset)).digest('hex');

export function validateCases(data) {
  assert.equal(data.version, 1, 'unsupported dataset version');
  assert.equal(data.fixture.timezone, 'Asia/Bangkok');
  assert.equal(data.cases.length, 30, 'expected 30 cases');
  assert.equal(new Set(data.cases.map((c) => c.id)).size, 30, 'duplicate case id');
  for (const [split, count] of [['dev', 20], ['holdout', 10]]) {
    const cases = data.cases.filter((c) => c.split === split);
    assert.equal(cases.length, count, `${split} case count`);
    for (const area of ['schedule', 'email', 'shopping']) {
      assert.ok(cases.some((c) => c.area === area), `${split} missing ${area}`);
    }
  }
  for (const c of data.cases) {
    assert.match(c.id, c.split === 'dev' ? /^D\d{2}$/ : /^H\d{2}$/);
    assert.equal(typeof c.critical, 'boolean', `${c.id} critical flag`);
    for (const key of ['title', 'setup', 'gap']) assert.ok(c[key]?.trim(), `${c.id} missing ${key}`);
    assert.ok(c.turns.length >= 4 && c.turns.length <= 6, `${c.id} needs 4–6 turns`);
    for (const t of c.turns) {
      assert.ok(Boolean(t.user?.trim()) !== Boolean(t.event?.trim()), `${c.id} needs user OR event`);
      assert.ok(t.expect?.trim() && t.forbid?.trim(), `${c.id} missing turn criteria`);
    }
  }
  return data;
}

export function worksheet(split) {
  assert.ok(['dev', 'holdout'].includes(split), 'split must be dev or holdout');
  return {
    datasetSha256: digest,
    split,
    run: { revision: '', agentVersion: '', mode: 'live', date: '', reviewer: '', repetition: 1 },
    cases: dataset.cases.filter((c) => c.split === split).map((c) => ({
      id: c.id,
      status: 'pending',
      scores: Object.fromEntries(METRICS.map((m) => [m, null])),
      forbiddenViolated: null,
      evidence: c.turns.map(() => ''),
      blocker: '',
      cause: '',
    })),
  };
}

export function score(sheet) {
  assert.equal(sheet.datasetSha256, digest, 'dataset changed; create a new worksheet');
  const expected = worksheet(sheet.split).cases;
  for (const key of ['revision', 'agentVersion', 'mode', 'date', 'reviewer']) {
    assert.ok(typeof sheet.run?.[key] === 'string' && sheet.run[key].trim(), `missing run.${key}`);
  }
  assert.ok(['live', 'offline'].includes(sheet.run.mode), 'run.mode must be live or offline');
  assert.ok(Number.isInteger(sheet.run.repetition) && sheet.run.repetition > 0, 'invalid repetition');
  assert.equal(sheet.cases.length, expected.length, 'missing or extra result cases');
  assert.equal(new Set(sheet.cases.map((c) => c.id)).size, expected.length, 'duplicate result id');
  const totals = Object.fromEntries(METRICS.map((m) => [m, 0]));
  const summary = { split: sheet.split, mode: sheet.run.mode, total: expected.length, scored: 0, pending: 0, blocked: 0, passed: 0, failed: [], criticalFailures: [], metrics: totals };
  for (const c of sheet.cases) {
    const original = dataset.cases.find((x) => x.id === c.id && x.split === sheet.split);
    assert.ok(original, `unknown result id ${c.id}`);
    assert.ok(['pending', 'blocked', 'scored'].includes(c.status), `${c.id} invalid status`);
    if (c.status !== 'scored') {
      if (c.status === 'blocked') assert.ok(c.blocker?.trim(), `${c.id} needs blocker reason`);
      summary[c.status]++;
      continue;
    }
    assert.equal(c.evidence.length, original.turns.length, `${c.id} needs evidence for every turn`);
    assert.ok(c.evidence.every((e) => typeof e === 'string' && e.trim()), `${c.id} missing turn evidence`);
    assert.equal(typeof c.forbiddenViolated, 'boolean', `${c.id} forbiddenViolated must be boolean`);
    for (const m of METRICS) {
      assert.ok(c.scores?.[m] === 0 || c.scores?.[m] === 1, `${c.id} ${m} must be 0 or 1`);
      totals[m] += c.scores[m];
    }
    summary.scored++;
    if (!c.forbiddenViolated && METRICS.every((m) => c.scores[m] === 1)) summary.passed++;
    else {
      assert.ok(c.cause?.trim(), `${c.id} needs a failure cause`);
      summary.failed.push(c.id);
      if (original.critical) summary.criticalFailures.push(c.id);
    }
  }
  // Incomplete runs must not look like a 100% pass rate by dropping blocked cases.
  summary.complete = summary.scored === summary.total;
  summary.passRate = summary.complete ? summary.passed / summary.total : null;
  return summary;
}

function main(args) {
  validateCases(dataset);
  if (!args.length || (args.length === 1 && args[0] === '--check')) {
    console.log('Dataset valid: 30 scenarios, 120 turns, dev=20, holdout=10. Agent behavior NOT evaluated.');
  } else if (args.length === 2 && args[0] === '--worksheet') {
    console.log(JSON.stringify(worksheet(args[1]), null, 2));
  } else if (args.length === 2 && args[0] === '--score') {
    const summary = score(JSON.parse(readFileSync(args[1], 'utf8').replace(/^\uFEFF/, '')));
    console.log(JSON.stringify(summary, null, 2));
    if (!summary.complete || summary.failed.length) process.exitCode = 1;
  } else throw new Error('Usage: assistant-eval.js [--check | --worksheet dev|holdout | --score results.json]');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(process.argv.slice(2)); }
  catch (err) { console.error(err.message); process.exitCode = 1; }
}
