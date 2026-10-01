/**
 * Sends one sample "new case" alert to CASE_ALERT_EMAILS, to check the Resend setup.
 * Usage: npm run email:test
 */
import 'dotenv/config';
import { Resend } from 'resend';
import { buildNewCaseEmail, parseRecipients } from '../src/lib/case-email';

const to = parseRecipients(process.env.CASE_ALERT_EMAILS);
if (!process.env.RESEND_API_KEY || to.length === 0) throw new Error('Set RESEND_API_KEY and CASE_ALERT_EMAILS in .env');

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

const { data, error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
  from: process.env.EMAIL_FROM || 'Florzy Critical Cases <onboarding@resend.dev>',
  to,
  subject: `[TEST] ${email.subject}`,
  html: email.html,
  text: email.text,
});
if (error) {
  console.error('Send failed:', error.name, error.message);
  process.exitCode = 1;
} else {
  console.log(`Sent test email ${data?.id} to ${to.join(', ')}`);
}
