/**
 * ReporterAgent
 * ─────────────────────────────────────────────────────────────────
 * Custom Playwright reporter that:
 * - Aggregates pass/fail/flaky counts
 * - Extracts failure details (error + screenshot + trace)
 * - Writes a structured agent-summary.json
 * - Triggers JiraAgent for each failed test (if enabled)
 * - Triggers NotificationAgent with final summary
 *
 * Registered in playwright.config.ts as a reporter.
 */

import type {
  Reporter,
  FullConfig,
  Suite,
  TestCase,
  TestResult,
  FullResult,
} from '@playwright/test/reporter';
import * as fs from 'fs';
import * as path from 'path';
import { JiraAgent } from './JiraAgent';
import { NotificationAgent } from './NotificationAgent';

interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  duration: number;
  failures: FailureDetail[];
}

interface FailureDetail {
  testName: string;
  suiteName: string;
  errorMessage: string;
  screenshotPath?: string;
  tracePath?: string;
  retries: number;
}

class ReporterAgent implements Reporter {
  private readonly outputFile: string;
  private readonly summary: TestSummary = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    flaky: 0,
    duration: 0,
    failures: [],
  };
  private startTime!: number;
  private readonly jiraAgent: JiraAgent;
  private readonly notificationAgent: NotificationAgent;

  constructor(options: { outputFile?: string } = {}) {
    this.outputFile = options.outputFile ?? 'reports/agent-summary.json';
    this.jiraAgent = new JiraAgent();
    this.notificationAgent = new NotificationAgent();
  }

  onBegin(_config: FullConfig, _suite: Suite): void {
    this.startTime = Date.now();
    console.log('\n🤖 ReporterAgent: Test run started');
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    this.summary.total++;

    switch (result.status) {
      case 'passed':
        this.summary.passed++;
        break;
      case 'failed':
      case 'timedOut':
        if (result.retry > 0 && result.status === 'passed') {
          this.summary.flaky++;
        } else {
          this.summary.failed++;
          this.collectFailureDetail(test, result);
        }
        break;
      case 'skipped':
        this.summary.skipped++;
        break;
    }
  }

  async onEnd(result: FullResult): Promise<void> {
    this.summary.duration = Date.now() - this.startTime;

    // Trigger Jira tickets for each failure
    for (const failure of this.summary.failures) {
      await this.jiraAgent.run(failure);
    }

    // Trigger notification with full summary
    await this.notificationAgent.run({ summary: this.summary, status: result.status });

    // Write summary to disk
    this.writeSummary();

    console.log(`\n🤖 ReporterAgent Summary:`);
    console.log(`   ✅ Passed:  ${this.summary.passed}`);
    console.log(`   ❌ Failed:  ${this.summary.failed}`);
    console.log(`   ⚠️  Flaky:   ${this.summary.flaky}`);
    console.log(`   ⏭️  Skipped: ${this.summary.skipped}`);
    console.log(`   ⏱️  Duration: ${(this.summary.duration / 1000).toFixed(1)}s`);
  }

  private collectFailureDetail(test: TestCase, result: TestResult): void {
    const screenshot = result.attachments.find((a) => a.name === 'screenshot');
    const trace = result.attachments.find((a) => a.name === 'trace');

    this.summary.failures.push({
      testName: test.title,
      suiteName: test.parent?.title ?? 'Unknown Suite',
      errorMessage: result.errors[0]?.message ?? 'No error message',
      screenshotPath: screenshot?.path,
      tracePath: trace?.path,
      retries: result.retry,
    });
  }

  private writeSummary(): void {
    const dir = path.dirname(this.outputFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.outputFile, JSON.stringify(this.summary, null, 2));
  }
}

export default ReporterAgent;
