# CLAUDE.md — Playwright Agent Framework

> **For AI assistants and engineers onboarding this project.**
> This file explains the framework architecture, agent setup, and contribution rules.

---

## Project Overview

Production-grade Playwright + TypeScript automation framework targeting [SauceDemo](https://www.saucedemo.com) and [ReqRes API](https://reqres.in).

**Stack:** Playwright · TypeScript · Node 20 · GitHub Actions

**Testing Scope:** UI E2E, API contract tests, self-healing locators, automated Jira bug filing.

---

## Directory Structure

```
playwright-agent-framework/
├── src/
│   ├── agents/               # All autonomous agents
│   │   ├── BaseAgent.ts      # Abstract base — all agents extend this
│   │   ├── JiraAgent.ts      # Files Jira tickets on failure
│   │   ├── NotificationAgent.ts  # Sends Slack alerts
│   │   ├── RetryAgent.ts     # Intelligent retry with backoff
│   │   └── ReporterAgent.ts  # Custom Playwright reporter + orchestrator
│   ├── healers/
│   │   └── HealerAgent.ts    # Self-healing locator system
│   ├── fixtures/
│   │   └── index.ts          # Central fixture registry
│   ├── pages/                # Page Object Model
│   │   ├── BasePage.ts       # Base POM with healer integration
│   │   ├── LoginPage.ts
│   │   └── InventoryPage.ts
│   └── utils/
│       └── Logger.ts         # Structured logger used by all agents
├── tests/
│   ├── e2e/                  # UI end-to-end tests
│   └── api/                  # API contract tests
├── reports/                  # Generated at runtime
│   ├── html/                 # Playwright HTML report
│   ├── results.json          # Raw JSON results
│   ├── agent-summary.json    # ReporterAgent output
│   └── healer-snapshots/     # Healer locator registry + suggestions
├── .env.example              # Required env vars template
├── playwright.config.ts
├── tsconfig.json
└── .github/workflows/playwright.yml
```

---

## Agents — How They Work

### Architecture

All agents follow a strict **lifecycle pattern** defined in `BaseAgent.ts`:

```
run() → init() → execute() → teardown()
```

Every agent:
- Extends `BaseAgent<TConfig, TResult>`
- Has an `enabled` flag (controlled via env var — safe to deploy without side effects)
- Returns a typed `AgentResult<T>` — never throws to the caller
- Logs via the shared `Logger` utility

---

### Agent 1: HealerAgent (`src/healers/HealerAgent.ts`)

**Purpose:** Prevents test failures caused by broken/changed locators.

**How it works:**

1. During Page Object construction, locators are **registered** with metadata:
   ```typescript
   this.healer.register('loginButton', '[data-testid="login-button"]', {
     role: 'button', text: 'Login', testId: 'login-button'
   });
   ```

2. Registry is persisted to `reports/healer-snapshots/locator-registry.json`.

3. When `safeLocator()` is called and the primary locator is not visible, HealerAgent:
   - Scans the live DOM (top 100 interactive elements)
   - Scores each candidate using weighted strategy:

   | Strategy | Score |
   |---|---|
   | Exact test-id match | 100 |
   | Exact text match | 80 |
   | Partial test-id match | 70 |
   | Partial text match | 60 |
   | Role match | 50 |
   | CSS class match | 40 |
   | Locator string similarity | 30 |

4. If best score ≥ 40 → healed locator returned; suggestion saved to `suggestions.json`.

5. Engineers **review suggestions** in CI artifacts and update their selectors accordingly.

**Enable/Disable:** `HEALER_ENABLED=true` in `.env`

---

### Agent 2: JiraAgent (`src/agents/JiraAgent.ts`)

**Purpose:** Automatically opens Jira bug tickets when tests fail.

**How it works:**

1. `ReporterAgent` calls `jiraAgent.run(failureDetail)` for each failed test after the run.
2. JiraAgent first checks for an **existing open ticket** with the same test name (deduplication via JQL).
3. If no duplicate exists, creates a new Bug with:
   - Test name, suite, error message
   - Screenshot and trace paths as attachments
   - Labels: `['automation', 'playwright']`
   - Priority: `High`

**Deduplication JQL:**
```
project = "QA" AND summary ~ "[Automation] Test Failed: <testName>" AND status != Done
```

**Required env vars:**
```
JIRA_BASE_URL=https://your-org.atlassian.net
JIRA_EMAIL=your@email.com
JIRA_API_TOKEN=<from Atlassian account settings>
JIRA_PROJECT_KEY=QA
```

**If env vars are missing** → agent is disabled, no side effects.

---

### Agent 3: NotificationAgent (`src/agents/NotificationAgent.ts`)

**Purpose:** Sends a Slack summary after every test run.

**Message includes:** total, pass rate, passed/failed/flaky counts, duration.

**Triggered by:** `ReporterAgent.onEnd()`

**Required env var:**
```
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

---

### Agent 4: RetryAgent (`src/agents/RetryAgent.ts`)

**Purpose:** Retries individual flaky actions within a test (not the whole test).

**Strategies:** `fixed` | `linear` | `exponential`

**Usage:**
```typescript
const result = await retryAgent.retry(
  () => page.click('[data-testid="submit"]'),
  { maxAttempts: 3, delayMs: 1000, backoff: 'exponential' }
);
```

**Playwright-specific shortcut** (retries only on timeout/network errors):
```typescript
await retryAgent.retryPlaywrightAction(() => page.click(selector));
```

---

### Agent 5: ReporterAgent (`src/agents/ReporterAgent.ts`)

**Purpose:** Custom Playwright reporter that **orchestrates all other agents**.

**Registered in `playwright.config.ts`:**
```typescript
reporter: [
  ['./src/agents/ReporterAgent', { outputFile: 'reports/agent-summary.json' }]
]
```

**Lifecycle:**
- `onBegin` → start timer
- `onTestEnd` → collect pass/fail/flaky, extract screenshot + trace paths
- `onEnd` → trigger JiraAgent for each failure → trigger NotificationAgent → write summary JSON

---

## Page Object Model

All pages extend `BasePage`, which:
- Provides `healer.safeLocator()` for all locator calls
- Enforces `navigate()`, `waitForPageLoad()`, `assertUrl()` contracts

**Locator preference order** (most to least reliable):
1. `getByTestId()` — preferred
2. `getByRole()` — semantic
3. `getByText()` — text-based
4. `locator()` with regex — flexible
5. CSS selector — last resort

---

## Fixtures

Central fixture file: `src/fixtures/index.ts`

All tests import from fixtures, not from `@playwright/test` directly:
```typescript
import { test, expect } from '../../src/fixtures/index';
```

Available fixtures:

| Fixture | Type | Description |
|---|---|---|
| `loginPage` | `LoginPage` | Login POM |
| `inventoryPage` | `InventoryPage` | Inventory POM |
| `healer` | `HealerAgent` | Healer instance |
| `retryAgent` | `RetryAgent` | Retry instance |
| `jiraAgent` | `JiraAgent` | Jira instance |
| `authenticatedPage` | `void` | Pre-logged-in state |

---

## Adding a New Agent

1. Create `src/agents/MyAgent.ts`
2. Extend `BaseAgent<MyConfig, MyResult>`
3. Implement `init()` and `execute()`
4. Add to fixtures in `src/fixtures/index.ts`
5. Inject into `ReporterAgent` if it should run post-suite
6. Document here in `CLAUDE.md`

---

## Environment Setup

```bash
cp .env.example .env
# Fill in values for your Jira, Slack, and app credentials
npm install
npx playwright install chromium firefox
npm test
```

---

## CI/CD

GitHub Actions workflow: `.github/workflows/playwright.yml`

- Runs on push to `main`/`develop`, PRs, and nightly at 6AM UTC
- Uploads HTML report, JSON results, and healer suggestions as artifacts
- All secrets managed via GitHub Secrets

---

## Contribution Rules

- Never use `page.waitForTimeout()` — use proper assertions or `waitFor`
- Always register locators with HealerAgent in POM constructors
- Never hardcode credentials — use `.env` + fixtures
- All agents must be safe to disable (check `enabled` flag)
- Tests must be idempotent — no shared mutable state between tests
