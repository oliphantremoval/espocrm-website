export const stages = [
  'New lead',
  'Estimate sent',
  'Scheduled',
  'In progress',
  'Completed',
  'Lost',
] as const;

export const services = [
  'Tree removal',
  'Tree trimming',
  'Junk removal',
  'Snow removal',
  'Storm cleanup',
] as const;

export const priorities = ['Normal', 'Urgent'] as const;

export type Stage = (typeof stages)[number];
export type Service = (typeof services)[number];
export type Priority = (typeof priorities)[number];

export type Customer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
};

export type Job = {
  id: string;
  customerId: string;
  title: string;
  service: Service;
  stage: Stage;
  priority: Priority;
  amount: number;
  scheduledDate: string;
  scheduledTime: string;
  crew: string;
  notes: string;
  createdAt: string;
};

export type Task = {
  id: string;
  title: string;
  dueDate: string;
  done: boolean;
};

export type CRMState = {
  version: 1;
  customers: Customer[];
  jobs: Job[];
  tasks: Task[];
  demo: boolean;
};

export function createEmptyState(): CRMState {
  return { version: 1, customers: [], jobs: [], tasks: [], demo: false };
}

function localDate(offset = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

/** Fictional records for exploring the dashboard; these are not customer data. */
export function createDemoState(): CRMState {
  const names = [
    'Jamie Bennett',
    'Morgan Davis',
    'Casey Wilson',
    'Taylor Brooks',
    'Jordan Ellis',
    'Alex Parker',
    'Riley Morgan',
  ];
  const customers: Customer[] = names.map((name, index) => ({
    id: `demo-customer-${index + 1}`,
    name,
    email: `${name.toLowerCase().replace(' ', '.')}@example.com`,
    phone: `(810) 555-01${String(index + 1).padStart(2, '0')}`,
    address: `${120 + index * 10} Example Lane, Lapeer, MI`,
    notes: 'Fictional sample customer for the CRM demonstration.',
  }));

  const sampleJobs: Pick<
    Job,
    'title' | 'service' | 'stage' | 'priority' | 'amount' | 'scheduledDate' | 'scheduledTime' | 'crew'
  >[] = [
    { title: 'Backyard oak removal', service: 'Tree removal', stage: 'New lead', priority: 'Normal', amount: 0, scheduledDate: '', scheduledTime: '', crew: '' },
    { title: 'Garage cleanout', service: 'Junk removal', stage: 'Estimate sent', priority: 'Normal', amount: 450, scheduledDate: '', scheduledTime: '', crew: '' },
    { title: 'Storm-damaged tree cleanup', service: 'Storm cleanup', stage: 'Scheduled', priority: 'Urgent', amount: 1250, scheduledDate: localDate(), scheduledTime: '09:00', crew: 'Crew A' },
    { title: 'Front yard tree trimming', service: 'Tree trimming', stage: 'In progress', priority: 'Normal', amount: 680, scheduledDate: localDate(), scheduledTime: '11:30', crew: 'Crew B' },
    { title: 'Driveway snow removal', service: 'Snow removal', stage: 'Scheduled', priority: 'Normal', amount: 180, scheduledDate: localDate(1), scheduledTime: '08:00', crew: 'Crew A' },
    { title: 'Fallen branch removal', service: 'Tree removal', stage: 'Completed', priority: 'Normal', amount: 920, scheduledDate: localDate(-2), scheduledTime: '10:00', crew: 'Crew A' },
    { title: 'Basement cleanout', service: 'Junk removal', stage: 'Lost', priority: 'Normal', amount: 575, scheduledDate: '', scheduledTime: '', crew: '' },
  ];

  return {
    version: 1,
    demo: true,
    customers,
    jobs: sampleJobs.map((job, index) => ({
      ...job,
      id: `demo-job-${index + 1}`,
      customerId: customers[index].id,
      notes: 'Fictional sample job. No estimate or notification has been sent.',
      createdAt: new Date(Date.now() - (index + 1) * 86_400_000).toISOString(),
    })),
    tasks: [
      { id: 'demo-task-1', title: 'Follow up on the garage cleanout estimate', dueDate: localDate(), done: false },
      { id: 'demo-task-2', title: 'Confirm tomorrow’s crew and equipment', dueDate: localDate(), done: false },
      { id: 'demo-task-3', title: 'Review the completed branch removal', dueDate: localDate(-1), done: true },
    ],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(message: string): never {
  throw new Error(message);
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Validate and rebuild imported data, ignoring unknown fields instead of copying them. */
export function validateImport(input: unknown): CRMState {
  if (!isRecord(input) || input.version !== 1) {
    fail('Choose an Oliphant CRM backup with version 1.');
  }
  if (typeof input.demo !== 'boolean') fail('The backup must identify whether it contains demo data.');

  let textLength = 0;
  const text = (value: unknown, label: string, max: number, required = false): string => {
    if (typeof value !== 'string') fail(`${label} must be text.`);
    if (value.length > max) fail(`${label} is too long (maximum ${max} characters).`);
    if (required && !value.trim()) fail(`${label} cannot be empty.`);
    textLength += value.length;
    if (textLength > 5_000_000) fail('The backup is too large. Use a file smaller than 5 MB.');
    return value;
  };
  const id = (value: unknown, label: string): string => {
    const result = text(value, label, 100, true);
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(result)) fail(`${label} contains invalid characters.`);
    return result;
  };
  const date = (value: unknown, label: string): string => {
    const result = text(value, label, 10);
    if (result && !validDate(result)) fail(`${label} must be a valid date in YYYY-MM-DD format.`);
    return result;
  };
  const records = (value: unknown, label: string): Record<string, unknown>[] => {
    if (!Array.isArray(value)) fail(`${label} must be a list.`);
    if (value.length > 5_000) fail(`${label} cannot contain more than 5,000 records.`);
    if (!value.every(isRecord)) fail(`${label} contains an invalid record.`);
    return value;
  };
  const unique = (items: { id: string }[], label: string) => {
    if (new Set(items.map((item) => item.id)).size !== items.length) fail(`${label} contains duplicate IDs.`);
  };

  const customers = records(input.customers, 'Customers').map((entry, index): Customer => {
    const label = `Customer ${index + 1}`;
    const email = text(entry.email, `${label} email`, 320);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(`${label} has an invalid email address.`);
    return {
      id: id(entry.id, `${label} ID`),
      name: text(entry.name, `${label} name`, 200, true),
      email,
      phone: text(entry.phone, `${label} phone`, 80),
      address: text(entry.address, `${label} address`, 1_000),
      notes: text(entry.notes, `${label} notes`, 10_000),
    };
  });
  unique(customers, 'Customers');
  const customerIds = new Set(customers.map((customer) => customer.id));

  const jobs = records(input.jobs, 'Jobs').map((entry, index): Job => {
    const label = `Job ${index + 1}`;
    const customerId = id(entry.customerId, `${label} customer ID`);
    if (!customerIds.has(customerId)) fail(`${label} refers to a customer that is missing from the backup.`);
    if (!(services as readonly unknown[]).includes(entry.service)) fail(`${label} has an unknown service.`);
    if (!(stages as readonly unknown[]).includes(entry.stage)) fail(`${label} has an unknown stage.`);
    if (!(priorities as readonly unknown[]).includes(entry.priority)) fail(`${label} has an unknown priority.`);
    if (typeof entry.amount !== 'number' || !Number.isFinite(entry.amount) || entry.amount < 0) {
      fail(`${label} amount must be a finite number of dollars, zero or greater.`);
    }
    const scheduledTime = text(entry.scheduledTime, `${label} scheduled time`, 5);
    if (scheduledTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(scheduledTime)) {
      fail(`${label} time must be in HH:mm format.`);
    }
    const createdAt = text(entry.createdAt, `${label} creation date`, 30, true);
    if (!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,3})?Z$/.test(createdAt)
      || !validDate(createdAt.slice(0, 10))
      || !Number.isFinite(Date.parse(createdAt))) {
      fail(`${label} creation date must be a valid ISO timestamp.`);
    }
    return {
      id: id(entry.id, `${label} ID`),
      customerId,
      title: text(entry.title, `${label} title`, 300, true),
      service: entry.service as Service,
      stage: entry.stage as Stage,
      priority: entry.priority as Priority,
      amount: entry.amount,
      scheduledDate: date(entry.scheduledDate, `${label} scheduled date`),
      scheduledTime,
      crew: text(entry.crew, `${label} crew`, 200),
      notes: text(entry.notes, `${label} notes`, 10_000),
      createdAt,
    };
  });
  unique(jobs, 'Jobs');

  const tasks = records(input.tasks, 'Tasks').map((entry, index): Task => {
    const label = `Task ${index + 1}`;
    if (typeof entry.done !== 'boolean') fail(`${label} completion must be true or false.`);
    return {
      id: id(entry.id, `${label} ID`),
      title: text(entry.title, `${label} title`, 300, true),
      dueDate: date(entry.dueDate, `${label} due date`),
      done: entry.done,
    };
  });
  unique(tasks, 'Tasks');

  return { version: 1, customers, jobs, tasks, demo: input.demo };
}

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function money(amount: number): string {
  return currency.format(amount);
}

export function initials(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}
