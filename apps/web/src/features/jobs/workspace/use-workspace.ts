import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { jobsApi } from '@/api/jobs';
import { JobFileTreeNode } from '@/api/types';
import { useI18n } from '@/shared/lib/i18n';

export interface OpenTab {
  id: string;
  name: string;
  path: string;
  content: string;
  originalContent: string;
  isDirty: boolean;
  loading: boolean;
}

export function useWorkspace(jobId: string | undefined, initialFiles: any[] = []) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [bufferedFiles, setBufferedFiles] = useState<any[]>(initialFiles);

  const treeQuery = useQuery({
    queryKey: ['job-files-tree', jobId],
    queryFn: () => (jobId ? jobsApi.listTree(jobId) : Promise.resolve([])),
    enabled: !!jobId,
  });

  const buildTreeFromFiles = (files: any[]): JobFileTreeNode[] => {
    const root: JobFileTreeNode[] = [];
    const map = new Map<string, JobFileTreeNode>();

    files.filter(f => f.status !== 'deleted').forEach((file) => {
      const parts = file.relative_path.split('/');
      let currentPath = '';

      parts.forEach((part: string, index: number) => {
        const isLast = index === parts.length - 1;
        const parentPath = currentPath;
        currentPath = currentPath ? `${currentPath}/${part}` : part;

        if (!map.has(currentPath)) {
          const node: JobFileTreeNode = {
            name: part,
            path: currentPath,
            type: isLast && file.source_type !== 'directory' ? 'file' : 'directory',
            children: [],
          };

          if (isLast && file.source_type !== 'directory') {
            node.file = file;
          }

          map.set(currentPath, node);

          if (parentPath) {
            const parent = map.get(parentPath);
            if (parent) {
              parent.children.push(node);
            }
          } else {
            root.push(node);
          }
        }
      });
    });

    return root;
  };

  const tree = jobId ? treeQuery.data || [] : buildTreeFromFiles(bufferedFiles);

  const toggleExpand = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const openFile = useCallback(async (node: any) => {
    if (!node || node.type === 'directory') return;

    setOpenTabs((prev) => {
      const existing = prev.find((tab) => tab.path === node.path);
      if (existing) {
        setActiveTabId(existing.path);
        return prev;
      }

      const newTab: OpenTab = {
        id: node.path,
        name: node.name,
        path: node.path,
        isDirty: false,
        content: '',
        originalContent: '',
        loading: !jobId && node.file ? false : true,
      };

      if (!jobId && node.file) {
          newTab.content = node.file.inline_content || '';
          newTab.originalContent = node.file.inline_content || '';
      }

      setActiveTabId(node.path);
      return [...prev, newTab];
    });

    if (jobId) {
      try {
        const content = await jobsApi.getFileContent(jobId, node.path);
        setOpenTabs((prev) =>
          prev.map((tab) =>
            tab.path === node.path
              ? { ...tab, content: content || '', originalContent: content || '', loading: false }
              : tab,
          ),
        );
      } catch (error) {
        console.error(error);
        toast.error(t.errors.loadContentFailed);
        setOpenTabs((prev) => prev.filter((tab) => tab.path !== node.path));
        setActiveTabId((prev) => (prev === node.path ? null : prev));
      }
    }
  }, [jobId, t.errors.loadContentFailed]);

  const closeTab = useCallback((path: string) => {
    setOpenTabs((prev) => {
      const tab = prev.find((t) => t.path === path);
      if (tab?.isDirty) {
          // You might want to show a confirm dialog here, but for brevity we'll just close
      }
      const next = prev.filter((t) => t.path !== path);
      if (activeTabId === path) {
        setActiveTabId(next[next.length - 1]?.path || null);
      }
      return next;
    });
  }, [activeTabId]);

  const updateTabContent = useCallback((path: string, content: string) => {
    setOpenTabs((prev) =>
      prev.map((tab) =>
        tab.path === path
          ? { ...tab, content, isDirty: content !== tab.originalContent }
          : tab,
      ),
    );
  }, []);

  const saveTab = useCallback(async (path: string) => {
    const tab = openTabs.find((t) => t.path === path);
    if (!tab) return;

    if (!jobId) {
        setBufferedFiles(prev => prev.map(f => f.relative_path === path ? { ...f, inline_content: tab.content } : f));
        setOpenTabs((prev) =>
            prev.map((t) =>
              t.path === path
                ? { ...t, originalContent: t.content, isDirty: false }
                : t,
            ),
        );
        return;
    }

    try {
      await jobsApi.saveFileContent(jobId, {
        relative_path: tab.path,
        content: tab.content || '',
      });
      setOpenTabs((prev) =>
        prev.map((t) =>
          t.path === path
            ? { ...t, originalContent: t.content, isDirty: false }
            : t,
        ),
      );
      toast.success(t.common.save);
      void queryClient.invalidateQueries({ queryKey: ['job-files-tree', jobId] });
    } catch (error) {
      console.error(error);
      toast.error(t.errors.apiError);
    }
  }, [jobId, openTabs, queryClient, t.common.save, t.errors.apiError]);

  const mkdirMutation = useMutation({
    mutationFn: async (path: string) => {
        if (!jobId) {
            setBufferedFiles(prev => [...prev, {
                relative_path: path,
                filename: path.split('/').pop(),
                source_type: 'directory',
                status: 'new'
            }]);
            return;
        }
        await jobsApi.mkdir(jobId, path);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['job-files-tree', jobId] });
      toast.success(t.common.save);
    },
    onError: (error) => {
        console.error(error);
        toast.error(t.errors.apiError);
    }
  });

  const renameMutation = useMutation({
    mutationFn: ({ oldPath, newPath }: { oldPath: string, newPath: string }) => {
        if (!jobId) {
            setBufferedFiles(prev => prev.map(f => {
                if (f.relative_path === oldPath) {
                    return { ...f, relative_path: newPath, filename: newPath.split('/').pop() || newPath };
                }
                if (f.relative_path.startsWith(oldPath + '/')) {
                    const suffix = f.relative_path.substring(oldPath.length);
                    return { ...f, relative_path: newPath + suffix };
                }
                return f;
            }));
            return Promise.resolve();
        }
        return jobsApi.rename(jobId, oldPath, newPath);
    },
    onSuccess: (_, { oldPath, newPath }) => {
      void queryClient.invalidateQueries({ queryKey: ['job-files-tree', jobId] });
      setOpenTabs((prev) => prev.map(tab => {
          if (tab.path === oldPath) {
              return { ...tab, path: newPath, id: newPath, name: newPath.split('/').pop() || newPath };
          }
          if (tab.path.startsWith(oldPath + '/')) {
              const suffix = tab.path.substring(oldPath.length);
              const nextPath = newPath + suffix;
              return { ...tab, path: nextPath, id: nextPath, name: nextPath.split('/').pop() || nextPath };
          }
          return tab;
      }));
      if (activeTabId === oldPath) setActiveTabId(newPath);
      toast.success(t.common.save);
    },
    onError: (error) => {
        console.error(error);
        toast.error(t.errors.apiError);
    }
  });

  const moveMutation = useMutation({
    mutationFn: ({ oldPath, newPath }: { oldPath: string, newPath: string }) => {
        if (!jobId) {
            setBufferedFiles(prev => prev.map(f => {
                if (f.relative_path === oldPath) {
                    return { ...f, relative_path: newPath, filename: newPath.split('/').pop() || newPath };
                }
                if (f.relative_path.startsWith(oldPath + '/')) {
                    const suffix = f.relative_path.substring(oldPath.length);
                    return { ...f, relative_path: newPath + suffix };
                }
                return f;
            }));
            return Promise.resolve();
        }
        return jobsApi.move(jobId, oldPath, newPath);
    },
    onSuccess: (_, { oldPath, newPath }) => {
      void queryClient.invalidateQueries({ queryKey: ['job-files-tree', jobId] });
      setOpenTabs((prev) => prev.map(tab => {
          if (tab.path === oldPath) {
              return { ...tab, path: newPath, id: newPath, name: newPath.split('/').pop() || newPath };
          }
          if (tab.path.startsWith(oldPath + '/')) {
              const suffix = tab.path.substring(oldPath.length);
              const nextPath = newPath + suffix;
              return { ...tab, path: nextPath, id: nextPath, name: nextPath.split('/').pop() || nextPath };
          }
          return tab;
      }));
      if (activeTabId === oldPath) setActiveTabId(newPath);
      toast.success(t.common.save);
    },
    onError: (error) => {
        console.error(error);
        toast.error(t.errors.apiError);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (path: string) => {
        if (!jobId) {
            setBufferedFiles(prev => prev.filter(f => !f.relative_path.startsWith(path)));
            return Promise.resolve();
        }
        return jobsApi.deleteFile(jobId, path);
    },
    onSuccess: (_, path) => {
      void queryClient.invalidateQueries({ queryKey: ['job-files-tree', jobId] });
      setOpenTabs((prev) => prev.filter(tab => !tab.path.startsWith(path)));
      if (activeTabId?.startsWith(path)) setActiveTabId(null);
      toast.success(t.common.deleted);
    },
    onError: (error) => {
        console.error(error);
        toast.error(t.errors.apiError);
    }
  });

  return {
    tree,
    loadingTree: treeQuery.isLoading,
    expandedPaths,
    toggleExpand,
    openTabs,
    activeTabId,
    setActiveTabId,
    openFile,
    closeTab,
    updateTabContent,
    saveTab,
    move: moveMutation.mutateAsync,
    createFile: async (path: string) => {
        if (!jobId) {
            setBufferedFiles(prev => [...prev, {
                relative_path: path,
                filename: path.split('/').pop(),
                source_type: 'inline',
                inline_content: '',
                status: 'new'
            }]);
            return;
        }
        await jobsApi.saveFileContent(jobId, {
            relative_path: path,
            content: '',
        });
        void queryClient.invalidateQueries({ queryKey: ['job-files-tree', jobId] });
        toast.success(t.common.save);
    },
    mkdir: mkdirMutation.mutateAsync,
    rename: renameMutation.mutateAsync,
    deletePath: deleteMutation.mutateAsync,
    bufferedFiles,
    download: (path: string) => jobId && jobsApi.download(jobId, path),
    upload: async (files: File[]) => {
        if (!jobId) return;
        await jobsApi.uploadFiles(jobId, files);
        void queryClient.invalidateQueries({ queryKey: ['job-files-tree', jobId] });
        toast.success(t.common.save);
    }
  };
}
