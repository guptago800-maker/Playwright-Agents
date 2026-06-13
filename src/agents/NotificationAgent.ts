/**
 * NotificationAgent
 * ─────────────────────────────────────────────────────────────────
 * Sends test run summaries to Slack via webhook.
 * Triggered automatically by ReporterAgent after each run.
 *
 * Setup: Set SLACK_WEBHOOK_URL in .env
 */

import { BaseAgent, AgentConfig } from './BaseAgent';

interface NotificationPayload {
  summary: {
    total: number;
    passed: number;
    failed: number;
    flaky: number;
    skipped: number;
    duration: number;
  };
  status: string;
}

interface NotificationAgentConfig extends AgentConfig {
  webhookUrl: string;
}

export class NotificationAgent extends BaseAgent<NotificationAgentConfig, { sent: boolean }> {
  constructor() {
    super({
      name: 'NotificationAgent',
      enabled: !!process.env.SLACK_WEBHOOK_URL &&
         !process.env.SLACK_WEBHOOK_URL.includes('your/webhook'),
      webhookUrl: process.env.SLACK_WEBHOOK_URL || '',
    });
  }

  protected async init(): Promise<void> {
    if (!this.config.webhookUrl) {
      throw new Error('NotificationAgent: SLACK_WEBHOOK_URL is not set');
    }
  }

  protected async execute(payload: unknown): Promise<{ sent: boolean }> {
    const { summary, status } = payload as NotificationPayload;

    const emoji = status === 'passed' ? '✅' : status === 'failed' ? '❌' : '⚠️';
    const passRate = summary.total > 0
      ? ((summary.passed / summary.total) * 100).toFixed(1)
      : '0';

    const message = {
      text: `${emoji} *Playwright Test Run Complete*`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `${emoji} Test Run: ${status.toUpperCase()}` },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Total:* ${summary.total}` },
            { type: 'mrkdwn', text: `*Pass Rate:* ${passRate}%` },
            { type: 'mrkdwn', text: `*✅ Passed:* ${summary.passed}` },
            { type: 'mrkdwn', text: `*❌ Failed:* ${summary.failed}` },
            { type: 'mrkdwn', text: `*⚠️ Flaky:* ${summary.flaky}` },
            { type: 'mrkdwn', text: `*⏱️ Duration:* ${(summary.duration / 1000).toFixed(1)}s` },
          ],
        },
      ],
    };

    const response = await fetch(this.config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(`Slack webhook failed: ${response.status}`);
    }

    this.logger.info('Slack notification sent successfully');
    return { sent: true };
  }
}
