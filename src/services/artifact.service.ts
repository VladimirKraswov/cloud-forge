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

  static async uploadFile(
    file: Buffer,
    filename: string,
    jobId: string,
    mimeType = 'application/octet-stream',
  ): Promise<{
    id: string;
    filename: string;
    size_bytes: number;
    storage_key: string;
  }> {
    await ArtifactService.ensureBucket();

    const fileId = uuidv4();
    const safeFilename = sanitizeFilename(filename);
    const storageKey = `jobs/${jobId}/files/${fileId}-${safeFilename}`;

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
}