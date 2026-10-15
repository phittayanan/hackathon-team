// Offline brain: turns what the user said into an agent action:
// { scene, line, say, data, action }.
// scene: which full-screen UI to grow (or null to only talk).
// action: a step inside the open scene, for example 'confirm'.
// Money rule: no spoken text can ever approve a payment. Only the Allow button can.
import { SCENE_DEFAULTS } from '../public/js/data.js';
import { LINES } from '../public/js/lines.js';
import { cannedTodo, cannedFirstAid, reviseByKeywords, validateSpec, TODO_WORDS, URGENT_WORDS } from '../public/js/genui.js';

const has = (text, words) => words.some((w) => text.includes(w));

const YES = ['yes', 'yeah', 'ok', 'okay', 'sure', 'do it', 'change it', 'ใช่', 'โอเค', 'ตกลง', 'เปลี่ยน', 'เอา', 'ได้', 'จัดไป'];
const NO = ['no', 'keep', 'cancel', 'ไม่', 'ยกเลิก', 'คงเดิม'];
const PAY_WORDS = ['allow', 'approve', 'pay', 'confirm payment', 'จ่าย', 'อนุมัติ', 'ชำระ'];

const KEYWORDS = [
  { scene: 'shopping', words: ['hectic', 'busy', 'groceries', 'grocery', 'shopping', 'email', 'ยุ่ง', 'วุ่น', 'ซื้อของ', 'อีเมล', 'เมล'] },
  { scene: 'payment', words: ['pay', 'checkout', 'จ่าย', 'ชำระ', 'เช็คเอาท์'] },
  { scene: 'flight', words: ['flight', 'delay', 'plane', 'เที่ยวบิน', 'ไฟลท์', 'เครื่องบิน', 'ดีเลย์'] },
  { scene: 'training', words: ['run', 'training', 'race', '10k', 'sleep', 'วิ่ง', 'ซ้อม', 'นอน', 'สมัคร'] },
];

const INTRO = { shopping: 'shop_intro', payment: 'pay_ask', flight: 'flight_intro', training: 'train_intro' };

export function sceneReply(scene, data) {
  return { scene, line: INTRO[scene], say: LINES[INTRO[scene]], data: { ...SCENE_DEFAULTS[scene], ...(data || {}) } };
}

const speakLine = (line, extra = {}) => ({ scene: null, line, say: LINES[line], ...extra });

// A saved scene the user kept earlier opens at once, with no new generation.
function savedMatch(text, saved) {
  const hit = (Array.isArray(saved) ? saved : []).find((s) => Array.isArray(s?.match) && s.match.some((w) => w && text.includes(String(w).toLowerCase())));
  return hit ? { scene: 'generated', line: 'gen_saved', say: LINES.gen_saved, data: { savedKind: String(hit.kind) }, via: 'saved' } : null;
}

// Talk about the generated page that is open: revise it, keep it, or close it.
function generatedAction(text, { spec, stage } = {}) {
  // An urgent page is never reviewed or kept: a new sentence is a new request.
  if (stage === 'urgent' || (spec && spec.urgency && spec.urgency !== 'none')) {
    const fresh = keywordRoute(text, null);
    return fresh.scene || fresh.line !== 'unsure' ? fresh : speakLine('get_well', { action: 'close' });
  }
  if (stage === 'keep') {
    if (has(text, ['no', "don't", 'not', 'ไม่'])) return speakLine('gen_not_kept', { action: 'close' });
    if (has(text, [...YES, 'keep', 'save', 'เก็บ'])) return speakLine('gen_kept', { action: 'keep' });
    return speakLine('gen_keep_ask', { action: 'ask' });
  }
  const current = validateSpec(spec);
  if (!current) return speakLine('gen_what', { action: 'ask' });
  const r = reviseByKeywords({ ...current, applied: spec.applied || [] }, text);
  if (r.action === 'revise') return speakLine('gen_revised', { action: 'revise', spec: r.spec });
  if (r.action === 'accept') return speakLine('gen_keep_ask', { action: 'accept' });
  return speakLine('gen_what', { action: 'ask' });
}

