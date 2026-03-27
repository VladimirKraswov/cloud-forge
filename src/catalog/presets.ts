// catalog/presets.ts
import { ContainerPreset } from '../models/job';
import { config } from '../utils/config';
import { jobTemplates } from './templates';

// Базовый официальный bootstrap-образ
const OFFICIAL_BOOTSTRAP_IMAGE = `${config.publishedWorkerImage}:${config.publishedWorkerTag}`;

export const containerPresets: ContainerPreset[] = [
  {
    id: 'bootstrap-python',
    name: 'Cloud Forge Bootstrap (Python)',
    category: 'bootstrap',
    description: 'Официальный bootstrap-контейнер Cloud Forge для Python job с предустановленным SDK.',
    recommended_for: ['python', 'remote-run', 'sdk', 'hello-world'],
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
    description: 'Официальный bootstrap-контейнер для JavaScript/Node.js job.',
    recommended_for: ['javascript', 'node', 'automation'],
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

  // ── Custom Model Workers (для больших моделей) ─────────────────────
  {
    id: 'custom-model-worker',
    name: 'Custom Model Worker',
    category: 'bootstrap',
    description: 'Self-contained bootstrap-образ с большой моделью внутри (50GB+).',
    recommended_for: ['llm', 'finetune', 'gpu'],
    support_level: 'supported',
    container: {
      name: 'bootstrap',
      image: 'igortet/cloud-forge-worker-qwen-7b:0.1.0', // ← Замени на свой актуальный образ при необходимости
      is_parent: true,
      resources: {
        gpus: 'all',
        shm_size: '16g',
        memory_limit: '64g',
        cpu_limit: 8,
      },
    },
  },

  {
    id: 'qwen-7b-finetune-worker',
    name: 'Qwen 7B Fine-tune Worker',
    category: 'bootstrap',
    description: 'Bootstrap с предзагруженной моделью Qwen 7B для fine-tuning.',
    recommended_for: ['finetune', 'qwen', 'llm', 'gpu'],
    support_level: 'supported',
    container: {
      name: 'bootstrap',
      image: 'igortet/cloud-forge-worker-qwen-7b:0.1.0',
      is_parent: true,
      resources: {
        gpus: 'all',
        shm_size: '16g',
        memory_limit: '64g',
        cpu_limit: 8,
      },
    },
  },

  // Runtime пресеты
  {
    id: 'pytorch-cu121',
    name: 'PyTorch CUDA 12.1',
    category: 'runtime',
    description: 'Контейнер с PyTorch и CUDA для обучения и инференса.',
    recommended_for: ['pytorch', 'training', 'gpu'],
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
    description: 'Контейнер для высокопроизводительного инференса LLM через vLLM.',
    recommended_for: ['llm', 'inference', 'vllm'],
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
    description: 'Контейнер для быстрого SFT/LoRA fine-tuning с Unsloth.',
    recommended_for: ['llm', 'finetune', 'unsloth'],
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
];

export { jobTemplates };