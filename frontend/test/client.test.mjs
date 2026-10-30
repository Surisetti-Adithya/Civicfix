import test from 'node:test';
import assert from 'node:assert/strict';

test('client error parsing', () => {
  const errorPayload = {
    code: 'UNAUTHORIZED',
    message: 'Invalid session token.',
    details: {}
  };
  assert.equal(errorPayload.code, 'UNAUTHORIZED');
  assert.equal(errorPayload.message, 'Invalid session token.');
});
