import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanFileName, MAX_CASE_PHOTOS, MAX_PHOTO_BYTES, MAX_PHOTOS, photoObjectKey, photoProblem, sniffPhotoType } from './photos';

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)));

const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const PNG = bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8 ');
const HEIC = bytes([0, 0, 0, 0x18], 'ftypheic', [0, 0, 0, 0]);

test('recognises photos by their bytes, not their name', () => {
  assert.equal(sniffPhotoType(JPEG), 'image/jpeg');
  assert.equal(sniffPhotoType(PNG), 'image/png');
  assert.equal(sniffPhotoType(WEBP), 'image/webp');
  assert.equal(sniffPhotoType(HEIC), 'image/heic');
  assert.equal(sniffPhotoType(bytes('%PDF-1.7')), null);
  assert.equal(sniffPhotoType(bytes('<svg xmlns=')), null); // SVG can carry script; never accepted
  assert.equal(sniffPhotoType(bytes([0, 0, 0, 0x18], 'ftypmp42')), null); // a video, not HEIF
  assert.equal(sniffPhotoType(new Uint8Array()), null);
});

test('photo list rules: count, size, type', () => {
  const ok = { name: 'a.jpg', size: 1000, bytes: JPEG };
  assert.equal(photoProblem([]), null);
  assert.equal(photoProblem([ok, { ...ok, bytes: PNG }]), null);
  assert.match(photoProblem(Array(MAX_PHOTOS + 1).fill(ok))!, /up to 6 photos at a time/);
  // Adding to an existing case: the case total is capped too.
  assert.equal(photoProblem([ok, ok], MAX_CASE_PHOTOS - 2), null);
  assert.match(photoProblem([ok, ok, ok], MAX_CASE_PHOTOS - 2)!, /can take 2 more photos/);
  assert.match(photoProblem([ok], MAX_CASE_PHOTOS)!, /already has 12 photos/);
  assert.match(photoProblem([{ ...ok, name: 'big.jpg', size: MAX_PHOTO_BYTES + 1 }])!, /“big.jpg” is too large/);
  assert.match(photoProblem([{ name: 'notes.jpg', size: 10, bytes: bytes('hello') }])!, /“notes.jpg” is not a photo/);
});

test('object keys are dated, typed and prefixed', () => {
  const at = new Date('2026-10-01T05:00:00Z');
  assert.equal(photoObjectKey('abc', 'image/jpeg', at), 'cases/2026/10/abc.jpg');
  assert.equal(photoObjectKey('abc', 'image/heic', at, 'e2e/'), 'e2e/cases/2026/10/abc.heic');
});

test('file names lose paths, quotes and control characters', () => {
  assert.equal(cleanFileName('C:\\fakepath\\IMG_0012.JPG'), 'IMG_0012.JPG');
  assert.equal(cleanFileName('a"b\u0000.jpg'), 'ab.jpg');
  assert.equal(cleanFileName('   '), null);
});
