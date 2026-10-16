// Browser-only secretary demo. No email is sent and no external calendar is changed.
export const NOTICE_TYPES = {
  meeting: { title: 'ลูกค้าขอเลื่อนนัด', label: 'นัดเลื่อนและเวลาชนกัน' },
  deadline: { title: 'งานใกล้ครบกำหนด', label: 'งานใกล้ครบกำหนด' },
  email: { title: 'อีเมลทั่วไป', label: 'อีเมลทั่วไป (ไม่พูดแทรก)' },
};

const seed = () => ({
  email: {
    subject: 'เตรียมประชุมวันนี้',
    body: 'นัดเดิม 14:00–14:30 รบกวนส่งสไลด์และเตรียมหัวข้อประชุมภายใน 13:30 ด้วยค่ะ',
  },
  events: [
    { id: 'team', title: 'ประชุมทีม', start: '13:00', end: '14:00' },
    { id: 'client', title: 'ประชุมลูกค้า', start: '14:00', end: '14:30' },
    { id: 'review', title: 'ทบทวนงานประจำวัน', start: '16:00', end: '16:30' },
  ],
  tasks: [{ id: 'budget', title: 'ตรวจงบประมาณ', due: '15:00', done: false }],
  imported: false, quietEmails: 0, draft: null, proposedMeeting: null, sent: false, notices: [],
});

const minutes = (time) => {
  if (!/^\d{2}:\d{2}$/.test(time)) throw new Error('invalid time');
  const [h, m] = time.split(':').map(Number);
  if (h > 23 || m > 59) throw new Error('invalid time');
  return h * 60 + m;
};

export function conflicts(events, start, end, excludeId = '') {
  const from = minutes(start); const until = minutes(end);
  if (until <= from) throw new Error('end must be after start');
  return events.filter((e) => e.id !== excludeId && minutes(e.start) < until && minutes(e.end) > from);
}

export function createSecretary({ notify = async () => {}, onError = console.error, now = Date.now } = {}) {
  let state = seed();
  let delivering = false;
  let generation = 0;
  const timers = new Map();
  const listeners = new Set();
  const changed = () => listeners.forEach((fn) => fn());
  const cancel = (id) => { clearTimeout(timers.get(id)); timers.delete(id); };
  const message = (type) => type === 'meeting'
    ? 'ลูกค้าขอเลื่อนประชุมเป็น 13:30 แต่ชนกับประชุมทีมค่ะ ช่วง 14:30 ว่าง เตรียมร่างตอบให้ตรวจได้เลย'
    : 'สไลด์ประชุมลูกค้าจะครบกำหนดในอีก 15 นาทีค่ะ เปิดงานหรือเลื่อนเตือนได้เลย';
  const queue = (notice, delayMs) => {
    cancel(notice.id);
    notice.status = 'scheduled'; notice.at = now() + delayMs;
    const fire = () => {
      timers.delete(notice.id);
      if (notice.type === 'email') { notice.status = 'quiet'; state.quietEmails++; }
      else notice.status = 'pending';
      changed();
    };
    if (delayMs === 0) fire();
    else timers.set(notice.id, setTimeout(fire, delayMs));
  };

  return {
    get: () => structuredClone(state),
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    schedule(type, seconds = 0) {
      if (!Object.hasOwn(NOTICE_TYPES, type) || ![0, 10, 30].includes(seconds)) return false;
      if (state.notices.some((n) => n.type === type)) return false;
      const notice = { id: type, type, title: NOTICE_TYPES[type].title, message: message(type) };
      state.notices.push(notice);
      queue(notice, seconds * 1000); changed();
      return true;
    },
    // Called by the existing agent loop only when home is idle. Batch simultaneous notices.
    flush() {
      if (delivering) return true;
      const pending = state.notices.filter((n) => n.status === 'pending');
      if (!pending.length) return false;
      pending.forEach((n) => { n.status = 'shown'; });
      delivering = true; changed();
      const mine = generation;
      const retry = () => { if (mine === generation) pending.forEach((n) => { if (n.status === 'shown') n.status = 'pending'; }); };
      Promise.resolve().then(() => mine === generation && notify(structuredClone(pending), () => mine === generation)).then((delivered) => {
        if (delivered === false) retry();
      }).catch((err) => {
        retry();
        onError(err);
      }).finally(() => { delivering = false; changed(); });
      return true;
    },
    importEmail() {
      if (state.imported) return false;
      state.tasks.push(
        { id: 'slides', title: 'ส่งสไลด์ให้ลูกค้า', due: '13:30', done: false },
        { id: 'agenda', title: 'เตรียมหัวข้อประชุมลูกค้า', due: '13:30', done: false },
      );
      state.imported = true; changed(); return true;
    },
    completeTask(id, done) {
      const task = state.tasks.find((t) => t.id === id);
      if (!task) return false;
      task.done = Boolean(done); changed(); return true;
    },
    draftReply() {
      const proposal = { eventId: 'client', start: '14:30', end: '15:00' };
      if (conflicts(state.events, proposal.start, proposal.end, proposal.eventId).length) return false;
      state.proposedMeeting = proposal;
      state.draft = `สวัสดีค่ะ ช่วง 13:30 ติดประชุมทีมอยู่ ขอเสนอเป็น ${proposal.start}–${proposal.end} แทน สะดวกไหมคะ ขอบคุณค่ะ`;
      changed(); return true;
    },
    sendDraft(text) {
      const proposal = state.proposedMeeting;
      if (state.sent || !state.draft || !proposal || typeof text !== 'string' || !text.trim() || text.length > 1500) return false;
      if (conflicts(state.events, proposal.start, proposal.end, proposal.eventId).length) return false;
      state.draft = text.trim(); state.sent = true;
      const event = state.events.find((e) => e.id === proposal.eventId);
      event.start = proposal.start; event.end = proposal.end;
      state.proposedMeeting = null;
      state.notices.filter((n) => n.type === 'meeting').forEach((n) => { cancel(n.id); n.status = 'dismissed'; });
      changed(); return true;
    },
    acknowledge(ids) {
      state.notices.filter((n) => ids.includes(n.id)).forEach((n) => { cancel(n.id); n.status = 'dismissed'; });
      changed();
    },
    snooze(ids, delayMinutes = 1) {
      if (![1, 5].includes(delayMinutes)) return false;
      state.notices.filter((n) => ids.includes(n.id) && n.status === 'shown').forEach((n) => queue(n, delayMinutes * 60000));
      changed(); return true;
    },
    reset() {
      generation++;
      timers.forEach(clearTimeout); timers.clear(); state = seed(); changed();
    },
    stop() { timers.forEach(clearTimeout); timers.clear(); listeners.clear(); },
  };
}
