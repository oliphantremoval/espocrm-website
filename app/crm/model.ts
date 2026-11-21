export const stages = [
  'New lead',
  'Estimate sent',
  'Scheduled',
  'In progress',
  'Completed',
  'Lost',
] as const;

/** Default options. Owners can customize their active service list in Settings. */
export const services = [
  'Tree removal',
  'Snow removal',
  'Scrap removal',
  'Tree trimming',
  'Storm cleanup',
  'Junk removal',
] as const;

export const priorities = ['Normal', 'Urgent'] as const;

export type Stage = (typeof stages)[number];
export type Service = string;
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

export type CRMSettings = {
  profile: {
    ownerName: string;
    title: string;
    contactEmail: string;
    phone: string;
  };
  business: {
    name: string;
    email: string;
    phone: string;
    website: string;
    address: string;
    serviceArea: string;
    timezone: string;
  };
  services: string[];
  jobDefaults: {
    priority: Priority;
    crew: string;
    arrivalTime: string;
    durationMinutes: number;
  };
  estimateDefaults: {
    validForDays: number;
    depositPercent: number;
    terms: string;
  };
  notifications: {
    newLeadEmail: boolean;
    followUpReminders: boolean;
    jobReminders: boolean;
    estimateReminders: boolean;
  };
  billing: {
    currency: 'USD';
    invoiceDueDays: number;
    lateFeeEnabled: boolean;
    lateFeePercent: number;
    acceptCard: boolean;
    acceptBankAccount: boolean;
  };
};

export type CRMState = {
  version: 2;
  customers: Customer[];
  jobs: Job[];
  tasks: Task[];
  settings: CRMSettings;
  demo: boolean;
};

export function createDefaultSettings(): CRMSettings {
  return {
    profile: {
      ownerName: 'Aiden Oliphant',
      title: 'Owner',
      contactEmail: 'oliphantremoval@gmail.com',
      phone: '810-542-5833',
    },
    business: {
      name: 'Oliphant Removal',
      email: 'oliphantremoval@gmail.com',
      phone: '810-542-5833',
      website: 'https://oliphantremoval.com',
      address: '',
      serviceArea: 'Lapeer County and surrounding areas',
      timezone: 'America/New_York',
    },
    services: [...services],
    jobDefaults: {
      priority: 'Normal',
      crew: '',
      arrivalTime: '',
      durationMinutes: 120,
    },
    estimateDefaults: {
      validForDays: 30,
      depositPercent: 0,
      terms: 'Payment is due according to the estimate or invoice terms.',
    },
    notifications: {
      newLeadEmail: true,
      followUpReminders: true,
      jobReminders: true,
      estimateReminders: true,
    },
    billing: {
      currency: 'USD',
      invoiceDueDays: 0,
      lateFeeEnabled: false,
      lateFeePercent: 0,
      acceptCard: true,
      acceptBankAccount: true,
    },
  };
}

