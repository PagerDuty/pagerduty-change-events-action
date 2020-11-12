# PagerDuty Change Events GitHub Action

This action creates a PagerDuty change event.

## Inputs

### `integration-key`

**Required** The integration key that identifies the PagerDuty service the change was made to.

## Outputs

### `status`

The status code returned from the API call to create the change event.

### `response`

The message returned from the API call to create the change event.

## Example usage

```
uses: actions/pagerduty-change-events-action@v0.1
with:
  integration-key: 'abcdabcdabcdabcdabcdabcdabcdabcd'
```
