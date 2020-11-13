# PagerDuty Change Events GitHub Action

This action creates a PagerDuty [change event](https://support.pagerduty.com/docs/change-events). Change events help
you track deploys, build completion, configuration updates, etc., providing contextual information that is critical during incident triage.

## Getting Started

Before you can use this action you'll need to have a PagerDuty service configured with an integration. To add a
GitHub integration to your service, follow [these instructions](https://support.pagerduty.com/docs/github-changes#in-pagerduty). Upon completing those steps you should receive an integration key that you can use with this action.

Currently only `push` and `pull_request` events are handled, and for `pull_request` events, a change event will only be created
when the pull request is merged. You can choose which event and which branches change events should be created for in your
workflow configuration.

## Inputs

### `integration-key`

**Required** The integration key that identifies the PagerDuty service the change was made to.

## Example usage

```
on:
  push:
    branches:
      - master
  pull_request:
    branches:
      - master
    types:
      - closed

jobs:
  action-test-job:
    runs-on: ubuntu-latest
    name: Deploying the application
    steps:
      - name: Create a change event
        uses: actions/pagerduty-change-events-action@master
        with:
          integration-key: '<your-integration-key-here>'
```
