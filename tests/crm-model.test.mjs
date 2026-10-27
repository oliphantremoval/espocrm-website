import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoState, createEmptyState, validateImport } from '../app/crm/model.ts';

// A deterministic, realistic backup: tests do not depend on the demo's current date.
function backup() {
  return {
    version: 1,
    demo: false,
    customers: [{
      id: 'customer-1',
      name: 'Sample Customer',
      email: 'customer@example.com',
      phone: '(810) 555-0100',
      address: '100 Example Lane, Lapeer, MI',
      notes: 'Use the side gate.',
    }],
    jobs: [{
      id: 'job-1',
      customerId: 'customer-1',
      title: 'Storm cleanup',
      service: 'Storm cleanup',
      stage: 'Scheduled',
      priority: 'Urgent',
      amount: 1250.75,
      scheduledDate: '2026-10-27',
      scheduledTime: '09:30',
      crew: 'Crew A',
      notes: 'Remove the fallen branches.',
      createdAt: '2026-10-26T15:30:00.000Z',
    }],
    tasks: [{
      id: 'task-1',
      title: 'Confirm property access',
      dueDate: '2026-10-26',
      done: false,
    }],
  };
}

test('a customer/job/task backup survives JSON export and import with decimal estimates intact', () => {
  const original = backup();
  const restored = validateImport(JSON.parse(JSON.stringify(original)));
  assert.deepEqual(restored, original);
  assert.equal(restored.jobs[0].amount, 1250.75);
  assert.notEqual(restored, original);
  assert.notEqual(restored.customers[0], original.customers[0]);
});

test('empty and fictional demo workspaces can both be restored', () => {
  assert.deepEqual(validateImport(createEmptyState()), {
    version: 1, customers: [], jobs: [], tasks: [], demo: false,
  });
  const demo = createDemoState();
  assert.equal(demo.demo, true);
  assert.ok(demo.jobs.length > 0);
  assert.ok(demo.customers.every(customer => customer.email.endsWith('@example.com')));
  assert.deepEqual(validateImport(JSON.parse(JSON.stringify(demo))), demo);
});

test('unknown fields are discarded at every record level', () => {
  const original = backup();
  const input = backup();
  input.untrusted = { enabled: true };
  input.customers[0].admin = true;
  input.jobs[0].externalWebhook = 'https://example.com';
  input.tasks[0].unexpected = 'discard me';
  assert.deepEqual(validateImport(input), original);
});

test('malformed backup envelopes and records are rejected', () => {
  const malformed = [null, [], {}, { ...backup(), version: 2 },
    { ...backup(), demo: 'false' }, { ...backup(), customers: {} },
    { ...backup(), jobs: [null] }, { ...backup(), tasks: [{ ...backup().tasks[0], done: 'false' }] }];
  for (const input of malformed) assert.throws(() => validateImport(input), Error);
});

test('a job cannot refer to a missing customer', () => {
  const input = backup();
  input.jobs[0].customerId = 'missing-customer';
  assert.throws(() => validateImport(input), /customer that is missing/);
});

for (const collection of ['customers', 'jobs', 'tasks']) {
  test(`duplicate ${collection} IDs are rejected instead of silently merging records`, () => {
    const input = backup();
    input[collection].push({ ...input[collection][0] });
    assert.throws(() => validateImport(input), /duplicate IDs/);
  });
}

for (const amount of [-1, Infinity, -Infinity, NaN, '1250.75', null]) {
  test(`invalid estimate amount ${String(amount)} is rejected`, () => {
    const input = backup();
    input.jobs[0].amount = amount;
    assert.throws(() => validateImport(input), /finite number of dollars/);
  });
}

test('a zero-dollar lead and a leap-day appointment are valid', () => {
  const input = backup();
  input.jobs[0].amount = 0;
  input.jobs[0].scheduledDate = '2028-02-29';
  assert.equal(validateImport(input).jobs[0].amount, 0);
});

for (const date of ['2026-02-29', '2026-04-31', '2026-13-01', '10/27/2026']) {
  test(`invalid appointment date ${date} is rejected`, () => {
    const input = backup();
    input.jobs[0].scheduledDate = date;
    assert.throws(() => validateImport(input), /valid date/);
  });
}

test('invalid task dates, appointment times, and creation timestamps are rejected', () => {
  const due = backup();
  due.tasks[0].dueDate = '2026-02-30';
  assert.throws(() => validateImport(due), /valid date/);
  const time = backup();
  time.jobs[0].scheduledTime = '24:00';
  assert.throws(() => validateImport(time), /HH:mm/);
  const created = backup();
  created.jobs[0].createdAt = '2026-02-30T09:30:00.000Z';
  assert.throws(() => validateImport(created), /ISO timestamp/);
});

test('unknown stages, unsafe IDs, and invalid contact details are rejected', () => {
  const stage = backup();
  stage.jobs[0].stage = 'Automatically paid';
  assert.throws(() => validateImport(stage), /unknown stage/);
  const customer = backup();
  customer.customers[0].id = '<script>';
  assert.throws(() => validateImport(customer), /invalid characters/);
  const email = backup();
  email.customers[0].email = 'not-an-email';
  assert.throws(() => validateImport(email), /invalid email/);
  const name = backup();
  name.customers[0].name = '   ';
  assert.throws(() => validateImport(name), /cannot be empty/);
});
