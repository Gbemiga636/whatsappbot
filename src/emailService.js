const config = require('./config');

let transporter;

function isConfigured() {
  return !!(config.smtp.host && config.smtp.user && config.smtp.pass);
}

function getTransporter() {
  if (!isConfigured()) return null;
  if (!transporter) {
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    });
  }
  return transporter;
}

async function sendOtpEmail(email, code) {
  const transport = getTransporter();
  if (!transport) {
    if (config.otp.devMode) {
      console.log(`[OTP dev] ${email} → ${code}`);
      return { ok: true, devMode: true };
    }
    return {
      ok: false,
      message:
        'Email not configured. Admin: set SMTP_HOST, SMTP_USER, SMTP_PASS in .env (or OTP_DEV_MODE=true for testing).',
    };
  }

  const from = config.smtp.from || config.smtp.user;
  const minutes = config.otp.expiryMinutes;

  try {
    await transport.sendMail({
      from,
      to: email,
      subject: `${code} — your Bygate login code`,
      text: `Your Bygate login code is: ${code}\n\nExpires in ${minutes} minutes.\n\n— Bygate Ads`,
      html: `<p>Your code: <strong style="font-size:24px">${code}</strong></p><p>Expires in ${minutes} minutes.</p>`,
    });
    return { ok: true };
  } catch (err) {
    console.error('SMTP error:', err.message);
    return { ok: false, message: 'Could not send email. Try again shortly.' };
  }
}

module.exports = { isConfigured, sendOtpEmail };