export function keywordRoute(rawText, context = null, extra = {}) {
  const text = String(rawText || '').toLowerCase().trim();
  if (!text) return { scene: null, line: 'unsure', say: LINES.unsure };
  if (context === 'generated') return generatedAction(text, extra);
  // Health, injury or emergency comes first: first-aid steps at once.
  if (has(text, URGENT_WORDS)) return { scene: 'generated', line: 'first_aid', say: LINES.first_aid, data: { spec: cannedFirstAid() } };
  if (has(text, ['หาสินค้า', 'ค้นสินค้า', 'หาหูฟัง', 'เปรียบเทียบราคา', 'find products', 'find headphones', 'compare prices'])) {
    const budget = text.match(/(?:งบ(?:ไม่เกิน)?|ไม่เกิน)\s*([\d,]+)/);
    return { scene: 'shopping', say: 'จะค้นสินค้าจาก Shopify มาให้เลือกค่ะ', data: { catalog: true, query: String(rawText).slice(0, 250), ...(budget ? { budget: Number(budget[1].replaceAll(',', '')) } : {}) } };
  }
  if (context === 'secretary') {
    const action = has(text, ['ร่าง', 'draft']) ? 'draft'
      : has(text, ['เพิ่มงาน', 'add task']) ? 'add_tasks'
        : has(text, ['เลื่อนเตือน', 'เตือนอีก', 'snooze']) ? 'snooze'
          : has(text, ['ทราบแล้ว', 'รับทราบ', 'dismiss']) ? 'acknowledge' : null;
    if (action) return { scene: null, action, minutes: /5|ห้า|five/.test(text) ? 5 : 1, say: null };
    if (has(text, ['ส่ง', 'send'])) return { scene: null, say: 'ตรวจร่างแล้วกดปุ่มส่งข้อความทดสอบได้เลยค่ะ' };
  }
  if (has(text, ['สรุปวันนี้', 'ตารางวันนี้', 'วันนี้ต้องทำอะไร', 'daily brief', 'today schedule'])) {
    return { scene: 'secretary', say: 'นี่คือตารางและงานวันนี้จากข้อมูลทดสอบค่ะ', data: { view: 'today' } };
  }
  if (has(text, ['เมลเป็นงาน', 'งานจากอีเมล', 'จัดการเมล', 'email to task'])) {
    return { scene: 'secretary', say: 'อีเมลตัวอย่างมีงานสองอย่างและนัดที่อยู่ในตารางแล้วค่ะ', data: { view: 'email' } };
  }

  // Inside an open scene, short answers act on that scene.
  if (context === 'payment' && has(text, PAY_WORDS.concat(YES))) {
    return { scene: null, action: 'button-only', line: 'pay_button_only', say: LINES.pay_button_only };
  }
  if (context === 'flight') {
    if (has(text, NO)) return { scene: null, action: 'decline', line: 'flight_keep', say: LINES.flight_keep };
    if (has(text, YES)) return { scene: null, action: 'confirm', line: null, say: null };
  }
  if (context === 'shopping' && has(text, YES)) return { scene: null, action: 'confirm', line: null, say: null };

  for (const { scene, words } of KEYWORDS) {
    if (has(text, words)) return sceneReply(scene);
  }
  const saved = savedMatch(text, extra.saved);
  if (saved) return saved;
  // No prebuilt scene fits: without a model, a todo request gets one canned generated page.
  if (has(text, TODO_WORDS)) return { scene: 'generated', line: 'gen_todo', say: LINES.gen_todo, data: { spec: cannedTodo(), ask: 'gen_ask' } };
  return { scene: null, line: 'unsure', say: LINES.unsure };
}

// Without the ElevenLabs agent (no key or no agent id), this keyword router is the brain.
// With the agent, the agent drives the UI through client tools in the browser (public/js/live-agent.js).
export async function route(text, context, extra = {}) {
  // A kept page opens at once, with no generation.
  if (!context) {
    const saved = savedMatch(String(text || '').toLowerCase(), extra.saved);
    if (saved) return saved;
  }
  return { via: 'keywords', ...keywordRoute(text, context, extra) };
}
