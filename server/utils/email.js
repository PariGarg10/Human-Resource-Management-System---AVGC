const nodemailer = require('nodemailer');

function isSmtpConfigured() {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_FROM
  );
}

function getFrontendUrl() {
  const url = (process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3000').trim();
  return url.replace(/\/$/, '');
}

function createTransport() {
  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function buildPasswordResetHtml({ name, resetUrl }) {
  const displayName = name || 'there';
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset Your Password</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Verdana,Geneva,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:#1a0002;padding:24px 28px;">
              <span style="font-size:20px;font-weight:800;letter-spacing:0.12em;color:#ffffff;">AVGC</span>
              <span style="display:block;font-size:13px;color:rgba(255,255,255,0.75);margin-top:6px;">HR System</span>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <p style="margin:0 0 16px;font-size:16px;color:#18181b;">Hi ${displayName},</p>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#52525b;">
                We received a request to reset your password.
                Click the button below to reset it. This link is valid for <strong>15 minutes</strong> only.
              </p>
              <p style="margin:0 0 24px;text-align:center;">
                <a href="${resetUrl}" style="display:inline-block;background:#ed1d24;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:8px;">
                  Reset Password
                </a>
              </p>
              <p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:#71717a;">
                If the button does not work, copy and paste this link into your browser:
              </p>
              <p style="margin:0 0 20px;font-size:12px;word-break:break-all;color:#3f3f46;">${resetUrl}</p>
              <p style="margin:0;font-size:13px;line-height:1.5;color:#71717a;">
                If you did not request this, please ignore this email. Your password will remain unchanged.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 24px;border-top:1px solid #e4e4e7;">
              <p style="margin:0;font-size:12px;color:#a1a1aa;">– HR System Team</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendPasswordResetEmail({ to, name, rawToken }) {
  const resetUrl = `${getFrontendUrl()}/reset-password?token=${encodeURIComponent(rawToken)}`;

  if (!isSmtpConfigured()) {
    console.log('[email] SMTP not configured — password reset link (dev):');
    console.log(`  To: ${to}`);
    console.log(`  ${resetUrl}`);
    return { sent: false, devLogged: true, resetUrl };
  }

  const transport = createTransport();
  await transport.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject: 'Reset Your Password',
    headers: {
      'X-Priority': '1',
      'X-Mailer': 'HRMS Mailer',
    },
    html: buildPasswordResetHtml({ name, resetUrl }),
    text: [
      `Hi ${name || 'there'},`,
      '',
      'We received a request to reset your password.',
      'Open this link within 15 minutes to reset it:',
      resetUrl,
      '',
      'If you did not request this, ignore this email.',
      '',
      '– HR System Team',
    ].join('\n'),
  });

  return { sent: true, resetUrl };
}

async function sendTemporaryPasswordEmail({ to, firstName, tempPassword }) {
  const safeFirstName = firstName || 'there';
  const subject = 'Your Temporary Password — HRMS';
  const text = [
    `Hi ${safeFirstName},`,
    '',
    'A password reset was requested for your HRMS account.',
    '',
    `Your temporary password is: ${tempPassword}`,
    '',
    'Use this to log in. You will be asked to set a new password immediately.',
    'This temporary password is valid for 24 hours only.',
    '',
    'If you did not request this, contact your administrator immediately.',
  ].join('\n');
  const html = `
    <p>Hi ${safeFirstName},</p>
    <p>A password reset was requested for your HRMS account.</p>
    <p><strong>Your temporary password is: ${tempPassword}</strong></p>
    <p>Use this to log in. You will be asked to set a new password immediately.<br/>This temporary password is valid for 24 hours only.</p>
    <p>If you did not request this, contact your administrator immediately.</p>
  `;

  if (!isSmtpConfigured()) {
    console.log('[email] SMTP not configured — temporary password email skipped (dev mode).');
    return { sent: false, devLogged: true };
  }

  const transport = createTransport();
  await transport.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    headers: {
      'X-Priority': '1',
      'X-Mailer': 'HRMS Mailer',
    },
    text,
    html,
  });
  return { sent: true };
}

module.exports = {
  isSmtpConfigured,
  getFrontendUrl,
  createTransport,
  sendPasswordResetEmail,
  sendTemporaryPasswordEmail,
};
