import { afterEach, describe, expect, test } from "bun:test";
import {
  buildCustomChangeEvent,
  buildPullRequestChangeEvent,
  buildPushChangeEvent,
  run,
  selectChangeEvent,
} from "../src/index.js";

function legacyBuildCustomChangeEvent(summary, integrationKey, env, now) {
  return {
    routing_key: integrationKey,
    payload: {
      summary,
      source: "GitHub",
      timestamp: now.toISOString(),
      custom_details: {},
    },
    links: [
      {
        href: `https://github.com/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`,
        text: "View run",
      },
    ],
  };
}

function legacyBuildPushChangeEvent(data, integrationKey, now) {
  const parts = data.ref.split("/");
  const branch = parts[parts.length - 1];

  return {
    routing_key: integrationKey,
    payload: {
      summary:
        `${data.sender.login} pushed branch ${branch} from ${data.repository.full_name}`.slice(
          0,
          1024,
        ),
      source: "GitHub",
      timestamp: now.toISOString(),
      custom_details: {},
    },
    links: [
      {
        href: data.compare,
        text: "View on GitHub",
      },
      {
        href: data.repository.html_url,
        text: "Repo",
      },
      {
        href: data.sender.html_url,
        text: `Sender - ${data.sender.login}`,
      },
    ],
  };
}

function legacyBuildPullRequestChangeEvent(data, integrationKey) {
  const pullRequest = data.pull_request;
  const changeEvent = {
    routing_key: integrationKey,
    payload: {
      summary:
        `[PR Merged - ${data.repository.full_name}] ${pullRequest.title}`.slice(
          0,
          1024,
        ),
      source: "GitHub",
      timestamp: pullRequest.merged_at,
      custom_details: {
        body: pullRequest.body,
        repo: data.repository.full_name,
        commits: pullRequest.commits,
        review_comments: pullRequest.review_comments,
        additions: pullRequest.additions,
        deletions: pullRequest.deletions,
        changed_files: pullRequest.changed_files,
      },
    },
    links: [
      {
        href: pullRequest.html_url,
        text: "View on GitHub",
      },
      {
        href: pullRequest.merged_by.html_url,
        text: `Merged by - ${pullRequest.merged_by.login}`,
      },
      {
        href: pullRequest.user.html_url,
        text: `Opened by - ${pullRequest.user.login}`,
      },
    ],
  };

  const serialized = JSON.stringify(changeEvent);
  if (serialized.length > 524288) {
    changeEvent.payload.custom_details.body = pullRequest.body.slice(
      0,
      serialized.length - 524288,
    );
  }

  return changeEvent;
}

afterEach(() => {
  process.exitCode = 0;
});

describe("selectChangeEvent", () => {
  test("custom event takes precedence over push", () => {
    const event = selectChangeEvent({
      env: {
        INPUT_INTEGRATION_KEY: "rk",
        INPUT_CUSTOM_EVENT: "Deployment succeeded",
        GITHUB_EVENT_NAME: "push",
        GITHUB_REPOSITORY: "owner/repo",
        GITHUB_RUN_ID: "42",
      },
      payload: {
        ref: "refs/heads/main",
      },
      now: new Date("2026-03-25T00:00:00.000Z"),
    });

    expect(event).toEqual(
      buildCustomChangeEvent(
        "Deployment succeeded",
        "rk",
        {
          GITHUB_REPOSITORY: "owner/repo",
          GITHUB_RUN_ID: "42",
        },
        new Date("2026-03-25T00:00:00.000Z"),
      ),
    );
  });

  test("returns null for unsupported events", () => {
    const event = selectChangeEvent({
      env: {
        INPUT_INTEGRATION_KEY: "rk",
        INPUT_CUSTOM_EVENT: "",
        GITHUB_EVENT_NAME: "workflow_dispatch",
      },
      payload: {},
    });

    expect(event).toBeNull();
  });
});

describe("payload builders", () => {
  test("builds push payload", () => {
    const event = buildPushChangeEvent(
      {
        ref: "refs/heads/main",
        compare: "https://github.com/owner/repo/compare/a...b",
        repository: {
          full_name: "owner/repo",
          html_url: "https://github.com/owner/repo",
        },
        sender: {
          login: "alice",
          html_url: "https://github.com/alice",
        },
      },
      "rk",
      new Date("2026-03-25T00:00:00.000Z"),
    );

    expect(event.payload.summary).toBe(
      "alice pushed branch main from owner/repo",
    );
    expect(event.payload.timestamp).toBe("2026-03-25T00:00:00.000Z");
    expect(event.links).toEqual([
      {
        href: "https://github.com/owner/repo/compare/a...b",
        text: "View on GitHub",
      },
      { href: "https://github.com/owner/repo", text: "Repo" },
      { href: "https://github.com/alice", text: "Sender - alice" },
    ]);
  });

  test("builds merged pull request payload", () => {
    const event = buildPullRequestChangeEvent(
      {
        action: "closed",
        repository: {
          full_name: "owner/repo",
        },
        pull_request: {
          title: "Ship feature",
          body: "details",
          commits: 3,
          additions: 10,
          deletions: 2,
          changed_files: 4,
          review_comments: 1,
          merged_at: "2026-03-24T12:34:56.000Z",
          html_url: "https://github.com/owner/repo/pull/1",
          user: {
            login: "author",
            html_url: "https://github.com/author",
          },
          merged_by: {
            login: "merger",
            html_url: "https://github.com/merger",
          },
        },
      },
      "rk",
    );

    expect(event.payload.summary).toBe("[PR Merged - owner/repo] Ship feature");
    expect(event.payload.timestamp).toBe("2026-03-24T12:34:56.000Z");
    expect(event.payload.custom_details).toEqual({
      body: "details",
      repo: "owner/repo",
      commits: 3,
      review_comments: 1,
      additions: 10,
      deletions: 2,
      changed_files: 4,
    });
    expect(event.links).toEqual([
      { href: "https://github.com/owner/repo/pull/1", text: "View on GitHub" },
      { href: "https://github.com/merger", text: "Merged by - merger" },
      { href: "https://github.com/author", text: "Opened by - author" },
    ]);
  });
});

