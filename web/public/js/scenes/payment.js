// Payment approval card. Money moves only when the owner taps Allow.
// The rules check runs in code (pay-rules.js), never in the model. Voice can never press Allow.
import { T } from '../timing.js';
import { checkRules, paymentTotal } from '../pay-rules.js';

const baht = (n) => `฿${Number(n).toLocaleString('en-US')}`;

export default function mountPayment(el, data, agent) {
  // Rules come from pay-rules.js only; data.rules from the agent is ignored.
  const total = paymentTotal(data);
  const checks = checkRules({ merchant: data.merchant, total });
  const passed = checks.every((c) => c.ok);

  el.innerHTML = `
    <div class="pay">
      <p class="eyebrow">Payment request</p>
      <h1 class="pay-merchant">${data.merchant}</h1>
      <p class="pay-total" data-testid="pay-total">${baht(total)}</p>
      <ul class="pay-items">
        ${data.items.map((i) => `<li><span>${i.name}${i.qty > 1 ? ` × ${i.qty}` : ''}</span><b>${baht(i.price * (i.qty || 1))}</b></li>`).join('')}
      </ul>
      <ul class="pay-rules">
        ${checks.map((c) => `<li class="${c.ok ? 'ok' : 'bad'}"><span class="tick">${c.ok ? '✓' : '✕'}</span>${c.label}<small>${c.detail}</small></li>`).join('')}
      </ul>
      <p class="pay-method">Pay with <b>${data.method}</b></p>
      <div class="pay-buttons">
        <button class="btn btn-deny" data-testid="deny">Deny</button>
        <button class="btn btn-allow" data-testid="allow" ${passed ? '' : 'disabled'}>Allow</button>
      </div>
      <p class="pay-note">${passed ? 'Only your tap can approve. Voice cannot.' : 'Blocked by the rules check.'}</p>
    </div>
    <div class="pay-result" hidden>
      <div class="big-check">✓</div>
      <h2 data-testid="pay-success">Paid ${baht(total)}</h2>
      <p>${data.merchant} · ${data.method}</p>
    </div>`;

  const allow = el.querySelector('[data-testid=allow]');
  const deny = el.querySelector('[data-testid=deny]');
  let done = false;

  allow.addEventListener('click', async () => {
    if (done || !passed) return;
    done = true;
    allow.classList.add('busy');
    allow.textContent = 'Paying…';
    deny.disabled = true;
    await agent.wait(1100);
    el.querySelector('.pay').hidden = true;
    el.querySelector('.pay-result').hidden = false;
    el.classList.add('paid');
    await agent.say('pay_done');
    await agent.wait(700);
    agent.close();
  });

  deny.addEventListener('click', async () => {
    if (done) return;
    done = true;
    el.classList.add('denied');
    await agent.say('pay_denied');
    agent.close();
  });

  if (data.announce) agent.say('pay_ask');

  return {
    onAction(action) {
      // Spoken "yes" / "allow" only points at the button.
      if (action === 'button-only') {
        allow.classList.remove('nudge');
        void allow.offsetWidth;
        allow.classList.add('nudge');
        setTimeout(() => allow.classList.remove('nudge'), T(1200));
      }
    },
  };
}
