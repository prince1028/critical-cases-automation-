import { expect, test, type Page } from '@playwright/test';
import type pg from 'pg';
import { RUN, chooseTileNotFound, connectDb, createTestUser, loginAs } from './helpers';

// Runs on the Neon e2e-test branch; uploaded test photos go under the "e2e/" storage prefix.
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
const OWNER = `e2e.photo.${RUN}`;
const OTHER = `e2e.photo2.${RUN}`;
const SUPPLY = `e2e.photo.supply.${RUN}`;
/** The case reported in the first test; the add-photo tests build on it. */
let caseId = '';

// A real 1x1 PNG, so the browser can decode and re-encode it like a phone photo.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const photo = (name: string) => ({ name, mimeType: 'image/png', buffer: PNG });

let db: pg.Client;
test.beforeAll(async () => {
  db = await connectDb();
  await createTestUser(db, { name: `E2E Photo Owner ${RUN}`, username: OWNER, team: 'Sales' });
  await createTestUser(db, { name: `E2E Photo Other ${RUN}`, username: OTHER, team: 'Sales' });
  await createTestUser(db, { name: `E2E Photo Supply ${RUN}`, username: SUPPLY, team: 'Supply' });
});
test.afterAll(async () => db?.end());
const q = async <T extends pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

async function startCase(page: Page, text: string) {
  await page.goto(`${BASE}/cases/new`);
  await chooseTileNotFound(page);
  await page.getByRole('checkbox', { name: 'Damaged Tile' }).click();
  await page.getByLabel('Customer requirement / description *').fill(text);
}

test.describe.configure({ mode: 'serial' });

test('salesperson attaches photos; only people who can see the case can open them', async ({ browser, playwright }) => {
  const page = await loginAs(browser, OWNER, BASE);
  await startCase(page, `E2E ${RUN}: 3 boxes arrived cracked`);

  // Add three, remove one: two are sent.
  const input = page.getByTestId('photo-input');
  await input.setInputFiles([photo('crack-1.png'), photo('crack-2.png')]);
  await input.setInputFiles([photo('label.png')]);
  const thumbs = page.getByRole('list', { name: 'Attached photos' }).getByRole('listitem');
  await expect(thumbs).toHaveCount(3);
  await expect(page.getByText('3/6 photos')).toBeVisible();
  await page.getByRole('button', { name: 'Remove photo 2' }).click();
  await expect(thumbs).toHaveCount(2);

  await page.getByRole('button', { name: 'Submit Case' }).click();
  await expect(page).toHaveURL(/\/cases\/[0-9a-f-]{36}(\?created=1)?$/);
  caseId = new URL(page.url()).pathname.split('/').pop()!;

  // Stored: two rows, JPEG (re-encoded in the browser), under the test prefix, in the order picked.
  const rows = await q<{ id: string; object_key: string; content_type: string; file_name: string; size_bytes: number }>(
    'SELECT id, object_key, content_type, file_name, size_bytes FROM case_attachments WHERE case_id = $1 ORDER BY position',
    [caseId],
  );
  expect(rows.map((r) => r.file_name)).toEqual(['crack-1.jpg', 'label.jpg']);
  for (const r of rows) {
    expect(r.content_type).toBe('image/jpeg');
    expect(r.object_key).toMatch(/^e2e\/cases\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.jpg$/);
    expect(r.size_bytes).toBeGreaterThan(0);
  }
  const [event] = await q<{ new_value: { photos?: number } }>(
    "SELECT new_value FROM case_events WHERE case_id = $1 AND event_type = 'CREATED'",
    [caseId],
  );
  expect(event.new_value.photos).toBe(2);

  // Shown on the case page, and the images actually load.
  await expect(page.getByText('Photos (2)')).toBeVisible();
  const imgs = page.locator('img[src^="/api/attachments/"]');
  await expect(imgs).toHaveCount(2);
  await expect.poll(() => imgs.evaluateAll((els) => els.every((e) => (e as HTMLImageElement).naturalWidth > 0))).toBe(true);

  const res = await page.request.get(`${BASE}/api/attachments/${rows[0].id}`);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('image/jpeg');
  expect(res.headers()['cache-control']).toContain('private');
  expect([...(await res.body()).subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);

  // Another salesperson: same answer as a photo that doesn't exist.
  const other = await loginAs(browser, OTHER, BASE);
  expect((await other.request.get(`${BASE}/api/attachments/${rows[0].id}`)).status()).toBe(404);
  // Signed out.
  const anon = await playwright.request.newContext();
  expect((await anon.get(`${BASE}/api/attachments/${rows[0].id}`)).status()).toBe(401);
  await anon.dispose();
});

test('a file that is not a photo is refused and nothing is saved', async ({ browser }) => {
  const page = await loginAs(browser, OWNER, BASE);
  const text = `E2E ${RUN}: fake photo`;
  await startCase(page, text);
  await page.getByTestId('photo-input').setInputFiles([{ name: 'invoice.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not really a jpeg') }]);
  await expect(page.getByRole('list', { name: 'Attached photos' }).getByRole('listitem')).toHaveCount(1);
  await page.getByRole('button', { name: 'Submit Case' }).click();

  await expect(page.getByRole('alert').filter({ hasText: 'is not a photo' })).toContainText('“invoice.jpg” is not a photo');
  await expect(page).toHaveURL(/\/cases\/new$/);
  expect(await q('SELECT 1 FROM critical_cases WHERE description = $1', [text])).toHaveLength(0);
  // The form keeps what was typed; removing the bad file lets the case through.
  await expect(page.getByLabel('Customer requirement / description *')).toHaveValue(text);
  await page.getByRole('button', { name: 'Remove photo 1' }).click();
  await page.getByRole('button', { name: 'Submit Case' }).click();
  await expect(page).toHaveURL(/\/cases\/[0-9a-f-]{36}(\?created=1)?$/);
  await expect(page.getByText(/Photos \(/)).toHaveCount(0);
});

/** Picks files the way a person does: the "Add photos" button opens the chooser (so the page must be ready). */
async function pickPhotos(page: Page, files: ReturnType<typeof photo>[]) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /^Add (more )?photos$/ }).click()]);
  await chooser.setFiles(files);
}

