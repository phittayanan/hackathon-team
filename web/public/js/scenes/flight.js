// Proactive flight-delay card. The agent speaks first and offers a faster flight.
// Yes (button or voice) books the new one; the timeline re-routes, then it folds home.
import { addMinutes, flightSummary } from '../scene-summary.js';

export default function mountFlight(el, data, agent) {
  const { old, proposed } = data;
  const newDepart = addMinutes(old.depart, data.delayMinutes);
  const newArrive = addMinutes(old.arrive, data.delayMinutes);

  el.innerHTML = `
    <img class="flight-hero" src="/img/flight.svg" alt="">
    <p class="eyebrow">Your trip tomorrow</p>
    <article class="ticket old" data-testid="old-flight">
      <div class="ticket-row"><b>${old.code}</b><span class="pill bad">Delayed ${data.delayMinutes / 60} h</span></div>
      <div class="route"><div><big>${old.from}</big><s>${old.depart}</s> <em>${newDepart}</em></div><span class="plane">✈</span><div><big>${old.to}</big><s>${old.arrive}</s> <em>${newArrive}</em></div></div>
      <small>${data.reason}</small>
    </article>
    <ol class="timeline" data-testid="timeline">
      <li class="tl-now"><time>now</time>Delay found</li>
      <li class="tl-new" hidden><time>${proposed.arrive}</time>Land ${proposed.to} on ${proposed.code}</li>
      <li class="tl-meet"><time>${data.meetingTime}</time>${data.meeting}</li>
      <li class="tl-old"><time>${newArrive}</time>Land ${old.to} on ${old.code}, misses the meeting</li>
    </ol>
    <article class="ticket offer" data-testid="offer">
      <div class="ticket-row"><b>${proposed.code}</b><span class="pill ok">Seat held</span></div>
      <div class="route"><div><big>${proposed.from}</big>${proposed.depart}</div><span class="plane">✈</span><div><big>${proposed.to}</big>${proposed.arrive}</div></div>
      <small>Arrives ${proposed.arrive}, no extra cost</small>
    </article>
    <div class="flight-buttons">
      <button class="btn btn-deny" data-testid="keep">Keep</button>
      <button class="btn btn-allow" data-testid="yes">Yes, change it</button>
    </div>
    <div class="flight-done" hidden data-testid="flight-done">
      <div class="big-check">✓</div>
      <h2>${proposed.code} booked</h2>
      <p>${proposed.from} ${proposed.depart} → ${proposed.to} ${proposed.arrive}</p>
    </div>`;

  let decided = false;
  const yes = async () => {
    if (decided) return;
    decided = true;
    el.querySelector('[data-testid=yes]').textContent = 'Changing…';
    await agent.wait(900);
    el.querySelector('.tl-old').classList.add('gone');
    el.querySelector('.tl-new').hidden = false;
    el.querySelector('.old').classList.add('gone');
    el.querySelector('.flight-buttons').hidden = true;
    const done = el.querySelector('.flight-done');
    done.hidden = false;
    // The confirmation is the last thing on the page: bring it above the subtitle and composer.
    done.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('rebooked');
    await agent.say('flight_done');
    await agent.wait(800);
    agent.close();
  };
  const keep = async (speak = true) => {
    if (decided) return;
    decided = true;
    if (speak) await agent.say('flight_keep');
    else await agent.wait(1500);
    agent.close();
  };
  el.querySelector('[data-testid=yes]').addEventListener('click', yes);
  el.querySelector('[data-testid=keep]').addEventListener('click', () => keep(true));

  return {
    summary: () => flightSummary(data),
    onAction(action) {
      if (action === 'confirm') yes();
      // The router already speaks the "keep" line for a spoken no.
      if (action === 'decline') keep(false);
    },
  };
}
