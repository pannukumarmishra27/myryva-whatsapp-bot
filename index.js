const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');
const https = require('https');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.text({ type: '*/*' }));

const SERVER_URL = "https://myryva-whatsapp-bot.onrender.com";
let sock;
let qrCodeData = "";
let isConnecting = false;
const invoicesDB = {};
const messageLogs = [];

// 1. PERMANENT WHATSAPP CONNECTION (ANTI-DISCONNECT ENGINE)
async function connectToWhatsApp() {
  if (isConnecting) return;
  isConnecting = true;
  try {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: true,
      browser: ["MYRYVA Cloud Server", "Chrome", "2.0.0"],
      keepAliveIntervalMs: 25000,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      syncFullHistory: false,
      markOnlineOnConnect: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) qrCodeData = qr;
      if (connection === 'open') {
        qrCodeData = "CONNECTED";
        isConnecting = false;
        console.log('✅ MYRYVA Permanent WhatsApp Connected!');
      }
      if (connection === 'close') {
        isConnecting = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        console.log('Connection closed with code:', statusCode);
        if (statusCode !== DisconnectReason.loggedOut) {
          setTimeout(connectToWhatsApp, 4000);
        } else {
          qrCodeData = "";
        }
      }
    });
  } catch (e) {
    isConnecting = false;
    setTimeout(connectToWhatsApp, 5000);
  }
}
connectToWhatsApp();

// Self-Ping every 4 minutes so Render Free Server NEVER sleeps or disconnects WhatsApp
setInterval(() => {
  https.get(SERVER_URL + "/health", () => {}).on('error', () => {});
}, 240000);

app.get('/health', (req, res) => res.json({ status: "alive", whatsapp: qrCodeData === "CONNECTED" }));

function getRealInvoiceUrl(data) {
  const params = new URLSearchParams({
    id: data.bookingId || '',
    inv: data.invoiceNo || ('MYR-INV-' + String(data.bookingId || '000').slice(-5)),
    name: data.customerName || '',
    phone: data.customerPhone || data.phone || '',
    amt: String(data.amount || '0'),
    txn: data.transactionId || 'N/A',
    mode: data.paymentMode || 'UPI',
    date: data.issuedDate || new Date().toLocaleString('en-IN'),
    service: data.serviceName || 'MYRYVA Home Service',
    status: data.type || data.status || 'PAID'
  });
  return `${SERVER_URL}/invoice?${params.toString()}`;
}

// Generate Real PDF Buffer in Memory for WhatsApp Attachment
function generateInvoicePDFBuffer(d) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => resolve(Buffer.concat(buffers)));

    doc.rect(0, 0, 600, 95).fill('#1b5e20');
    doc.fillColor('#ffffff').fontSize(22).text('MYRYVA OFFICIAL TAX INVOICE', 40, 30, { align: 'center' });
    doc.fontSize(11).text('24/7 Helpline: 9304570798 | Verified Home Service Ecosystem', 40, 60, { align: 'center' });

    doc.fillColor('#111111').fontSize(13).text(`Invoice No: ${d.invoiceNo}`, 40, 120);
    doc.text(`Booking ID: #${d.bookingId}`, 40, 142);
    doc.text(`Issued Date: ${d.issuedDate}`, 40, 164);
    doc.text(`Status: ${d.status}`, 380, 120);

    doc.moveTo(40, 195).lineTo(555, 195).stroke('#cccccc');

    doc.fontSize(13).text(`Customer Name: ${d.customerName}`, 40, 215);
    doc.text(`Customer Phone: ${d.customerPhone || '-'}`, 40, 237);
    doc.text(`Service Booked: ${d.serviceName}`, 40, 259);
    doc.text(`Payment Mode: ${d.paymentMode}`, 40, 281);
    doc.text(`Transaction ID: ${d.transactionId}`, 40, 303);

    doc.rect(40, 340, 515, 50).fill('#e8f5e9');
    doc.fillColor('#1b5e20').fontSize(18).text(`Total Amount: Rs. ${d.amount}`, 55, 357);

    doc.fillColor('#333333').fontSize(11).text('30-Day Service Warranty Active! Verified inspection photos are archived in your MYRYVA App.', 40, 420);
    doc.end();
  });
}

