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

function handlePushEvent(data, integrationKey, targetBranches) {
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

  if (!targetBranches.includes(branch)) {
    console.log(`Skipping push event on branch ${branch}.`);
    return;
  }

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

function handlePullRequestEvent(data, integrationKey, targetBranches) {
  const {
    pull_request: {
      merged,
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
      },
      base: {
        ref: baseBranch
      }
    },
    repository: {
      full_name: repoName
    }
  } = data;

  if (!merged) {
    console.log('Skipping event, pull request was not merged');
  }

  if (!targetBranches.includes(baseBranch)) {
    console.log(`Skipping pull request event on branch ${baseBranch}.`);
    return;
  }

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
  const branch = core.getInput('branch').split(' ');
  const data = github.context.payload;

  if (github.context.eventName === 'push') {
    handlePushEvent(data, integrationKey, branch);
  } else if (github.context.eventName === 'pull_request' && github.context.action === 'closed') {
    handlePullRequestEvent(data, integrationKey, branch);
  } else {
    console.log('No action taken. The event or action are not handled by this Action.');
  }
} catch (error) {
  core.setFailed(error.message)
}
