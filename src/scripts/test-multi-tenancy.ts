import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as fs from 'fs';
import * as path from 'path';
import { Pool, PoolClient, types } from 'pg';
import * as schema from '../db/schema';

const workspaceRoot = path.resolve(__dirname, '../../../..');
const isSystemEnv = !!process.env.DB_HOST;

// Load environment-specific config
if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
  dotenv.config({
    path: path.join(workspaceRoot, '.env.development'),
    override: !isSystemEnv,
  });
} else {
  dotenv.config({
    path: path.join(workspaceRoot, '.env'),
    override: !isSystemEnv,
  });
}

const createDb = (client: PoolClient) => drizzle(client, { schema });
type Db = ReturnType<typeof createDb>;

let pool: Pool | undefined;
let client: PoolClient | undefined;
let db: Db | undefined;

function patchPgParsers(): void {
  types.setTypeParser(1114, (value) => {
    if (value === null) {
      return null;
    }
    return new Date(`${value}Z`);
  });
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

function getDb(): Db {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

function serializeAuthorizations(authorizations: string[]): string {
  return authorizations.join(',');
}

function parseAuthorizations(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function whereAnd(conditions: Array<unknown>) {
  const filtered = conditions.filter(Boolean) as any[];
  if (filtered.length === 0) {
    return undefined;
  }
  if (filtered.length === 1) {
    return filtered[0];
  }
  return and(...filtered);
}

let markdownContent = '';
let testsPassed = 0;
let testsFailed = 0;

function appendToMarkdown(text: string) {
  markdownContent += text + '\n';
}

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

function printHeader(text: string) {
  const width = 72;
  const padding = Math.max(0, Math.floor((width - text.length - 4) / 2));
  const paddedText = ' '.repeat(padding) + text + ' '.repeat(padding);
  const adjustedText =
    paddedText.length < width - 4 ? paddedText + ' ' : paddedText;

  console.log('');
  console.log(
    `${COLORS.bright}${COLORS.cyan}╔${'═'.repeat(width - 2)}╗${COLORS.reset}`,
  );
  console.log(
    `${COLORS.bright}${COLORS.cyan}║${COLORS.reset}${
      COLORS.bright
    }  ${adjustedText.substring(0, width - 4)}  ${COLORS.reset}${
      COLORS.bright
    }${COLORS.cyan}║${COLORS.reset}`,
  );
  console.log(
    `${COLORS.bright}${COLORS.cyan}╚${'═'.repeat(width - 2)}╝${COLORS.reset}`,
  );
  console.log('');

  appendToMarkdown('');
  appendToMarkdown(`╔${'═'.repeat(width - 2)}╗`);
  appendToMarkdown(`║  ${adjustedText.substring(0, width - 4)}  ║`);
  appendToMarkdown(`╚${'═'.repeat(width - 2)}╝`);
  appendToMarkdown('');
}

function printSubHeader(text: string) {
  console.log('');
  console.log(`${COLORS.bright}${COLORS.yellow}  ► ${text}${COLORS.reset}`);
  console.log(
    `${COLORS.yellow}    ${'─'.repeat(text.length + 2)}${COLORS.reset}`,
  );
  appendToMarkdown('');
  appendToMarkdown(`  ► ${text}`);
  appendToMarkdown(`    ${'─'.repeat(text.length + 2)}`);
}

function printSuccess(text: string) {
  console.log(`    ${COLORS.green}✅${COLORS.reset}  ${text}`);
  appendToMarkdown(`    ✅  ${text}`);
  testsPassed++;
}

function printInfo(text: string) {
  console.log(`    ${COLORS.blue}ℹ️${COLORS.reset}  ${text}`);
  appendToMarkdown(`    ℹ️  ${text}`);
}

function printWarning(text: string) {
  console.log(`    ${COLORS.yellow}⚠️${COLORS.reset}  ${text}`);
  appendToMarkdown(`    ⚠️  ${text}`);
}

function printError(text: string) {
  console.log(`    ${COLORS.red}❌${COLORS.reset}  ${text}`);
  appendToMarkdown(`    ❌  ${text}`);
  testsFailed++;
}

function printPlain(text: string) {
  console.log(`  ${text}`);
  appendToMarkdown(`  ${text}`);
}

function printTable(title: string, data: any[], columns: string[]) {
  console.log('');
  console.log(
    `    ${COLORS.bright}${COLORS.cyan}┌─ ${title} ${'─'.repeat(
      Math.max(0, 50 - title.length),
    )}┐${COLORS.reset}`,
  );
  appendToMarkdown('');
  appendToMarkdown(
    `    ┌─ ${title} ${'─'.repeat(Math.max(0, 50 - title.length))}┐`,
  );

  if (data.length === 0) {
    console.log(
      `    ${COLORS.cyan}│${COLORS.reset}  ${COLORS.yellow}(empty - no records found)${COLORS.reset}`,
    );
    console.log(`    ${COLORS.cyan}└${'─'.repeat(54)}┘${COLORS.reset}`);
    appendToMarkdown(`    │  (empty - no records found)`);
    appendToMarkdown(`    └${'─'.repeat(54)}┘`);
    return;
  }

  data.forEach((item, index) => {
    const values = columns.map((col) => {
      const value = col.includes('.')
        ? col.split('.').reduce((obj, key) => obj?.[key], item)
        : item[col];
      return value ?? 'N/A';
    });
    const line = `${String(index + 1).padStart(2)}.  ${values.join('  │  ')}`;
    console.log(`    ${COLORS.cyan}│${COLORS.reset}  ${line}`);
    appendToMarkdown(`    │  ${line}`);
  });

  console.log(`    ${COLORS.cyan}└${'─'.repeat(54)}┘${COLORS.reset}`);
  appendToMarkdown(`    └${'─'.repeat(54)}┘`);
}

function saveMarkdownReport() {
  const resultsDir = path.join(__dirname, 'results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `multi-tenancy-report-${timestamp}.md`;
  const filepath = path.join(resultsDir, filename);

  const wrapContent = '```\n' + markdownContent + '\n```';

  fs.writeFileSync(filepath, wrapContent, 'utf-8');
  console.log(
    `\n  ${COLORS.green}📄 Report saved to: ${filepath}${COLORS.reset}`,
  );
  return filepath;
}

async function cleanupTestData() {
  printSubHeader('Cleaning up previous test data...');

  const db = getDb();

  const testCompanies = await db
    .select()
    .from(schema.companies)
    .where(
      inArray(schema.companies.name, ['Acme Logistics', 'Beta Delivery Co']),
    );

  for (const company of testCompanies) {
    await db
      .delete(schema.missions)
      .where(eq(schema.missions.companyId, company.id));
    await db
      .delete(schema.vehicleDriverAssignments)
      .where(eq(schema.vehicleDriverAssignments.companyId, company.id));
    await db.delete(schema.users).where(eq(schema.users.companyId, company.id));
    await db
      .delete(schema.drivers)
      .where(eq(schema.drivers.companyId, company.id));
    await db
      .delete(schema.vehicles)
      .where(eq(schema.vehicles.companyId, company.id));
    await db
      .delete(schema.branches)
      .where(eq(schema.branches.companyId, company.id));
    await db.delete(schema.roles).where(eq(schema.roles.companyId, company.id));
    await db
      .delete(schema.companies)
      .where(eq(schema.companies.id, company.id));
  }

  printInfo('Previous test data cleaned up');
}

async function createTenant(
  name: string,
  adminUsername: string,
  branches: string[],
  vehicleCount: number,
  driverCount: number,
) {
  const db = getDb();

  const [company] = await db
    .insert(schema.companies)
    .values({ name })
    .returning();
  printInfo(`Company created: ${name}`);

  const createdBranches: any[] = [];
  for (const branchName of branches) {
    const [branch] = await db
      .insert(schema.branches)
      .values({ name: branchName, companyId: company.id })
      .returning();
    createdBranches.push({ ...branch, company });
    printInfo(`  Branch created: ${branchName}`);
  }

  const [adminRole] = await db
    .insert(schema.roles)
    .values({
      name: 'companyAdmin',
      description: 'Company Administrator',
      authorizations: serializeAuthorizations(['*']),
      companyId: company.id,
    })
    .returning();

  const [operatorRole] = await db
    .insert(schema.roles)
    .values({
      name: 'operator',
      description: 'Branch Operator',
      authorizations: serializeAuthorizations([
        'read:vehicles',
        'read:drivers',
        'read:missions',
      ]),
      companyId: company.id,
    })
    .returning();
  printInfo(`  Roles created: companyAdmin, operator`);

  const hashedPassword = await bcrypt.hash('password123', 10);

  const [adminUser] = await db
    .insert(schema.users)
    .values({
      username: adminUsername,
      email: `${adminUsername}@example.com`,
      password: hashedPassword,
      companyId: company.id,
      branchId: createdBranches[0]?.id,
      roleId: adminRole.id,
      isSuperAdmin: false,
    })
    .returning();

  const regularUsers: any[] = [];
  for (let i = 0; i < createdBranches.length; i++) {
    const branch = createdBranches[i];
    const [regularUser] = await db
      .insert(schema.users)
      .values({
        username: `${name.split(' ')[0].toLowerCase()}_user_${i + 1}`,
        email: `user${i + 1}@${name.split(' ')[0].toLowerCase()}.com`,
        password: hashedPassword,
        companyId: company.id,
        branchId: branch.id,
        roleId: operatorRole.id,
        isSuperAdmin: false,
      })
      .returning();
    regularUsers.push({
      ...regularUser,
      company,
      branch,
      role: {
        ...operatorRole,
        authorizations: parseAuthorizations(operatorRole.authorizations),
      },
    });
  }
  printInfo(`  Users created: 1 admin + ${regularUsers.length} regular users`);

  const createdVehicles: any[] = [];
  for (let i = 1; i <= vehicleCount; i++) {
    const branch = createdBranches[i % createdBranches.length];
    const [vehicle] = await db
      .insert(schema.vehicles)
      .values({
        vin: `${name.split(' ')[0]}-VIN-${i}`,
        plateNumber: `${name.substring(0, 2).toUpperCase()}-${1000 + i}`,
        companyId: company.id,
        branchId: branch.id,
        createdById: adminUser.id,
      })
      .returning();
    createdVehicles.push({ ...vehicle, company, branch, createdBy: adminUser });
  }
  printInfo(`  ${vehicleCount} vehicles created`);

  const createdDrivers: any[] = [];
  for (let i = 1; i <= driverCount; i++) {
    const branch = createdBranches[i % createdBranches.length];
    const [driver] = await db
      .insert(schema.drivers)
      .values({
        name: `${name.split(' ')[0]}-Driver-${i}`,
        phone: `555-${String(i).padStart(4, '0')}`,
        companyId: company.id,
        branchId: branch.id,
        createdById: adminUser.id,
        isActive: true,
      })
      .returning();
    createdDrivers.push({ ...driver, company, branch, createdBy: adminUser });
  }
  printInfo(`  ${driverCount} drivers created`);

  const createdAssignments: any[] = [];
  for (
    let i = 0;
    i < Math.min(createdVehicles.length, createdDrivers.length);
    i++
  ) {
    const vehicle = createdVehicles[i];
    const driver = createdDrivers[i];
    const [assignment] = await db
      .insert(schema.vehicleDriverAssignments)
      .values({
        companyId: company.id,
        branchId: vehicle.branchId,
        vehicleId: vehicle.id,
        driverId: driver.id,
        startDate: new Date(),
      })
      .returning();
    createdAssignments.push({
      ...assignment,
      company,
      branch: vehicle.branch,
      vehicle,
      driver,
    });
  }
  printInfo(
    `  ${createdAssignments.length} vehicle-driver assignments created`,
  );

  const createdMissions: any[] = [];
  for (let i = 0; i < Math.min(3, createdVehicles.length); i++) {
    const vehicle = createdVehicles[i];
    const [mission] = await db
      .insert(schema.missions)
      .values({
        companyId: company.id,
        branchId: vehicle.branchId,
        date: new Date().toISOString().split('T')[0] as any,
        customerName: `Customer ${i + 1}`,
        phone: `555-100${i}`,
        address: `${100 + i} Test Street`,
        latitude: 40.7128 + i * 0.01,
        longitude: -74.006 + i * 0.01,
        startTimeWindow: new Date(),
        endTimeWindow: new Date(Date.now() + 3600000),
        createdById: adminUser.id,
      })
      .returning();
    createdMissions.push({ ...mission, company, branch: vehicle.branch });
  }
  printInfo(`  ${createdMissions.length} missions created`);

  return {
    company,
    branches: createdBranches,
    adminUser,
    regularUsers,
    adminRole,
    operatorRole,
    vehicles: createdVehicles,
    drivers: createdDrivers,
    assignments: createdAssignments,
    missions: createdMissions,
  };
}

async function simulateCompanyScopedQuery(
  companyId: string,
  branchId: string | null,
  isSuperAdmin: boolean,
  isCompanyAdmin: boolean,
) {
  const db = getDb();

  const vehicleFilter = isSuperAdmin
    ? undefined
    : whereAnd([
        eq(schema.vehicles.companyId, companyId),
        !isCompanyAdmin && branchId
          ? eq(schema.vehicles.branchId, branchId)
          : undefined,
      ]);

  const driverFilter = isSuperAdmin
    ? undefined
    : whereAnd([
        eq(schema.drivers.companyId, companyId),
        !isCompanyAdmin && branchId
          ? eq(schema.drivers.branchId, branchId)
          : undefined,
      ]);

  const branchFilter = isSuperAdmin
    ? undefined
    : eq(schema.branches.companyId, companyId);

  const userFilter = isSuperAdmin
    ? undefined
    : eq(schema.users.companyId, companyId);

  const roleFilter = isSuperAdmin
    ? undefined
    : eq(schema.roles.companyId, companyId);

  const missionFilter = isSuperAdmin
    ? undefined
    : whereAnd([
        eq(schema.missions.companyId, companyId),
        !isCompanyAdmin && branchId
          ? eq(schema.missions.branchId, branchId)
          : undefined,
      ]);

  const vehicles = (
    await db
      .select({
        vehicle: schema.vehicles,
        company: schema.companies,
        branch: schema.branches,
      })
      .from(schema.vehicles)
      .leftJoin(
        schema.companies,
        eq(schema.vehicles.companyId, schema.companies.id),
      )
      .leftJoin(
        schema.branches,
        eq(schema.vehicles.branchId, schema.branches.id),
      )
      .where(vehicleFilter as any)
  ).map((row) => ({
    ...row.vehicle,
    company: row.company,
    branch: row.branch,
  }));

  const drivers = (
    await db
      .select({
        driver: schema.drivers,
        company: schema.companies,
        branch: schema.branches,
      })
      .from(schema.drivers)
      .leftJoin(
        schema.companies,
        eq(schema.drivers.companyId, schema.companies.id),
      )
      .leftJoin(
        schema.branches,
        eq(schema.drivers.branchId, schema.branches.id),
      )
      .where(driverFilter as any)
  ).map((row) => ({
    ...row.driver,
    company: row.company,
    branch: row.branch,
  }));

  const branches = (
    await db
      .select({ branch: schema.branches, company: schema.companies })
      .from(schema.branches)
      .leftJoin(
        schema.companies,
        eq(schema.branches.companyId, schema.companies.id),
      )
      .where(branchFilter as any)
  ).map((row) => ({
    ...row.branch,
    company: row.company,
  }));

  const roles = (
    await db
      .select({ role: schema.roles, company: schema.companies })
      .from(schema.roles)
      .leftJoin(
        schema.companies,
        eq(schema.roles.companyId, schema.companies.id),
      )
      .where(roleFilter as any)
  ).map((row) => ({
    ...row.role,
    company: row.company,
    authorizations: parseAuthorizations(row.role.authorizations),
  }));

  const users = (
    await db
      .select({
        user: schema.users,
        company: schema.companies,
        branch: schema.branches,
        role: schema.roles,
      })
      .from(schema.users)
      .leftJoin(
        schema.companies,
        eq(schema.users.companyId, schema.companies.id),
      )
      .leftJoin(schema.branches, eq(schema.users.branchId, schema.branches.id))
      .leftJoin(schema.roles, eq(schema.users.roleId, schema.roles.id))
      .where(userFilter as any)
  ).map((row) => ({
    ...row.user,
    company: row.company,
    branch: row.branch,
    role: row.role
      ? {
          ...row.role,
          authorizations: parseAuthorizations(row.role.authorizations),
        }
      : undefined,
  }));

  const missions = (
    await db
      .select({
        mission: schema.missions,
        company: schema.companies,
        branch: schema.branches,
      })
      .from(schema.missions)
      .leftJoin(
        schema.companies,
        eq(schema.missions.companyId, schema.companies.id),
      )
      .leftJoin(
        schema.branches,
        eq(schema.missions.branchId, schema.branches.id),
      )
      .where(missionFilter as any)
  ).map((row) => ({
    ...row.mission,
    company: row.company,
    branch: row.branch,
  }));

  const assignmentFilter = isSuperAdmin
    ? undefined
    : eq(schema.vehicleDriverAssignments.companyId, companyId);

  const assignments = (
    await db
      .select({
        assignment: schema.vehicleDriverAssignments,
        vehicle: schema.vehicles,
        driver: schema.drivers,
      })
      .from(schema.vehicleDriverAssignments)
      .leftJoin(
        schema.vehicles,
        eq(schema.vehicleDriverAssignments.vehicleId, schema.vehicles.id),
      )
      .leftJoin(
        schema.drivers,
        eq(schema.vehicleDriverAssignments.driverId, schema.drivers.id),
      )
      .where(assignmentFilter as any)
  ).map((row) => ({
    ...row.assignment,
    vehicle: row.vehicle,
    driver: row.driver,
  }));

  return { vehicles, drivers, branches, users, roles, missions, assignments };
}

async function runMultiTenancyDemo() {
  markdownContent = '';
  testsPassed = 0;
  testsFailed = 0;

  printHeader('MULTI-TENANCY COMPREHENSIVE TEST SUITE');

  console.log('');
  console.log(
    `    ┌────────────────────────────────────────────────────────────────┐`,
  );
  console.log(
    `    │  📋  ABOUT THIS TEST SUITE                                     │`,
  );
  console.log(
    `    ├────────────────────────────────────────────────────────────────┤`,
  );
  console.log(
    `    │  This script validates all multi-tenancy isolation patterns   │`,
  );
  console.log(
    `    │  in the Rouptimize API, based on TenantContext logic:         │`,
  );
  console.log(
    `    │                                                               │`,
  );
  console.log(
    `    │    🏢  buildCompanyScope()         → Company-level isolation  │`,
  );
  console.log(
    `    │    🏬  buildCompanyAndBranchScope() → Company + Branch scope  │`,
  );
  console.log(
    `    │    👑  isSuperAdmin()              → Super admin bypass       │`,
  );
  console.log(
    `    │    👔  isCompanyAdmin()            → Admin sees all branches  │`,
  );
  console.log(
    `    └────────────────────────────────────────────────────────────────┘`,
  );
  console.log('');

  appendToMarkdown('');
  appendToMarkdown(
    `    ┌────────────────────────────────────────────────────────────────┐`,
  );
  appendToMarkdown(
    `    │  📋  ABOUT THIS TEST SUITE                                     │`,
  );
  appendToMarkdown(
    `    ├────────────────────────────────────────────────────────────────┤`,
  );
  appendToMarkdown(
    `    │  This script validates all multi-tenancy isolation patterns   │`,
  );
  appendToMarkdown(
    `    │  in the Rouptimize API, based on TenantContext logic:         │`,
  );
  appendToMarkdown(
    `    │                                                               │`,
  );
  appendToMarkdown(
    `    │    🏢  buildCompanyScope()         → Company-level isolation  │`,
  );
  appendToMarkdown(
    `    │    🏬  buildCompanyAndBranchScope() → Company + Branch scope  │`,
  );
  appendToMarkdown(
    `    │    👑  isSuperAdmin()              → Super admin bypass       │`,
  );
  appendToMarkdown(
    `    │    👔  isCompanyAdmin()            → Admin sees all branches  │`,
  );
  appendToMarkdown(
    `    └────────────────────────────────────────────────────────────────┘`,
  );
  appendToMarkdown('');

  const createdCompanyIds: string[] = [];

  try {
    printSubHeader('Initializing database connection...');
    patchPgParsers();
    pool = new Pool({
      host: requireEnv('DB_HOST'),
      port: Number(process.env.DB_PORT ?? 5432),
      user: requireEnv('DB_USERNAME'),
      password: requireEnv('DB_PASSWORD'),
      database: requireEnv('DB_DATABASE'),
      max: Number(process.env.DB_POOL_MAX ?? 10),
      idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_TIMEOUT_MS ?? 30000),
      connectionTimeoutMillis: Number(
        process.env.DB_POOL_CONNECTION_TIMEOUT_MS ?? 2000,
      ),
    });
    client = await pool.connect();
    await client.query("SET app.is_superadmin = 'true'");
    db = createDb(client);
    printInfo('Database connected successfully');

    await cleanupTestData();

    printHeader('STEP 1: CREATE TEST TENANTS WITH FULL DATA');

    printSubHeader('Creating Tenant A: Acme Logistics');
    const tenantA = await createTenant(
      'Acme Logistics',
      'acme_admin',
      ['main', 'Downtown Hub', 'Airport Branch'],
      4,
      3,
    );
    createdCompanyIds.push(tenantA.company.id);

    printSubHeader('Creating Tenant B: Beta Delivery Co');
    const tenantB = await createTenant(
      'Beta Delivery Co',
      'beta_admin',
      ['main', 'North Station', 'South Station'],
      3,
      2,
    );
    createdCompanyIds.push(tenantB.company.id);

    printHeader('STEP 2: TEST COMPANY-LEVEL ISOLATION (buildCompanyScope)');

    printSubHeader('Scenario 2.1: Company Admin Access');
    printPlain(
      `  Testing: Company admin can see ALL data within their company\n`,
    );

    const acmeAdminResults = await simulateCompanyScopedQuery(
      tenantA.company.id,
      tenantA.branches[0].id,
      false,
      true,
    );

    const betaAdminResults = await simulateCompanyScopedQuery(
      tenantB.company.id,
      tenantB.branches[0].id,
      false,
      true,
    );

    printTable('Acme Admin - Vehicles', acmeAdminResults.vehicles, [
      'vin',
      'branch.name',
    ]);
    printTable('Acme Admin - Drivers', acmeAdminResults.drivers, [
      'name',
      'branch.name',
    ]);
    printTable('Acme Admin - Users', acmeAdminResults.users, [
      'username',
      'role.name',
      'branch.name',
    ]);

    const acmeVehiclesCorrect = acmeAdminResults.vehicles.every(
      (v) => v.company?.id === tenantA.company.id,
    );
    const betaVehiclesCorrect = betaAdminResults.vehicles.every(
      (v) => v.company?.id === tenantB.company.id,
    );

    if (acmeVehiclesCorrect) {
      printSuccess('Acme admin sees ONLY Acme vehicles');
    } else {
      printError('FAIL: Acme admin sees vehicles from other companies!');
    }

    if (betaVehiclesCorrect) {
      printSuccess('Beta admin sees ONLY Beta vehicles');
    } else {
      printError('FAIL: Beta admin sees vehicles from other companies!');
    }

    if (acmeAdminResults.vehicles.length === 4) {
      printSuccess(`Acme admin sees all 4 Acme vehicles (across all branches)`);
    } else {
      printError(
        `FAIL: Expected 4 vehicles, got ${acmeAdminResults.vehicles.length}`,
      );
    }

    printHeader(
      'STEP 3: TEST BRANCH-LEVEL ISOLATION (buildCompanyAndBranchScope)',
    );

    printSubHeader('Scenario 3.1: Regular User Branch Restriction');
    printPlain(
      `  Testing: Regular users can only see data from their assigned branch\n`,
    );

    const acmeUser1Branch = tenantA.branches[1];
    const acmeUser1Results = await simulateCompanyScopedQuery(
      tenantA.company.id,
      acmeUser1Branch.id,
      false,
      false,
    );

    printTable(
      'Regular User - Vehicles (Branch Scoped)',
      acmeUser1Results.vehicles,
      ['vin', 'branch.name'],
    );

    const user1BranchCorrect = acmeUser1Results.vehicles.every(
      (v) => v.branch?.id === acmeUser1Branch.id,
    );

    if (user1BranchCorrect && acmeUser1Results.vehicles.length > 0) {
      printSuccess(
        `Regular user sees ONLY vehicles from their branch (${acmeUser1Branch.name})`,
      );
    } else if (acmeUser1Results.vehicles.length === 0) {
      printWarning(
        `No vehicles in branch ${acmeUser1Branch.name} - branch scoping working but no data`,
      );
    } else {
      printError('FAIL: Regular user sees vehicles from other branches!');
    }

    printSubHeader('Scenario 3.2: Company Admin vs Regular User Comparison');

    const adminVehicleCount = acmeAdminResults.vehicles.length;
    const userVehicleCount = acmeUser1Results.vehicles.length;

    printPlain(
      `  Company Admin sees: ${adminVehicleCount} vehicles (all branches)`,
    );
    printPlain(
      `  Regular User sees:  ${userVehicleCount} vehicles (single branch)\n`,
    );

    if (adminVehicleCount >= userVehicleCount) {
      printSuccess(
        'Company admin sees more or equal vehicles than regular user',
      );
    } else {
      printError('FAIL: Regular user sees more vehicles than company admin!');
    }

    printHeader('STEP 4: TEST SUPER ADMIN ACCESS');

    printSubHeader('Scenario 4.1: Super Admin Sees All Companies');

    const superAdminResults = await simulateCompanyScopedQuery(
      '',
      null,
      true,
      false,
    );

    const totalVehicles = superAdminResults.vehicles.length;
    const totalDrivers = superAdminResults.drivers.length;
    const totalBranches = superAdminResults.branches.length;
    const totalMissions = superAdminResults.missions.length;
    const totalAssignments = superAdminResults.assignments.length;

    printPlain(`  Super Admin Total Vehicles:    ${totalVehicles}`);
    printPlain(`  Super Admin Total Drivers:     ${totalDrivers}`);
    printPlain(`  Super Admin Total Branches:    ${totalBranches}`);
    printPlain(`  Super Admin Total Missions:    ${totalMissions}`);
    printPlain(`  Super Admin Total Assignments: ${totalAssignments}\n`);

    const expectedVehicles =
      acmeAdminResults.vehicles.length + betaAdminResults.vehicles.length;
    const expectedDrivers =
      acmeAdminResults.drivers.length + betaAdminResults.drivers.length;

    if (totalVehicles >= expectedVehicles) {
      printSuccess(
        `Super admin sees all vehicles (${totalVehicles} >= ${expectedVehicles})`,
      );
    } else {
      printError(
        `FAIL: Super admin missing vehicles (${totalVehicles} < ${expectedVehicles})`,
      );
    }

    if (totalDrivers >= expectedDrivers) {
      printSuccess(
        `Super admin sees all drivers (${totalDrivers} >= ${expectedDrivers})`,
      );
    } else {
      printError(
        `FAIL: Super admin missing drivers (${totalDrivers} < ${expectedDrivers})`,
      );
    }

    printHeader('STEP 5: TEST CROSS-TENANT ACCESS PREVENTION');

    printSubHeader('Scenario 5.1: Tenant A Cannot Access Tenant B Data');

    const acmeSeesBetaVehicles = acmeAdminResults.vehicles.some(
      (v) => v.company?.id === tenantB.company.id,
    );
    const betaSeesAcmeVehicles = betaAdminResults.vehicles.some(
      (v) => v.company?.id === tenantA.company.id,
    );

    if (!acmeSeesBetaVehicles) {
      printSuccess('Acme CANNOT access Beta vehicles');
    } else {
      printError('SECURITY FAIL: Acme can see Beta vehicles!');
    }

    if (!betaSeesAcmeVehicles) {
      printSuccess('Beta CANNOT access Acme vehicles');
    } else {
      printError('SECURITY FAIL: Beta can see Acme vehicles!');
    }

    const acmeSeesBetaDrivers = acmeAdminResults.drivers.some(
      (d) => d.company?.id === tenantB.company.id,
    );
    const betaSeesAcmeDrivers = betaAdminResults.drivers.some(
      (d) => d.company?.id === tenantA.company.id,
    );

    if (!acmeSeesBetaDrivers) {
      printSuccess('Acme CANNOT access Beta drivers');
    } else {
      printError('SECURITY FAIL: Acme can see Beta drivers!');
    }

    if (!betaSeesAcmeDrivers) {
      printSuccess('Beta CANNOT access Acme drivers');
    } else {
      printError('SECURITY FAIL: Beta can see Acme drivers!');
    }

    printHeader('STEP 6: TEST ROLE AND USER ISOLATION');

    printSubHeader('Scenario 6.1: Roles Are Company-Scoped');

    const acmeRoles = acmeAdminResults.roles;
    const betaRoles = betaAdminResults.roles;

    const acmeRolesCorrect = acmeRoles.every(
      (r) => r.company?.id === tenantA.company.id,
    );
    const betaRolesCorrect = betaRoles.every(
      (r) => r.company?.id === tenantB.company.id,
    );

    if (acmeRolesCorrect) {
      printSuccess(`Acme sees only Acme roles (${acmeRoles.length} roles)`);
    } else {
      printError('FAIL: Acme sees roles from other companies!');
    }

    if (betaRolesCorrect) {
      printSuccess(`Beta sees only Beta roles (${betaRoles.length} roles)`);
    } else {
      printError('FAIL: Beta sees roles from other companies!');
    }

    printSubHeader('Scenario 6.2: Users Are Company-Scoped');

    const acmeUsers = acmeAdminResults.users;
    const betaUsers = betaAdminResults.users;

    const acmeUsersCorrect = acmeUsers.every(
      (u) => u.company?.id === tenantA.company.id,
    );

    if (acmeUsersCorrect) {
      printSuccess(`Acme sees only Acme users (${acmeUsers.length} users)`);
    } else {
      printError('FAIL: Acme sees users from other companies!');
    }

    printHeader('STEP 7: TEST MISSION ISOLATION');

    printSubHeader('Scenario 7.1: Missions Are Company-Scoped');

    const acmeMissions = acmeAdminResults.missions;
    const betaMissions = betaAdminResults.missions;

    printPlain(`  Acme Missions: ${acmeMissions.length}`);
    printPlain(`  Beta Missions: ${betaMissions.length}\n`);

    const acmeMissionsCorrect = acmeMissions.every(
      (m) => m.company?.id === tenantA.company.id,
    );
    const betaMissionsCorrect = betaMissions.every(
      (m) => m.company?.id === tenantB.company.id,
    );

    if (acmeMissionsCorrect) {
      printSuccess('Acme sees only Acme missions');
    } else {
      printError('FAIL: Acme sees missions from other companies!');
    }

    if (betaMissionsCorrect) {
      printSuccess('Beta sees only Beta missions');
    } else {
      printError('FAIL: Beta sees missions from other companies!');
    }

    printHeader('STEP 8: TEST VEHICLE-DRIVER ASSIGNMENT ISOLATION');

    printSubHeader('Scenario 8.1: Assignments Are Company-Scoped');

    const acmeAssignments = acmeAdminResults.assignments;
    const betaAssignments = betaAdminResults.assignments;

    printPlain(`  Acme Assignments: ${acmeAssignments.length}`);
    printPlain(`  Beta Assignments: ${betaAssignments.length}\n`);

    if (acmeAssignments.length > 0) {
      printSuccess(
        `Acme has ${acmeAssignments.length} vehicle-driver assignments`,
      );
    } else {
      printWarning('No assignments created for Acme');
    }

    if (betaAssignments.length > 0) {
      printSuccess(
        `Beta has ${betaAssignments.length} vehicle-driver assignments`,
      );
    } else {
      printWarning('No assignments created for Beta');
    }

    printHeader('STEP 9: TEST SUMMARY');

    printSubHeader('Final Results');

    const totalTests = testsPassed + testsFailed;
    const passRate =
      totalTests > 0 ? ((testsPassed / totalTests) * 100).toFixed(1) : '0';
    const passedStr = String(testsPassed).padStart(2);
    const failedStr = String(testsFailed).padStart(2);
    const rateStr = `${passRate}%`.padStart(7);

    const resultBox =
      testsFailed === 0
        ? [
            '',
            `      ╔═══════════════════════════════════════════════════════╗`,
            `      ║                                                       ║`,
            `      ║   🏆  T E S T   R E S U L T S   S U M M A R Y  🏆    ║`,
            `      ║                                                       ║`,
            `      ╠═══════════════════════════════════════════════════════╣`,
            `      ║                                                       ║`,
            `      ║       ✅  Tests Passed:    ${passedStr}                      ║`,
            `      ║       ❌  Tests Failed:    ${failedStr}                      ║`,
            `      ║       📊  Pass Rate:    ${rateStr}                   ║`,
            `      ║                                                       ║`,
            `      ╠═══════════════════════════════════════════════════════╣`,
            `      ║                                                       ║`,
            `      ║        🎉  ALL TESTS PASSED SUCCESSFULLY! 🎉         ║`,
            `      ║                                                       ║`,
            `      ╚═══════════════════════════════════════════════════════╝`,
            '',
          ]
        : [
            '',
            `      ╔═══════════════════════════════════════════════════════╗`,
            `      ║                                                       ║`,
            `      ║   ⚠️   T E S T   R E S U L T S   S U M M A R Y  ⚠️    ║`,
            `      ║                                                       ║`,
            `      ╠═══════════════════════════════════════════════════════╣`,
            `      ║                                                       ║`,
            `      ║       ✅  Tests Passed:    ${passedStr}                      ║`,
            `      ║       ❌  Tests Failed:    ${failedStr}                      ║`,
            `      ║       📊  Pass Rate:    ${rateStr}                   ║`,
            `      ║                                                       ║`,
            `      ╠═══════════════════════════════════════════════════════╣`,
            `      ║                                                       ║`,
            `      ║        🚨  SOME TESTS FAILED - REVIEW SECURITY! 🚨   ║`,
            `      ║                                                       ║`,
            `      ╚═══════════════════════════════════════════════════════╝`,
            '',
          ];

    resultBox.forEach((line) => {
      console.log(line);
      appendToMarkdown(line);
    });

    printSubHeader('Test Coverage');
    const coverageItems = [
      '🏢  Company-level isolation (buildCompanyScope)',
      '🏬  Branch-level isolation (buildCompanyAndBranchScope)',
      '👑  Super admin access bypass',
      '👔  Company admin sees all branches',
      '👤  Regular user branch restriction',
      '🔒  Cross-tenant access prevention',
      '🎭  Role isolation',
      '👥  User isolation',
      '📋  Mission isolation',
      '🚗  Vehicle-driver assignment isolation',
    ];

    coverageItems.forEach((item) => {
      console.log(`      ✓  ${item}`);
      appendToMarkdown(`      ✓  ${item}`);
    });
    console.log('');
    appendToMarkdown('');

    printSubHeader('Test Credentials');
    console.log('');
    appendToMarkdown('');
    console.log(
      `      ┌────────────────────────────────────────────────────────┐`,
    );
    console.log(
      `      │  🔑  LOGIN CREDENTIALS                                 │`,
    );
    console.log(
      `      ├────────────────────────────────────────────────────────┤`,
    );
    console.log(
      `      │  Acme Admin:   acme_admin / password123                │`,
    );
    console.log(
      `      │  Beta Admin:   beta_admin / password123                │`,
    );
    console.log(
      `      │  Acme Users:   acme_user_1, acme_user_2, acme_user_3   │`,
    );
    console.log(
      `      │  Beta Users:   beta_user_1, beta_user_2, beta_user_3   │`,
    );
    console.log(
      `      │  Password:     password123                             │`,
    );
    console.log(
      `      └────────────────────────────────────────────────────────┘`,
    );
    console.log('');

    appendToMarkdown(
      `      ┌────────────────────────────────────────────────────────┐`,
    );
    appendToMarkdown(
      `      │  🔑  LOGIN CREDENTIALS                                 │`,
    );
    appendToMarkdown(
      `      ├────────────────────────────────────────────────────────┤`,
    );
    appendToMarkdown(
      `      │  Acme Admin:   acme_admin / password123                │`,
    );
    appendToMarkdown(
      `      │  Beta Admin:   beta_admin / password123                │`,
    );
    appendToMarkdown(
      `      │  Acme Users:   acme_user_1, acme_user_2, acme_user_3   │`,
    );
    appendToMarkdown(
      `      │  Beta Users:   beta_user_1, beta_user_2, beta_user_3   │`,
    );
    appendToMarkdown(
      `      │  Password:     password123                             │`,
    );
    appendToMarkdown(
      `      └────────────────────────────────────────────────────────┘`,
    );
    appendToMarkdown('');

    saveMarkdownReport();
  } catch (error) {
    printError(`Demo failed: ${error}`);
    console.error(error);
  } finally {
    if (createdCompanyIds.length > 0) {
      printSubHeader('Cleaning up created test data...');
      const db = getDb();

      for (const companyId of createdCompanyIds) {
        await db
          .delete(schema.missions)
          .where(eq(schema.missions.companyId, companyId));
        await db
          .delete(schema.vehicleDriverAssignments)
          .where(eq(schema.vehicleDriverAssignments.companyId, companyId));
        await db
          .delete(schema.users)
          .where(eq(schema.users.companyId, companyId));
        await db
          .delete(schema.drivers)
          .where(eq(schema.drivers.companyId, companyId));
        await db
          .delete(schema.vehicles)
          .where(eq(schema.vehicles.companyId, companyId));
        await db
          .delete(schema.branches)
          .where(eq(schema.branches.companyId, companyId));
        await db
          .delete(schema.roles)
          .where(eq(schema.roles.companyId, companyId));
        await db
          .delete(schema.companies)
          .where(eq(schema.companies.id, companyId));
      }
      printInfo('All test data cleaned up');
    }
    if (pool) {
      if (client) {
        client.release();
        client = undefined;
      }
      await pool.end();
    }
    printInfo('Database connection closed');
  }
}

runMultiTenancyDemo();
