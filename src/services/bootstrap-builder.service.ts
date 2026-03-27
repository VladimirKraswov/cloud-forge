import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';

export interface BuildOptions {
  id: string;
  name: string;
  baseImage: string;
  extraPackages: string;
  tag: string;
  dockerUser: string;
  dockerPass: string;
}

export interface BuildProgress {
  status: 'building' | 'pushing' | 'completed' | 'failed';
  logs: string[];
}

const buildStatus = new Map<string, BuildProgress>();

export class BootstrapBuilderService {
  static getProgress(id: string) {
    return buildStatus.get(id);
  }

  static generateDockerfile(baseImage: string, extraPackages: string): string {
    const packages = extraPackages.trim().split(/\s+/).filter(Boolean).join(' ');
    return `FROM ${baseImage}

WORKDIR /app
COPY runner.py /app/runner.py
COPY sdk/ /app/sdk/

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir requests ${packages}

WORKDIR /workspace
ENTRYPOINT ["python3", "/app/runner.py"]
`;
  }

  static async buildAndPush(options: BuildOptions) {
    const { id, name, baseImage, extraPackages, tag, dockerUser, dockerPass } = options;
    const fullImageName = `${dockerUser}/${name}:${tag}`;
    const workspaceDir = path.join(os.tmpdir(), `build-${id}`);

    buildStatus.set(id, { status: 'building', logs: ['Starting build...'] });

    try {
      // 1. Prepare Workspace
      fs.mkdirSync(workspaceDir, { recursive: true });
      fs.writeFileSync(path.join(workspaceDir, 'Dockerfile'), this.generateDockerfile(baseImage, extraPackages));

      // Copy runner.py and sdk/
      const rootDir = path.resolve(__dirname, '../../');
      fs.copyFileSync(path.join(rootDir, 'runner.py'), path.join(workspaceDir, 'runner.py'));

      const copyDir = (src: string, dest: string) => {
        fs.mkdirSync(dest, { recursive: true });
        for (const item of fs.readdirSync(src)) {
          const s = path.join(src, item);
          const d = path.join(dest, item);
          if (fs.statSync(s).isDirectory()) copyDir(s, d);
          else fs.copyFileSync(s, d);
        }
      };
      copyDir(path.join(rootDir, 'sdk'), path.join(workspaceDir, 'sdk'));

      // 2. Build
      await this.runCommand('docker', ['build', '-t', fullImageName, '.'], workspaceDir, id);

      // 3. Login
      buildStatus.get(id)?.logs.push('Logging into Docker Hub...');
      await this.runCommand('docker', ['login', '-u', dockerUser, '--password-stdin'], workspaceDir, id, dockerPass);

      // 4. Push
      buildStatus.get(id)!.status = 'pushing';
      await this.runCommand('docker', ['push', fullImageName], workspaceDir, id);

      // 5. Success
      buildStatus.get(id)!.status = 'completed';
      buildStatus.get(id)!.logs.push('Image published successfully!');

      await this.saveToDb(options, fullImageName);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      buildStatus.get(id)!.status = 'failed';
      buildStatus.get(id)!.logs.push(`Error: ${errorMsg}`);

      await this.updateStatusInDb(id, 'failed', errorMsg);
    } finally {
      // Cleanup
      try {
        if (fs.existsSync(workspaceDir)) {
          fs.rmSync(workspaceDir, { recursive: true, force: true });
        }
      } catch (e) { /* ignore */ }
    }
  }

  private static runCommand(command: string, args: string[], cwd: string, id: string, stdin?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, { cwd });

      if (stdin) {
        proc.stdin.write(stdin);
        proc.stdin.end();
      }

      proc.stdout.on('data', (data) => {
        buildStatus.get(id)?.logs.push(data.toString());
      });

      proc.stderr.on('data', (data) => {
        buildStatus.get(id)?.logs.push(data.toString());
      });

      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`${command} exited with code ${code}`));
      });
    });
  }

  private static async saveToDb(options: BuildOptions, fullImageName: string) {
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO custom_bootstrap_images (id, name, base_image, tag, extra_packages, full_image_name, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [options.id, options.name, options.baseImage, options.tag, options.extraPackages, fullImageName, 'completed'],
        (err) => {
          if (err) reject(err);
          else resolve(undefined);
        }
      );
    });
  }

  private static async updateStatusInDb(id: string, status: string, error?: string) {
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE custom_bootstrap_images SET status = ?, error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [status, error || null, id],
        (err) => {
          if (err) reject(err);
          else resolve(undefined);
        }
      );
    });
  }
}