const photoRows = (id: string) =>
  q<{ file_name: string; position: number; uploaded_by: string }>(
    'SELECT file_name, position, uploaded_by FROM case_attachments WHERE case_id = $1 ORDER BY position',
    [id],
  );

test('the reporter and the Supply team can add photos to an existing case', async ({ browser }) => {
  expect(caseId).not.toBe('');
  const page = await loginAs(browser, OWNER, BASE);
  await page.goto(`${BASE}/cases/${caseId}`);
  await expect(page.getByText('0/6 photos')).toBeVisible();
  await pickPhotos(page, [photo('delivered.png')]);
  await page.getByRole('button', { name: 'Upload 1 photo' }).click();
  await expect(page.getByText('1 photo added').first()).toBeVisible(); // toast and timeline
  await expect(page.getByText('Photos (3)')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Attached photos' })).toHaveCount(0); // picker cleared

  // Supply team, on someone else's case.
  const supply = await loginAs(browser, SUPPLY, BASE);
  await supply.goto(`${BASE}/cases/${caseId}`);
  await pickPhotos(supply, [photo('replacement.png'), photo('invoice.png')]);
  await supply.getByRole('button', { name: 'Upload 2 photos' }).click();
  await expect(supply.getByText('Photos (5)')).toBeVisible();
  await expect(supply.getByText('2 photos added', { exact: true }).last()).toBeVisible();

  const rows = await photoRows(caseId);
  expect(rows.map((r) => [r.file_name, r.position])).toEqual([
    ['crack-1.jpg', 0], ['label.jpg', 1], ['delivered.jpg', 2], ['replacement.jpg', 3], ['invoice.jpg', 4],
  ]);
  const [{ id: supplyId }] = await q<{ id: string }>('SELECT id FROM users WHERE username = $1', [SUPPLY]);
  expect(rows[3].uploaded_by).toBe(supplyId);
  const events = await q<{ new_value: { photos_added: number } }>(
    "SELECT new_value FROM case_events WHERE case_id = $1 AND event_type = 'UPDATED' ORDER BY created_at",
    [caseId],
  );
  expect(events.map((e) => e.new_value.photos_added)).toEqual([1, 2]);
});

test('a case holds at most 12 photos; the picker offers only what is left', async ({ browser }) => {
  // Top the case up to 11 directly in the database (rows only; these images are never fetched).
  for (let i = 0; i < 6; i++) {
    await db.query(
      "INSERT INTO case_attachments (case_id, object_key, content_type, size_bytes, file_name, position) VALUES ($1, $2, 'image/jpeg', 1, 'filler.jpg', $3)",
      [caseId, `e2e/filler/${RUN}-${i}.jpg`, 10 + i],
    );
  }
  const page = await loginAs(browser, OWNER, BASE);
  await page.goto(`${BASE}/cases/${caseId}`);
  await expect(page.getByText('Photos (11)')).toBeVisible();
  await expect(page.getByText('0/1 photos')).toBeVisible();
  await pickPhotos(page, [photo('one.png'), photo('two.png')]);
  await expect(page.getByText('Only 1 photo can be added; extra photos were left out.')).toBeVisible();
  await page.getByRole('button', { name: 'Upload 1 photo' }).click();
  await expect(page.getByText('Photos (12)')).toBeVisible();
  await expect(page.getByText('This case has 12 photos, the most it can hold.')).toBeVisible();
  await expect(page.getByTestId('photo-input')).toHaveCount(0);
});

test('historical WhatsApp cases offer no photo upload, even to the Supply team', async ({ browser }) => {
  const [{ id }] = await q<{ id: string }>(
    "SELECT c.id FROM critical_cases c WHERE c.source = 'WHATSAPP_HISTORICAL' AND NOT EXISTS (SELECT 1 FROM case_attachments a WHERE a.case_id = c.id) LIMIT 1",
  );
  const supply = await loginAs(browser, SUPPLY, BASE);
  await supply.goto(`${BASE}/cases/${id}`);
  await expect(supply.getByText('Original WhatsApp messages')).toBeVisible();
  await expect(supply.getByTestId('photo-input')).toHaveCount(0);
  await expect(supply.getByText('No photos yet.')).toHaveCount(0);
});
