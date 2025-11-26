import { Env } from '../types/env';
import { Alert } from '../types/cache-monitor';

/**
 * Notification Service
 *
 * Handles sending alerts for cache health and other monitored metrics.
 * Supports multiple notification channels (Email, Slack).
 */

/**
 * Formats an array of alerts into a plain text email body.
 * @param alerts - The alerts to format.
 * @returns The formatted email body.
 */
function formatAlertEmail(alerts: Alert[]): string {
  let body = "The following cache alerts have been triggered:\n\n";
  alerts.forEach(alert => {
    body += `Severity: ${alert.severity}\n`;
    body += `Metric: ${alert.metric}\n`;
    body += `Threshold: ${alert.threshold}\n`;
    body += `Actual Value: ${alert.actual}\n`;
    body += `Action: ${alert.action}\n\n`;
  });
  return body;
}

/**
 * Sends alerts to configured notification channels.
 *
 * @param env - The worker environment, containing secrets like MAILGUN_API_KEY, SLACK_WEBHOOK_URL, ALERT_FROM_EMAIL, and ALERT_TO_EMAIL.
 * @param alerts - An array of alerts to send.
 * @returns
 */
export async function sendAlert(env: Env, alerts: Alert[]): Promise<void> {
  if (!alerts || alerts.length === 0) {
    return;
  }

  const fromEmail = env.ALERT_FROM_EMAIL || 'alerts@bookstrack.com';
  const toEmail = env.ALERT_TO_EMAIL || 'ops@bookstrack.com';

  // Option A: Email (via Mailgun/SendGrid)
  if (env.MAILGUN_API_KEY && env.MAILGUN_DOMAIN) {
    try {
      await fetch(`https://api.mailgun.net/v3/${env.MAILGUN_DOMAIN}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`api:${env.MAILGUN_API_KEY}`)}`
        },
        body: JSON.stringify({
          from: fromEmail,
          to: toEmail,
          subject: `[BooksTrack] Cache Alert: ${alerts[0].severity}`,
          text: formatAlertEmail(alerts)
        })
      });
      console.log(`Sent alert email from ${fromEmail} to ${toEmail} via Mailgun.`);
    } catch (error) {
      console.error('Failed to send alert email:', error);
    }
  }

  // Option B: Slack webhook
  if (env.SLACK_WEBHOOK_URL) {
    try {
      await fetch(env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        body: JSON.stringify({
          text: `🚨 Cache Alert`,
          blocks: alerts.map(a => ({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*${a.metric}*: ${a.actual} (threshold: ${a.threshold})\n_Action:_ ${a.action}`
            }
          }))
        })
      });
      console.log('Sent alert to Slack.');
    } catch (error) {
      console.error('Failed to send alert to Slack:', error);
    }
  }
}
