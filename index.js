/*
╔══════════════════════════════════════════════╗
║ ⚠️  PERINGATAN PENTING                       ║
║ ❌ Script ini TIDAK BOLEH DIPERJUALBELIKAN!  ║
╠══════════════════════════════════════════════╣
║ 🛠️ Version   : 1.1                           ║
║ 👨‍💻 Developer : AbuZy Creative                ║
║ 🌐 Website   : t.me/abuzycreative            ║
║ 💻 GitHub    : github.com/PrabuSA123/        ║
╠══════════════════════════════════════════════╣
║ 📌 Open Source mulai 13 Januari 2026         ║
║ 🔗 Bisa digunakan GRATIS & untuk edukasi     ║
╚══════════════════════════════════════════════╝
*/

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const QRCode = require('qrcode');
const fs = require('fs');
const config = require('./config');
const bot = new TelegramBot(config.BOT_TOKEN, { polling: true });
const BOT_START_TIME = new Date();

const DUIT_FILE = './duit.json';
const USERS_FILE = './users.json';
const loadingMessages = {};
const activeChecks = {};

// =========================
// BOT START TIME
// =========================
function getUptime() {
  const diff = Date.now() - BOT_START_TIME;

  const detik = Math.floor(diff / 1000) % 60;
  const menit = Math.floor(diff / (1000 * 60)) % 60;
  const jam = Math.floor(diff / (1000 * 60 * 60));

  return `${jam} jam ${menit} menit ${detik} detik`;
}

// =========================
// KIRIM INFO BOT START KE USER
// =========================
const users = loadUsers();

for (const userId of users) {
  bot.sendMessage(
    userId,
`🤖 *BOT QRIS AKTIF*

🟢 Status: *ONLINE*
⏱ Uptime: *0 detik*
🕒 Start: ${BOT_START_TIME.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}

Ketik /uptime untuk cek durasi terbaru`,

    { parse_mode: 'Markdown' }
  ).catch(() => {});
}

// =========================
// /uptime
// =========================
bot.onText(/\/uptime/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `⏱ *BOT UPTIME*\n\n🟢 ${getUptime()}`,
    { parse_mode: 'Markdown' }
  );
});


/* =========================
   LOAD & SAVE USER
   ========================= */
function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return [];
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

/* =========================
   SIMPAN USER OTOMATIS
   ========================= */
bot.on('message', (msg) => {
  if (!msg.from) return;

  const userId = String(msg.from.id); // SIMPAN STRING
  let users = loadUsers();

  // jangan simpan owner
  if (userId === config.OWNER_ID) return;

  if (!users.includes(userId)) {
    users.push(userId);
    saveUsers(users);

    // notif ke owner
    bot.sendMessage(
      config.OWNER_ID,
      `👤 *User baru akses bot*\n🆔 ID: \`${userId}\``,
      { parse_mode: 'Markdown' }
    );
  }
});

/* =========================
   BROADCAST (OWNER ONLY)
   ========================= */
bot.onText(/\/bc (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;

  // CEK OWNER (STRING)
  if (String(msg.from.id) !== config.OWNER_ID) {
    return bot.sendMessage(chatId, '❌ Akses ditolak');
  }

  const text = match[1];
  const users = loadUsers();

  let success = 0;
  let failed = 0;

  for (const userId of users) {
    try {
      await bot.sendMessage(
        userId,
        `📢 *Pengumuman*\n\n${text}`,
        { parse_mode: 'Markdown' }
      );
      success++;
    } catch (err) {
      failed++;
    }
  }

  bot.sendMessage(
    chatId,
    `✅ *Broadcast selesai*\n📨 Terkirim: *${success}*\n❌ Gagal: *${failed}*`,
    { parse_mode: 'Markdown' }
  );
});


