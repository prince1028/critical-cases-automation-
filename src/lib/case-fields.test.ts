import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeIssueFields } from './case-fields';

test('several problems: union of shown and required fields, fixed field order, hint from the first', () => {
  assert.equal(mergeIssueFields([]), null);
  const m = mergeIssueFields(['DAMAGED_TILE', 'COLOR_UNAVAILABLE', 'INSUFFICIENT_STOCK'])!;
  assert.deepEqual(m.show, ['requestedColor', 'quantities', 'alternative']);
  assert.deepEqual(new Set(m.required), new Set(['requestedColor', 'requiredQuantity', 'availableQuantity', 'unit']));
  assert.match(m.descriptionHint, /damaged/i);
});
