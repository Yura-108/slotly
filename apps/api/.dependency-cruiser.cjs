/**
 * Architecture rules for apps/api, checked on the whole import graph by `pnpm lint`.
 * Source of truth: ADR-006 and docs/architecture/backend.md (§1 layers, §2 modules).
 *
 * `moduleDependencies` mirrors the module graph in backend.md §2.
 * Adding an edge is an architecture decision: update backend.md in the same change.
 */
const moduleDependencies = {
  auth: ['users', 'notifications'],
  users: [],
  specialists: ['users'],
  services: ['specialists'],
  scheduling: ['specialists'],
  bookings: ['scheduling', 'services', 'specialists', 'notifications'],
  notifications: [],
};

const moduleNames = Object.keys(moduleDependencies);

// Drizzle schema files reference other modules' tables for foreign keys only.
const SCHEMA_FILE = '\\.schema\\.ts$';
const TEST_CODE = '(\\.test\\.ts$|^src/test-utils/)';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'The dependency graph must be acyclic; forwardRef is banned (ADR-006).',
      from: {},
      to: { circular: true },
    },
    {
      name: 'known-modules-only',
      severity: 'error',
      comment:
        'Every module must be declared in moduleDependencies (and in backend.md §2) before it is used.',
      from: { path: `^src/modules/(?!(${moduleNames.join('|')})/)` },
      to: {},
    },
    ...Object.entries(moduleDependencies).map(([name, allowed]) => ({
      name: `module-graph-${name}`,
      severity: 'error',
      comment: `Module "${name}" may depend only on: ${allowed.join(', ') || 'no other modules'} (backend.md §2).`,
      from: { path: `^src/modules/${name}/`, pathNot: [SCHEMA_FILE, TEST_CODE] },
      to: {
        path: '^src/modules/',
        pathNot: `^src/modules/(${[name, ...allowed].join('|')})/`,
      },
    })),
    {
      name: 'cross-module-public-api-only',
      severity: 'error',
      comment:
        'Another module is used only through its Nest module and exported service. Its repository, schema and internals are private: a table is read and written only by its owner (CLAUDE.md rule 3).',
      from: { path: '^src/modules/([^/]+)/', pathNot: [SCHEMA_FILE, TEST_CODE] },
      to: {
        path: '^src/modules/',
        pathNot: ['^src/modules/$1/', '\\.(module|service)\\.ts$'],
      },
    },
    {
      name: 'schema-imports-schema-only',
      severity: 'error',
      comment:
        'A schema file may import only other schema files (foreign keys) and database column helpers.',
      from: { path: `^src/modules/[^/]+/[^/]+${SCHEMA_FILE}` },
      to: { path: '^src/', pathNot: [SCHEMA_FILE, '^src/infrastructure/database/columns\\.ts$'] },
    },
    {
      name: 'domain-no-frameworks',
      severity: 'error',
      comment: 'Domain is pure: no NestJS, Drizzle or database driver (CLAUDE.md rule 4).',
      from: { path: '^src/modules/[^/]+/domain/' },
      to: { path: '(^|/)node_modules/(@nestjs/|drizzle-orm/|pg/|nestjs-pino/|pino/)' },
    },
    {
      name: 'domain-no-application-layers',
      severity: 'error',
      comment: 'Domain depends only on domain code and src/shared (CLAUDE.md rule 4).',
      from: { path: '^src/modules/[^/]+/domain/' },
      to: { path: '^src/', pathNot: ['^src/modules/[^/]+/domain/', '^src/shared/'] },
    },
    {
      name: 'controller-no-data-access',
      severity: 'error',
      comment:
        'Module controllers call services, never repositories or the database (CLAUDE.md rule 4). The health check in infrastructure pings the database directly by design.',
      from: { path: '^src/modules/.+\\.controller\\.ts$' },
      to: { path: ['\\.repository\\.ts$', SCHEMA_FILE, '^src/infrastructure/database/'] },
    },
    {
      name: 'infrastructure-no-modules',
      severity: 'error',
      comment:
        'Infrastructure is used by modules, not the other way round. Exception: the schema aggregate for Drizzle.',
      from: {
        path: '^src/infrastructure/',
        pathNot: ['^src/infrastructure/database/schema\\.ts$', TEST_CODE],
      },
      to: { path: '^src/modules/' },
    },
    {
      name: 'shared-is-leaf',
      severity: 'error',
      comment: 'src/shared holds building blocks for every layer and must not depend on them.',
      from: { path: '^src/shared/' },
      to: { path: '^src/(modules|infrastructure)/' },
    },
    {
      name: 'no-test-code-in-production',
      severity: 'error',
      from: { pathNot: TEST_CODE },
      to: { path: TEST_CODE },
    },
    {
      name: 'not-to-dev-dependency',
      severity: 'error',
      comment:
        'Production code must not import devDependencies: they are absent in the runtime image.',
      from: { path: '^src/', pathNot: TEST_CODE },
      to: { dependencyTypes: ['npm-dev'], dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '^(dist|drizzle)/' },
    // Type-only imports are coupling too: `import type { BookingRow }` from another module counts.
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
  },
};
