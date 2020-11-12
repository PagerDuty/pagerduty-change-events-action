const core = require('@actions/core')
const github = require('@actions/github')

try {
  const integrationKey = core.getInput('integration-key');
  const timestamp = (new Date()).toISOString();

  const payload = JSON.stringify(github.context.payload, undefined, 2);
  console.log(`The event payload: ${payload}`);

  core.setOutput('status', 202);
  core.setOutput('message', 'yay!');
} catch (error) {
  core.setFailed(error.message)
}
