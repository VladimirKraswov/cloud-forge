import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn, ChildProcess } from 'child_process';
import db from '../db';
import { ExecutionLanguage } from '../models/job';

export interface BootstrapEnvironmentInput {
  name: string;
  requirements_text: string;
  python_binary?: string | null;
}

export interface BuildOptions {
  id: string;
  name: string;
  baseImage: string;
  tag: string;
  executionLanguage: ExecutionLanguage;
  dockerfileText: string;
  environments: BootstrapEnvironmentInput[];
  runtimeResources?: Record<string, unknown> | null;
  dockerUser: string;
  dockerPass: string;
}

export interface BuildProgress {
  status: 'building' | 'pushing' | 'completed' | 'failed' | 'cancelled';
  logs: string[];
}

const buildStatus = new Map<string, BuildProgress>();
const activeProcesses = new Map<string, ChildProcess>();

const appendLog = async (imageId: string, message: string, level: 'info' | 'error' = 'info') => {
  const progress = buildStatus.get(imageId);
  if (progress) {
    progress.logs.push(message);
  }

  await new Promise<void>((resolve, reject) => {
    db.run(
      `INSERT INTO bootstrap_image_logs (image_id, level, message) VALUES (?, ?, ?)`,
      [imageId, level, message],
      (err) => {
        if (err) reject(err);
        else resolve();
      },
    );
  });
};

const fileExists = (value: string): boolean => {
  try {
    return fs.existsSync(value);
  } catch {
    return false;
  }
};

const ensureDir = (dir: string) => {
  fs.mkdirSync(dir, { recursive: true });
};

const copyDirRecursive = (src: string, dest: string) => {
  ensureDir(dest);

  for (const item of fs.readdirSync(src)) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);
    const stat = fs.statSync(srcPath);

    if (stat.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
};

const safeEnvName = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-');

const splitPackageLines = (input: string): string[] =>
  input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

const buildPythonEnvInstallBlock = (env: BootstrapEnvironmentInput): string => {
  const envName = safeEnvName(env.name || 'default');
  const reqFile = `requirements-${envName}.txt`;
  const pythonBinary = (env.python_binary || 'python3').trim() || 'python3';

  return `
COPY ${reqFile} /tmp/${reqFile}
RUN ${pythonBinary} -m venv /opt/cloudforge/envs/${envName} && \\
    /opt/cloudforge/envs/${envName}/bin/pip install --upgrade pip setuptools wheel && \\
    if [ -s /tmp/${reqFile} ]; then /opt/cloudforge/envs/${envName}/bin/pip install --no-cache-dir -r /tmp/${reqFile}; fi && \\
    rm -f /tmp/${reqFile}
`.trim();
};

const buildJavascriptInstallBlock = (): string => `
COPY packages.txt /tmp/packages.txt
RUN mkdir -p /opt/cloudforge/node && \\
    cd /opt/cloudforge/node && \\
    npm init -y >/dev/null 2>&1 && \\
    grep -v '^[[:space:]]*#' /tmp/packages.txt | sed '/^[[:space:]]*$/d' > /tmp/packages-clean.txt && \\
    if [ -s /tmp/packages-clean.txt ]; then xargs -r npm install --omit=dev --no-fund --no-audit < /tmp/packages-clean.txt; fi && \\
    rm -f /tmp/packages.txt /tmp/packages-clean.txt
`.trim();

export class BootstrapBuilderService {
  static getProgress(id: string) {
    return buildStatus.get(id);
  }

  static async cancelBuild(id: string): Promise<void> {
    const proc = activeProcesses.get(id);
    if (proc) {
      console.log(`[Builder] Cancelling build ${id}, killing process`);
      proc.kill('SIGTERM');
      activeProcesses.delete(id);
    }

    const progress = buildStatus.get(id);
    if (progress) {
      progress.status = 'cancelled';
      progress.logs.push('Build cancelled by user.');
    }

    await this.updateImageStatus(id, 'cancelled', 'Build cancelled by user');
    await appendLog(id, 'Build cancelled by user', 'info');
  }

