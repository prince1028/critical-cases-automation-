/**
 * Sends one sample "new case" alert to CASE_ALERT_EMAILS, to check the SMTP setup.
 * Usage: npm run email:test
 */
import 'dotenv/config';
import { buildNewCaseEmail, parseRecipients } from '../src/lib/case-email';
import { sendMail, smtpFromEnv } from '../src/lib/smtp';

const smtp = smtpFromEnv();
const to = parseRecipients(process.env.CASE_ALERT_EMAILS);
if (!smtp || to.length === 0) throw new Error('Set SMTP_USER, SMTP_PASS and CASE_ALERT_EMAILS in .env');

const email = buildNewCaseEmail(
  {
    caseId: '00000000-0000-0000-0000-000000000000',
    caseCode: 'CC-TEST',
    issueType: 'INSUFFICIENT_STOCK',
    severity: 'CRITICAL',
    tileCode: '6716',
    tileLabel: 'Sample tile',
    description: 'Test alert from the Florzy critical cases app. No real case was created.',
    requestedColor: null,
    requestedSize: null,
    requestedFinish: null,
    requiredQuantity: '120',
    availableQuantity: '40',
    unit: 'boxes',
    alternativeTileText: null,
    notes: null,
    reporterName: 'Test',
    reporterTeam: 'Sales',
    createdAt: new Date(),
  },
  process.env.APP_URL,
);

try {
  await sendMail(smtp.cfg, { from: smtp.from, to, subject: `[TEST] ${email.subject}`, html: email.html, text: email.text });
  console.log(`Sent test email from ${smtp.cfg.user} to ${to.join(', ')}`);
} catch (e) {
  console.error('Send failed:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
}
