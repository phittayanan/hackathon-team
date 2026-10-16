// Shopping list built item by item from a (fake) email, then it slides up into the payment card.
import { mountCatalog } from './shopping-catalog.js';
import { shoppingSummary } from '../scene-summary.js';
const baht = (n) => `฿${Number(n).toLocaleString('en-US')}`;

export default function mountShopping(el, data, agent) {
  if (data.catalog === true) return mountCatalog(el, data, agent);
  const total = data.items.reduce((s, i) => s + i.price * (i.qty || 1), 0);
  el.innerHTML = `
    <p class="eyebrow">Checking your email</p>
    <article class="mail" data-testid="mail">
      <div class="mail-avatar">${data.email.from[0]}</div>
      <div><b>${data.email.from}</b><h3>${data.email.subject}</h3><p>${data.email.preview}</p></div>
    </article>
    <div class="shop-head">
      <img src="/img/groceries.svg" alt="">
      <div><p class="eyebrow">Shopping list</p><h1>${data.merchant}</h1></div>
    </div>
    <ul class="shop-items" data-testid="shop-items"></ul>
    <div class="shop-total"><span>Total</span><b data-testid="shop-total">${baht(0)}</b></div>
    <button class="btn btn-allow shop-go" data-testid="checkout" hidden>Checkout</button>`;

  const list = el.querySelector('.shop-items');
  const totalEl = el.querySelector('[data-testid=shop-total]');
  let checkedOut = false;

  const checkout = () => {
    if (checkedOut || !agent.alive()) return;
    checkedOut = true;
    agent.open('payment', {
      merchant: data.merchant,
      items: data.items.map((i) => ({ name: i.name, qty: i.qty || 1, price: i.price })),
      total,
      announce: true,
    });
  };
  el.querySelector('.shop-go').addEventListener('click', checkout);

  (async () => {
    await agent.wait(900);
    el.querySelector('.mail').classList.add('read');
    let running = 0;
    for (const item of data.items) {
      await agent.wait(450);
      if (!agent.alive()) return;
      running += item.price * (item.qty || 1);
      const li = document.createElement('li');
      li.innerHTML = `<span class="check">✓</span><span>${item.name}</span><b>${baht(item.price * (item.qty || 1))}</b>`;
      list.appendChild(li);
      totalEl.textContent = baht(running);
    }
    el.querySelector('.shop-go').hidden = false;
    await agent.say('shop_found');
    await agent.wait(500);
    checkout();
  })();

  return {
    summary: () => shoppingSummary(data),
    onAction(action) {
      if (action === 'confirm') checkout();
    },
  };
}
