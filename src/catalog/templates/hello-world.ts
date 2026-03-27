// catalog/templates/hello-world.ts
import { JobTemplate, Container } from '../../models/job';
import { config } from '../../utils/config';

const OFFICIAL_BOOTSTRAP_IMAGE = `${config.publishedWorkerImage}:${config.publishedWorkerTag}`;

const bootstrapPython: Container = {
  name: 'bootstrap',
  image: OFFICIAL_BOOTSTRAP_IMAGE,
  is_parent: true,
  resources: {
    shm_size: '2g',
    cpu_limit: 2,
    memory_limit: '4g',
  },
};

export const helloWorldPython: JobTemplate = {
  id: 'hello-world-python',
  name: 'Hello World (Remote Python)',
  description: 'Минимальный job для проверки удалённого запуска через Docker.',
  tags: ['python', 'hello-world', 'remote-run', 'sdk', 'supported'],
  support_level: 'supported',
  draft: {
    title: 'Hello World',
    description: 'Проверочный remote job для публикации bootstrap-образа.',
    containers: [bootstrapPython],
    environments: {
      APP_ENV: 'production',
    },
    attached_files: [],
    execution_code: `from cloudforge import info, artifacts_path, raise_if_cancel_requested
from datetime import datetime
import json

info("hello world job started")
info("Cloud Forge SDK is available inside the bootstrap container")
raise_if_cancel_requested()

hello_file = artifacts_path("hello.txt")
hello_file.parent.mkdir(parents=True, exist_ok=True)
hello_file.write_text("hello from cloud forge\\n", encoding="utf-8")

summary_file = artifacts_path("summary.json")
summary_file.write_text(
    json.dumps(
        {
            "message": "hello from cloud forge",
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "artifacts": ["hello.txt", "summary.json"],
        },
        indent=2,
    ),
    encoding="utf-8",
)

info(f"artifact written: {hello_file}")
info(f"artifact written: {summary_file}")
info("hello world job finished successfully")
`,
    execution_language: 'python',
    entrypoint: 'main.py',
  },
};