  static async cleanupInterruptedBuilds() {
    return new Promise<void>((resolve, reject) => {
      db.run(
        `
        UPDATE bootstrap_images
        SET status = 'failed',
            error = 'Build interrupted by server restart',
            updated_at = CURRENT_TIMESTAMP
        WHERE status IN ('building', 'pushing')
        `,
        (err) => {
          if (err) reject(err);
          else resolve();
        },
      );
    });
  }

  static generateDockerfile(
    baseImage: string,
    environments: BootstrapEnvironmentInput[],
    executionLanguage: ExecutionLanguage,
    dockerfileOverride?: string,
  ): string {
    if (dockerfileOverride && dockerfileOverride.trim()) {
      return dockerfileOverride;
    }

    const normalizedEnvs = environments.length
      ? environments
      : [{ name: 'default', requirements_text: '' }];

    const defaultEnvName = safeEnvName(normalizedEnvs[0]?.name || 'default');
    const pythonBlocks =
      executionLanguage === 'python'
        ? normalizedEnvs.map((env) => buildPythonEnvInstallBlock(env)).join('\n\n')
        : '';
    const javascriptBlock =
      executionLanguage === 'javascript' ? buildJavascriptInstallBlock() : '';

    return `
FROM ${baseImage}

SHELL ["/bin/bash", "-lc"]

ENV CLOUD_FORGE_HOME=/opt/cloudforge
ENV CLOUD_FORGE_ENVS=/opt/cloudforge/envs
ENV CLOUD_FORGE_NODE_HOME=/opt/cloudforge/node
ENV PATH="/opt/cloudforge/bin:$PATH"

WORKDIR /opt/cloudforge

COPY runner.py /opt/cloudforge/runner.py
COPY sdk/ /opt/cloudforge/sdk/
COPY bin/ /opt/cloudforge/bin/

RUN apt-get update && apt-get install -y --no-install-recommends \\
    python3 python3-venv python3-pip curl ca-certificates bash tini \\
    && rm -rf /var/lib/apt/lists/*

${
  executionLanguage === 'javascript'
    ? `
RUN if ! command -v node >/dev/null 2>&1; then \\
      apt-get update && apt-get install -y --no-install-recommends nodejs npm && \\
      rm -rf /var/lib/apt/lists/*; \\
    fi
`.trim()
    : ''
}

RUN mkdir -p /opt/cloudforge/envs /opt/cloudforge/node /workspace

${executionLanguage === 'python' ? pythonBlocks : javascriptBlock}

${
  executionLanguage === 'python'
    ? `ENV PATH="/opt/cloudforge/envs/${defaultEnvName}/bin:/opt/cloudforge/bin:$PATH"`
    : `ENV NODE_PATH="/opt/cloudforge/node/node_modules:\${NODE_PATH}"`
}

WORKDIR /workspace
ENTRYPOINT ["python3", "/opt/cloudforge/runner.py"]
`.trim();
  }

  private static resolveRuntimeAssetsRoot(): string {
    const candidates = [
      process.env.WORKER_ASSETS_PATH,
      path.resolve(process.cwd(), 'worker'),
      path.resolve(process.cwd(), '../worker'),
      path.resolve(__dirname, '../../worker'),
      path.resolve(__dirname, '../../../../apps/worker'),
      '/app/worker',
    ].filter((c): c is string => !!c);

    for (const candidate of candidates) {
      const runnerPath = path.join(candidate, 'runner.py');
      const sdkPath = path.join(candidate, 'sdk');

      if (fileExists(runnerPath) && fileExists(sdkPath)) {
        return candidate;
      }
    }

    throw new Error(
      'Worker runtime assets not found: expected worker/runner.py and worker/sdk/ to exist.',
    );
  }

  static async buildAndPush(options: BuildOptions) {
    const {
      id,
      name,
      baseImage,
      tag,
      executionLanguage,
      dockerfileText,
      environments,
      dockerUser,
      dockerPass,
    } = options;

    const fullImageName = `${dockerUser}/${name}:${tag}`;
    const workspaceDir = path.join(os.tmpdir(), `build-${id}`);

    buildStatus.set(id, { status: 'building', logs: ['Starting build...'] });

    try {
      try {
        await this.runCommand('docker', ['--version'], os.tmpdir(), id, undefined, false, true);
      } catch {
        throw new Error(
          'Docker CLI is not available in the orchestrator environment. Please ensure Docker is installed and the socket is mounted.',
        );
      }

      await this.createOrUpdateBuildRecord(options, fullImageName);
      await appendLog(id, 'Starting build...');

      ensureDir(workspaceDir);
      ensureDir(path.join(workspaceDir, 'sdk'));
      ensureDir(path.join(workspaceDir, 'bin'));

      const runtimeAssetsRoot = this.resolveRuntimeAssetsRoot();
      await appendLog(id, `Using runtime assets from ${runtimeAssetsRoot}`);

      fs.writeFileSync(path.join(workspaceDir, 'Dockerfile'), dockerfileText, 'utf8');

      const runnerSrc = path.join(runtimeAssetsRoot, 'runner.py');
      const sdkSrc = path.join(runtimeAssetsRoot, 'sdk');

      if (!fileExists(runnerSrc)) {
        throw new Error(`runner.py not found at ${runnerSrc}`);
      }

      if (!fileExists(sdkSrc)) {
        throw new Error(`sdk directory not found at ${sdkSrc}`);
      }

      fs.copyFileSync(runnerSrc, path.join(workspaceDir, 'runner.py'));
      copyDirRecursive(sdkSrc, path.join(workspaceDir, 'sdk'));

      const cfPythonPath = path.join(workspaceDir, 'bin', 'cf-python');
      fs.writeFileSync(
        cfPythonPath,
        `#!/usr/bin/env bash
set -euo pipefail
ENV_NAME="$1"
shift
exec "/opt/cloudforge/envs/\${ENV_NAME}/bin/python" "$@"
`,
        { encoding: 'utf8', mode: 0o755 },
      );

      if (executionLanguage === 'javascript') {
        const packages = environments.flatMap((env) => splitPackageLines(env.requirements_text || ''));
        fs.writeFileSync(path.join(workspaceDir, 'packages.txt'), `${packages.join('\n')}\n`, 'utf8');
      } else {
        for (const env of environments) {
          const envName = safeEnvName(env.name || 'default');
          const reqFilename = `requirements-${envName}.txt`;
          fs.writeFileSync(path.join(workspaceDir, reqFilename), env.requirements_text || '', 'utf8');
        }
      }

      await appendLog(id, `Building Docker image ${fullImageName}`);
      await this.runCommand('docker', ['build', '-t', fullImageName, '.'], workspaceDir, id);

      const progress = buildStatus.get(id);
      if (progress?.status === 'cancelled') {
        await this.updateImageStatus(id, 'cancelled', 'Build cancelled by user');
        await appendLog(id, 'Build cancelled by user');
        return;
      }

      buildStatus.get(id)!.status = 'pushing';
      await this.updateImageStatus(id, 'pushing');

      await appendLog(id, 'Logging into Docker registry...');
      await this.runCommand(
        'docker',
        ['login', '-u', dockerUser, '--password-stdin'],
        workspaceDir,
        id,
        dockerPass,
        true,
      );

      const afterLogin = buildStatus.get(id);
      if (afterLogin?.status === 'cancelled') {
        await this.updateImageStatus(id, 'cancelled', 'Build cancelled by user');
        await appendLog(id, 'Build cancelled by user');
        return;
      }

      await appendLog(id, `Pushing image ${fullImageName}`);
      await this.runCommand('docker', ['push', fullImageName], workspaceDir, id);

      const afterPush = buildStatus.get(id);
      if (afterPush?.status === 'cancelled') {
        await this.updateImageStatus(id, 'cancelled', 'Build cancelled by user');
        await appendLog(id, 'Build cancelled by user');
        return;
      }

      buildStatus.get(id)!.status = 'completed';
      await this.updateImageStatus(id, 'completed');
      await appendLog(id, 'Image published successfully!');
    } catch (err) {
      const wasCancelled = buildStatus.get(id)?.status === 'cancelled';
      const message =
        wasCancelled ? 'Build cancelled by user' : err instanceof Error ? err.message : String(err);

      if (wasCancelled) {
        await this.updateImageStatus(id, 'cancelled', message);
        await appendLog(id, message, 'info');
      } else {
        buildStatus.set(id, {
          status: 'failed',
          logs: [...(buildStatus.get(id)?.logs || []), `Error: ${message}`],
        });

        await this.updateImageStatus(id, 'failed', message);
        await appendLog(id, `Error: ${message}`, 'error');
      }
    } finally {
      activeProcesses.delete(id);

      try {
        if (fs.existsSync(workspaceDir)) {
          fs.rmSync(workspaceDir, { recursive: true, force: true });
        }
      } catch {
        // ignore cleanup errors
      }
    }
  }

  private static runCommand(
    command: string,
    args: string[],
    cwd: string,
    imageId: string,
    stdin?: string,
    maskStdinInLogs = false,
    silent = false,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, { cwd });
      activeProcesses.set(imageId, proc);

      if (stdin) {
        proc.stdin.write(stdin);
        proc.stdin.end();
      }

      proc.stdout.on('data', async (data) => {
        if (silent) return;
        const text = data.toString();
        await appendLog(imageId, text.trimEnd());
      });

      proc.stderr.on('data', async (data) => {
        if (silent) return;
        const text = data.toString();
        await appendLog(imageId, text.trimEnd(), 'error');
      });

      proc.on('error', (err) => {
        activeProcesses.delete(imageId);
        reject(err);
      });

      proc.on('close', async (code) => {
        activeProcesses.delete(imageId);

        const renderedArgs =
          stdin && maskStdinInLogs
            ? `${command} ${args.join(' ')} [stdin hidden]`
            : `${command} ${args.join(' ')}`;

        if (code === 0) {
          if (!silent) await appendLog(imageId, `Command succeeded: ${renderedArgs}`);
          resolve();
        } else if (code === null) {
          reject(new Error(`${command} was terminated`));
        } else {
          reject(new Error(`${command} exited with code ${code}`));
        }
      });
    });
  }

  private static createOrUpdateBuildRecord(
    options: BuildOptions,
    fullImageName: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      db.run(
        `
        INSERT INTO bootstrap_images (
          id, name, base_image, tag, dockerfile_text, environments_json, execution_language,
          runtime_resources_json, sdk_version, full_image_name, status, error, build_started_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          base_image = excluded.base_image,
          tag = excluded.tag,
          dockerfile_text = excluded.dockerfile_text,
          environments_json = excluded.environments_json,
          execution_language = excluded.execution_language,
          runtime_resources_json = excluded.runtime_resources_json,
          sdk_version = excluded.sdk_version,
          full_image_name = excluded.full_image_name,
          status = excluded.status,
          error = NULL,
          build_started_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        `,
        [
          options.id,
          options.name,
          options.baseImage,
          options.tag,
          options.dockerfileText,
          JSON.stringify(options.environments || []),
          options.executionLanguage,
          JSON.stringify(options.runtimeResources || {}),
          '1',
          fullImageName,
          'building',
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        },
      );
    });
  }

  private static updateImageStatus(
    id: string,
    status: 'building' | 'pushing' | 'completed' | 'failed' | 'cancelled',
    error?: string,
  ): Promise<void> {
    const finishedAt = ['completed', 'failed', 'cancelled'].includes(status)
      ? 'CURRENT_TIMESTAMP'
      : 'NULL';

    return new Promise((resolve, reject) => {
      db.run(
        `
        UPDATE bootstrap_images
        SET
          status = ?,
          error = ?,
          build_finished_at = ${finishedAt},
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        `,
        [status, error || null, id],
        (err) => {
          if (err) reject(err);
          else resolve();
        },
      );
    });
  }
}