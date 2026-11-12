// Tasks run from e2e/ (closest config wins), so the root .prettierignore is passed explicitly.
const config = {
  '*': 'prettier --write --ignore-unknown --ignore-path ../.prettierignore',
  '*.{ts,mts,cts,js,mjs,cjs}': 'eslint --fix --max-warnings 0',
};

export default config;
