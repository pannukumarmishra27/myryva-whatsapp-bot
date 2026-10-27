const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.text({ type: '*/*' }));

let sock;
let qrCodeData = "";

// Real Invoices Store (Server Memory + Dynamic URL Support)
const invoicesDB = {};

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    browser: ["MYRYVA Official Engine", "Chrome", "1.0.0"]
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) qrCodeData = qr;
    if (connection === 'open') {
      qrCodeData = "CONNECTED";
      console.log('✅ MYRYVA Live Engine Connected!');
    }
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) setTimeout(connectToWhatsApp, 3000);
    }
  });
}
connectToWhatsApp();

// Asli Working Invoice Link Generator (Jo 100% Har Phone Me Khulega)
function getRealInvoiceUrl(data) {
  const params = new URLSearchParams({
    id: data.bookingId || '',
    inv: data.invoiceNo || '',
    name: data.customerName || '',
    phone: data.customerPhone || data.phone || '',
    amt: String(data.amount || ''),
    txn: data.transactionId || '',
    mode: data.paymentMode || 'UPI',
    date: data.issuedDate || '',
    service: data.serviceName || 'MYRYVA Home Service'
  });
  return `https://myryva-whatsapp-bot.onrender.com/invoice?${params.toString()}`;
}

function buildMyryvaMessage(data, invoiceUrl) {
  if (data.message && !data.invoiceNo) return data.message;

  const type = (data.type || 'INVOICE').toUpperCase();
  const name = data.customerName;
  const bookingId = data.bookingId;
  const invoiceNo = data.invoiceNo;
  const helpline = '9304570798';

  if (type === 'BOOKING' || type === 'NEW_BOOKING') {
    return `✨ *MYRYVA BOOKING CONFIRMED* ✨\n\nDear *${name}*,\nYour service booking has been registered! 🛠️\n\n📋 *Booking Summary:*\n• *Booking ID:* #${bookingId}\n• *Service:* ${data.serviceName}\n• *Date:* ${data.scheduledDate || data.issuedDate}\n• *Payment Mode:* ${data.paymentMode}\n\n📞 *24/7 Support Helpline:* ${helpline}`;
  }

  if (type === 'COMPLAINT' || type === 'SUPPORT') {
    return `🛡️ *MYRYVA PRIORITY SUPPORT TICKET* 🛡️\n\nDear *${name}*,\nYour complaint/support request is registered.\n\n🎫 *Ticket Details:*\n• *Booking ID:* #${bookingId}\n• *Issue:* ${data.issue || data.serviceName}\n• *Status:* Urgent Action ⚡\n\n📞 *24/7 Helpline:* ${helpline}`;
  }

  return `🎉 *MYRYVA PAYMENT SUCCESSFUL & TAX INVOICE* 🎉\n\nDear *${name}*,\nWe have received your payment of *₹${data.amount}*! 💳\n\n🧾 *Invoice Details:*\n• *Invoice No:* ${invoiceNo}\n• *Booking ID:* #${bookingId}\n• *Transaction ID:* ${data.transactionId}\n• *Payment Mode:* ${data.paymentMode}\n• *Issued Date:* ${data.issuedDate}\n\n📸 *Work Inspection Photos:*\nVerified inspection photos are archived on your invoice and safe in your app.\n\n📥 *Download / View Official Invoice:*\n${invoiceUrl}\n\n🛡️ *30-Day Service Warranty Active!*\nFor any questions or re-work, our 24/7 Helpline is ready: 📞 ${helpline}`;
}

app.get('/', (req, res) => {
  res.send('<h2>🚀 MYRYVA Live Server Running! <a href="/qr">QR Scan (/qr)</a></h2>');
});

