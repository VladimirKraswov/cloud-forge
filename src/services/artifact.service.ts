import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../utils/config';

const s3Client = new S3Client({
  endpoint: config.minioEndpoint,
  region: 'us-east-1',
  credentials: {
    accessKeyId: config.minioAccessKey,
    secretAccessKey: config.minioSecretKey,
  },
  forcePathStyle: true,
});

const BUCKET = config.minioBucket;
let bucketReadyPromise: Promise<void> | null = null;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const sanitizeFilename = (filename: string): string => filename.replace(/[\\/]/g, '_');

const normalizeRelativePath = (value: string): string =>
  value
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .map((segment) => segment.replace(/[^a-zA-Z0-9._-]/g, '_'))
    .join('/');

export class ArtifactService {
  static async ensureBucket(): Promise<void> {
    if (!bucketReadyPromise) {
      bucketReadyPromise = (async () => {
        for (let attempt = 1; attempt <= 5; attempt++) {
          try {
            await s3Client.send(new HeadBucketCommand({ Bucket: BUCKET }));
            console.log(`[Artifacts] Bucket ready: ${BUCKET}`);
            return;
          } catch {
            try {
              await s3Client.send(new CreateBucketCommand({ Bucket: BUCKET }));
              console.log(`[Artifacts] Bucket created: ${BUCKET}`);
              return;
            } catch (err) {
              if (attempt === 5) throw err;
              await sleep(attempt * 1000);
            }
          }
        }
      })().catch((err) => {
        bucketReadyPromise = null;
        throw err;
      });
    }

    return bucketReadyPromise;
  }

  static async uploadJobFile(
    file: Buffer,
    filename: string,
    jobId: string,
    relativePath: string,
    mimeType = 'application/octet-stream',
  ): Promise<{
    id: string;
    filename: string;
    relative_path: string;
    size_bytes: number;
    storage_key: string;
  }> {
    await ArtifactService.ensureBucket();

    const fileId = uuidv4();
    const safeFilename = sanitizeFilename(filename);
    const normalizedRelativePath = normalizeRelativePath(relativePath || safeFilename) || safeFilename;
    const storageKey = `jobs/${jobId}/files/${fileId}/${normalizedRelativePath}`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: storageKey,
        Body: file,
        ContentType: mimeType,
      }),
    );

    return {
      id: fileId,
      filename: safeFilename,
      relative_path: normalizedRelativePath,
      size_bytes: file.length,
      storage_key: storageKey,
    };
  }

  static async uploadRunArtifact(
    file: Buffer,
    filename: string,
    runId: string,
    relativePath: string,
    mimeType = 'application/octet-stream',
  ): Promise<{
    id: string;
    filename: string;
    relative_path: string;
    size_bytes: number;
    storage_key: string;
  }> {
    await ArtifactService.ensureBucket();

    const artifactId = uuidv4();
    const safeFilename = sanitizeFilename(filename);
    const normalizedRelativePath = normalizeRelativePath(relativePath || safeFilename) || safeFilename;
    const storageKey = `runs/${runId}/artifacts/${artifactId}/${normalizedRelativePath}`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: storageKey,
        Body: file,
        ContentType: mimeType,
      }),
    );

    return {
      id: artifactId,
      filename: safeFilename,
      relative_path: normalizedRelativePath,
      size_bytes: file.length,
      storage_key: storageKey,
    };
  }

  static async getDownloadUrl(storageKey: string, expiresIn = 3600): Promise<string> {
    await ArtifactService.ensureBucket();

    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: storageKey,
    });

    return getSignedUrl(s3Client, command, { expiresIn });
  }

  static async getObject(storageKey: string) {
    await ArtifactService.ensureBucket();

    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET,
        Key: storageKey,
      }),
    );

    return response;
  }

  static async readTextObject(storageKey: string): Promise<string> {
    const response = await ArtifactService.getObject(storageKey);
    const body = response.Body;

    if (!body || typeof (body as any).transformToString !== 'function') {
      throw new Error('Unable to read object body as text');
    }

    return (body as any).transformToString();
  }
}
