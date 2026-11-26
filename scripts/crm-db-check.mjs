import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';

const tables = ['crm_team_members', 'crm_team_login_links', 'crm_team_sessions', 'crm_team_rate_limits', 'crm_workspace'];
const args = process.argv.slice(2);
const install = args.length === 1 && args[0] === '--install';
if (args.length && !install) throw new Error('Usage: node scripts/crm-db-check.mjs [--install]');
if (!process.stdin.isTTY) throw new Error('A secure interactive terminal is required.');

// Keep the database URL out of command history, arguments, and logs.
process.stdout.write('Enter the Neon database connection URL (input hidden)\n');
process.stdin.setRawMode(true);
process.stdin.setEncoding('utf8');
let databaseUrl;
try {
  databaseUrl = await new Promise((resolve, reject) => {
    let input = '';
    const onInput = (chunk) => {
      for (const character of chunk) {
        if (character === '\u0003') return finish(() => reject(new Error('Cancelled.')));
        if (character === '\n' || character === '\r') return finish(() => resolve(input.trim()));
        if (character === '\b' || character === '\u007f') input = input.slice(0, -1);
        else input += character;
      }
    };
    function finish(callback) {
      process.stdin.off('data', onInput);
      callback();
    }
    process.stdin.on('data', onInput);
  });
} finally {
  process.stdin.setRawMode(false);
  process.stdin.pause();
}

try {
  const connection = new URL(databaseUrl);
  if (connection.protocol !== 'postgresql:' || !connection.hostname.endsWith('.neon.tech')) {
    throw new Error('Expected a Neon Postgres connection URL.');
  }
  const sql = neon(databaseUrl, { fetchOptions: { signal: AbortSignal.timeout(20_000) } });
  if (install) {
    const schemas = await Promise.all(['crm-team.sql', 'crm-workspace.sql'].map((file) =>
      readFile(new URL(`../docs/sql/${file}`, import.meta.url), 'utf8')));
    const statements = schemas.flatMap((schema) => schema.replace(/^\s*--.*$/gm, '').split(';').map((part) => part.trim()).filter(Boolean));
    await sql.transaction(statements.map((statement) => sql.query(statement)));
  }
  const rows = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = ANY(${tables}::text[])
  `;
  const found = new Set(rows.map((row) => row.table_name));
  const missing = tables.filter((name) => !found.has(name));
  if (missing.length) {
    console.error(`CRM tables missing: ${missing.join(', ')}`);
    process.exitCode = 1;
  } else {
    console.log('CRM team and shared workspace tables are ready.');
  }
} catch (error) {
  const code = typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? ` (${error.code})` : '';
  console.error(`CRM database setup could not be verified${code}.`);
  process.exitCode = 1;
}