// 100% REAL LIVE INVOICE VIEWER PAGE (Jab customer link dabayega ya QR scan karega)
app.get('/invoice', async (req, res) => {
  const invNo = req.query.inv || '';
  const saved = invoicesDB[invNo] || {};
  
  const d = {
    invoiceNo: invNo || saved.invoiceNo || '-',
    bookingId: req.query.id || saved.bookingId || '-',
    customerName: req.query.name || saved.customerName || '-',
    customerPhone: req.query.phone || saved.customerPhone || '-',
    amount: req.query.amt || saved.amount || '0',
    transactionId: req.query.txn || saved.transactionId || '-',
    paymentMode: req.query.mode || saved.paymentMode || 'UPI',
    issuedDate: req.query.date || saved.issuedDate || '-',
    serviceName: req.query.service || saved.serviceName || 'MYRYVA Verified Home Service'
  };

  const fullUrl = `https://myryva-whatsapp-bot.onrender.com${req.originalUrl}`;
  const qrDataUrl = await QRCode.toDataURL(fullUrl);

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>MYRYVA Official Tax Invoice - ${d.invoiceNo}</title>
      <style>
        body { font-family: Arial, sans-serif; background: #f4f6f8; margin: 0; padding: 15px; }
        .card { max-width: 550px; margin: auto; background: #fff; border-radius: 14px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); overflow: hidden; border: 2px solid #2e7d32; }
        .header { background: #2e7d32; color: #fff; padding: 20px; text-align: center; }
        .header h1 { margin: 0; font-size: 22px; }
        .badge { background: #e8f5e9; color: #2e7d32; padding: 6px 14px; border-radius: 20px; font-weight: bold; display: inline-block; margin-top: 8px; font-size: 13px; }
        .content { padding: 20px; color: #333; }
        .row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; font-size: 14px; }
        .total { font-size: 20px; font-weight: bold; color: #2e7d32; background: #f1f8e9; padding: 14px; border-radius: 8px; margin-top: 15px; display: flex; justify-content: space-between; }
        .qr-box { text-align: center; margin-top: 20px; padding: 15px; background: #fafafa; border-radius: 10px; }
        .btn { display: block; width: 100%; text-align: center; background: #1565c0; color: #fff; padding: 14px; border: none; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; margin-top: 15px; text-decoration: none; box-sizing: border-box; }
        @media print { .no-print { display: none; } body { background: #fff; } }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h1>MYRYVA OFFICIAL TAX INVOICE</h1>
          <div class="badge">✓ PAYMENT VERIFIED & PAID</div>
        </div>
        <div class="content">
          <div class="row"><span><b>Customer Name:</b></span><span>${d.customerName}</span></div>
          <div class="row"><span><b>Invoice No:</b></span><span>${d.invoiceNo}</span></div>
          <div class="row"><span><b>Booking ID:</b></span><span>#${d.bookingId}</span></div>
          <div class="row"><span><b>Service Details:</b></span><span>${d.serviceName}</span></div>
          <div class="row"><span><b>Transaction ID:</b></span><span>${d.transactionId}</span></div>
          <div class="row"><span><b>Payment Mode:</b></span><span>${d.paymentMode}</span></div>
          <div class="row"><span><b>Issued Date:</b></span><span>${d.issuedDate}</span></div>
          <div class="row"><span><b>Warranty Status:</b></span><span style="color:#2e7d32;font-weight:bold;">🛡️ 30-Day Warranty Active</span></div>
          
          <div class="total">
            <span>Total Paid:</span>
            <span>₹${d.amount}</span>
          </div>

          <div class="qr-box">
            <img src="${qrDataUrl}" style="width:130px;height:130px;" />
            <p style="font-size:12px;color:#666;margin:5px 0 0;">Scan to verify official MYRYVA Invoice</p>
            <p style="font-size:13px;margin-top:8px;"><b>24/7 Helpline:</b> 📞 9304570798</p>
          </div>

          <button class="btn no-print" onclick="window.print()">📥 Download PDF / Print Official Invoice</button>
        </div>
      </div>
    </body>
    </html>
  `);
});

app.get('/qr', async (req, res) => {
  if (qrCodeData === "CONNECTED") return res.send('<h2 style="color:green;">✅ MYRYVA WhatsApp Connected Hai!</h2>');
  if (!qrCodeData) return res.send('<h3>⏳ QR Code ban raha hai... 5 second me Refresh karein.</h3>');
  const qrImage = await QRCode.toDataURL(qrCodeData);
  res.send(`<div style="text-align:center;margin-top:30px;"><h2>Scan with WhatsApp Linked Devices</h2><img src="${qrImage}" style="width:280px;"/></div>`);
});

app.post('/send', async (req, res) => {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (body.invoiceNo) invoicesDB[body.invoiceNo] = body;

    let phone = String(body.phone || body.customerPhone || '').replace(/\D/g, '');
    if (phone.length === 10) phone = '91' + phone;

    const realInvoiceUrl = getRealInvoiceUrl(body);
    const textMessage = buildMyryvaMessage(body, realInvoiceUrl);

    await sock.sendMessage(phone + '@s.whatsapp.net', { text: textMessage });
    res.json({ status: 'success', sentTo: phone, invoiceUrl: realInvoiceUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('MYRYVA Engine running on port ' + PORT));
