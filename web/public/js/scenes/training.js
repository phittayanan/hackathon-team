// Proactive training page: sleep score, run plan and a 10K race card.
// The race card turns into a sign-up form that fills itself and submits,
// all inside our own UI (no outside website). Ends with the mascot on a treadmill and confetti.
import { trainingSummary } from '../scene-summary.js';

export default function mountTraining(el, data, agent) {
  const { race, runner } = data;
  const fields = [
    ['name', 'Full name', runner.name],
    ['email', 'Email', runner.email],
    ['shirt', 'Shirt size', runner.shirt],
    ['emergency', 'Emergency contact', runner.emergency],
  ];
  el.innerHTML = `
    <p class="eyebrow">Good morning</p>
    <section class="sleep">
      <div class="ring" style="--p:${data.sleepScore}"><b data-testid="sleep-score">${data.sleepScore}</b><small>sleep</small></div>
      <ul><li><b>${data.sleepHours}</b> asleep</li><li><b>${data.restingHr}</b> resting bpm</li><li class="good">Ready to run</li></ul>
    </section>
    <h2 class="train-h">This week</h2>
    <ul class="plan">${data.plan.map((p) => `<li><b>${p.day}</b><span>${p.run}</span><small>${p.pace}</small></li>`).join('')}</ul>
    <article class="race" data-testid="race">
      <img src="/img/race.svg" alt="">
      <div class="race-body">
        <h3>${race.name}</h3>
        <p>${race.date} · ${race.place} · ${race.entry}</p>
        <form class="race-form" data-testid="race-form" hidden>
          ${fields.map(([id, label]) => `<label>${label}<input data-field="${id}" readonly></label>`).join('')}
          <label class="agree"><input type="checkbox" data-field="agree" disabled> I agree to the race rules</label>
          <button type="button" class="btn btn-allow" data-testid="race-submit">Submit</button>
        </form>
      </div>
    </article>
    <div class="race-done" hidden data-testid="race-done">
      <img class="treadmill" data-mascot-pose="running" src="/img/ubot/05-running.jpeg" alt="U-Bot running">
      <h2>You're in! ${race.name}</h2>
      <p>Bib number arrives by email</p>
    </div>`;

  const confetti = () => {
    const box = document.createElement('div');
    box.className = 'confetti';
    const colors = ['#ff7a59', '#ffb36b', '#23a26d', '#5aa9ff', '#c38bff', '#ffd84d'];
    for (let i = 0; i < 70; i++) {
      const c = document.createElement('i');
      c.style.cssText = `left:${Math.random() * 100}%;background:${colors[i % colors.length]};animation-delay:${Math.random() * 0.6}s;--x:${(Math.random() - 0.5) * 120}px;--r:${Math.random() * 720}deg`;
      box.appendChild(c);
    }
    el.appendChild(box);
  };

  (async () => {
    await agent.wait(2600);
    if (!agent.alive()) return;
    const raceEl = el.querySelector('.race');
    raceEl.classList.add('expanding');
    raceEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.querySelector('.race-form').hidden = false;
    for (const [id, , value] of fields) {
      const input = el.querySelector(`[data-field=${id}]`);
      input.classList.add('typing');
      for (const ch of value) {
        if (!agent.alive()) return;
        input.value += ch;
        await agent.wait(45);
      }
      input.classList.remove('typing');
      await agent.wait(150);
    }
    el.querySelector('[data-field=agree]').checked = true;
    await agent.wait(400);
    const submit = el.querySelector('[data-testid=race-submit]');
    submit.classList.add('pressed');
    submit.textContent = 'Submitting…';
    await agent.wait(900);
    if (!agent.alive()) return;
    raceEl.hidden = true;
    el.querySelector('.race-done').hidden = false;
    el.classList.add('signed-up');
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    confetti();
    await agent.say('train_done');
    await agent.wait(1500);
    agent.close();
  })();

  return { summary: () => trainingSummary(data) };
}
