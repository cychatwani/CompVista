// Deterministic workforce plan used by the demo seed and by organization provisioning. Pure: no
// database access, so the same inputs always produce the same people, attributes, and packages.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const workforceTarget = 10_000;
export const workforceSeed = 20_260_401;
export const rosterCodePattern = /^CV-\d{5}$/;
export const packageEffectiveFrom = '2026-04-01';

export const countryCodes = ['IN', 'US', 'GB', 'DE', 'AE', 'SG'] as const;
export type CountryCode = typeof countryCodes[number];
export const countryCurrency: Record<CountryCode, string> = { IN: 'INR', US: 'USD', GB: 'GBP', DE: 'EUR', AE: 'AED', SG: 'SGD' };
export const countryTargets: Record<CountryCode, number> = { IN: 5000, US: 1500, GB: 1000, DE: 1000, AE: 800, SG: 700 };

/** Scales a 10,000-person target table to `total` people with largest-remainder rounding (exact sum). */
export function scaleTargets<K extends string>(targets: Record<K, number>, total: number): Record<K, number> {
  const keys = Object.keys(targets) as K[];
  const base = keys.reduce((sum, key) => sum + targets[key], 0);
  const raw = keys.map((key) => ({ key, value: (targets[key] * total) / base }));
  const result = Object.fromEntries(raw.map(({ key, value }) => [key, Math.floor(value)])) as Record<K, number>;
  let missing = total - keys.reduce((sum, key) => sum + result[key], 0);
  for (const { key } of [...raw].sort((a, b) => (b.value % 1) - (a.value % 1) || keys.indexOf(a.key) - keys.indexOf(b.key))) {
    if (missing <= 0) break;
    result[key]++; missing--;
  }
  return result;
}

export const departmentCatalog = [
  { code: 'ENGINEERING', name: 'Engineering', description: 'Builds and runs the CompVista platform.' },
  { code: 'PRODUCT', name: 'Product', description: 'Product management, design, and research.' },
  { code: 'SALES_MARKETING', name: 'Sales & Marketing', description: 'Revenue, partnerships, and brand.' },
  { code: 'FINANCE', name: 'Finance', description: 'Accounting, FP&A, and treasury.' },
  { code: 'HUMAN_RESOURCES', name: 'Human Resources', description: 'People operations, talent, and rewards.' },
  { code: 'OPERATIONS', name: 'Operations', description: 'Customer operations, facilities, and IT.' },
] as const;
export type DepartmentCode = typeof departmentCatalog[number]['code'];
export const departmentCodes = departmentCatalog.map((item) => item.code) as DepartmentCode[];
export const departmentTargets: Record<DepartmentCode, number> = { ENGINEERING: 3500, PRODUCT: 1200, SALES_MARKETING: 1800, FINANCE: 1000, HUMAN_RESOURCES: 800, OPERATIONS: 1700 };

// Relative presence of each department in each country before fitting to the exact totals:
// engineering hubs in India and Germany, commercial teams in the US, UK and UAE, finance in Singapore and London.
const affinity: Record<CountryCode, Record<DepartmentCode, number>> = {
  IN: { ENGINEERING: 1.35, PRODUCT: 1.0, SALES_MARKETING: 0.7, FINANCE: 1.1, HUMAN_RESOURCES: 1.0, OPERATIONS: 1.15 },
  US: { ENGINEERING: 0.9, PRODUCT: 1.3, SALES_MARKETING: 1.5, FINANCE: 0.9, HUMAN_RESOURCES: 0.9, OPERATIONS: 0.6 },
  GB: { ENGINEERING: 0.8, PRODUCT: 1.0, SALES_MARKETING: 1.4, FINANCE: 1.3, HUMAN_RESOURCES: 1.0, OPERATIONS: 0.8 },
  DE: { ENGINEERING: 1.25, PRODUCT: 1.1, SALES_MARKETING: 1.0, FINANCE: 0.8, HUMAN_RESOURCES: 0.9, OPERATIONS: 0.9 },
  AE: { ENGINEERING: 0.5, PRODUCT: 0.6, SALES_MARKETING: 1.7, FINANCE: 1.1, HUMAN_RESOURCES: 1.1, OPERATIONS: 1.4 },
  SG: { ENGINEERING: 0.9, PRODUCT: 1.0, SALES_MARKETING: 1.3, FINANCE: 1.4, HUMAN_RESOURCES: 0.9, OPERATIONS: 0.9 },
};

