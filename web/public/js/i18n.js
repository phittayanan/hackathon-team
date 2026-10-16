// UI language only. Conversation text and editable values are never rewritten.
import { SUGGESTION_POOL } from './suggest.js';

const pairs = [
  ['พิมพ์ที่นี่', 'Type here'], ['ส่ง', 'Send'], ['กดค้างเพื่อพูด', 'Hold to talk'],
  ['กดค้างที่ไมค์เพื่อพูด', 'Hold the mic to talk'], ['แตะหน้าจอเพื่อเปิดเสียง', 'Tap to turn on sound'],
  ['⌂ หน้าหลัก', '⌂ Home'], ['กลับหน้าหลัก', 'Back to the agent home'],
  ['ข้อความเสียง', 'Voice transcript'], ['พิมพ์สิ่งที่ต้องการบอก', 'Type what you want to say'],
  ['หน้าหลัก Q-Bot', 'Agent home'], ['นำทางงาน', 'Task navigation'], ['เลขาส่วนตัว', 'Personal assistant'],
  ['ภาษา UI', 'UI language'], ['มุมมองเลขา', 'Secretary views'], ['ลองพูดว่า', 'Try saying'],
  ['สวัสดี ฉันคือ Q-Bot ผู้ช่วยของคุณ', 'Hi, I’m Q-Bot, your assistant'],
  // \u2060 (word joiner): the line never breaks inside "to-do".
  ['ช่วยซื้อของตามอีเมล วางแผนวิ่ง เช็คเที่ยวบิน และทำ to\u2060-\u2060do list', 'I shop from your email, plan runs, check flights and make to\u2060-\u2060do lists'],
  ...SUGGESTION_POOL.map((s) => [s.say, s.en]),
  ['สรุปวันนี้', 'Today'], ['อีเมล → งาน', 'Email → Tasks'], ['ทดสอบการแจ้งเตือน', 'Test notifications'],
  ['ข้อมูลจำลอง ไม่ส่งเมลหรือแก้ปฏิทินจริง', 'Simulated data. No real email or calendar changes.'],
  ['เหตุการณ์', 'Event'], ['แจ้งเมื่อ', 'Notify me'], ['ทันทีเมื่อหน้าหลักว่าง', 'When the home screen is idle'],
  ['อีก 10 วินาที', 'In 10 seconds'], ['อีก 30 วินาที', 'In 30 seconds'],
  ['นัดเลื่อนและเวลาชนกัน', 'Rescheduled meeting conflict'], ['งานใกล้ครบกำหนด', 'Task deadline approaching'],
  ['อีเมลทั่วไป (ไม่พูดแทรก)', 'Ordinary email (quiet)'], ['เริ่มทดสอบ', 'Start test'],
  ['รีเซ็ตเดโม', 'Reset'], ['ปิด', 'Close'], ['ทดสอบเรื่องนี้แล้ว กดรีเซ็ตเพื่อเริ่มใหม่', 'Already tested. Reset to try again.'],
  ['วันนี้ของคุณ', 'Your day'], ['จากอีเมลเป็นงาน', 'Email to tasks'], ['มีเรื่องต้องแจ้ง', 'Notifications'],
  ['ร่างตอบกลับ', 'Draft reply'], ['อีเมล', 'Email'], ['งานที่ต้องทำ', 'Tasks'], ['ตารางวันนี้', 'Today’s schedule'],
  ['อีเมลตัวอย่าง · จากลูกค้า', 'Sample email · From a client'], ['เตรียมประชุมวันนี้', 'Prepare for today’s meeting'],
  ['นัดเดิม 14:00–14:30 รบกวนส่งสไลด์และเตรียมหัวข้อประชุมภายใน 13:30 ด้วยค่ะ', 'Our meeting is at 14:00–14:30. Please send the slides and prepare the agenda by 13:30.'],
  ['เพิ่มงานแล้ว ✓', 'Tasks added ✓'], ['เพิ่ม 2 งานจากอีเมล', 'Add 2 tasks from email'],
  ['นัด 14:00 มีในตารางตัวอย่างแล้ว จึงไม่สร้างนัดซ้ำ', 'The 14:00 meeting is already in the sample calendar; no duplicate will be added.'],
  ['แจ้งเตือนทดสอบ', 'Test notification'], ['ช่วงเวลานี้ไม่มีนัดชนกัน', 'No calendar conflict'],
  ['เวลาว่างที่เสนอ: 14:30–15:00', 'Suggested free slot: 14:30–15:00'], ['เตรียมร่างตอบ 14:30', 'Draft a reply for 14:30'],
  ['เปิดงานที่ต้องทำ', 'Open tasks'], ['ทราบแล้ว', 'Acknowledge'], ['ถึง: ลูกค้า (ตัวอย่าง)', 'To: Client (sample)'],
  ['นัดที่เสนอ 14:30–15:00 · ไม่ชนกับตาราง', 'Proposed meeting 14:30–15:00 · No conflict'],
  ['ตรวจข้อความก่อนส่ง', 'Review before sending'], ['ส่งข้อความทดสอบ', 'Send test message'],
  ['ส่งข้อความทดสอบแล้ว ✓', 'Test message sent ✓'],
  ['เป็นการจำลองในแอป ไม่ได้ส่งอีเมลหรือเปลี่ยน Google Calendar จริง', 'This is an in-app simulation. No real email is sent or Google Calendar changed.'],
  ['ตารางตัวอย่างอัปเดตเป็น 14:30 แล้ว', 'Sample calendar updated to 14:30'],
  ['ประชุมทีม', 'Team meeting'], ['ประชุมลูกค้า', 'Client meeting'], ['ทบทวนงานประจำวัน', 'Daily review'],
  ['ตรวจงบประมาณ', 'Review budget'], ['ส่งสไลด์ประชุมลูกค้า', 'Send client meeting slides'], ['เตรียมหัวข้อประชุม', 'Prepare meeting agenda'],
  ['ลูกค้าขอเลื่อนนัด', 'Client requests a new meeting time'], ['อีเมลทั่วไป', 'Ordinary email'],
  ['ลูกค้าขอเลื่อนประชุมเป็น 13:30 แต่ชนกับประชุมทีมค่ะ ช่วง 14:30 ว่าง เตรียมร่างตอบให้ตรวจได้เลย', 'The client requests 13:30, which conflicts with the team meeting. 14:30 is free; a reply can be drafted for review.'],
  ['สไลด์ประชุมลูกค้าจะครบกำหนดในอีก 15 นาทีค่ะ เปิดงานหรือเลื่อนเตือนได้เลย', 'Client slides are due in 15 minutes. Open the task or snooze the reminder.'],
  ['กำลังอ่านอีเมล', 'Checking your email'], ['รายการซื้อของ', 'Shopping list'], ['ยอดรวม', 'Total'], ['ชำระเงิน', 'Checkout'],
  ['คำขอชำระเงิน', 'Payment request'], ['อยู่ในงบรายเดือน', 'Inside monthly budget'], ['ไม่เกินวงเงินต่อครั้ง', 'Under cap per payment'],
  ['ร้านค้าอยู่ในรายการที่อนุญาต', 'Shop on allowed list'], ['ปฏิเสธ', 'Deny'], ['อนุญาต', 'Allow'],
  ['กำลังชำระเงิน…', 'Paying…'], ['อนุมัติได้ด้วยการกดปุ่มเท่านั้น', 'Only your tap can approve. Voice cannot.'],
  ['ไม่ผ่านเงื่อนไขการชำระเงิน', 'Blocked by the rules check.'],
  ['การเดินทางพรุ่งนี้', 'Your trip tomorrow'], ['เก็บเที่ยวบินเดิม', 'Keep'], ['เปลี่ยนเที่ยวบิน', 'Yes, change it'],
  ['กำลังเปลี่ยน…', 'Changing…'], ['พบเที่ยวบินล่าช้า', 'Delay found'], ['ตอนนี้', 'now'], ['สำรองที่นั่งแล้ว', 'Seat held'],
  ['อรุณสวัสดิ์', 'Good morning'], ['การนอน', 'sleep'], ['พร้อมออกวิ่ง', 'Ready to run'], ['สัปดาห์นี้', 'This week'],
  ['ชื่อ–นามสกุล', 'Full name'], ['ขนาดเสื้อ', 'Shirt size'], ['ผู้ติดต่อฉุกเฉิน', 'Emergency contact'],
  ['ยอมรับกติกาการแข่งขัน', 'I agree to the race rules'], ['ยืนยัน', 'Submit'], ['กำลังส่ง…', 'Submitting…'],
  ['รับหมายเลขวิ่งทางอีเมล', 'Bib number arrives by email'],
  ['สร้างให้คุณ', 'Generated for you'], ['หน้าที่บันทึกไว้', 'Saved scene'], ['ปฐมพยาบาล', 'First aid'],
  ['แหล่งข้อมูล', 'Sources'],
  ['กำลังพักผ่อน', 'asleep'], ['ชีพจรขณะพัก', 'resting bpm'],
  ['Q-Bot กำลังรอ', 'Q-Bot waiting'], ['Q-Bot กำลังฟัง', 'Q-Bot listening'], ['Q-Bot กำลังพูด', 'Q-Bot speaking'],
  ['Q-Bot กำลังทำงาน', 'Q-Bot working'], ['Q-Bot กำลังฉลอง', 'Q-Bot celebrating'], ['Q-Bot เป็นห่วง', 'Q-Bot concerned'],
  ['ค้นหาวิดีโอบน YouTube', 'Search YouTube videos'], ['เปิดผลการค้นหา', 'Open search results'],
  ['เปิดผลการค้นหาล่าสุด แล้วเลือกคลิปที่ต้องการ', 'Open the latest results and choose a video'],
  ['ใกล้ฉัน', 'Near me'], ['ดูใน Google Maps', 'Open in Google Maps'], ['สถานที่ใกล้คุณ', 'Places near you'],
];
const dictionary = new Map(pairs.flatMap((pair) => pair.map((word) => [word, pair])));
let language = 'th';
export const getLanguage = () => language;

