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
      console.log('✅ MYRYVA Super-Advanced WhatsApp Engine Connected!');
    }
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) setTimeout(connectToWhatsApp, 3000);
    }
  });
}
connectToWhatsApp();

// Smart Template Generator (Har Event ke liye Automatic Design)
function buildMyryvaMessage(data) {
  if (data.message) return data.message; // Agar custom message aaye

  const type = (data.type || 'INVOICE').toUpperCase();
  const name = data.customerName || 'Valued Customer';
  const bookingId = data.bookingId || 'N/A';
  const invoiceNo = data.invoiceNo || ('MYR-INV-' + Math.floor(10000 + Math.random() * 90000));
  const helpline = '9304570798';

  if (type === 'BOOKING' || type === 'NEW_BOOKING') {
    return `✨ *MYRYVA BOOKING CONFIRMED* ✨\n\nDear *${name}*,\nYour service booking has been successfully registered! 🛠️\n\n📋 *Booking Summary:*\n• *Booking ID:* #${bookingId}\n• *Service:* ${data.serviceName || 'Home Service'}\n• *Scheduled Date:* ${data.scheduledDate || data.issuedDate || 'Today'}\n• *Payment Status:* ${data.paymentMode || 'Pay After Service'}\n\n👨‍🔧 *Next Step:*\nOur verified Myryva expert will be assigned shortly.\n\n📞 *24/7 Support Helpline:* ${helpline}`;
  }

  if (type === 'ASSIGNED' || type === 'PARTNER_ASSIGNED') {
    return `👨‍🔧 *MYRYVA EXPERT ASSIGNED* 👨‍🔧\n\nDear *${name}*,\nA verified technician has been assigned for your Booking *#${bookingId}*.\n\n🪪 *Technician Details:*\n• *Name:* ${data.partnerName || 'Myryva Pro Expert'}\n• *Phone:* ${data.partnerPhone || helpline}\n• *Status:* On the way 🚀\n\n🔐 *Safety Note:* Always share OTP only after the expert reaches your location.\n📞 *24/7 Helpline:* ${helpline}`;
  }

  if (type === 'COMPLAINT' || type === 'SUPPORT') {
    return `🛡️ *MYRYVA PRIORITY SUPPORT TICKET* 🛡️\n\nDear *${name}*,\nWe have registered your support request/complaint and our senior team is taking immediate action.\n\n🎫 *Ticket Details:*\n• *Ticket / Booking ID:* #${bookingId}\n• *Issue:* ${data.issue || data.subject || 'Service Support Request'}\n• *Status:* High Priority Investigation ⚡\n\nOur manager will call you shortly.\n📞 *Direct Escalation Helpline:* ${helpline}`;
  }

  if (type === 'OFFER' || type === 'PROMO') {
    return `🎁 *MYRYVA EXCLUSIVE VIP OFFER* 🎁\n\nDear *${name}*,\n${data.offerText || 'Get flat special discount on your next home service booking with MYRYVA!'}\n\n🏷️ *Promo Code:* *${data.promoCode || 'MYRYVAVIP'}*\n📲 Book now on the *MYRYVA App*!\n📞 *Helpline:* ${helpline}`;
  }

  // Default: PAYMENT & TAX INVOICE
  return `🎉 *MYRYVA PAYMENT SUCCESSFUL & TAX INVOICE* 🎉\n\nDear *${name}*,\nWe have received your payment of *₹${data.amount || 0}*! 💳\n\n🧾 *Invoice Details:*\n• *Invoice No:* ${invoiceNo}\n• *Booking ID:* #${bookingId}\n• *Transaction ID:* ${data.transactionId || 'pay_' + Date.now().toString().slice(-6)}\n• *Payment Mode:* ${data.paymentMode || 'UPI'}\n• *Issued Date:* ${data.issuedDate || new Date().toLocaleString('en-IN')}\n\n📸 *Work Inspection Photos:*\nVerified inspection photos are archived on your invoice and safe in your app.\n\n📥 *Download / View Official Invoice:*\nhttps://myryva.app/invoice?id=${bookingId}&inv=${invoiceNo}\n\n🛡️ *30-Day Service Warranty Active!*\nFor any questions or re-work, our 24/7 Helpline is ready: 📞 ${helpline}`;
}

app.get('/', (req, res) => {
  res.send('<h2>🚀 MYRYVA Automatic WhatsApp Server Chalu Hai! <a href="/qr">QR Scan Karne Ke Liye Yahan Click Karein</a></h2>');
});

app.get('/qr', async (req, res) => {
  if (qrCodeData === "CONNECTED") {
    return res.send('<h2 style="color:green; font-family:sans-serif;">✅ MYRYVA WhatsApp 100% Connected Hai! Ab sabhi Booking, Invoice, Complaint automatic jayenge.</h2>');
  }
  if (!qrCodeData) {
    return res.send('<h3>⏳ QR Code ban raha hai... 5 second me page Refresh karein.</h3>');
  }
  const qrImage = await QRCode.toDataURL(qrCodeData);
  res.send(`
    <div style="text-align:center; font-family:sans-serif; margin-top:30px;">
      <h2>Apne WhatsApp -> Linked Devices se Scan karein</h2>
      <img src="${qrImage}" style="width:280px; height:280px; border:3px solid #2e7d32; border-radius:10px;" />
      <p>Scan karne ke baad 5 second me page refresh karein.</p>
    </div>
  `);
});

// Automatic Trigger Endpoint (Customer + Admin Alert)
app.post('/send', async (req, res) => {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    let phone = String(body.phone || body.customerPhone || '').replace(/\D/g, '');
    if (phone.length === 10) phone = '91' + phone;

    const textMessage = buildMyryvaMessage(body);

    // 1. Customer ko Automatic WhatsApp bhejein
    await sock.sendMessage(phone + '@s.whatsapp.net', { text: textMessage });

    // 2. Agar Admin ya Partner ko bhi copy bhejni ho (Optional automatic alert)
    if (body.partnerPhone) {
      let pPhone = String(body.partnerPhone).replace(/\D/g, '');
      if (pPhone.length === 10) pPhone = '91' + pPhone;
      await sock.sendMessage(pPhone + '@s.whatsapp.net', {
        text: `🔔 *MYRYVA PARTNER ALERT*\nBooking #${body.bookingId} update for customer *${body.customerName}* (${body.customerPhone}).`
      });
    }

    res.json({ status: 'success', sentTo: phone });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('MYRYVA Engine running on port ' + PORT));