/* =====================
   UTIL
===================== */
function generateOrderId() {
  return `DEP${Date.now()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
}

const rupiah = n => n.toLocaleString('id-ID');

function loadSaldo() {
  if (!fs.existsSync(DUIT_FILE)) return {};
  return JSON.parse(fs.readFileSync(DUIT_FILE));
}

function saveSaldo(data) {
  fs.writeFileSync(DUIT_FILE, JSON.stringify(data, null, 2));
}

function getSaldo(telegramId) {
  const data = loadSaldo();
  return data[telegramId]?.saldo || 0;
}

function tambahSaldo(telegramId, amount) {
  const data = loadSaldo();
  if (!data[telegramId]) data[telegramId] = { saldo: 0 };
  data[telegramId].saldo += amount;
  saveSaldo(data);
}

/* =========================
   /deposit (TANPA JUMLAH)
========================= */
bot.onText(/^\/deposit$/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
`💸 *Cara Melakukan Deposit*

Ketik:
/deposit <jumlah>

Contoh:
/deposit 10000

Minimal deposit: *Rp1.000*`,
    { parse_mode: 'Markdown' }
  );
});

/* =========================
   /deposit <jumlah>
========================= */
bot.onText(/\/deposit (\d+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id;
  const amount = parseInt(match[1]);

  if (amount < 1000) {
    return bot.sendMessage(chatId, '❌ Minimal deposit Rp1.000');
  }

  const order_id = generateOrderId();

  // Pesan loading
  const loadingMsg = await bot.sendMessage(
    chatId,
    '⏳ Membuat QRIS pembayaran...'
  );
  loadingMessages[order_id] = loadingMsg.message_id;

  try {
    const res = await axios.post(
      'https://app.pakasir.com/api/transactioncreate/qris',
      {
        project: config.PAKASIR_PROJECT,
        order_id,
        amount,
        api_key: config.PAKASIR_API_KEY
      }
    );

    const pay = res.data.payment;
    const admin = pay.total_payment - pay.amount;
    const qrImage = await QRCode.toBuffer(pay.payment_number);

    const qrMsg = await bot.sendPhoto(chatId, qrImage, {
      caption:
`🏦 *QRIS PAYMENT OTOMATIS ABUZY* 🏦
━━━━━━━━━━━━━━━━━━━━━
🧾 *ID Pembayaran:* ${order_id}
💰 *Jumlah Deposit:* Rp${rupiah(amount)}
🧾 *Biaya Admin:* Rp${rupiah(admin)}
💳 *Total Pembayaran:* Rp${rupiah(pay.total_payment)}
⏰ *Masa Aktif:* 60 Menit`,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '❌ Batalkan Pembayaran', callback_data: `cancel_${order_id}` }]
        ]
      }
    });

    // Hapus loading
    await bot.deleteMessage(chatId, loadingMessages[order_id]).catch(() => {});
    delete loadingMessages[order_id];

    /* =====================
       DEV MODE (AUTO PAID)
    ===================== */
    if (config.DEV_MODE) {
      setTimeout(async () => {
        tambahSaldo(telegramId, amount);
        await bot.deleteMessage(chatId, qrMsg.message_id).catch(() => {});
        await bot.sendMessage(
          chatId,
          `✅ *Deposit Berhasil!*\n💰 Saldo bertambah Rp${rupiah(amount)}`,
          { parse_mode: 'Markdown' }
        );
      }, 5000);
      return;
    }

    /* =====================
       REAL MODE (CEK STATUS)
    ===================== */
    activeChecks[order_id] = setInterval(async () => {
      try {
        const statusRes = await axios.post(
          'https://app.pakasir.com/api/transactionstatus',
          {
            project: config.PAKASIR_PROJECT,
            order_id,
            api_key: config.PAKASIR_API_KEY
          }
        );

        const status = statusRes.data.status;
        if (status === 'PAID' || status === 'SUCCESS') {
          clearInterval(activeChecks[order_id]);
          delete activeChecks[order_id];

          tambahSaldo(telegramId, amount);

          await bot.deleteMessage(chatId, qrMsg.message_id).catch(() => {});
          await bot.sendMessage(
            chatId,
            `✅ *Deposit Berhasil!*\n💰 Saldo bertambah Rp${rupiah(amount)}`,
            { parse_mode: 'Markdown' }
          );
        }
      } catch (e) {
        console.log('Cek status error:', e.message);
      }
    }, 5000);

  } catch (err) {
    await bot.deleteMessage(chatId, loadingMessages[order_id]).catch(() => {});
    delete loadingMessages[order_id];
    bot.sendMessage(chatId, '❌ Gagal membuat QRIS');
  }
});

/* =========================
   TOMBOL BATAL
========================= */
bot.on('callback_query', async (q) => {
  if (!q.data.startsWith('cancel_')) return;

  const orderId = q.data.replace('cancel_', '');
  const chatId = q.message.chat.id;

  await bot.deleteMessage(chatId, q.message.message_id).catch(() => {});

  if (activeChecks[orderId]) {
    clearInterval(activeChecks[orderId]);
    delete activeChecks[orderId];
  }

  await bot.sendMessage(chatId, '❌ Transaksi dibatalkan');
  await bot.answerCallbackQuery(q.id);
});

/* =========================
   /saldo
========================= */
bot.onText(/\/saldo/, (msg) => {
  const saldo = getSaldo(msg.from.id);
  bot.sendMessage(
    msg.chat.id,
    `💰 *Saldo kamu:* Rp${rupiah(saldo)}`,
    { parse_mode: 'Markdown' }
  );
});

console.log('🤖 BOT QRIS BY ABUZY BERJALAN DENGAN LANCAR BOSKU');

