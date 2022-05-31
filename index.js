const core = require('@actions/core');
const github = require('@actions/github');
const axios = require('axios')

async function sendChangeEvent(changeEvent) {
  try {
    const response = await axios.post('https://events.pagerduty.com/v2/change/enqueue', changeEvent);
    console.log(`PagerDuty responded with ${response.status} - ${JSON.stringify(response.data)}`);

    if (response.status !== 202) {
      core.setFailed(`PagerDuty API returned status code ${response.status}`);
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

function handleCustomEvent(summary, integrationKey) {
  const changeEvent = {
    routing_key: integrationKey,
    payload: {
      summary: summary,
      source: 'GitHub',
      timestamp: (new Date()).toISOString(),
      custom_details: {}
    },
    links: [
      {
        href: `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
        text: "View run"
      }
    ]
  };

  sendChangeEvent(changeEvent);
}

function handlePushEvent(data, integrationKey) {
  const {
    ref,
    compare: compareHref,
    repository: {
      full_name: repoFullName,
      html_url: repoHref
    },
    sender: {
      login: senderLogin,
      html_url: senderHref
    }
  } = data;

  const parts = ref.split('/');
  const branch = parts[parts.length - 1];

  const changeEvent = {
    routing_key: integrationKey,
    payload: {
      summary: `${senderLogin} pushed branch ${branch} from ${repoFullName}`.slice(0, 1024),
      source: 'GitHub',
      timestamp: (new Date()).toISOString(),
      custom_details: {}
    },
    links: [
      {
        href: compareHref,
        text: 'View on GitHub'
      }, {
        href: repoHref,
        text: 'Repo'
      }, {
        href: senderHref,
        text: `Sender - ${senderLogin}`
      }
    ]
  };

  sendChangeEvent(changeEvent);
}

function handlePullRequestEvent(data, integrationKey) {
  const {
    pull_request: {
      title,
      body,
      commits,
      additions,
      deletions,
      changed_files: changedFiles,
      review_comments: reviewComments,
      merged_at: mergedAt,
      html_url: pullRequestUrl,
      user: {
        login: userLogin,
        html_url: userUrl
      },
      merged_by: {
        login: mergedByLogin,
        html_url: mergedByUrl
      }
    },
    repository: {
      full_name: repoName
    }
  } = data;

  const changeEvent = {
    routing_key: integrationKey,
    payload: {
      summary: `[PR Merged - ${repoName}] ${title}`.slice(0, 1024),
      source: 'GitHub',
      timestamp: mergedAt,
      custom_details: {
        body: body,
        repo: repoName,
        commits: commits,
        review_comments: reviewComments,
        additions: additions,
        deletions: deletions,
        changed_files: changedFiles
      }
    },
    links: [
      {
        href: pullRequestUrl,
        text: 'View on GitHub'
      }, {
        href: mergedByUrl,
        text: `Merged by - ${mergedByLogin}`
      }, {
        href: userUrl,
        text: `Opened by - ${userLogin}`
      }
    ]
  };

  const changeEventString = JSON.stringify(changeEvent);

  // enforce the 512kb message size limit
  if (changeEventString.length > 524288) {
    changeEvent['payload']['custom_details']['body'] = body.slice(0, changeEventString.length - 524288);
  }

  sendChangeEvent(changeEvent);
}

try {
  const integrationKey = core.getInput('integration-key');
  const customEvent = core.getInput('custom-event');
  const data = github.context.payload;

  if (typeof customEvent === 'string') {
    // if custom event is described, prefer emitting custom event
    handleCustomEvent(customEvent, integrationKey);
  } else if (github.context.eventName === 'push') {
    handlePushEvent(data, integrationKey);
  } else if (github.context.eventName === 'pull_request' && data.action === 'closed' && data.pull_request.merged) {
    handlePullRequestEvent(data, integrationKey);
  } else {
    console.log('No action taken. The event or action are not handled by this Action.');
  }
} catch (error) {
  core.setFailed(error.message)
}
