/**
 * Architecture rules for apps/web, checked on the whole import graph by `pnpm lint`.
 * Source of truth: ADR-009, docs/architecture/frontend.md §7 and CLAUDE.md rules 1–2.
 */

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'features-isolated',
      severity: 'error',
      comment:
        'Features do not import each other; shared code lives in src/shared (frontend.md §7).',
      from: { path: '^src/features/([^/]+)/' },
      to: { path: '^src/features/', pathNot: '^src/features/$1/' },
    },
    {
      name: 'features-not-routes',
      severity: 'error',
      comment: 'Routes (src/app) assemble features, not the other way round.',
      from: { path: '^src/features/' },
      to: { path: '^src/app/' },
    },
    {
      name: 'shared-is-leaf',
      severity: 'error',
      comment: 'src/shared must not depend on features or routes.',
      from: { path: '^src/shared/' },
      to: { path: '^src/(features|app)/' },
    },
    {
      name: 'no-database-access',
      severity: 'error',
      comment:
        'apps/web never talks to the database; all data goes through the API (CLAUDE.md rule 1).',
      from: {},
      to: { path: '(^|/)node_modules/(pg|postgres|drizzle-orm|@neondatabase/[^/]+)/' },
    },
    {
      name: 'no-imports-outside-package',
      severity: 'error',
      comment:
        'Code of other workspace packages (e.g. apps/api) is not imported directly; the contract is OpenAPI.',
      from: {},
      // pnpm keeps packages in the root node_modules, which also starts with ../
      to: { path: '^\\.\\./', pathNot: '(^|/)node_modules/' },
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
    exclude: { path: '^\\.next/' },
    tsPreCompilationDeps: true,
    // Resolves the @/* path alias
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
  },
};
