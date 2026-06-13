/**
 * JiraAgent
 * ─────────────────────────────────────────────────────────────────
 * Automatically creates Jira issues when tests fail.
 * - Deduplicates: won't open a ticket if one already exists for the same test.
 * - Attaches screenshots and trace paths to the issue.
 * - Supports custom labels, priority, and assignee via config.
 *
 * Setup: set JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY in .env
 */

import { BaseAgent, AgentConfig } from './BaseAgent';

export interface JiraIssuePayload {
  testName: string;
  errorMessage: string;
  screenshotPath?: string;
  tracePath?: string;
  suiteName?: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  url: string;
  alreadyExisted: boolean;
}

export interface JiraAgentConfig extends AgentConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  projectKey: string;
  issueType?: string;
  priority?: string;
  labels?: string[];
  assignee?: string;
}

export class JiraAgent extends BaseAgent<JiraAgentConfig, JiraIssue> {
  private authHeader!: string;

  constructor() {
    super({
      name: 'JiraAgent',
      enabled: !!process.env.JIRA_API_TOKEN &&
         !process.env.JIRA_API_TOKEN.startsWith('your-') &&
         !!process.env.JIRA_BASE_URL &&
         !process.env.JIRA_BASE_URL.includes('your-org'),
      baseUrl: process.env.JIRA_BASE_URL || '',
      email: process.env.JIRA_EMAIL || '',
      apiToken: process.env.JIRA_API_TOKEN || '',
      projectKey: process.env.JIRA_PROJECT_KEY || 'QA',
      issueType: 'Bug',
      priority: 'High',
      labels: ['automation', 'playwright'],
    });
  }

  protected async init(): Promise<void> {
    if (!this.config.baseUrl || !this.config.email || !this.config.apiToken) {
      throw new Error('JiraAgent: Missing required env vars (JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN)');
    }
    const credentials = Buffer.from(`${this.config.email}:${this.config.apiToken}`).toString('base64');
    this.authHeader = `Basic ${credentials}`;
    this.logger.info('JiraAgent initialized');
  }

  protected async execute(payload: unknown): Promise<JiraIssue> {
    const issue = payload as JiraIssuePayload;

    // Step 1: Check for existing open ticket (deduplication)
    const existing = await this.findExistingIssue(issue.testName);
    if (existing) {
      this.logger.warn(`Jira issue already exists: ${existing.key} — skipping creation`);
      return { ...existing, alreadyExisted: true };
    }

    // Step 2: Create new Jira issue
    const created = await this.createIssue(issue);
    this.logger.info(`Jira issue created: ${created.key} → ${created.url}`);
    return { ...created, alreadyExisted: false };
  }

  private async findExistingIssue(testName: string): Promise<Omit<JiraIssue, 'alreadyExisted'> | null> {
    const summary = this.buildSummary(testName);
    const jql = encodeURIComponent(
      `project = "${this.config.projectKey}" AND summary ~ "${summary}" AND status != Done ORDER BY created DESC`
    );

    const response = await fetch(`${this.config.baseUrl}/rest/api/3/search?jql=${jql}&maxResults=1`, {
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) return null;

    const data = await response.json() as { issues: Array<{ id: string; key: string }> };
    if (data.issues.length === 0) return null;

    const found = data.issues[0];
    return {
      id: found.id,
      key: found.key,
      url: `${this.config.baseUrl}/browse/${found.key}`,
    };
  }

  private async createIssue(payload: JiraIssuePayload): Promise<Omit<JiraIssue, 'alreadyExisted'>> {
    const body = {
      fields: {
        project: { key: this.config.projectKey },
        summary: this.buildSummary(payload.testName),
        description: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: `Automated test failure detected by Playwright.\n\n` +
                    `*Test:* ${payload.testName}\n` +
                    `*Suite:* ${payload.suiteName ?? 'N/A'}\n` +
                    `*Error:* ${payload.errorMessage}\n` +
                    `*Screenshot:* ${payload.screenshotPath ?? 'N/A'}\n` +
                    `*Trace:* ${payload.tracePath ?? 'N/A'}\n` +
                    `*Timestamp:* ${new Date().toISOString()}`,
                },
              ],
            },
          ],
        },
        issuetype: { name: this.config.issueType ?? 'Bug' },
        priority: { name: this.config.priority ?? 'High' },
        labels: this.config.labels ?? ['automation'],
        ...(this.config.assignee && { assignee: { accountId: this.config.assignee } }),
      },
    };

    const response = await fetch(`${this.config.baseUrl}/rest/api/3/issue`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Jira API error ${response.status}: ${err}`);
    }

    const created = await response.json() as { id: string; key: string };
    return {
      id: created.id,
      key: created.key,
      url: `${this.config.baseUrl}/browse/${created.key}`,
    };
  }

  private buildSummary(testName: string): string {
    return `[Automation] Test Failed: ${testName}`;
  }
}
