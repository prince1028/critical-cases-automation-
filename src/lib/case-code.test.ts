import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatCaseCode } from './case-code';

test('case codes continue the historical CC-### convention', () => {
  assert.equal(formatCaseCode(115), 'CC-115');
  assert.equal(formatCaseCode(7), 'CC-007');
  assert.equal(formatCaseCode(1000), 'CC-1000');
});
