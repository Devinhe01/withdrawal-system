const escpos = require('escpos');
const axios = require('axios');

const BRANCH_ID = process.env.BRANCH_ID || 'headquarters';
const BRANCH_NAME = process.env.BRANCH_NAME || '总部';
const SERVER = process.env.SERVER_URL || 'http://localhost:10000';
const PRINTER_VID = parseInt(process.env.PRINTER_VID || '0x0416', 16);
const PRINTER_PID = parseInt(process.env.PRINTER_PID || '0x5011', 16);
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '10000');

const device = new escpos.USB(PRINTER_VID, PRINTER_PID);
const printer = new escpos.Printer(device);

function amountToChinese(num) {
  const cn = ['零','壹','贰','叁','肆','伍','陆','柒','捌','玖'];
  const unit = ['元','拾','佰','仟','万','拾','佰','仟','亿'];
  const str = Math.floor(num).toString();
  let result = '';
  for (let i = 0; i < str.length; i++) {
    result += cn[parseInt(str[i])] + unit[str.length - 1 - i];
  }
  if (num % 1 !== 0) {
    const dec = Math.round((num % 1) * 100);
    result += cn[Math.floor(dec/10)] + '角' + cn[dec%10] + '分';
  } else {
    result += '整';
  }
  return result;
}

function printReceipt(order) {
  const isWithdraw = order.biz_type === 'withdraw';
  const title = isWithdraw ? '异地取款凭证' : '异地存款凭证';
  const cpLabel = isWithdraw ? '收款人' : '存款人';

  device.open(function() {
    printer
      .init()
      .align('CT')
      .size(2, 2)
      .text(title)
      .size(1, 1)
      .align('LT')
      .text(`单号：${order.order_no}`)
      .text(`日期：${order.submit_time ? order.submit_time.split('T')[0] : ''}`)
      .text(`提交人：${order.submitter_name}`)
      .text('────────────────')
      .text(`${cpLabel}：${order.counterparty_name}`)
      .text(`手机：${order.counterparty_mobile || ''}`);

    if (!isWithdraw && order.counterparty_account) {
      printer.text(`账号：${order.counterparty_account}`);
    }

    printer
      .text(`用途：${order.purpose || ''}`)
      .text(`网点：${order.target_branch}`)
      .text('────────────────')
      .align('CT')
      .text('金额')
      .size(2, 2)
      .text(`¥${order.amount}`)
      .size(1, 1)
      .text(`人民币：${amountToChinese(order.amount)}`)
      .text('────────────────');

    if (order.qr_data) {
      printer.qrCode(order.qr_data, 2, 8);
    }

    printer
      .text('扫码核销 · 一单一码')
      .text('────────────────')
      .text(`有效期至：${order.expire_date}`)
      .text(`打印时间：${new Date().toLocaleString('zh-CN')}`)
      .text(`打印网点：${BRANCH_NAME}`)
      .text('')
      .text('本凭证仅限一次使用')
      .cut()
      .close();

    console.log(`[${BRANCH_NAME}] 已打印: ${order.order_no}`);
  });
}

async function pollAndPrint() {
  try {
    const res = await axios.get(`${SERVER}/api/print/pending?branch=${BRANCH_ID}`);
    if (res.data.orders && res.data.orders.length > 0) {
      for (const order of res.data.orders) {
        try {
          printReceipt(order);
          await axios.post(`${SERVER}/api/print/done`, {
            orderNo: order.order_no,
            branch: BRANCH_ID,
            printUser: BRANCH_NAME
          });
          await new Promise(r => setTimeout(r, 3000));
        } catch (e) {
          console.error(`[${BRANCH_NAME}] 打印失败: ${order.order_no}`, e.message);
        }
      }
    }
  } catch (e) {
    console.log(`[${BRANCH_NAME}] 等待打印任务...`);
  }
}

console.log(`打印服务启动 - 网点: ${BRANCH_NAME} (${BRANCH_ID})`);
console.log(`后端地址: ${SERVER}`);
console.log(`轮询间隔: ${POLL_INTERVAL}ms`);
console.log('---');

setInterval(pollAndPrint, POLL_INTERVAL);
pollAndPrint();