function translate(source) {
  const text = source.trim();
  const pair = dictionary.get(text);
  let result = pair?.[language === 'th' ? 0 : 1];
  // Existing bilingual UI labels become a single language. Voice is excluded below.
  if (!result && /[ก-๙]/.test(text) && /[a-z]/i.test(text) && text.includes(' · ')) {
    const parts = text.split(' · ');
    if (parts.length === 2 && /[ก-๙]/.test(parts[0]) && !/[ก-๙]/.test(parts[1])) result = parts[language === 'th' ? 0 : 1];
  }
  if (!result && language === 'en') {
    result = text.replace(/^(\d+) งานค้าง · (\d+) นัดหมาย · (\d+) เมลทั่วไป$/, '$1 pending tasks · $2 appointments · $3 ordinary emails')
      .replace(/^เปิดแจ้งเตือน (\d+) เรื่อง$/, 'Open $1 notifications')
      .replace(/^เตือนอีก (\d+) นาที$/, 'Remind me in $1 min')
      .replace(/^13:30–14:00 ชนกับ (.+)$/, (_, names) => `13:30–14:00 conflicts with ${names.split(', ').map((name) => dictionary.get(name)?.[1] || name).join(', ')}`);
  }
  if (!result && language === 'th') {
    result = text.replace(/^Delayed (\d+) h$/, 'ล่าช้า $1 ชม.')
      .replace(/^Paid (.+)$/, 'ชำระแล้ว $1').replace(/^Pay with$/, 'ชำระด้วย')
      .replace(/^You're in! (.+)$/, 'สมัครแล้ว! $1').replace(/^(.+) booked$/, 'จอง $1 แล้ว')
      .replace(/^(.+) left$/, 'เหลือ $1').replace(/^cap (.+)$/, 'วงเงิน $1')
      .replace(/^Arrives ([\d:]+), no extra cost$/, 'ถึง $1 ไม่มีค่าใช้จ่ายเพิ่ม');
  }
  return result ? source.replace(text, result) : source;
}

export function initLanguage() {
  try { language = localStorage.getItem('qbot.language') === 'en' ? 'en' : 'th'; } catch { /* storage can be disabled */ }
  const sources = new WeakMap();
  const skip = (el) => el.closest('script, style, textarea, #subtitle, [data-no-translate]');
  const renderValue = (node, key, value, set) => {
    let records = sources.get(node);
    if (!records) { records = {}; sources.set(node, records); }
    const record = records[key];
    const source = record && value === record.last ? record.source : value;
    const next = translate(source);
    records[key] = { source, last: next };
    if (next !== value) set(next);
  };
  const observer = new MutationObserver(() => render());
  const render = () => {
    observer.disconnect();
    document.documentElement.lang = language;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.parentElement || skip(node.parentElement)) continue;
      renderValue(node, 'text', node.nodeValue, (next) => { node.nodeValue = next; });
    }
    for (const el of document.querySelectorAll('[placeholder], [aria-label], [alt], [title]')) {
      if (skip(el)) continue;
      for (const attr of ['placeholder', 'aria-label', 'alt', 'title']) {
        if (el.hasAttribute(attr)) renderValue(el, attr, el.getAttribute(attr), (next) => el.setAttribute(attr, next));
      }
    }
    for (const button of document.querySelectorAll('[data-language]')) button.setAttribute('aria-pressed', String(button.dataset.language === language));
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'aria-label', 'alt', 'title'] });
  };
  for (const button of document.querySelectorAll('[data-language]')) button.addEventListener('click', () => {
    language = button.dataset.language;
    try { localStorage.setItem('qbot.language', language); } catch { /* optional persistence */ }
    render();
  });
  render();
}
