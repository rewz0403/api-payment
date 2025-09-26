require('dotenv').config(); // โหลดค่าจาก .env

const express = require('express');
const bodyParser = require('body-parser');
const Omise = require('omise');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const admin = require('firebase-admin');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// ✅ ใช้ Omise Key จาก .env
const omise = Omise({
  publicKey: process.env.OMISE_PUBLIC_KEY,
  secretKey: process.env.OMISE_SECRET_KEY
});

// ✅ Firebase Admin ใช้ service account จาก .env
const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: process.env.FIREBASE_BUCKET
});

const bucket = admin.storage().bucket();
const upload = multer({ storage: multer.memoryStorage() }); // upload แบบ memory

// -----------------------------
// 🔹 API: Test server
// -----------------------------
app.post('/test', (req, res) => {
  res.json({
    status: 'ok',
    message: '🚀 API is running successfully!',
    time: new Date().toISOString()
  });
});

// -----------------------------
// 🔹 API: Charge with token
// -----------------------------
app.post('/charge', async (req, res) => {
  try {
    const { token, amount } = req.body;

    if (!token || !amount) {
      return res.status(400).json({ error: 'Missing token or amount' });
    }

    const charge = await omise.charges.create({
      amount,
      currency: 'thb',
      card: token
    });

    if (charge.status === 'successful') {
      res.json({
        message: 'Payment successful',
        chargeId: charge.id,
        charge,
      });
    } else {
      res.status(400).json({ error: 'Payment failed', charge });
    }
  } catch (err) {
    console.error('Error in /charge:', err);
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------
// 🔹 API: Pay with raw card info
// -----------------------------
app.post('/pay-with-card', async (req, res) => {
  try {
    const { card, amount, description } = req.body;

    if (!card || !amount) {
      return res.status(400).json({ error: 'Missing card info or amount' });
    }

    // 1. สร้าง token จากข้อมูลบัตร
    const token = await omise.tokens.create({ card });

    // 2. เรียก charge จาก token ที่สร้างได้
    const charge = await omise.charges.create({
      amount,
      currency: 'thb',
      card: token.id,
      description: description || 'Training Payment',
    });

    if (charge.status === 'successful') {
      return res.json({
        status: 'successful',
        chargeId: charge.id,
        amount: charge.amount,
        paidAt: charge.paid_at,
        charge,
      });
    } else {
      return res.status(400).json({
        status: 'failed',
        message: charge.failure_message || 'Charge failed',
        charge,
      });
    }
  } catch (err) {
    console.error('Error in /pay-with-card:', err);
    return res.status(500).json({ error: err.message });
  }
});

// -----------------------------
// 🔹 API: Upload slip to Firebase
// -----------------------------
app.post('/upload-slip', upload.single('slip'), async (req, res) => {
  const file = req.file;
  const folderPath = req.body.folderPath;

  if (!file || !folderPath) {
    return res.status(400).json({ error: 'Missing slip file or folderPath' });
  }

  try {
    const filePath = `${folderPath}/${file.originalname}`;
    const fileUpload = bucket.file(filePath);

    // Upload buffer to Firebase Storage
    await fileUpload.save(file.buffer, {
      metadata: { contentType: file.mimetype }
    });

    // Create signed URL (10 นาที)
    const [signedUrl] = await fileUpload.getSignedUrl({
      action: 'read',
      expires: Date.now() + 10 * 60 * 1000
    });

    res.json({
      message: 'Upload successful',
      path: filePath,
      url: signedUrl
    });
  } catch (err) {
    console.error('Error uploading slip:', err);
    res.status(500).json({ error: 'Upload failed', details: err.message });
  }
});


app.post('/test', (req, res) => {
  res.json({
    status: 'ok',
    message: '🚀 API is running successfully!',
    time: new Date().toISOString()
  });
});

// -----------------------------
// 🔹 Start Server
// -----------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running at http://0.0.0.0:${PORT}`);
});
