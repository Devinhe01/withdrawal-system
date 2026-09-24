const axios = require('axios');

const WEBHOOK = process.env.WEWORK_WEBHOOK || '';

async function notifyGroup(content) {
  if (!WEBHOOK) { console.log('[notify] No webhook configured'); return; }
  try {
    await axios.post(WEBHOOK, {
      msgtype: 'markdown',
      markdown: { content }
    });
  } catch (e) {
    console.error('[notify] Failed:', e.message);
  }
}

module.exports = { notifyGroup };
