import { AttachedFile, Container, ExecutionLanguage } from '../models/job';
import { config } from '../utils/config';

export interface JobDraftTemplate {
  title: string;
  description: string;
  containers: Container[];
  environments: Record<string, string>;
  attached_files: AttachedFile[];
  execution_code: string;
  execution_language: ExecutionLanguage;
  entrypoint?: string | null;
}

export interface ContainerPreset {
  id: string;
  name: string;
  category: 'bootstrap' | 'runtime' | 'model' | 'service';
  description: string;
  recommended_for: string[];
  container: Container;
  support_level: 'supported' | 'future';
}

export interface JobTemplate {
  id: string;
  name: string;
  description: string;
  tags: string[];
  draft: JobDraftTemplate;
  support_level: 'supported' | 'future';
}

const OFFICIAL_BOOTSTRAP_IMAGE = `${config.publishedWorkerImage}:${config.publishedWorkerTag}`;

const HELLO_WORLD_PYTHON = `from cloudforge import info, artifacts_path, raise_if_cancel_requested
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
`;

const PYTHON_SAMPLE = `from cloudforge import info, artifacts_path, raise_if_cancel_requested
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
`;

const JAVASCRIPT_SAMPLE = `const fs = require('fs');
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
`;

export const containerPresets: ContainerPreset[] = [
  {
    id: 'bootstrap-python',
    name: 'Cloud Forge Bootstrap (Python)',
    category: 'bootstrap',
    description:
      'Официальный bootstrap-контейнер Cloud Forge для Python job с предустановленным SDK и worker runtime.',
    recommended_for: ['python', 'remote-run', 'sdk', 'hello-world', 'etl', 'data-processing'],
    support_level: 'supported',
    container: {
      name: 'bootstrap',
      image: OFFICIAL_BOOTSTRAP_IMAGE,
      is_parent: true,
      resources: {
        shm_size: '2g',
        cpu_limit: 2,
        memory_limit: '4g',
      },
    },
  },
  {
    id: 'bootstrap-node',
    name: 'Cloud Forge Bootstrap (Node.js)',
    category: 'bootstrap',
    description:
      'Официальный bootstrap-контейнер Cloud Forge для JavaScript/Node.js job с предустановленным SDK и worker runtime.',
    recommended_for: ['javascript', 'node', 'remote-run', 'sdk', 'automation'],
    support_level: 'supported',
    container: {
      name: 'bootstrap',
      image: OFFICIAL_BOOTSTRAP_IMAGE,
      is_parent: true,
      resources: {
        shm_size: '1g',
        cpu_limit: 2,
        memory_limit: '4g',
      },
    },
  },
  {
    id: 'pytorch-cu121',
    name: 'PyTorch CUDA 12.1',
    category: 'runtime',
    description: 'Контейнер с PyTorch и CUDA для обучения и инференса.',
    recommended_for: ['pytorch', 'training', 'gpu', 'vision'],
    support_level: 'future',
    container: {
      name: 'pytorch',
      image: 'pytorch/pytorch:2.4.1-cuda12.1-cudnn9-runtime',
      resources: {
        gpus: 'all',
        shm_size: '16g',
        memory_limit: '32g',
      },
    },
  },
  {
    id: 'vllm-runtime',
    name: 'vLLM Runtime',
    category: 'runtime',
    description: 'Контейнер для инференса LLM через vLLM.',
    recommended_for: ['llm', 'inference', 'vllm', 'gpu'],
    support_level: 'future',
    container: {
      name: 'vllm',
      image: 'vllm/vllm-openai:latest',
      resources: {
        gpus: 'all',
        shm_size: '16g',
        memory_limit: '32g',
      },
    },
  },
  {
    id: 'unsloth-finetune',
    name: 'Unsloth Fine-tune',
    category: 'runtime',
    description: 'Контейнер для SFT/LoRA fine-tuning с Unsloth.',
    recommended_for: ['llm', 'finetune', 'unsloth', 'gpu'],
    support_level: 'future',
    container: {
      name: 'unsloth',
      image: 'unsloth/unsloth:latest',
      resources: {
        gpus: 'all',
        shm_size: '16g',
        memory_limit: '48g',
      },
    },
  },
  {
    id: 'qwen-7b-model',
    name: 'Qwen 7B Model Store',
    category: 'model',
    description: 'Контейнер-носитель с предзагруженной моделью семейства Qwen 7B.',
    recommended_for: ['llm', 'qwen', 'inference', 'training'],
    support_level: 'future',
    container: {
      name: 'model-qwen-7b',
      image: 'igortet/model-qwen-7b:latest',
      resources: {
        shm_size: '4g',
      },
    },
  },
];