// Status-Aware Message Builder (Booked, In-Progress, Paid, Cancelled, Refunded)
function buildMyryvaMessage(data, invoiceUrl) {
  const type = (data.type || data.status || 'INVOICE').toUpperCase();
  const name = data.customerName || 'Customer';
  const bookingId = data.bookingId || 'N/A';
  const invoiceNo = data.invoiceNo || ('MYR-INV-' + String(bookingId).slice(-5));
  const service = data.serviceName || 'MYRYVA Home Service';
  const helpline = '9304570798';
  const appOpenUrl = `${invoiceUrl}&openApp=1`;

  if (type.includes('BOOK')) {
    return `✨ *MYRYVA BOOKING CONFIRMED* ✨\n\nDear *${name}*,\nYour booking has been successfully confirmed! 🛠️\n\n📋 *Booking Details:*\n• *Booking ID:* #${bookingId}\n• *Service:* ${service}\n• *Date:* ${data.issuedDate || 'Today'}\n• *Status:* Booking Confirmed ✅\n\n📲 *Open Directly in MYRYVA App:*\n${appOpenUrl}\n\n📞 *24/7 Helpline:* ${helpline}`;
  }

  if (type.includes('PROGRESS') || type.includes('WORK')) {
    return `🛠️ *MYRYVA WORK IN PROGRESS* 🛠️\n\nDear *${name}*,\nYour service for Booking *#${bookingId}* (*${service}*) is currently *In Progress*.\n\n• *Work Status:* Ongoing ⚙️\n• *Payment Status:* ${data.paymentMode || 'Pending / Pay on Completion'}\n\n📲 *Track Live in MYRYVA App:*\n${appOpenUrl}\n\n📞 *24/7 Helpline:* ${helpline}`;
  }

  if (type.includes('CANCEL')) {
    return `❌ *MYRYVA BOOKING CANCELLED* ❌\n\nDear *${name}*,\nYour Booking *#${bookingId}* (*${service}*) has been cancelled.\n\n• *Booking ID:* #${bookingId}\n• *Status:* Cancelled ❌\n• *Date:* ${data.issuedDate || new Date().toLocaleString('en-IN')}\n\nIf this was a mistake or you wish to reschedule, open the app:\n${appOpenUrl}\n\n📞 *24/7 Helpline:* ${helpline}`;
  }

  if (type.includes('REFUND')) {
    return `💸 *MYRYVA REFUND UPDATE* 💸\n\nDear *${name}*,\nYour refund of *₹${data.amount || 0}* for Booking *#${bookingId}* has been initiated/processed! 🏦\n\n• *Booking ID:* #${bookingId}\n• *Refund Amount:* ₹${data.amount || 0}\n• *Ref / TXN ID:* ${data.transactionId || 'REF_' + Date.now().toString().slice(-6)}\n\n📥 *View Refund Receipt:*\n${invoiceUrl}\n\n📞 *24/7 Helpline:* ${helpline}`;
  }

  return `🎉 *MYRYVA PAYMENT SUCCESSFUL & TAX INVOICE* 🎉\n\nDear *${name}*,\nWe have received your payment of *₹${data.amount || 0}*! 💳\n\n🧾 *Invoice Details:*\n• *Invoice No:* ${invoiceNo}\n• *Booking ID:* #${bookingId}\n• *Service:* ${service}\n• *Transaction ID:* ${data.transactionId || 'N/A'}\n• *Payment Mode:* ${data.paymentMode || 'UPI'}\n• *Issued Date:* ${data.issuedDate || new Date().toLocaleString('en-IN')}\n\n📸 *Work Inspection Photos:*\nVerified inspection photos are archived on your invoice and safe in your app.\n\n📥 *Download / View Official Invoice & Open App:*\n${invoiceUrl}\n\n🛡️ *30-Day Service Warranty Active!*\nFor any questions or re-work, our 24/7 Helpline is ready: 📞 ${helpline}`;
}