export const jobLevels = ['JUNIOR', 'MID', 'SENIOR', 'LEAD', 'MANAGER', 'DIRECTOR'] as const;
export type JobLevel = typeof jobLevels[number];
const levelWeights: Record<JobLevel, number> = { JUNIOR: 28, MID: 32, SENIOR: 22, LEAD: 9, MANAGER: 6.5, DIRECTOR: 2.5 };
const levelFactor: Record<JobLevel, number> = { JUNIOR: 0.58, MID: 1, SENIOR: 1.45, LEAD: 1.85, MANAGER: 2.15, DIRECTOR: 3.1 };
const departmentFactor: Record<DepartmentCode, number> = { ENGINEERING: 1.15, PRODUCT: 1.2, SALES_MARKETING: 1.0, FINANCE: 1.05, HUMAN_RESOURCES: 0.88, OPERATIONS: 0.82 };
// Typical annual cost to company for a mid-level employee, in the country's own currency.
const midLevelCtc: Record<CountryCode, number> = { IN: 1_600_000, US: 125_000, GB: 68_000, DE: 72_000, AE: 300_000, SG: 98_000 };
// Annual bonus as a percentage of one month's Basic Salary.
const bonusPercent: Record<JobLevel, number> = { JUNIOR: 0, MID: 50, SENIOR: 100, LEAD: 150, MANAGER: 200, DIRECTOR: 300 };

const titles: Record<DepartmentCode, Record<JobLevel, string>> = {
  ENGINEERING: { JUNIOR: 'Associate Software Engineer', MID: 'Software Engineer', SENIOR: 'Senior Software Engineer', LEAD: 'Lead Engineer', MANAGER: 'Engineering Manager', DIRECTOR: 'Director of Engineering' },
  PRODUCT: { JUNIOR: 'Associate Product Designer', MID: 'Product Manager', SENIOR: 'Senior Product Manager', LEAD: 'Lead Product Designer', MANAGER: 'Group Product Manager', DIRECTOR: 'Director of Product' },
  SALES_MARKETING: { JUNIOR: 'Sales Development Representative', MID: 'Account Executive', SENIOR: 'Senior Account Executive', LEAD: 'Marketing Lead', MANAGER: 'Regional Sales Manager', DIRECTOR: 'Director of Sales' },
  FINANCE: { JUNIOR: 'Finance Associate', MID: 'Financial Analyst', SENIOR: 'Senior Financial Analyst', LEAD: 'Finance Lead', MANAGER: 'Finance Manager', DIRECTOR: 'Director of Finance' },
  HUMAN_RESOURCES: { JUNIOR: 'HR Associate', MID: 'HR Generalist', SENIOR: 'Senior HR Business Partner', LEAD: 'Talent Acquisition Lead', MANAGER: 'People Operations Manager', DIRECTOR: 'Director of People' },
  OPERATIONS: { JUNIOR: 'Operations Associate', MID: 'Operations Specialist', SENIOR: 'Senior Operations Analyst', LEAD: 'Operations Lead', MANAGER: 'Operations Manager', DIRECTOR: 'Director of Operations' },
};