export function createEmptyState(): CRMState {
  return { version: 2, customers: [], jobs: [], tasks: [], settings: createDefaultSettings(), demo: false };
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
    version: 2,
    demo: true,
    settings: createDefaultSettings(),
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
  if (!isRecord(input) || (input.version !== 1 && input.version !== 2)) {
    fail('Choose an Oliphant CRM backup with version 1 or 2.');
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
  const email = (value: unknown, label: string): string => {
    const result = text(value, label, 254);
    if (result && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) fail(`${label} has an invalid email address.`);
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
  const bool = (value: unknown, label: string): boolean => {
    if (typeof value !== 'boolean') fail(`${label} must be true or false.`);
    return value;
  };
  const number = (value: unknown, label: string, min: number, max: number, integer = false): number => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
      fail(`${label} must be ${integer ? 'a whole number' : 'a number'} between ${min} and ${max}.`);
    }
    return value;
  };
  const time = (value: unknown, label: string): string => {
    const result = text(value, label, 5);
    if (result && !/^([01]\d|2[0-3]):[0-5]\d$/.test(result)) fail(`${label} must be in HH:mm format.`);
    return result;
  };
  const settingsRecord = (value: unknown, label: string): Record<string, unknown> => {
    if (!isRecord(value)) fail(`${label} must be an object.`);
    return value;
  };

  const settings = (() => {
    if (input.version === 1 && input.settings === undefined) return createDefaultSettings();
    const entry = settingsRecord(input.settings, 'Settings');
    const profileInput = settingsRecord(entry.profile, 'Profile settings');
    const businessInput = settingsRecord(entry.business, 'Business settings');
    const jobInput = settingsRecord(entry.jobDefaults, 'Job defaults');
    const estimateInput = settingsRecord(entry.estimateDefaults, 'Estimate defaults');
    const notificationInput = settingsRecord(entry.notifications, 'Notification settings');
    const billingInput = settingsRecord(entry.billing, 'Billing settings');
    if (!Array.isArray(entry.services) || entry.services.length < 1 || entry.services.length > 30) {
      fail('Services must contain between 1 and 30 entries.');
    }
    const activeServices = entry.services.map((value, index) => {
      const result = text(value, `Service ${index + 1}`, 80, true).trim();
      if (result.length < 2) fail(`Service ${index + 1} must be at least 2 characters.`);
      return result;
    });
    if (new Set(activeServices.map((service) => service.toLocaleLowerCase())).size !== activeServices.length) {
      fail('Services cannot contain duplicates.');
    }
    const website = text(businessInput.website, 'Business website', 2_048);
    if (website) {
      try {
        const parsed = new URL(website);
        if (!['http:', 'https:'].includes(parsed.protocol)) fail('Business website must use http or https.');
      } catch {
        fail('Business website must be a valid URL.');
      }
    }
    const timezone = text(businessInput.timezone, 'Business timezone', 100, true);
    try {
      Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    } catch {
      fail('Business timezone must be a valid IANA timezone.');
    }
    const priority = text(jobInput.priority, 'Default priority', 20, true);
    if (!(priorities as readonly string[]).includes(priority)) fail('Default priority is not supported.');
    const currency = text(billingInput.currency, 'Billing currency', 3, true);
    if (currency !== 'USD') fail('Billing currency must be USD.');
    return {
      profile: {
        ownerName: text(profileInput.ownerName, 'Profile name', 200, true),
        title: text(profileInput.title, 'Profile title', 100, true),
        contactEmail: email(profileInput.contactEmail, 'Profile email'),
        phone: text(profileInput.phone, 'Profile phone', 80),
      },
      business: {
        name: text(businessInput.name, 'Business name', 200, true),
        email: email(businessInput.email, 'Business email'),
        phone: text(businessInput.phone, 'Business phone', 80),
        website,
        address: text(businessInput.address, 'Business address', 500),
        serviceArea: text(businessInput.serviceArea, 'Service area', 500),
        timezone,
      },
      services: activeServices,
      jobDefaults: {
        priority: priority as Priority,
        crew: text(jobInput.crew, 'Default crew', 200),
        arrivalTime: time(jobInput.arrivalTime, 'Default arrival time'),
        durationMinutes: number(jobInput.durationMinutes, 'Default duration', 15, 1_440, true),
      },
      estimateDefaults: {
        validForDays: number(estimateInput.validForDays, 'Estimate validity', 1, 365, true),
        depositPercent: number(estimateInput.depositPercent, 'Deposit percentage', 0, 100),
        terms: text(estimateInput.terms, 'Estimate terms', 2_000),
      },
      notifications: {
        newLeadEmail: bool(notificationInput.newLeadEmail, 'New lead email setting'),
        followUpReminders: bool(notificationInput.followUpReminders, 'Follow-up reminder setting'),
        jobReminders: bool(notificationInput.jobReminders, 'Job reminder setting'),
        estimateReminders: bool(notificationInput.estimateReminders, 'Estimate reminder setting'),
      },
      billing: {
        currency: 'USD',
        invoiceDueDays: number(billingInput.invoiceDueDays, 'Invoice due days', 0, 365, true),
        lateFeeEnabled: bool(billingInput.lateFeeEnabled, 'Late fee setting'),
        lateFeePercent: number(billingInput.lateFeePercent, 'Late fee percentage', 0, 100),
        acceptCard: bool(billingInput.acceptCard, 'Card payment setting'),
        acceptBankAccount: bool(billingInput.acceptBankAccount, 'Bank account payment setting'),
      },
    } satisfies CRMSettings;
  })();

  const customers = records(input.customers, 'Customers').map((entry, index): Customer => {
    const label = `Customer ${index + 1}`;
    return {
      id: id(entry.id, `${label} ID`),
      name: text(entry.name, `${label} name`, 200, true),
      email: email(entry.email, `${label} email`),
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
    const service = text(entry.service, `${label} service`, 80, true);
    if (!(stages as readonly unknown[]).includes(entry.stage)) fail(`${label} has an unknown stage.`);
    if (!(priorities as readonly unknown[]).includes(entry.priority)) fail(`${label} has an unknown priority.`);
    if (typeof entry.amount !== 'number' || !Number.isFinite(entry.amount) || entry.amount < 0) {
      fail(`${label} amount must be a finite number of dollars, zero or greater.`);
    }
    const scheduledTime = time(entry.scheduledTime, `${label} scheduled time`);
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
      service,
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
    return {
      id: id(entry.id, `${label} ID`),
      title: text(entry.title, `${label} title`, 300, true),
      dueDate: date(entry.dueDate, `${label} due date`),
      done: bool(entry.done, `${label} completion`),
    };
  });
  unique(tasks, 'Tasks');

  return { version: 2, customers, jobs, tasks, settings, demo: input.demo };
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

