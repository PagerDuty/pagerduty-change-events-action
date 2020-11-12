const core = require('@actions/core');
const github = require('@actions/github');
const axios = require('axios')

async function sendChangeEvent(changeEvent) {
  try {
    const response = await axios.post('https://events.pagerduty.com/v2/change/enqueue', changeEvent);

    if (response.status !== 202) {
      core.setFailed(`PagerDuty API returned status code ${response.status}`);
    }

    core.setOutput('status', response.status);
    core.setOutput('response', JSON.stringify(response.data));
  } catch (error) {
    core.setFailed(error.message);
  }
}

function handlePushEvent(data, integrationKey) {
  const {
    ref,
    compare: compareHref,
    repository: {
      full_name: repoFullName,
      html_url: repoHref,
      updated_at: timestamp
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
      timestamp: timestamp,
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

function handlePullRequestMergedEvent(data, integrationKey) {
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
  const data = github.context.payload;

  if (github.context.eventName === 'push') {
    handlePushEvent(data, integrationKey);
  } else if (github.context.eventName === 'pull_request' && github.context.action === 'merged') {
    handlePullRequestMergedEvent(data, integrationKey);
  } else {
    core.setOutput('response', 'No action taken. The event or action are not handled by this Action.');
  }
} catch (error) {
  core.setFailed(error.message)
}
