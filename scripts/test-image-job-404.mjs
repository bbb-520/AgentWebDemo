import assert from 'node:assert/strict';
import { test } from 'node:test';
import { imageJobResponseAction } from '../src/lib/imageJobPolling.ts';

test('404 image-job responses are distinguishable from transient failures', async () => {
  assert.equal(imageJobResponseAction(404), 'missing');
});

test('transient image-job responses remain retryable', async () => {
  assert.equal(imageJobResponseAction(503), 'retry');
});
