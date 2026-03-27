// catalog/templates/python-basic.ts
import { JobTemplate } from '../../models/job';
import { containerPresets } from '../presets';

export const pythonBasic: JobTemplate = {
  id: 'python-basic',
  name: 'Python Basic',
  description: 'Простой Python job с одним bootstrap-контейнером.',
  tags: ['python', 'basic', 'sdk'],
  support_level: 'supported',
  draft: {
    title: 'Python Basic Job',
    description: 'Шаблон базовой Python job для обработки данных или автоматизации.',
    containers: [containerPresets.find((p) => p.id === 'bootstrap-python')!.container],
    environments: {
      APP_ENV: 'development',
    },
    attached_files: [],
    execution_code: `from cloudforge import info, artifacts_path, raise_if_cancel_requested
from datetime import datetime
import json

info("python job started")
raise_if_cancel_requested()

result_file = artifacts_path("result.txt")
result_file.parent.mkdir(parents=True, exist_ok=True)
result_file.write_text("hello from cloud forge", encoding="utf-8")

metadata_file = artifacts_path("metadata.json")
metadata_file.write_text(
    json.dumps(
        {
            "language": "python",
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "message": "hello from cloud forge",
        },
        indent=2,
    ),
    encoding="utf-8",
)

info(f"result written to {result_file}")
info(f"metadata written to {metadata_file}")
`,
    execution_language: 'python',
    entrypoint: 'main.py',
  },
};