// Root config: files outside apps/* (docs, configs). Each app has its own config, which wins
// for files inside it (lint-staged uses the closest config and runs tasks from its directory).
const config = {
  '*': 'prettier --write --ignore-unknown',
};

export default config;
