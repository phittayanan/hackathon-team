// Pictures for generated pages: a fixed set made ahead of time (agy, flat pastel style, no text),
// stored in public/pics/. A page's picture prompt picks one by keyword; no match gets the default.
// No ElevenLabs call, no key, no cost: before this the ElevenLabs image API used ~18% of the credit.
export const PICTURES = [
  { name: 'groceries', words: ['grocer', 'food', 'vegetable', 'fruit', 'cook', 'recipe', 'meal', 'market', 'ingredient', 'kitchen', 'อาหาร', 'ผัก', 'ผลไม้', 'ทำกับข้าว', 'ของสด'] },
  { name: 'running', words: ['run', 'race', 'marathon', 'jog', 'training', 'sport', 'fitness', 'exercise', 'วิ่ง', 'ซ้อม', 'มาราธอน', 'ออกกำลัง'] },
  { name: 'travel', words: ['flight', 'plane', 'airport', 'travel', 'trip', 'beach', 'holiday', 'vacation', 'island', 'เที่ยวบิน', 'เครื่องบิน', 'สนามบิน', 'เที่ยว', 'ทะเล'] },
  { name: 'money', words: ['pay', 'money', 'budget', 'wallet', 'bank', 'card', 'invoice', 'bill', 'saving', 'price', 'crypto', 'จ่าย', 'เงิน', 'งบ', 'บัตร', 'ราคา'] },
  { name: 'shopping', words: ['shop', 'buy', 'bag', 'store', 'gift', 'order', 'cart', 'ซื้อ', 'ร้าน', 'ของขวัญ'] },
  { name: 'calendar', words: ['calendar', 'meeting', 'schedule', 'appointment', 'plan', 'event', 'week', 'agenda', 'นัด', 'ประชุม', 'ตาราง', 'ปฏิทิน'] },
  { name: 'mail', words: ['mail', 'email', 'inbox', 'letter', 'message', 'อีเมล', 'จดหมาย', 'ข้อความ'] },
  { name: 'city', words: ['city', 'hotel', 'map', 'restaurant', 'cafe', 'coffee', 'street', 'place', 'โรงแรม', 'ร้านกาแฟ', 'เมือง', 'แผนที่'] },
  { name: 'health', words: ['health', 'doctor', 'medicine', 'sleep', 'yoga', 'water', 'wellness', 'สุขภาพ', 'หมอ', 'ยา', 'นอน'] },
];
export const DEFAULT_PICTURE = 'default';

export const cleanPrompt = (p) => String(p || '').replace(/\s+/g, ' ').trim().slice(0, 200);

// The picture with the most keyword hits wins; ties go to the earlier entry.
export function pickPicture(prompt) {
  const text = cleanPrompt(prompt).toLowerCase();
  let best = DEFAULT_PICTURE;
  let bestHits = 0;
  for (const { name, words } of PICTURES) {
    const hits = words.filter((w) => text.includes(w)).length;
    if (hits > bestHits) [best, bestHits] = [name, hits];
  }
  return best;
}

export const pictureUrl = (name) => `/pics/${name}.png`;

// Same shape as the old ElevenLabs service, so handlers and routes stay as they were.
export function createImageService() {
  return {
    file: () => null,
    unavailable: () => null,
    async get(rawPrompt) {
      if (!cleanPrompt(rawPrompt)) return { error: 'empty prompt' };
      return { url: pictureUrl(pickPicture(rawPrompt)) };
    },
  };
}
