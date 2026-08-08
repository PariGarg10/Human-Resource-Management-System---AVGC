/**
 * Verify SMTP credentials and optionally send a test message.
 * Usage: node server/scripts/test-smtp.js [recipient@example.com]
 */
require('dotenv').config();
const { isSmtpConfigured, verifySmtpConnection, sendTemporaryPasswordEmail } = require('../utils/email');

const to = process.argv[2];

(async () => {
  if (!isSmtpConfigured()) {
    console.error('SMTP is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_FROM in .env or EB env.');
    process.exit(1);
  }

  try {
    const result = await verifySmtpConnection();
    console.log('SMTP connection:', result.ok ? 'OK' : result.message);
  } catch (err) {
    console.error('SMTP verify failed:', err.message);
    console.error('Gmail: use an App Password (https://myaccount.google.com/apppasswords), not your login password.');
    process.exit(1);
  }

  if (to) {
    await sendTemporaryPasswordEmail({
      to,
      firstName: 'Test',
      tempPassword: 'TestPass1!',
    });
    console.log('Test email sent to', to);
  } else {
    console.log('SMTP OK. Pass a recipient to send a test email: node server/scripts/test-smtp.js you@example.com');
  }
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
