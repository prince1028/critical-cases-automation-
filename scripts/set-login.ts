/**
 * Give an employee a username + password (e.g. the first admin), typing the password in a hidden prompt.
 * Run it in your own terminal (not through a chat tool), so the password is never shown or logged:
 *
 *   npm run user:set-login -- --name "Full Name" --username yourname --role ADMIN
 *
 * --name finds an existing employee (case-insensitive) or, with --team, creates one.
 * Afterwards, manage everyone else from the app: Users page (admins only).
 */
import { parseArgs } from 'node:util';
import { sql } from 'drizzle-orm';
import { db, pool } from '../src/db';
import { users } from '../src/db/schema';
import { hashPassword } from '../src/lib/password';
import { newPasswordSchema, usernameSchema } from '../src/lib/validation';

const { values } = parseArgs({
  options: { name: { type: 'string' }, username: { type: 'string' }, role: { type: 'string' }, team: { type: 'string' } },
});

function ask(question: string): Promise<string> {
  // Hidden input: raw mode, no echo.
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) return reject(new Error('Run this in an interactive terminal so the password can be typed privately.'));
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let input = '';
    const onData = (ch: string) => {
      if (ch === '\r' || ch === '\n') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off('data', onData);
        process.stdout.write('\n');
        resolve(input);
      } else if (ch === '\u0003') {
        process.stdout.write('\n');
        process.exit(130);
      } else if (ch === '\u007f' || ch === '\b') {
        input = input.slice(0, -1);
      } else {
        input += ch;
      }
    };
    stdin.on('data', onData);
  });
}

const name = values.name?.replace(/\s+/g, ' ').trim();
if (!name) throw new Error('--name is required');
const username = usernameSchema.parse(values.username ?? '');
const role = values.role?.toUpperCase();
if (role && role !== 'SALES' && role !== 'MANAGER' && role !== 'ADMIN') throw new Error('--role must be SALES, MANAGER or ADMIN');

const [existing] = await db
  .select({ id: users.id, role: users.role })
  .from(users)
  .where(sql`lower(regexp_replace(trim(${users.name}), '\\s+', ' ', 'g')) = lower(${name})`)
  .limit(1);
if (!existing && !values.team) throw new Error(`No employee named "${name}". Add --team to create them.`);

const [taken] = await db
  .select({ id: users.id })
  .from(users)
  .where(sql`${users.username} = ${username} AND ${users.id} IS DISTINCT FROM ${existing?.id ?? null}`)
  .limit(1);
if (taken) throw new Error(`Username "${username}" is already used by someone else.`);

const password = await ask(`New password for ${name} (${username}): `);
const check = newPasswordSchema.safeParse(password);
if (!check.success) throw new Error(check.error.issues[0].message);
if ((await ask('Repeat password: ')) !== password) throw new Error('Passwords do not match');

const passwordHash = await hashPassword(password);
if (existing) {
  await db
    .update(users)
    .set({
      username,
      passwordHash,
      mustChangePassword: false,
      failedLoginAttempts: 0,
      lockedUntil: null,
      sessionVersion: sql`${users.sessionVersion} + 1`,
      ...(role ? { role: role as 'SALES' | 'MANAGER' | 'ADMIN' } : {}),
      ...(values.team ? { team: values.team } : {}),
      updatedAt: new Date(),
    })
    .where(sql`${users.id} = ${existing.id}`);
  console.log(`Login set for "${name}": username "${username}", role ${role ?? existing.role}.`);
} else {
  await db.insert(users).values({
    name,
    username,
    passwordHash,
    team: values.team!,
    role: (role as 'SALES' | 'MANAGER' | 'ADMIN') ?? 'SALES',
  });
  console.log(`Created "${name}" with username "${username}", role ${role ?? 'SALES'}.`);
}
await pool.end();
