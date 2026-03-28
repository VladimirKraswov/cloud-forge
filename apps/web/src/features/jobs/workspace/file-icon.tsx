import {
  FileCode2,
  FileJson,
  FileMusic,
  FileText,
  FileVideo,
  Folder,
  FolderOpen,
  Image,
  Terminal,
  FileCode,
  FileArchive,
  FileCheck2,
  FileBox,
  FileEdit,
  Hash,
} from 'lucide-react';
import { cn } from '@/shared/utils/cn';

interface FileIconProps {
  name: string;
  isOpen?: boolean;
  isDirectory?: boolean;
  className?: string;
}

export function FileIcon({ name, isOpen, isDirectory, className }: FileIconProps) {
  if (isDirectory) {
    return isOpen ? (
      <FolderOpen className={cn('text-blue-400 fill-blue-400/10', className)} />
    ) : (
      <Folder className={cn('text-blue-400 fill-blue-400/10', className)} />
    );
  }

  const ext = name.split('.').pop()?.toLowerCase();

  if (name === 'Dockerfile') {
    return <FileBox className={cn('text-blue-500', className)} />;
  }

  if (name === '.env') {
    return <Hash className={cn('text-amber-500', className)} />;
  }

  switch (ext) {
    case 'py':
      return <FileCode2 className={cn('text-blue-400', className)} />;
    case 'js':
    case 'jsx':
      return <FileCode className={cn('text-yellow-400', className)} />;
    case 'ts':
    case 'tsx':
      return <FileCode className={cn('text-blue-500', className)} />;
    case 'json':
    case 'jsonl':
      return <FileJson className={cn('text-amber-400', className)} />;
    case 'sh':
    case 'bash':
      return <Terminal className={cn('text-emerald-400', className)} />;
    case 'txt':
      return <FileText className={cn('text-slate-400', className)} />;
    case 'md':
      return <FileEdit className={cn('text-blue-300', className)} />;
    case 'yml':
    case 'yaml':
      return <Hash className={cn('text-purple-400', className)} />;
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'webp':
    case 'svg':
      return <Image className={cn('text-purple-400', className)} />;
    case 'mp3':
    case 'wav':
    case 'ogg':
      return <FileMusic className={cn('text-rose-400', className)} />;
    case 'mp4':
    case 'webm':
      return <FileVideo className={cn('text-rose-500', className)} />;
    case 'zip':
    case 'tar':
    case 'gz':
    case 'rar':
      return <FileArchive className={cn('text-amber-600', className)} />;
    case 'lock':
      return <FileCheck2 className={cn('text-emerald-500', className)} />;
    default:
      return <FileText className={cn('text-slate-400', className)} />;
  }
}
