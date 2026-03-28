import { buildArtifactContentUrl, buildArtifactDownloadUrl } from '@/api/client';

export const artifactsApi = {
  buildDownloadUrl: (storageKey: string) => buildArtifactDownloadUrl(storageKey),
  buildContentUrl: (storageKey: string) => buildArtifactContentUrl(storageKey),
};
