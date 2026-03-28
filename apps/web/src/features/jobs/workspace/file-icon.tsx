import {
  FileCode2,
  FileJson,
  FileMusic,
  FileText,
  FileVideo,
  FileWarning,
  Folder,
  FolderOpen,
  Image,
  Terminal,
  Type,
  FileCode,
  FileArchive,
  LucideIcon
} from 'lucide-react';

interface FileIconProps {
  name: string;
  isOpen?: boolean;
  isDirectory?: boolean;
  className?: string;
}

export function FileIcon({ name, isOpen, isDirectory, className }: FileIconProps) {
  if (isDirectory) {
    return isOpen ? (
      <FolderOpen className={className} />
    ) : (
      <Folder className={className} />
    );
  }

  const ext = name.split('.').pop()?.toLowerCase();

  switch (ext) {
    case 'py':
      return <FileCode2 className={className} />;
    case 'js':
    case 'jsx':
    case 'ts':
    case 'tsx':
      return <FileCode className={className} />;
    case 'json':
    case 'jsonl':
      return <FileJson className={className} />;
    case 'sh':
    case 'bash':
      return <Terminal className={className} />;
    case 'txt':
    case 'md':
    case 'env':
      return <FileText className={className} />;
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'webp':
      return <Image className={className} />;
    case 'svg':
      return <FileCode2 className={className} />;
    case 'mp3':
    case 'wav':
    case 'ogg':
      return <FileMusic className={className} />;
    case 'mp4':
    case 'webm':
      return <FileVideo className={className} />;
    case 'zip':
    case 'tar':
    case 'gz':
    case 'rar':
      return <FileArchive className={className} />;
    default:
      return <FileText className={className} />;
  }
}
