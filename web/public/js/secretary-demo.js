import { NOTICE_TYPES } from './secretary.js';

export function setupSecretaryDemo(store, { reset }) {
  const make = (tag, text, cls) => {
    const el = document.createElement(tag);
    if (text) el.textContent = text;
    if (cls) el.className = cls;
    return el;
  };
  const button = (text, action, id) => {
    const el = make('button', text, 'secretary-button');
    el.type = 'button'; el.dataset.testid = id; el.onclick = action;
    return el;
  };
  const dialog = make('dialog', null, 'secretary-demo');
  dialog.id = 'secretary-demo'; dialog.setAttribute('aria-labelledby', 'demo-title');
  const title = make('h2', 'ทดสอบการแจ้งเตือน'); title.id = 'demo-title';
  dialog.append(title, make('p', 'ข้อมูลจำลอง ไม่ส่งเมลหรือแก้ปฏิทินจริง', 'secretary-note'));
  const select = (labelText, entries) => {
    const label = make('label', labelText);
    const input = make('select'); input.setAttribute('aria-label', labelText);
    for (const [value, text] of entries) { const option = make('option', text); option.value = value; input.append(option); }
    label.append(input); dialog.append(label); return input;
  };
  const type = select('เหตุการณ์', Object.entries(NOTICE_TYPES).map(([key, value]) => [key, value.label]));
  const delay = select('แจ้งเมื่อ', [['0', 'ทันทีเมื่อหน้าหลักว่าง'], ['10', 'อีก 10 วินาที'], ['30', 'อีก 30 วินาที']]);
  const feedback = make('p', '', 'secretary-note'); feedback.setAttribute('role', 'status');
  dialog.append(feedback, button('เริ่มทดสอบ', () => {
    if (!store.schedule(type.value, Number(delay.value))) { feedback.textContent = 'ทดสอบเรื่องนี้แล้ว กดรีเซ็ตเพื่อเริ่มใหม่'; return; }
    dialog.close();
  }, 'schedule-notice'), button('รีเซ็ตเดโม', () => {
    reset(); feedback.textContent = ''; dialog.close();
  }, 'reset-secretary'), button('ปิด', () => dialog.close(), 'close-demo'));
  document.getElementById('phone').append(dialog);
  // No buttons on the home screen: the agent opens today and email (secretary_action); the team
  // opens this test dialog with the presenter hotkey n.
  return { show: () => { feedback.textContent = ''; dialog.showModal(); } };
}
