// catalog/templates/index.ts
import { JobTemplate } from '../../models/job';

import { helloWorldPython } from './hello-world';
import { pythonBasic } from './python-basic';
import { javascriptBasic } from './javascript-basic';
import { qwen7bFinetune } from './qwen-7b-finetune';

export const jobTemplates: JobTemplate[] = [
  helloWorldPython,
  pythonBasic,
  javascriptBasic,
  qwen7bFinetune,
];