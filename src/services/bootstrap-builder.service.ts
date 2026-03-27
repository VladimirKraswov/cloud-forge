import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import db from '../db';

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
  dockerfileText: string;
  environments: BootstrapEnvironmentInput[];
  dockerUser: string;
  dockerPass: string;
}

export interface BuildProgress {
  status: 'building' | 'pushing' | 'completed' | 'failed';
  logs: string[];
}

const buildStatus = new Map<string, BuildProgress>();

const appendLog = async (
  imageId: string,
  message: string,
  level: 'info' | 'error' = 'info',
) => {
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

const quoteForShell = (value: string): string =>
  `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

const safeEnvName = (value: string): string =>
  value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-');

const buildEnvInstallBlock = (env: BootstrapEnvironmentInput): string => {
  const envName = safeEnvName(env.name || 'env');
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

export class BootstrapBuilderService {
  static getProgress(id: string) {
    return buildStatus.get(id);
  }

  static generateDockerfile(
    baseImage: string,
    environments: BootstrapEnvironmentInput[],
    dockerfileOverride?: string,
  ): string {
    if (dockerfileOverride && dockerfileOverride.trim()) {
      return dockerfileOverride;
    }

    const envBlocks = environments
      .map((env) => buildEnvInstallBlock(env))
      .join('\n\n');

    return `
FROM ${baseImage}

SHELL ["/bin/bash", "-lc"]

ENV CLOUD_FORGE_HOME=/opt/cloudforge
ENV CLOUD_FORGE_ENVS=/opt/cloudforge/envs
ENV PATH="/opt/cloudforge/bin:$PATH"

WORKDIR /opt/cloudforge

COPY runner.py /opt/cloudforge/runner.py
COPY sdk/ /opt/cloudforge/sdk/
COPY bin/ /opt/cloudforge/bin/

RUN apt-get update && apt-get install -y --no-install-recommends \\
    python3 python3-venv python3-pip curl ca-certificates bash tini \\
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt/cloudforge/envs /workspace

${envBlocks}

WORKDIR /workspace
ENTRYPOINT ["python3", "/opt/cloudforge/runner.py"]
`.trim();
  }

  private static resolveRuntimeAssetsRoot(): string {
    const candidates = [
      path.resolve(process.cwd()),
      path.resolve(__dirname, '../../'),
      path.resolve(__dirname, '../../../'),
      '/app',
    ];

    for (const candidate of candidates) {
      const runnerPath = path.join(candidate, 'runner.py');
      const sdkPath = path.join(candidate, 'sdk');

      if (fileExists(runnerPath) && fileExists(sdkPath)) {
        return candidate;
      }
    }

    throw new Error(
      'Runtime assets not found: expected runner.py and sdk/ to exist in the orchestrator image.',
    );
  }

  static async buildAndPush(options: BuildOptions) {
    const { id, name, baseImage, tag, dockerfileText, environments, dockerUser, dockerPass } =
      options;

    const fullImageName = `${dockerUser}/${name}:${tag}`;
    const workspaceDir = path.join(os.tmpdir(), `build-${id}`);

    buildStatus.set(id, { status: 'building', logs: ['Starting build...'] });

    try {
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
exec "/opt/cloudforge/envs/${'$'}{ENV_NAME}/bin/python" "$@"
`,
        { encoding: 'utf8', mode: 0o755 },
      );

      for (const env of environments) {
        const envName = safeEnvName(env.name || 'env');
        const reqFilename = `requirements-${envName}.txt`;
        fs.writeFileSync(
          path.join(workspaceDir, reqFilename),
          env.requirements_text || '',
          'utf8',
        );
      }

      await appendLog(id, `Building Docker image ${fullImageName}`);
      await this.runCommand('docker', ['build', '-t', fullImageName, '.'], workspaceDir, id);

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

      await appendLog(id, `Pushing image ${fullImageName}`);
      await this.runCommand('docker', ['push', fullImageName], workspaceDir, id);

      buildStatus.get(id)!.status = 'completed';
      await this.updateImageStatus(id, 'completed');
      await appendLog(id, 'Image published successfully!');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      buildStatus.set(id, {
        status: 'failed',
        logs: [...(buildStatus.get(id)?.logs || []), `Error: ${message}`],
      });

      await this.updateImageStatus(id, 'failed', message);
      await appendLog(id, `Error: ${message}`, 'error');
    } finally {
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
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, { cwd });

      if (stdin) {
        proc.stdin.write(stdin);
        proc.stdin.end();
      }

      proc.stdout.on('data', async (data) => {
        const text = data.toString();
        await appendLog(imageId, text.trimEnd());
      });

      proc.stderr.on('data', async (data) => {
        const text = data.toString();
        await appendLog(imageId, text.trimEnd(), 'error');
      });

      proc.on('error', (err) => {
        reject(err);
      });

      proc.on('close', async (code) => {
        const renderedArgs =
          stdin && maskStdinInLogs
            ? `${command} ${args.join(' ')} [stdin hidden]`
            : `${command} ${args.join(' ')}`;

        if (code === 0) {
          await appendLog(imageId, `Command succeeded: ${renderedArgs}`);
          resolve();
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
        INSERT INTO custom_bootstrap_images (
          id, name, base_image, tag, dockerfile_text, environments_json,
          sdk_version, full_image_name, status, error, build_started_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          base_image = excluded.base_image,
          tag = excluded.tag,
          dockerfile_text = excluded.dockerfile_text,
          environments_json = excluded.environments_json,
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
    status: 'building' | 'pushing' | 'completed' | 'failed',
    error?: string,
  ): Promise<void> {
    const finishedAt =
      status === 'completed' || status === 'failed' ? 'CURRENT_TIMESTAMP' : 'NULL';

    return new Promise((resolve, reject) => {
      db.run(
        `
        UPDATE custom_bootstrap_images
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