export const jobTemplates: JobTemplate[] = [
  {
    id: 'hello-world-python',
    name: 'Hello World (Remote Python)',
    description:
      'Минимальный job для проверки удаленного запуска через Docker: пишет hello.txt и summary.json через Cloud Forge SDK.',
    tags: ['python', 'hello-world', 'remote-run', 'sdk', 'supported'],
    support_level: 'supported',
    draft: {
      title: 'Hello World',
      description:
        'Проверочный remote job для публикации bootstrap-образа и запуска на любой машине с Docker.',
      containers: [containerPresets.find((preset) => preset.id === 'bootstrap-python')!.container],
      environments: {
        APP_ENV: 'production',
      },
      attached_files: [],
      execution_code: HELLO_WORLD_PYTHON,
      execution_language: 'python',
      entrypoint: 'python3 /workspace/code/main.py',
    },
  },
  {
    id: 'python-basic',
    name: 'Python Basic',
    description: 'Простой Python job с одним bootstrap-контейнером.',
    tags: ['python', 'basic', 'sdk'],
    support_level: 'supported',
    draft: {
      title: 'Python Basic Job',
      description: 'Шаблон базовой Python job для обработки данных или автоматизации.',
      containers: [containerPresets.find((preset) => preset.id === 'bootstrap-python')!.container],
      environments: {
        APP_ENV: 'development',
      },
      attached_files: [],
      execution_code: PYTHON_SAMPLE,
      execution_language: 'python',
      entrypoint: 'python3 /workspace/code/main.py',
    },
  },
  {
    id: 'javascript-basic',
    name: 'JavaScript Basic',
    description: 'Простой Node.js job с bootstrap-контейнером.',
    tags: ['javascript', 'node', 'basic', 'sdk'],
    support_level: 'supported',
    draft: {
      title: 'JavaScript Basic Job',
      description: 'Шаблон базовой JavaScript job для скриптов и автоматизации.',
      containers: [containerPresets.find((preset) => preset.id === 'bootstrap-node')!.container],
      environments: {
        APP_ENV: 'development',
      },
      attached_files: [],
      execution_code: JAVASCRIPT_SAMPLE,
      execution_language: 'javascript',
      entrypoint: 'node /workspace/code/index.js',
    },
  },
  {
    id: 'pytorch-training',
    name: 'PyTorch Training',
    description: 'Стартовая конфигурация для обучения модели на PyTorch.',
    tags: ['python', 'pytorch', 'training', 'gpu'],
    support_level: 'future',
    draft: {
      title: 'PyTorch Training Job',
      description: 'Шаблон job для обучения модели с GPU и датасетом.',
      containers: [
        containerPresets.find((preset) => preset.id === 'bootstrap-python')!.container,
        containerPresets.find((preset) => preset.id === 'pytorch-cu121')!.container,
      ],
      environments: {
        CUDA_VISIBLE_DEVICES: '0',
        TRAIN_BATCH_SIZE: '8',
        EPOCHS: '3',
      },
      attached_files: [],
      execution_code: `from cloudforge import info, artifacts_path, raise_if_cancel_requested

info("training started")
raise_if_cancel_requested()

checkpoint = artifacts_path("checkpoints/epoch-1.txt")
checkpoint.parent.mkdir(parents=True, exist_ok=True)
checkpoint.write_text("demo checkpoint", encoding="utf-8")

info("training finished")
`,
      execution_language: 'python',
      entrypoint: 'python3 /workspace/code/train.py',
    },
  },
  {
    id: 'vllm-inference',
    name: 'vLLM Inference',
    description: 'Шаблон для запуска инференса LLM с vLLM и отдельным model-контейнером.',
    tags: ['python', 'llm', 'vllm', 'inference', 'gpu'],
    support_level: 'future',
    draft: {
      title: 'vLLM Inference Job',
      description: 'Шаблон для инференса с отдельным runtime и модельным контейнером.',
      containers: [
        containerPresets.find((preset) => preset.id === 'bootstrap-python')!.container,
        containerPresets.find((preset) => preset.id === 'vllm-runtime')!.container,
        containerPresets.find((preset) => preset.id === 'qwen-7b-model')!.container,
      ],
      environments: {
        MODEL_NAME: 'Qwen/Qwen2.5-7B-Instruct',
        MAX_TOKENS: '512',
      },
      attached_files: [],
      execution_code: `from cloudforge import info, raise_if_cancel_requested

info("vLLM inference job started")
raise_if_cancel_requested()
info("connect to vLLM runtime and execute prompts here")
`,
      execution_language: 'python',
      entrypoint: 'python3 /workspace/code/main.py',
    },
  },
];