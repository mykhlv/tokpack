export interface ExampleDef {
  label: string;
  type: 'json' | 'text';
  build: (n: number) => string;
}

export const SIZES = [10, 25, 50] as const;
export type Size = typeof SIZES[number];
export const DEFAULT_SIZE: Size = 25;

// --- Realistic data pools ---

const firstNames = [
  'Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'Ethan', 'Sophia', 'Mason',
  'Isabella', 'James', 'Mia', 'Benjamin', 'Charlotte', 'Lucas', 'Amelia',
  'Henry', 'Harper', 'Alexander', 'Evelyn', 'Daniel', 'Aria', 'Matthew',
  'Chloe', 'Sebastian', 'Luna', 'Jack', 'Ella', 'Owen', 'Grace', 'Samuel',
  'Victoria', 'Ryan', 'Scarlett', 'Leo', 'Zoey', 'Nathan', 'Lily', 'Caleb',
  'Hannah', 'Isaac', 'Nora', 'Adam', 'Riley', 'Dylan', 'Stella', 'Wyatt',
  'Violet', 'Gabriel', 'Aurora', 'Julian',
];

const lastNames = [
  'Anderson', 'Chen', 'Martinez', 'Patel', 'Williams', 'Kim', 'Taylor',
  'Nakamura', 'Garcia', 'Brown', 'Mueller', 'Singh', 'Thompson', 'Lee',
  'Wilson', 'Okafor', 'Davis', 'Rossi', 'Johnson', 'Sato', 'Miller',
  'Petrov', 'Moore', 'Johansson', 'Clark', 'Santos', 'Hall', 'Ivanov',
  'Young', 'Kowalski', 'Torres', 'Tanaka', 'White', 'Nguyen', 'Harris',
  'Berg', 'King', 'Dubois', 'Wright', 'Schmidt', 'Lopez', 'Ito',
  'Walker', 'Larsson', 'Allen', 'Costa', 'Scott', 'Yamamoto', 'Green', 'Park',
];

const domains = ['acme.io', 'globex.com', 'initech.dev', 'umbrella.co', 'stark.tech'];
const roles = ['Engineer', 'Designer', 'Product Manager', 'Data Scientist', 'DevOps', 'QA Lead', 'Tech Lead', 'Architect'];
const departments = ['Platform', 'Product', 'Infrastructure', 'Security', 'Data', 'Frontend', 'Backend', 'Mobile'];
const cities = ['San Francisco', 'New York', 'London', 'Berlin', 'Tokyo', 'Toronto', 'Sydney', 'Amsterdam', 'Singapore', 'Austin'];

const productAdjectives = ['Premium', 'Classic', 'Ultra', 'Pro', 'Essential', 'Deluxe', 'Compact', 'Advanced'];
const productNouns = ['Keyboard', 'Monitor', 'Headset', 'Webcam', 'Mouse', 'Dock', 'Hub', 'Stand', 'Cable', 'Charger',
  'Backpack', 'Notebook', 'Pen Set', 'Desk Lamp', 'Chair Mat', 'Footrest', 'Whiteboard', 'Timer', 'Planner', 'Adapter',
  'Speaker', 'Mic', 'Light Bar', 'Wrist Rest', 'Desk Pad', 'Filter', 'Mount', 'Shelf', 'Organizer', 'Holder',
  'Sleeve', 'Case', 'Cover', 'Strap', 'Clip', 'Pouch', 'Tray', 'Hook', 'Rack', 'Board',
  'Panel', 'Sensor', 'Switch', 'Module', 'Ring', 'Band', 'Tag', 'Card', 'Stick', 'Frame'];
const categories = ['Electronics', 'Office', 'Accessories', 'Audio', 'Ergonomics'];

const httpMethods = ['GET', 'GET', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'GET', 'GET', 'POST'];
const apiPaths = [
  '/api/users', '/api/users/42', '/api/products', '/api/products/17', '/api/orders',
  '/api/orders/93', '/api/auth/login', '/api/auth/refresh', '/api/health', '/api/metrics',
  '/api/sessions', '/api/webhooks', '/api/config', '/api/search?q=test', '/api/uploads',
  '/api/notifications', '/api/billing/invoices', '/api/teams/5', '/api/comments', '/api/tags',
  '/api/users/me', '/api/products?page=2', '/api/orders?status=pending', '/api/analytics',
  '/api/exports/csv', '/api/imports', '/api/audit-log', '/api/feedback', '/api/features', '/api/releases',
  '/api/users/12/settings', '/api/products/search', '/api/orders/bulk', '/api/cache/clear', '/api/deploy',
  '/api/rollback', '/api/cron/status', '/api/queue/stats', '/api/db/migrate', '/api/health/deep',
  '/api/users/export', '/api/products/inventory', '/api/orders/refund', '/api/auth/logout', '/api/tokens',
  '/api/teams', '/api/roles', '/api/permissions', '/api/billing/usage', '/api/support/tickets',
];
const statusCodes = [200, 200, 200, 201, 200, 204, 200, 200, 200, 200, 200, 200, 404, 200, 403, 200, 200, 200, 202, 200,
  200, 200, 201, 200, 200, 500, 200, 401, 200, 201, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200,
  200, 200, 200, 200, 200, 200, 200, 200, 200, 200];
