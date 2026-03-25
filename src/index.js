import { readFileSync } from "node:fs";

const PAGERDUTY_CHANGE_EVENT_URL =
  "https://events.pagerduty.com/v2/change/enqueue";
const MAX_SUMMARY_LENGTH = 1024;
const MAX_EVENT_SIZE = 524288;
const NO_ACTION_LOG =
  "No action taken. The event or action are not handled by this Action.";

function truncateSummary(summary) {
  return String(summary).slice(0, MAX_SUMMARY_LENGTH);
}

function getInput(name, env = process.env) {
  return (
    env[`INPUT_${name.replace(/ /g, "_").replace(/-/g, "_").toUpperCase()}`] ??
    ""
  );
}

function getRunUrl(env = process.env) {
  return `https://github.com/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;
}

function createBaseEvent(integrationKey, summary, timestamp) {
  return {
    routing_key: integrationKey,
    payload: {
      summary,
      source: "GitHub",
      timestamp,
      custom_details: {},
    },
    links: [],
  };
}

export function buildCustomChangeEvent(
  summary,
  integrationKey,
  env = process.env,
  now = new Date(),
) {
  const changeEvent = createBaseEvent(
    integrationKey,
    String(summary),
    now.toISOString(),
  );

  changeEvent.links.push({
    href: getRunUrl(env),
    text: "View run",
  });

  return changeEvent;
}

export function buildPushChangeEvent(data, integrationKey, now = new Date()) {
  const parts = data.ref.split("/");
  const branch = parts[parts.length - 1];
  const changeEvent = createBaseEvent(
    integrationKey,
    truncateSummary(
      `${data.sender.login} pushed branch ${branch} from ${data.repository.full_name}`,
    ),
    now.toISOString(),
  );

  changeEvent.links.push(
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
  );

  return changeEvent;
}

export function buildPullRequestChangeEvent(data, integrationKey) {
  const pullRequest = data.pull_request;
  const changeEvent = createBaseEvent(
    integrationKey,
    truncateSummary(
      `[PR Merged - ${data.repository.full_name}] ${pullRequest.title}`,
    ),
    pullRequest.merged_at,
  );

  changeEvent.payload.custom_details = {
    body: pullRequest.body,
    repo: data.repository.full_name,
    commits: pullRequest.commits,
    review_comments: pullRequest.review_comments,
    additions: pullRequest.additions,
    deletions: pullRequest.deletions,
    changed_files: pullRequest.changed_files,
  };

  changeEvent.links.push(
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
  );

  return trimPullRequestEvent(changeEvent);
}

export function trimPullRequestEvent(changeEvent) {
  const body = changeEvent.payload.custom_details.body;
  if (typeof body !== "string") {
    return changeEvent;
  }

  let serialized = JSON.stringify(changeEvent);
  if (serialized.length <= MAX_EVENT_SIZE) {
    return changeEvent;
  }

  const overflow = serialized.length - MAX_EVENT_SIZE;
  changeEvent.payload.custom_details.body = body.slice(
    0,
    Math.max(0, body.length - overflow),
  );
  serialized = JSON.stringify(changeEvent);

  if (serialized.length > MAX_EVENT_SIZE) {
    changeEvent.payload.custom_details.body = body.slice(
      0,
      Math.max(
        0,
        body.length - overflow - (serialized.length - MAX_EVENT_SIZE),
      ),
    );
  }

  return changeEvent;
}

export function readGithubEventPayload(env = process.env) {
  if (!env.GITHUB_EVENT_PATH) {
    return {};
  }

  return JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8"));
}

export function selectChangeEvent({
  env = process.env,
  now = new Date(),
  payload,
} = {}) {
  const integrationKey = getInput("integration-key", env);
  const customEvent = getInput("custom-event", env);
  const eventName = env.GITHUB_EVENT_NAME;
  const data = payload ?? readGithubEventPayload(env);

  if (typeof customEvent === "string" && customEvent !== "") {
    return buildCustomChangeEvent(customEvent, integrationKey, env, now);
  }

  if (eventName === "push") {
    return buildPushChangeEvent(data, integrationKey, now);
  }

  if (
    eventName === "pull_request" &&
    data.action === "closed" &&
    data.pull_request?.merged
  ) {
    return buildPullRequestChangeEvent(data, integrationKey);
  }

  return null;
}

function setFailed(message) {
  console.error(`::error::${message}`);
  process.exitCode = 1;
}

export async function sendChangeEvent(
  changeEvent,
  fetchImpl = globalThis.fetch,
) {
  const response = await fetchImpl(PAGERDUTY_CHANGE_EVENT_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(changeEvent),
  });

  const responseText = await response.text();
  console.log(`PagerDuty responded with ${response.status} - ${responseText}`);

  if (response.status !== 202) {
    throw new Error(`PagerDuty API returned status code ${response.status}`);
  }
}

export async function run({
  env = process.env,
  now = new Date(),
  payload,
  fetchImpl = globalThis.fetch,
} = {}) {
  try {
    const changeEvent = selectChangeEvent({ env, now, payload });
    if (!changeEvent) {
      console.log(NO_ACTION_LOG);
      return 0;
    }

    await sendChangeEvent(changeEvent, fetchImpl);
    return 0;
  } catch (error) {
    setFailed(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (import.meta.main) {
  run();
}
