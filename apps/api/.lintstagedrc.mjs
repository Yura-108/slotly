// Tasks run from apps/api (closest config wins), so the root .prettierignore is passed explicitly.
// Sequential run (--concurrent false in the hook): Prettier and ESLint never edit one file at once.
const config = {
  '*': 'prettier --write --ignore-unknown --ignore-path ../../.prettierignore',
  '*.{ts,mts,cts,js,mjs,cjs}': 'eslint --fix --max-warnings 0',
};

export default config;
