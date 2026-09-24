const QRCode = require('qrcode');
const crypto = require('crypto');

const SECRET = process.env.QR_SECRET || 'change-this-to-a-random-secret-key-1234567890';

async function generateQR(order) {
  const ts = Math.floor(Date.now() / 1000);
  const payload = {
    t: order.biz_type,
    o: order.order_no,
    a: order.amount.toString(),
    n: order.counterparty_name,
    b: order.target_branch,
    e: order.expire_date,
    ts: ts
  };

  const raw = `${payload.t}|${payload.o}|${payload.a}|${payload.n}|${payload.b}|${payload.e}|${payload.ts}`;
  const sign = crypto.createHmac('sha256', SECRET)
    .update(raw).digest('hex').substring(0, 16);
  payload.s = sign;

  const qrContent = JSON.stringify(payload);
  const qrImage = await QRCode.toDataURL(qrContent, {
    width: 300, margin: 1, errorCorrectionLevel: 'M'
  });

  return { qrContent, qrImage, sign };
}

function verifyQR(qrContent) {
  try {
    const d = JSON.parse(qrContent);
    const raw = `${d.t}|${d.o}|${d.a}|${d.n}|${d.b}|${d.e}|${d.ts}`;
    const expected = crypto.createHmac('sha256', SECRET)
      .update(raw).digest('hex').substring(0, 16);
    return { valid: expected === d.s, data: d };
  } catch {
    return { valid: false, data: null };
  }
}

module.exports = { generateQR, verifyQR };