// UNIFIED INVOICE PAGE WITH REAL 1-CLICK PDF DOWNLOAD (`html2pdf.js`) & APP DEEP LINK
app.get('/invoice', async (req, res) => {
  const invNo = req.query.inv || 'MYR-INV';
  const saved = invoicesDB[invNo] || {};

  const d = {
    invoiceNo: invNo,
    bookingId: req.query.id || saved.bookingId || '-',
    customerName: req.query.name || saved.customerName || 'Valued Customer',
    customerPhone: req.query.phone || saved.customerPhone || '-',
    amount: req.query.amt || saved.amount || '0',
    transactionId: req.query.txn || saved.transactionId || '-',
    paymentMode: req.query.mode || saved.paymentMode || 'UPI',
    issuedDate: req.query.date || saved.issuedDate || new Date().toLocaleDateString('en-IN'),
    serviceName: req.query.service || saved.serviceName || 'MYRYVA Verified Home Service',
    status: (req.query.status || saved.type || 'PAID').toUpperCase()
  };

  const fullUrl = `${SERVER_URL}${req.originalUrl}`;
  const qrDataUrl = await QRCode.toDataURL(fullUrl);
  const deepLink = `intent://invoice?id=${d.bookingId}&inv=${d.invoiceNo}#Intent;scheme=myryva;package=com.myryva.customer;end`;

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>MYRYVA Invoice - ${d.invoiceNo}</title>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; background: #eef2f6; margin: 0; padding: 12px; }
        .invoice-box { max-width: 520px; margin: auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.12); border: 2px solid #1b5e20; }
        .header { background: linear-gradient(135deg, #1b5e20, #2e7d32); color: #fff; padding: 22px; text-align: center; }
        .header h1 { margin: 0; font-size: 20px; letter-spacing: 0.5px; }
        .badge { background: #fff; color: #1b5e20; padding: 5px 14px; border-radius: 20px; font-weight: bold; display: inline-block; margin-top: 8px; font-size: 12px; }
        .body { padding: 20px; color: #222; }
        .row { display: flex; justify-content: space-between; padding: 9px 0; border-bottom: 1px dashed #e0e0e0; font-size: 14px; }
        .total-box { background: #e8f5e9; color: #1b5e20; padding: 14px; border-radius: 10px; font-size: 19px; font-weight: bold; display: flex; justify-content: space-between; margin-top: 14px; border: 1px solid #a5d6a7; }
        .qr-section { text-align: center; margin-top: 16px; padding: 12px; background: #f8fafc; border-radius: 12px; }
        .actions { max-width: 520px; margin: 14px auto; display: flex; flex-direction: column; gap: 10px; }
        .btn { padding: 14px; border: none; border-radius: 10px; font-size: 15px; font-weight: bold; cursor: pointer; text-align: center; text-decoration: none; display: block; }
        .btn-download { background: #1565c0; color: #fff; }
        .btn-app { background: #111827; color: #fff; }
      </style>
    </head>
    <body>
      <div id="invoiceCard" class="invoice-box">
        <div class="header">
          <h1>MYRYVA OFFICIAL TAX INVOICE</h1>
          <div class="badge">✓ STATUS: ${d.status}</div>
        </div>
        <div class="body">
          <div class="row"><span><b>Customer Name:</b></span><span>${d.customerName}</span></div>
          <div class="row"><span><b>Phone Number:</b></span><span>${d.customerPhone}</span></div>
          <div class="row"><span><b>Invoice No:</b></span><span><b>${d.invoiceNo}</b></span></div>
          <div class="row"><span><b>Booking ID:</b></span><span>#${d.bookingId}</span></div>
          <div class="row"><span><b>Service Details:</b></span><span>${d.serviceName}</span></div>
          <div class="row"><span><b>Transaction ID:</b></span><span>${d.transactionId}</span></div>
          <div class="row"><span><b>Payment Mode:</b></span><span>${d.paymentMode}</span></div>
          <div class="row"><span><b>Date & Time:</b></span><span>${d.issuedDate}</span></div>
          <div class="row"><span><b>Warranty:</b></span><span style="color:#1b5e20;font-weight:bold;">🛡️ 30-Day Service Warranty</span></div>

          <div class="total-box">
            <span>Total Amount:</span>
            <span>₹${d.amount}</span>
          </div>

          <div class="qr-section">
            <img src="${qrDataUrl}" style="width:125px;height:125px;" />
            <div style="font-size:12px;color:#555;margin-top:4px;">Verified MYRYVA QR Invoice | 📞 Helpline: 9304570798</div>
          </div>
        </div>
      </div>

      <div class="actions">
        <button class="btn btn-download" onclick="downloadPDF()">📥 Download Official Invoice PDF</button>
        <a class="btn btn-app" href="${deepLink}">📲 Open Directly in MYRYVA App</a>
      </div>

      <script>
        function downloadPDF() {
          const element = document.getElementById('invoiceCard');
          html2pdf().set({
            margin: 8,
            filename: 'MYRYVA_${d.invoiceNo}.pdf',
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
          }).from(element).save();
        }
        if (new URLSearchParams(window.location.search).get('openApp') === '1') {
          setTimeout(() => { window.location.href = "${deepLink}"; }, 600);
        }
      </script>
    </body>
    </html>
  `);
});

app.get('/qr', async (req, res) => {
  if (qrCodeData === "CONNECTED") return res.send('<h2 style="color:green;">✅ MYRYVA Permanent WhatsApp Connected Hai!</h2>');
  if (!qrCodeData) return res.send('<h3>⏳ QR Code ban raha hai... 5 second me Refresh karein.</h3>');
  const qrImage = await QRCode.toDataURL(qrCodeData);
  res.send(`<div style="text-align:center;margin-top:30px;"><h2>Scan with WhatsApp Linked Devices</h2><img src="${qrImage}" style="width:280px;"/></div>`);
});

// View Message Logs API (For App Notification Module)
app.get('/logs', (req, res) => {
  res.json({ totalSent: messageLogs.length, connected: qrCodeData === "CONNECTED", logs: messageLogs });
});

app.post('/send', async (req, res) => {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const invNo = body.invoiceNo || ('MYR-INV-' + String(body.bookingId || '000').slice(-5));
    body.invoiceNo = invNo;
    invoicesDB[invNo] = body;

    let phone = String(body.phone || body.customerPhone || '').replace(/\D/g, '');
    if (phone.length === 10) phone = '91' + phone;

    const realInvoiceUrl = getRealInvoiceUrl(body);
    const textMessage = buildMyryvaMessage(body, realInvoiceUrl);

    // 1. Send Text Message with Live Link
    await sock.sendMessage(phone + '@s.whatsapp.net', { text: textMessage });

    // 2. Automatically Send Official PDF Invoice File on WhatsApp for Paid/Invoice/Refund events
    const type = (body.type || body.status || 'INVOICE').toUpperCase();
    if (type.includes('INVOICE') || type.includes('PAID') || type.includes('COMPLETED') || type.includes('REFUND')) {
      const pdfBuffer = await generateInvoicePDFBuffer({
        invoiceNo: invNo,
        bookingId: body.bookingId || '-',
        customerName: body.customerName || 'Customer',
        customerPhone: phone,
        amount: body.amount || '0',
        transactionId: body.transactionId || 'N/A',
        paymentMode: body.paymentMode || 'UPI',
        issuedDate: body.issuedDate || new Date().toLocaleString('en-IN'),
        serviceName: body.serviceName || 'MYRYVA Home Service',
        status: type
      });

      await sock.sendMessage(phone + '@s.whatsapp.net', {
        document: pdfBuffer,
        mimetype: 'application/pdf',
        fileName: `MYRYVA_Invoice_${invNo}.pdf`,
        caption: `📄 Official Tax Invoice PDF (#${invNo}) - MYRYVA`
      });
    }

    const logEntry = {
      id: Date.now(),
      customerName: body.customerName,
      customerPhone: phone,
      bookingId: body.bookingId,
      invoiceNo: invNo,
      type: type,
      timestamp: new Date().toLocaleString('en-IN'),
      status: 'SENT'
    };
    messageLogs.unshift(logEntry);

    res.json({ status: 'success', sentTo: phone, invoiceUrl: realInvoiceUrl, log: logEntry });
  } catch (err) {
    res.status(500).json({ status: 'failed', error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('MYRYVA Engine 2.0 running on port ' + PORT));
