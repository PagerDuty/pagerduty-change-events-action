const core = require('@actions/core');
const github = require('@actions/github');
const axios = require('axios')

function sendChangeEvent(changeEvent) {
  axios
    .post('https://events.pagerduty.com/v2/change/enqueue', changeEvent)
    .then((response) => {
      if (response.status !== 202) {
        core.setFailed(`PagerDuty API returned status code ${response.status}`);
      }

      core.setOutput('status', response.status);
      core.setOutput('response', JSON.stringify(response.data));
    })
    .catch((error) => {
      core.setFailed(error.message);
    });
}

try {
  const integrationKey = core.getInput('integration-key');
  const data = github.context.payload;

  if (github.context.eventName === 'push') {
    const ref = data['ref'].split('/');
    const branch = ref[ref.length - 1];
    const compareHref = data['compare'];
    const repository = data['repository'];
    const repoFullName = repository['full_name'];
    const repoHref = repository['html_url'];
    const timestamp = repository['updated_at'];
    const sender = data['sender'];
    const senderLogin = sender['login'];
    const senderHref = sender['html_url'];

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
  } else if (github.context.eventName === 'pull_request' && github.context.action === 'merged') {
    const pullRequest = data['pull_request'];
    const title = pullRequest['title'];
    const body = pullRequest['body'];
    const commits = pullRequest['commits'];
    const additions = pullRequest['additions'];
    const deletions = pullRequst['deletions'];
    const changedFiles = pullRequest['changed_files'];
    const reviewComments = pullRequest['review_comments'];
    const mergedAt = pullRequest['merged_at'];
    const pullRequestUrl = pullRequest['html_url'];
    const user = pullRequest['user'];
    const userLogin = user['login'];
    const userUrl = user['html_url'];
    const mergedBy = pullRequest['merged_by'];
    const mergedByLogin = mergedBy['login'];
    const mergedByUrl = mergedBy['html_url'];
    const repoName = data['repository']['full_name'];

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
  } else {
    core.setOutput('response', 'No action taken. The event or action are not handled by this Action.');
  }
} catch (error) {
  core.setFailed(error.message)
}