// Synthetic name pools. Combinations are random; none describe real people.
const indian = JSON.parse(readFileSync(resolve('scripts/common_indian_names.json'), 'utf8')) as { first_names: string[]; last_names: string[] };
const names: Record<CountryCode, { first: string[]; last: string[] }> = {
  IN: { first: indian.first_names, last: indian.last_names },
  US: { first: ['James', 'Olivia', 'Liam', 'Emma', 'Noah', 'Ava', 'Ethan', 'Sophia', 'Mason', 'Isabella', 'Lucas', 'Mia', 'Logan', 'Amelia', 'Elijah', 'Harper', 'Aiden', 'Evelyn', 'Carter', 'Abigail', 'Jayden', 'Emily', 'Caleb', 'Ella', 'Grace', 'Wyatt', 'Chloe', 'Daniel', 'Zoe', 'Henry'], last: ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Clark', 'Lewis', 'Walker', 'Young', 'Allen', 'King'] },
  GB: { first: ['Oliver', 'Amelia', 'George', 'Isla', 'Harry', 'Ava', 'Jack', 'Lily', 'Charlie', 'Freya', 'Thomas', 'Florence', 'Oscar', 'Poppy', 'William', 'Emily', 'Alfie', 'Ivy', 'Archie', 'Rosie', 'Arthur', 'Evie', 'Theo', 'Matilda', 'Freddie', 'Imogen'], last: ['Smith', 'Jones', 'Taylor', 'Brown', 'Williams', 'Wilson', 'Johnson', 'Davies', 'Patel', 'Robinson', 'Wright', 'Thompson', 'Evans', 'Walker', 'White', 'Roberts', 'Green', 'Hall', 'Wood', 'Clarke', 'Hughes', 'Edwards', 'Turner', 'Cooper', 'Hill', 'Ward'] },
  DE: { first: ['Lukas', 'Mia', 'Leon', 'Emma', 'Finn', 'Hannah', 'Jonas', 'Sofia', 'Paul', 'Lena', 'Felix', 'Marie', 'Elias', 'Lea', 'Noah', 'Anna', 'Ben', 'Clara', 'Maximilian', 'Laura', 'Moritz', 'Johanna', 'Julian', 'Greta', 'Tim', 'Ida'], last: ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Schulz', 'Hoffmann', 'Koch', 'Richter', 'Klein', 'Wolf', 'Schröder', 'Neumann', 'Schwarz', 'Braun', 'Zimmermann', 'Krüger', 'Hartmann', 'Lange', 'Werner', 'Krause', 'Lehmann', 'Köhler'] },
  AE: { first: ['Ahmed', 'Fatima', 'Mohammed', 'Aisha', 'Omar', 'Mariam', 'Khalid', 'Noura', 'Yousef', 'Layla', 'Hamdan', 'Hessa', 'Rashid', 'Sara', 'Saeed', 'Shamma', 'Ali', 'Reem', 'Hassan', 'Amna', 'Arjun', 'Priya', 'Daniel', 'Maria', 'Ravi', 'Anna'], last: ['Al Mansoori', 'Al Hashemi', 'Al Nuaimi', 'Al Suwaidi', 'Al Mazrouei', 'Al Ketbi', 'Al Shamsi', 'Al Dhaheri', 'Al Falasi', 'Al Marri', 'Haddad', 'Khoury', 'Nasser', 'Saleh', 'Menon', 'Nair', 'Fernandes', 'Thomas', 'Rahman', 'Qureshi', 'Siddiqui', 'Hussain'] },
  SG: { first: ['Wei Ling', 'Jun Jie', 'Hui Min', 'Zhi Hao', 'Xin Yi', 'Jia Hui', 'Kai Wen', 'Shu Fen', 'Nurul', 'Hafiz', 'Siti', 'Aisyah', 'Rajesh', 'Kavitha', 'Ethan', 'Chloe', 'Ryan', 'Rachel', 'Marcus', 'Natalie', 'Darren', 'Michelle', 'Farah', 'Imran'], last: ['Tan', 'Lim', 'Lee', 'Ng', 'Ong', 'Wong', 'Goh', 'Chua', 'Chan', 'Koh', 'Teo', 'Ang', 'Yeo', 'Tay', 'Ho', 'Low', 'Toh', 'Sim', 'Rahman', 'Ismail', 'Abdullah', 'Pillai', 'Krishnan', 'Raj'] },
};

/** mulberry32: small, fast, deterministic PRNG. */
export function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Cell = { country: CountryCode; department: DepartmentCode };
export const cellKey = (cell: Cell) => `${cell.country}:${cell.department}`;

/**
 * Integer country × department headcounts whose rows and columns hit the targets exactly:
 * iterative proportional fitting on the affinity table, then controlled rounding.
 */
export function distributionMatrix(total = workforceTarget): Map<string, number> {
  const countries = scaleTargets(countryTargets, total);
  const departments = scaleTargets(departmentTargets, total);
  const fitted = countryCodes.map((country) => departmentCodes.map((department) => affinity[country][department]));
  const rowTargets = countryCodes.map((country) => countries[country]);
  const columnTargets = departmentCodes.map((department) => departments[department]);
  if (rowTargets.reduce((a, b) => a + b) !== columnTargets.reduce((a, b) => a + b)) throw new Error('Country and department targets disagree');
  for (let iteration = 0; iteration < 200; iteration++) {
    fitted.forEach((row, r) => { const sum = row.reduce((a, b) => a + b); row.forEach((_, c) => { row[c] = sum ? row[c] * rowTargets[r] / sum : 0; }); });
    columnTargets.forEach((target, c) => { const sum = fitted.reduce((acc, row) => acc + row[c], 0); fitted.forEach((row) => { row[c] = sum ? row[c] * target / sum : 0; }); });
  }
  const counts = fitted.map((row) => row.map(Math.floor));
  const rowNeed = rowTargets.map((target, r) => target - counts[r].reduce((a, b) => a + b));
  const columnNeed = columnTargets.map((target, c) => target - counts.reduce((total, row) => total + row[c], 0));
  const remainders = fitted.flatMap((row, r) => row.map((value, c) => ({ r, c, fraction: value - Math.floor(value) }))).sort((a, b) => b.fraction - a.fraction || a.r - b.r || a.c - b.c);
  for (const pass of [true, false]) {
    for (const { r, c, fraction } of remainders) {
      if (pass && fraction === 0) continue;
      while (rowNeed[r] > 0 && columnNeed[c] > 0) {
        counts[r][c]++; rowNeed[r]--; columnNeed[c]--;
        if (pass) break;
      }
    }
  }
  if (rowNeed.some(Boolean) || columnNeed.some(Boolean)) throw new Error('Could not round the distribution to exact totals');
  return new Map(countryCodes.flatMap((country, r) => departmentCodes.map((department, c) => [cellKey({ country, department }), counts[r][c]] as const)));
}

export type PlannedRule = { code: string; calculationType: 'FIXED' | 'PERCENTAGE_OF_BASE'; fixedAmount: string | null; percentage: string | null; frequency: 'MONTHLY' | 'ANNUAL' };
export type PlannedEmployee = {
  code: string; displayName: string; email: string; country: CountryCode; department: DepartmentCode; level: JobLevel; jobTitle: string;
  employmentStatus: 'ACTIVE' | 'PROBATION' | 'ON_LEAVE' | 'NOTICE_PERIOD'; hireDate: string; currency: string; targetAnnualCtc: number; rules: PlannedRule[];
};

const percent = (code: string, value: number, frequency: PlannedRule['frequency'] = 'MONTHLY'): PlannedRule => ({ code, calculationType: 'PERCENTAGE_OF_BASE', fixedAmount: null, percentage: value.toFixed(2), frequency });
const fixed = (code: string, value: number, frequency: PlannedRule['frequency'] = 'MONTHLY'): PlannedRule => ({ code, calculationType: 'FIXED', fixedAmount: value.toFixed(2), percentage: null, frequency });
const roundTo = (value: number, unit: number) => Math.max(unit, Math.round(value / unit) * unit);

/**
 * Country-appropriate package rules that land close to the target annual CTC. India uses the
 * statutory PF structure; elsewhere generic retirement, health, and housing components apply.
 */
export function packageRules(country: CountryCode, level: JobLevel, targetAnnualCtc: number, next: () => number): PlannedRule[] {
  const bonus = bonusPercent[level];
  const withBonus = (rules: PlannedRule[]) => bonus ? [...rules, percent('PERFORMANCE_BONUS', bonus, 'ANNUAL')] : rules;
  // Solve Basic B from: 12·B·(1 + Σ monthly % of Basic) + (bonus% / 100)·B + 12·fixed extras = target.
  const basicFor = (monthlyPercent: number, fixedMonthly: number) => (targetAnnualCtc - 12 * fixedMonthly) / (12 * (1 + monthlyPercent / 100) + bonus / 100);
  switch (country) {
    case 'IN': {
      const basic = roundTo((0.4 * targetAnnualCtc) / 12, 100);
      const hra = next() < 0.6 ? 50 : 40; // metro vs non-metro
      const special = roundTo(targetAnnualCtc / 12 - basic * (1 + hra / 100 + 0.12) - (basic * bonus) / 1200, 100);
      return withBonus([fixed('BASIC', basic), percent('HRA', hra), fixed('SPECIAL', special), percent('EMPLOYER_PF', 12), percent('EMPLOYEE_PF', 12)]);
    }
    case 'US': {
      const health = roundTo(650 + next() * 300, 10);
      return withBonus([fixed('BASIC', roundTo(basicFor(4, health), 10)), percent('EMPLOYER_RETIREMENT', 4), fixed('HEALTH_INSURANCE', health)]);
    }
    case 'GB': return withBonus([fixed('BASIC', roundTo(basicFor(5, 0), 10)), percent('EMPLOYER_RETIREMENT', 5)]);
    case 'DE': return withBonus([fixed('BASIC', roundTo(basicFor(9.3, 0), 10)), percent('EMPLOYER_RETIREMENT', 9.3)]);
    case 'AE': {
      const transport = roundTo(800 + next() * 1200, 50);
      return withBonus([fixed('BASIC', roundTo(basicFor(40, transport), 50)), percent('HRA', 40), fixed('SPECIAL', transport)]);
    }
    case 'SG': return withBonus([fixed('BASIC', roundTo(basicFor(17, 0), 10)), percent('EMPLOYER_RETIREMENT', 17), percent('EMPLOYEE_RETIREMENT', 20)]);
  }
}

function pickWeighted<T extends string>(weights: Record<T, number>, roll: number): T {
  const entries = Object.entries(weights) as [T, number][];
  let remaining = roll * entries.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [key, weight] of entries) { remaining -= weight; if (remaining < 0) return key; }
  return entries[entries.length - 1][0];
}
const slug = (value: string) => value.normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'person';

/**
 * The generated roster. `occupied` counts people who already exist outside the roster (seeded
 * login accounts, manual entries) per cell, so roster plus existing people match the targets.
 */
export function workforcePlan(occupied: Map<string, number>, emailDomain: string, options: { total?: number; emailPrefix?: string } = {}): PlannedEmployee[] {
  const matrix = distributionMatrix(options.total ?? workforceTarget);
  const slots: Cell[] = [];
  for (const country of countryCodes) for (const department of departmentCodes) {
    const key = cellKey({ country, department });
    const remaining = (matrix.get(key) ?? 0) - (occupied.get(key) ?? 0);
    if (remaining < 0) throw new Error(`Existing employees exceed the planned ${department} headcount in ${country}`);
    for (let index = 0; index < remaining; index++) slots.push({ country, department });
  }
  const next = random(workforceSeed);
  for (let index = slots.length - 1; index > 0; index--) {
    const swap = Math.floor(next() * (index + 1));
    [slots[index], slots[swap]] = [slots[swap], slots[index]];
  }
  return slots.map(({ country, department }, index) => {
    const sequence = String(index + 1).padStart(5, '0');
    const pool = names[country];
    const first = pool.first[Math.floor(next() * pool.first.length)];
    const last = pool.last[Math.floor(next() * pool.last.length)];
    const level = pickWeighted(levelWeights, next());
    // Log-normal-ish spread of ±~12% around the band.
    const jitter = Math.exp((next() + next() + next() - 1.5) * 0.2);
    const targetAnnualCtc = Math.round(midLevelCtc[country] * departmentFactor[department] * levelFactor[level] * jitter);
    const tenureYears = { JUNIOR: 2, MID: 4, SENIOR: 6, LEAD: 7, MANAGER: 8, DIRECTOR: 10 }[level];
    const hired = new Date(Date.UTC(2026, 2, 31) - Math.floor(next() * tenureYears * 365.25) * 86_400_000);
    const statusRoll = next();
    const employmentStatus = statusRoll < 0.02 ? 'ON_LEAVE' : statusRoll < 0.03 ? 'NOTICE_PERIOD' : hired >= new Date(Date.UTC(2025, 9, 1)) ? 'PROBATION' : 'ACTIVE';
    return {
      code: `CV-${sequence}`, displayName: `${first} ${last}`, email: `${options.emailPrefix ? `${options.emailPrefix}.` : ''}${slug(first)}.${slug(last)}.${sequence}@${emailDomain}`.toLowerCase(),
      country, department, level, jobTitle: titles[department][level], employmentStatus, hireDate: hired.toISOString().slice(0, 10),
      currency: countryCurrency[country], targetAnnualCtc, rules: packageRules(country, level, targetAnnualCtc, next),
    };
  });
}

/** Extra generic components the international packages use, alongside the default catalog. */
export const workforceComponents = [
  { code: 'PERFORMANCE_BONUS', name: 'Performance Bonus', category: 'EARNING', default_frequency: 'ANNUAL' },
  { code: 'EMPLOYER_RETIREMENT', name: 'Employer Retirement Contribution', category: 'EMPLOYER_CONTRIBUTION', default_frequency: 'MONTHLY' },
  { code: 'EMPLOYEE_RETIREMENT', name: 'Employee Retirement Contribution', category: 'EMPLOYEE_DEDUCTION', default_frequency: 'MONTHLY' },
  { code: 'HEALTH_INSURANCE', name: 'Employer Health Insurance', category: 'EMPLOYER_CONTRIBUTION', default_frequency: 'MONTHLY' },
] as const;

/** Department, title, and level for people seeded before the roster (login accounts), by role. */
export const profileForRole: Record<'admin' | 'hr' | 'employee', { department: DepartmentCode; level: JobLevel; jobTitle: string }> = {
  admin: { department: 'HUMAN_RESOURCES', level: 'DIRECTOR', jobTitle: 'Director of People' },
  hr: { department: 'HUMAN_RESOURCES', level: 'SENIOR', jobTitle: 'Senior HR Business Partner' },
  employee: { department: 'ENGINEERING', level: 'MID', jobTitle: 'Software Engineer' },
};

/** The standard component catalog every organization starts with. */
export const defaultComponentCatalog = [
  { code: 'BASIC', name: 'Basic Salary', category: 'EARNING', is_basic: true },
  { code: 'HRA', name: 'House Rent Allowance', category: 'EARNING', is_basic: false },
  { code: 'SPECIAL', name: 'Special Allowance', category: 'EARNING', is_basic: false },
  { code: 'EMPLOYER_PF', name: 'Employer PF', category: 'EMPLOYER_CONTRIBUTION', is_basic: false },
  { code: 'EMPLOYEE_PF', name: 'Employee PF', category: 'EMPLOYEE_DEDUCTION', is_basic: false },
] as const;

/** Default permission flags per application role. */
export const defaultPermissions = {
  admin: { canViewAllComp: true, canViewOwnComp: true, canProposeOthersComp: true, canProposeOwnComp: true, canApproveComp: true, canApproveOwnComp: true, requiresApproval: false },
  hr: { canViewAllComp: true, canViewOwnComp: true, canProposeOthersComp: true, canProposeOwnComp: false, canApproveComp: false, canApproveOwnComp: false, requiresApproval: true },
  employee: { canViewAllComp: false, canViewOwnComp: true, canProposeOthersComp: false, canProposeOwnComp: false, canApproveComp: false, canApproveOwnComp: false, requiresApproval: true },
} as const;
