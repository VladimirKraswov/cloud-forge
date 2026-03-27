// catalog/templates/qwen-7b-finetune.ts
import { JobTemplate } from '../../models/job';
import { containerPresets } from '../presets';

export const qwen7bFinetune: JobTemplate = {
  id: 'qwen-7b-finetune',
  name: 'Qwen 7B Fine-tune',
  description: 'Готовый шаблон для fine-tuning модели Qwen 7B с self-contained bootstrap-образом.',
  tags: ['llm', 'finetune', 'qwen', 'gpu', 'supported'],
  support_level: 'supported',
  draft: {
    title: 'Qwen 7B Fine-tune',
    description: 'Модель уже внутри bootstrap-образа. Добавь свой код обучения.',
    containers: [
      containerPresets.find((p) => p.id === 'qwen-7b-finetune-worker')!.container,
    ],
    environments: {
      MODEL_DIR: '/models/qwen-7b',
      HF_HOME: '/workspace/.cache/huggingface',
      OUTPUT_DIR: '/workspace/artifacts/output',
    },
    attached_files: [],
    execution_code: `# Ваш код fine-tuning здесь
from cloudforge import info, artifacts_path, raise_if_cancel_requested
from datetime import datetime
import json

info("Qwen 7B fine-tuning job started")
raise_if_cancel_requested()

# Пример использования Unsloth или transformers:
# from unsloth import FastLanguageModel
# model, tokenizer = FastLanguageModel.from_pretrained("/models/qwen-7b")

info("Fine-tuning completed successfully")

summary_file = artifacts_path("training_summary.json")
summary_file.write_text(
    json.dumps({
        "status": "completed",
        "model": "Qwen-7B",
        "finished_at": datetime.utcnow().isoformat() + "Z"
    }, indent=2),
    encoding="utf-8"
)
`,
    execution_language: 'python',
    entrypoint: null,
  },
};