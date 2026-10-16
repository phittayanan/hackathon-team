import { conflicts } from '../secretary.js';

const h = (tag, cls, text) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
};
const button = (label, action, testid) => {
  const el = h('button', 'secretary-button', label);
  el.type = 'button'; el.addEventListener('click', action);
  if (testid) el.dataset.testid = testid;
  return el;
};

export default function mountSecretary(el, data, agent) {
  const store = agent.secretary;
  let view = ['today', 'email', 'notifications', 'draft'].includes(data.view) ? data.view : 'today';
  let noticeIds = Array.isArray(data.noticeIds) ? data.noticeIds : [];
  let draftText = null;
  if (view === 'draft' && !store.get().draft) store.draftReply();
  const draw = () => {
    const previousView = el.dataset.view;
    const state = store.get();
    el.replaceChildren(); el.dataset.view = view;
    el.append(h('h1', 'secretary-title', {
      today: 'วันนี้ของคุณ', email: 'จากอีเมลเป็นงาน', notifications: 'มีเรื่องต้องแจ้ง', draft: 'ร่างตอบกลับ',
    }[view]));
    const tabs = h('nav', 'secretary-tabs'); tabs.setAttribute('aria-label', 'Secretary views');
    for (const [key, title] of [['today', 'สรุปวันนี้'], ['email', 'อีเมล']]) {
      const tab = button(title, () => { view = key; draw(); });
      tab.setAttribute('aria-current', view === key ? 'page' : 'false'); tabs.append(tab);
    }
    el.append(tabs);

    const tasks = () => {
      const section = h('section', 'secretary-card'); section.append(h('h2', null, 'งานที่ต้องทำ'));
      for (const task of state.tasks) {
        const label = h('label', 'secretary-task');
        const check = h('input'); check.type = 'checkbox'; check.checked = task.done;
        check.addEventListener('change', () => store.completeTask(task.id, check.checked));
        label.append(check, h('span', task.done ? 'task-done' : '', task.title), h('time', null, task.due));
        section.append(label);
      }
      el.append(section);
    };

    if (view === 'today') {
      el.append(h('p', 'secretary-summary', `${state.tasks.filter((t) => !t.done).length} งานค้าง · ${state.events.length} นัดหมาย · ${state.quietEmails} เมลทั่วไป`));
      tasks();
      const calendar = h('section', 'secretary-card'); calendar.append(h('h2', null, 'ตารางวันนี้'));
      for (const event of [...state.events].sort((a, b) => a.start.localeCompare(b.start))) {
        const row = h('div', 'secretary-event'); row.append(h('time', null, `${event.start}–${event.end}`), h('span', null, event.title)); calendar.append(row);
      }
      el.append(calendar);
      const history = state.notices.filter((n) => n.status === 'shown');
      if (history.length) el.append(button(`เปิดแจ้งเตือน ${history.length} เรื่อง`, () => { noticeIds = history.map((n) => n.id); view = 'notifications'; draw(); }));
    }
    if (view === 'email') {
      const mail = h('article', 'secretary-card');
      mail.append(h('p', 'eyebrow', 'อีเมลตัวอย่าง · จากลูกค้า'), h('h2', null, state.email.subject), h('p', null, state.email.body));
      el.append(mail);
      el.append(button(state.imported ? 'เพิ่มงานแล้ว ✓' : 'เพิ่ม 2 งานจากอีเมล', () => store.importEmail(), 'import-email'));
      el.append(h('p', 'secretary-note', 'นัด 14:00 มีในตารางตัวอย่างแล้ว จึงไม่สร้างนัดซ้ำ'));
      if (state.imported) tasks();
    }
    if (view === 'notifications') {
      const notices = state.notices.filter((n) => noticeIds.includes(n.id));
      for (const notice of notices) {
        const card = h('article', 'secretary-card notification-card'); card.dataset.testid = 'notification-card';
        card.append(h('p', 'eyebrow', 'แจ้งเตือนทดสอบ'), h('h2', null, notice.title), h('p', null, notice.message));
        if (notice.type === 'meeting') {
          const collision = conflicts(state.events, '13:30', '14:00', 'client');
          card.append(h('p', 'secretary-conflict', collision.length ? `13:30–14:00 ชนกับ ${collision.map((e) => e.title).join(', ')}` : 'ช่วงเวลานี้ไม่มีนัดชนกัน'));
          card.append(h('p', 'secretary-free', 'เวลาว่างที่เสนอ: 14:30–15:00'), button('เตรียมร่างตอบ 14:30', () => { draftText = null; store.draftReply(); view = 'draft'; draw(); }, 'prepare-reply'));
        } else card.append(button('เปิดงานที่ต้องทำ', () => { store.importEmail(); view = 'today'; draw(); }));
        el.append(card);
      }
      const actions = h('div', 'secretary-actions');
      actions.append(button('ทราบแล้ว', () => { store.acknowledge(noticeIds); agent.close(); }, 'acknowledge'));
      for (const minute of [1, 5]) actions.append(button(`เตือนอีก ${minute} นาที`, () => { store.snooze(noticeIds, minute); agent.close(); }, `snooze-${minute}`));
      el.append(actions);
    }
    if (view === 'draft') {
      const current = store.get();
      const card = h('section', 'secretary-card');
      card.append(h('h2', null, 'ถึง: ลูกค้า (ตัวอย่าง)'), h('p', 'secretary-free', 'นัดที่เสนอ 14:30–15:00 · ไม่ชนกับตาราง'));
      const label = h('label', 'secretary-draft-label', 'ตรวจข้อความก่อนส่ง');
      const textarea = h('textarea'); textarea.value = draftText ?? current.draft ?? ''; textarea.maxLength = 1500; textarea.rows = 5; textarea.disabled = current.sent;
      textarea.addEventListener('input', () => { draftText = textarea.value; });
      label.append(textarea); card.append(label);
      const send = button(current.sent ? 'ส่งข้อความทดสอบแล้ว ✓' : 'ส่งข้อความทดสอบ', () => store.sendDraft(textarea.value), 'send-demo-reply');
      send.disabled = current.sent; card.append(send);
      card.append(h('p', 'secretary-note', 'เป็นการจำลองในแอป ไม่ได้ส่งอีเมลหรือเปลี่ยน Google Calendar จริง'));
      if (current.sent) { const status = h('p', 'secretary-free', 'ตารางตัวอย่างอัปเดตเป็น 14:30 แล้ว'); status.setAttribute('role', 'status'); card.append(status); }
      el.append(card);
    }
    if (previousView !== view) el.scrollTop = 0;
  };
  const unsubscribe = store.subscribe(() => {
    // Background events must not steal the caret while the owner edits the reply.
    if (el.contains(document.activeElement) && document.activeElement.matches('textarea')) return;
    draw();
  });
  draw();
  return {
    destroy: unsubscribe,
    state: () => ({ view, noticeIds }),
    onAction(action, res = {}) {
      if (action === 'add_tasks') store.importEmail();
      else if (action === 'draft') { draftText = null; store.draftReply(); view = 'draft'; }
      else if (action === 'acknowledge') { store.acknowledge(noticeIds); agent.close(); return; }
      else if (action === 'snooze') { store.snooze(noticeIds, res.minutes || 1); agent.close(); return; }
      else if (['today', 'email'].includes(action)) view = action;
      draw();
    },
  };
}
