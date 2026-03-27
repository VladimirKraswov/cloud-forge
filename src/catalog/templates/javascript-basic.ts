// catalog/templates/javascript-basic.ts
import { JobTemplate } from '../../models/job';
import { containerPresets } from '../presets';

export const javascriptBasic: JobTemplate = {
  id: 'javascript-basic',
  name: 'JavaScript Basic',
  description: 'Простой Node.js job с bootstrap-контейнером.',
  tags: ['javascript', 'node', 'basic', 'sdk'],
  support_level: 'supported',
  draft: {
    title: 'JavaScript Basic Job',
    description: 'Шаблон базовой JavaScript job для скриптов и автоматизации.',
    containers: [containerPresets.find((p) => p.id === 'bootstrap-node')!.container],
    environments: {
      APP_ENV: 'development',
    },
    attached_files: [],
    execution_code: `const fs = require('fs');
const path = require('path');
const {
  info,
  artifactsPath,
  raiseIfCancelRequested,
} = require('cloudforge');

async function main() {
  await info('javascript job started');
  await info('Cloud Forge SDK is available inside the bootstrap container');
  raiseIfCancelRequested();

  const resultPath = artifactsPath('result.txt');
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
  fs.writeFileSync(resultPath, 'hello from cloud forge');

  const summaryPath = artifactsPath('summary.json');
  fs.writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        language: 'javascript',
        message: 'hello from cloud forge',
        generated_at: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  await info(\`result written to \${resultPath}\`);
  await info(\`summary written to \${summaryPath}\`);
}

main().catch(async (err) => {
  try {
    await info(\`fatal error: \${err.message}\`);
  } finally {
    process.exit(1);
  }
});
`,
    execution_language: 'javascript',
    entrypoint: 'main.js',
  },
};
