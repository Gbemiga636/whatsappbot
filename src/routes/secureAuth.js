const express = require('express');
const { login, signup } = require('../mysogiAuth');
const { setUser } = require('../userStore');
const { sendText } = require('../whatsapp');

const router = express.Router();

function page(title, body) {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<style>
*{box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#0f172a;color:#fff;margin:0;padding:24px;min-height:100vh;display:flex;align-items:center;justify-content:center}
.card{background:#1e293b;border-radius:16px;padding:28px;max-width:400px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,.3)}
h1{font-size:1.25rem;margin:0 0 8px}p{color:#94a3b8;font-size:.9rem;margin:0 0 20px}
label{display:block;font-size:.85rem;margin:12px 0 4px;color:#cbd5e1}
input,select{width:100%;padding:12px;border-radius:8px;border:1px solid #334155;background:#0f172a;color:#fff;font-size:1rem}
button{width:100%;margin-top:20px;padding:14px;border:none;border-radius:8px;background:#e11d48;color:#fff;font-size:1rem;font-weight:600;cursor:pointer}
.err{background:#7f1d1d;padding:10px;border-radius:8px;margin-bottom:12px;font-size:.85rem}
.ok{text-align:center;padding:20px 0}.ok h2{color:#4ade80}
a{color:#38bdf8}
</style></head><body><div class="card">${body}</div></body></html>`;
}

router.get('/login', (req, res) => {
  const wa = req.query.wa || '';
  res.send(
    page(
      'Mysogi Login',
      `<h1>Mysogi Login</h1>
<p>Secure sign-in — password is not saved in WhatsApp chat.</p>
<form method="post" action="/auth/login">
<input type="hidden" name="wa" value="${wa}"/>
<label>Email</label><input type="email" name="email" required autocomplete="username"/>
<label>Password</label><input type="password" name="password" required autocomplete="current-password"/>
<button type="submit">Login</button>
</form>`
    )
  );
});

router.post('/login', async (req, res) => {
  const { email, password, wa } = req.body;
  const result = await login(email, password);

  if (!result.ok) {
    return res.send(
      page(
        'Login failed',
        `<div class="err">${result.message}</div>
<form method="post" action="/auth/login">
<input type="hidden" name="wa" value="${wa || ''}"/>
<label>Email</label><input type="email" name="email" value="${email || ''}" required/>
<label>Password</label><input type="password" name="password" required/>
<button type="submit">Try again</button>
</form>`
      )
    );
  }

  if (wa) {
    setUser(wa, {
      authMode: 'authenticated',
      email: result.user.email,
      firstName: result.user.firstName,
      lastName: result.user.lastName,
      mysogiToken: result.token,
      userId: result.user.id,
    });
    try {
      await sendText(
        wa,
        `✅ *You are logged in!*\n\nWelcome, ${result.user.firstName || result.user.email}.\n\nType *menu* to create ads on Mysogi.`
      );
    } catch {
      // token may be expired on whatsapp side
    }
  }

  res.send(
    page(
      'Logged in',
      `<div class="ok"><h2>✓ You are logged in</h2>
<p>Welcome, <strong>${result.user.firstName || result.user.email}</strong></p>
<p>Return to WhatsApp and type <strong>menu</strong> to continue.</p></div>`
    )
  );
});

router.get('/signup', (req, res) => {
  const wa = req.query.wa || '';
  res.send(
    page(
      'Mysogi Sign Up',
      `<h1>Create account</h1>
<p>Same account as mysogi.com.ng</p>
<form method="post" action="/auth/signup">
<input type="hidden" name="wa" value="${wa}"/>
<label>First name</label><input name="firstName" required/>
<label>Last name</label><input name="lastName" required/>
<label>Email</label><input type="email" name="email" required autocomplete="username"/>
<label>Password</label><input type="password" name="password" required minlength="6" autocomplete="new-password"/>
<label>Account type</label>
<select name="userType"><option value="individual">Individual</option><option value="business">Business</option></select>
<button type="submit">Create account</button>
</form>`
    )
  );
});

router.post('/signup', async (req, res) => {
  const { firstName, lastName, email, password, userType, wa } = req.body;
  const result = await signup(
    {
      firstName,
      lastName,
      email,
      password,
      userType: userType || 'individual',
      businessName: req.body.businessName || `${firstName} ${lastName}`,
    },
    wa
  );

  if (!result.ok) {
    return res.send(
      page(
        'Sign up failed',
        `<div class="err">${result.message}</div>
<p><a href="/auth/signup?wa=${wa || ''}">Try again</a></p>`
      )
    );
  }

  if (wa) {
    setUser(wa, {
      authMode: 'authenticated',
      email: result.user?.email || email,
      firstName: result.user?.firstName || firstName,
      lastName: result.user?.lastName || lastName,
      mysogiToken: result.token,
      userId: result.user?.id,
    });
    try {
      await sendText(
        wa,
        `✅ *Account created — you are logged in!*\n\nWelcome, ${firstName}.\n\nType *menu* to create your first ad.`
      );
    } catch {
      /* ignore */
    }
  }

  res.send(
    page(
      'Account created',
      `<div class="ok"><h2>✓ You are logged in</h2>
<p>Welcome to Mysogi, <strong>${firstName}</strong>!</p>
<p>Return to WhatsApp and type <strong>menu</strong>.</p></div>`
    )
  );
});

module.exports = router;
