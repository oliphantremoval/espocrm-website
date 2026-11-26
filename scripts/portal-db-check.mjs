import { neon } from '@neondatabase/serverless';
import { readFile } from 'node:fs/promises';
import { lookup } from 'node:dns/promises';

// The connection string is supplied through stdin, never as an argument or log.
if (!process.stdin.isTTY) throw new Error('A secure interactive input is required.');
process.stdin.setRawMode(true);
process.stdin.setEncoding('utf8');
process.stdout.write('Ready for private connection.\n');
const url = await new Promise((resolve) => {
  let buffer = '';
  process.stdin.on('data', (chunk) => {
    buffer += chunk;
    if (buffer.includes('\n') || buffer.includes('\r')) resolve(buffer.split(/[\r\n]/, 1)[0]);
  });
});
process.stdin.setRawMode(false);
process.stdin.pause();
try {
  const parsed = new URL(url);
  const dns = await lookup(parsed.hostname).then(() => 'resolved', (error) => error.code ?? 'failed');
  console.log(JSON.stringify({ credentialFormat: parsed.protocol, knownNeonHost: parsed.hostname.endsWith('.neon.tech'), dns }));
  const sql = neon(url, { fetchOptions: { signal: AbortSignal.timeout(15_000) } });
  if (process.argv[2] === '--install') {
    const schema = await readFile(new URL('../docs/sql/customer-portal.sql', import.meta.url), 'utf8');
    const statements = schema.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n').split(';').map((part) => part.trim()).filter(Boolean);
    await sql.transaction(statements.map((statement) => sql.query(statement)));
    console.log(JSON.stringify({ installed: true, statements: statements.length }));
  }
  const rows = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`;
  console.log(JSON.stringify({ connected: true, tables: rows.map((row) => row.table_name) }));
  process.exit(0);
} catch (error) {
  console.error(JSON.stringify({ connected: false, errorType: error?.name ?? 'Error', errorCode: error?.code ?? null, sourceType: error?.sourceError?.name ?? null, sourceCode: error?.sourceError?.cause?.code ?? null }));
  process.exit(1);
}