const userAgents = ['Mozilla/5.0 (Macintosh)', 'curl/8.5.0', 'PostmanRuntime/7.36', 'Python/3.12 httpx/0.27',
  'Go-http-client/2.0', 'axios/1.7.2', 'Mozilla/5.0 (Windows)', 'okhttp/4.12'];
const ipAddresses = ['192.168.1.10', '10.0.0.5', '172.16.0.3', '10.0.0.12', '192.168.2.1',
  '172.16.0.8', '10.0.0.22', '192.168.3.1', '172.16.0.15', '10.0.1.4'];

const eventTypes = ['deployment', 'config_change', 'incident', 'scaling', 'maintenance'];
const eventServices = ['api-gateway', 'auth-service', 'payment-service', 'notification-service', 'search-service',
  'user-service', 'order-service', 'inventory-service', 'analytics-service', 'cdn-edge'];
const eventEnvs = ['production', 'staging', 'production', 'production', 'staging'];
const tags = ['backend', 'frontend', 'infra', 'database', 'networking', 'security', 'monitoring', 'ci-cd'];

// --- Pick helpers (deterministic, no randomness) ---

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

// --- Generators ---

function buildUsers(n: number): object[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `${pick(firstNames, i)} ${pick(lastNames, i + 7)}`,
    email: `${pick(firstNames, i).toLowerCase()}.${pick(lastNames, i + 7).toLowerCase()}@${pick(domains, i)}`,
    role: pick(roles, i),
    department: i % 6 === 0 ? null : pick(departments, i + 3),
    phone: i % 4 === 0 ? null : `+1-555-${String(1000 + i * 37).slice(-4)}`,
    active: i % 7 !== 0,
  }));
}

function buildProducts(n: number): object[] {
  return Array.from({ length: n }, (_, i) => {
    const price = +((i * 17.3 + 9.99) % 299 + 4.99).toFixed(2);
    return {
    sku: `SKU-${String(1000 + i * 13).slice(-4)}`,
    name: `${pick(productAdjectives, i)} ${pick(productNouns, i)}`,
    price,
    category: pick(categories, i),
    discount: i % 3 === 0 ? null : Math.round(price * 0.1 * 100) / 100,
    inStock: i % 5 !== 0,
    rating: i % 5 === 0 ? null : +(((i * 7 + 3) % 40 + 10) / 10).toFixed(1),
    notes: null,
  };
  });
}

function buildLogs(n: number): object[] {
  return Array.from({ length: n }, (_, i) => ({
    timestamp: `2026-03-23T10:${String(Math.floor(i / 3)).padStart(2, '0')}:${String((i * 20) % 60).padStart(2, '0')}Z`,
    method: pick(httpMethods, i),
    path: pick(apiPaths, i),
    status: pick(statusCodes, i),
    duration_ms: ((i * 37 + 5) % 300) + 1,
    ip: pick(ipAddresses, i),
    user_agent: pick(userAgents, i),
    referrer: null,
    session_id: null,
  }));
}

function buildEvents(n: number): object[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `evt_${String(i + 1).padStart(4, '0')}`,
    type: pick(eventTypes, i),
    service: pick(eventServices, i),
    env: pick(eventEnvs, i),
    meta: {
      triggered_by: `${pick(firstNames, i + 3).toLowerCase()}@${pick(domains, i + 1)}`,
      duration_s: ((i * 13 + 2) % 120) + 1,
      tags: [pick(tags, i), pick(tags, i + 3)],
      rollback: null,
    },
    resolved_at: null,
    created_at: `2026-03-${String((i % 28) + 1).padStart(2, '0')}T${String(8 + (i % 12))}:${String((i * 7) % 60).padStart(2, '0')}:00Z`,
  }));
}

function buildStructuredText(n: number): string {
  return Array.from({ length: n }, (_, i) =>
    `Name: ${pick(firstNames, i + 10)} ${pick(lastNames, i + 5)}\n`
    + `Role: ${pick(roles, i + 2)}\n`
    + `Department: ${pick(departments, i + 1)}\n`
    + `Location: ${pick(cities, i)}`,
  ).join('\n\n');
}

function buildPythonRepr(n: number): string {
  const items = Array.from({ length: n }, (_, i) => {
    const first = pick(firstNames, i);
    const last = pick(lastNames, i + 7);
    const domain = pick(domains, i);
    const role = pick(roles, i);
    const active = i % 7 !== 0 ? 'True' : 'False';
    const dept = i % 6 === 0 ? 'None' : `'${pick(departments, i + 3)}'`;
    return `{'id': ${i + 1}, 'name': '${first} ${last}', 'email': '${first.toLowerCase()}.${last.toLowerCase()}@${domain}', 'role': '${role}', 'department': ${dept}, 'active': ${active}}`;
  });
  return `[${items.join(', ')}]`;
}

export const exampleDefs: ExampleDef[] = [
  { label: 'Logs', type: 'json', build: (n) => JSON.stringify(buildLogs(n), null, 2) },
  { label: 'Users', type: 'json', build: (n) => JSON.stringify(buildUsers(n), null, 2) },
  { label: 'Products', type: 'json', build: (n) => JSON.stringify(buildProducts(n), null, 2) },
  { label: 'Events', type: 'json', build: (n) => JSON.stringify(buildEvents(n), null, 2) },
  { label: 'Python repr', type: 'text', build: buildPythonRepr },
  { label: 'Structured text', type: 'text', build: buildStructuredText },
];
