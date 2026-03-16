const express = require('express');
const path = require('path');

// ---------------------------------------------------------------------------
// Load environment variables from .env file (without requiring dotenv as a
// dependency — we parse it manually so the project stays lightweight).
// In production you can set env vars directly on your host.
// ---------------------------------------------------------------------------
const fs = require('fs');
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) return;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  });
}

const MAILERLITE_API_KEY = process.env.MAILERLITE_API_KEY;
const MAILERLITE_GROUP_ID = process.env.MAILERLITE_GROUP_ID;
const PORT = process.env.PORT || 3000;

if (!MAILERLITE_API_KEY || MAILERLITE_API_KEY === 'your_api_key_here') {
  console.warn('⚠  MAILERLITE_API_KEY is not set. Subscription endpoint will not work.');
}
if (!MAILERLITE_GROUP_ID || MAILERLITE_GROUP_ID === 'your_group_id_here') {
  console.warn('⚠  MAILERLITE_GROUP_ID is not set. Subscribers won\'t be added to a group.');
}

const app = express();

// Parse JSON bodies (for the subscribe endpoint)
app.use(express.json());

// Serve static files (index.html, styles.css, etc.)
app.use(express.static(path.join(__dirname)));

// ---------------------------------------------------------------------------
// POST /api/subscribe — add an email to MailerLite and assign to the group
// Uses the MailerLite API v2: https://developers.mailerlite.com/docs/
// ---------------------------------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.post('/api/subscribe', async (req, res) => {
  const { email } = req.body;

  // --- validate ----------------------------------------------------------
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email обязателен.' });
  }

  const cleaned = email.trim().toLowerCase();
  if (!EMAIL_RE.test(cleaned)) {
    return res.status(400).json({ error: 'Некорректный email.' });
  }

  if (!MAILERLITE_API_KEY || MAILERLITE_API_KEY === 'your_api_key_here') {
    console.error('MailerLite API key is missing.');
    return res.status(500).json({ error: 'Сервис временно недоступен.' });
  }

  // --- call MailerLite ----------------------------------------------------
  try {
    const body = { email: cleaned };

    // Attach to group if configured
    if (MAILERLITE_GROUP_ID && MAILERLITE_GROUP_ID !== 'your_group_id_here') {
      body.groups = [MAILERLITE_GROUP_ID];
    }

    const mlRes = await fetch('https://connect.mailerlite.com/api/subscribers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${MAILERLITE_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    const data = await mlRes.json();

    // 200 = existing subscriber updated, 201 = new subscriber created
    if (mlRes.status === 200 || mlRes.status === 201) {
      return res.json({ ok: true, alreadySubscribed: mlRes.status === 200 });
    }

    // 422 = validation error (e.g. email already exists with unsubscribed status)
    if (mlRes.status === 422) {
      console.error('MailerLite 422:', JSON.stringify(data));
      // Treat "already exists" as success for UX purposes
      if (data.message && data.message.toLowerCase().includes('already')) {
        return res.json({ ok: true, alreadySubscribed: true });
      }
      return res.status(400).json({ error: data.message || 'Не удалось подписать.' });
    }

    // Any other error
    console.error(`MailerLite ${mlRes.status}:`, JSON.stringify(data));
    return res.status(502).json({ error: 'Не удалось подписать. Попробуйте позже.' });

  } catch (err) {
    console.error('MailerLite request failed:', err);
    return res.status(502).json({ error: 'Не удалось подписать. Попробуйте позже.' });
  }
});

// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
