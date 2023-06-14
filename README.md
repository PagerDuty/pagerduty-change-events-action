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

**Required** The integration key that identifies the PagerDuty service the change was made to, added as a GitHub secret for the repository.

### `custom-event`

Custom event summary. If provided the GitHub event type is ignored and the given summary used. A link to the run is included in the change event.

### `custom-details`

Additional details about the event and affected system on a push or custom event.

### `custom-link`

Override default links to be shown on the alert and/or corresponding incident for a push or custom event.

## Example usage

```yaml
on:
  push:
    branches:
      - master
      - main
  pull_request:
    branches:
      - master
      - main
    types:
      - closed

jobs:
  send-pagerduty-change-event:
    runs-on: ubuntu-latest
    name: Sending PagerDuty Change Event
    steps:
      - name: Create a change event
        uses: PagerDuty/pagerduty-change-events-action@master
        with:
          integration-key: ${{ secrets.PAGERDUTY_CHANGE_INTEGRATION_KEY }}
```

### Custom event

Custom events can for instance be used for notifying about the result of a job:

```yaml
on:
  push:
    branches:
      - master
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    name: Deploying the application (dummy)
    steps:
      - name: Dummy step
        run: echo "Dummy deployment"

  notification:
    runs-on: ubuntu-latest
    name: Notify PagerDuty
    needs: [deploy]
    if: always()
    steps:
      # make deploy job status available
      # see https://github.com/marketplace/actions/workflow-status-action
      - uses: martialonline/workflow-status@v3
        id: check
        
      - name: Create a change event
        uses: PagerDuty/pagerduty-change-events-action@master
        with:
          integration-key: ${{ secrets.PAGERDUTY_CHANGE_INTEGRATION_KEY }}
          custom-event: Deployment ${{ steps.check.outputs.status }}
          custom-details: |
            {
              "build_state": "passed",
              "build_number": "220",
              "run_time": "1236s"
            }
          custom-links: |
            [
              {
                "href": "https://dashboard.com/1234",
                "text": "View Dashboard"
              }
            ]
```