describe("legacy payload parity", () => {
  test("matches legacy custom event payload", () => {
    const env = {
      GITHUB_REPOSITORY: "owner/repo",
      GITHUB_RUN_ID: "42",
    };
    const now = new Date("2026-03-25T00:00:00.000Z");

    expect(buildCustomChangeEvent("Smoke test", "rk", env, now)).toEqual(
      legacyBuildCustomChangeEvent("Smoke test", "rk", env, now),
    );
  });

  test("matches legacy push payload", () => {
    const payload = {
      ref: "refs/heads/main",
      compare: "https://github.com/owner/repo/compare/a...b",
      repository: {
        full_name: "owner/repo",
        html_url: "https://github.com/owner/repo",
      },
      sender: {
        login: "alice",
        html_url: "https://github.com/alice",
      },
    };
    const now = new Date("2026-03-25T00:00:00.000Z");

    expect(buildPushChangeEvent(payload, "rk", now)).toEqual(
      legacyBuildPushChangeEvent(payload, "rk", now),
    );
  });

  test("matches legacy merged pull request payload", () => {
    const payload = {
      action: "closed",
      repository: {
        full_name: "owner/repo",
      },
      pull_request: {
        title: "Ship feature",
        body: "details",
        commits: 3,
        additions: 10,
        deletions: 2,
        changed_files: 4,
        review_comments: 1,
        merged_at: "2026-03-24T12:34:56.000Z",
        html_url: "https://github.com/owner/repo/pull/1",
        user: {
          login: "author",
          html_url: "https://github.com/author",
        },
        merged_by: {
          login: "merger",
          html_url: "https://github.com/merger",
        },
      },
    };

    expect(buildPullRequestChangeEvent(payload, "rk")).toEqual(
      legacyBuildPullRequestChangeEvent(payload, "rk"),
    );
  });
});

describe("run", () => {
  test("posts a custom event payload to PagerDuty", async () => {
    const calls = [];
    const exitCode = await run({
      env: {
        INPUT_INTEGRATION_KEY: "rk",
        INPUT_CUSTOM_EVENT: "Smoke test",
        GITHUB_EVENT_NAME: "push",
        GITHUB_REPOSITORY: "owner/repo",
        GITHUB_RUN_ID: "42",
      },
      payload: {
        ref: "refs/heads/main",
      },
      now: new Date("2026-03-25T00:00:00.000Z"),
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return {
          status: 202,
          text: async () => JSON.stringify({ status: "ok" }),
        };
      },
    });

    expect(exitCode).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://events.pagerduty.com/v2/change/enqueue");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(calls[0].init.body)).toEqual(
      buildCustomChangeEvent(
        "Smoke test",
        "rk",
        {
          GITHUB_REPOSITORY: "owner/repo",
          GITHUB_RUN_ID: "42",
        },
        new Date("2026-03-25T00:00:00.000Z"),
      ),
    );
  });

  test("marks the run as failed when PagerDuty returns a non-202 response", async () => {
    const exitCode = await run({
      env: {
        INPUT_INTEGRATION_KEY: "rk",
        INPUT_CUSTOM_EVENT: "Smoke test",
        GITHUB_EVENT_NAME: "push",
        GITHUB_REPOSITORY: "owner/repo",
        GITHUB_RUN_ID: "42",
      },
      payload: {
        ref: "refs/heads/main",
      },
      fetchImpl: async () => ({
        status: 500,
        text: async () => "boom",
      }),
    });

    expect(exitCode).toBe(1);
    expect(process.exitCode).toBe(1);
  });

  test("does not call PagerDuty for unsupported events", async () => {
    let calls = 0;
    const exitCode = await run({
      env: {
        INPUT_INTEGRATION_KEY: "rk",
        INPUT_CUSTOM_EVENT: "",
        GITHUB_EVENT_NAME: "workflow_dispatch",
      },
      payload: {},
      fetchImpl: async () => {
        calls += 1;
        return {
          status: 202,
          text: async () => JSON.stringify({ status: "ok" }),
        };
      },
    });

    expect(exitCode).toBe(0);
    expect(calls).toBe(0);
  });
});
