import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JobService } from '../../src/services/job.service';
import { JobModel, TokenModel } from '../../src/models';
import { QueueService } from '../../src/services/queue.service';

vi.mock('../../src/models', () => ({
  JobModel: {
    create: vi.fn(),
    findById: vi.fn(),
    updateStatus: vi.fn(),
    addLog: vi.fn(),
    getLogs: vi.fn(),
  },
  TokenModel: {
    create: vi.fn(),
    findValidToken: vi.fn(),
    markAsUsed: vi.fn(),
  },
}));

vi.mock('../../src/services/queue.service', () => ({
  QueueService: {
    addJob: vi.fn(),
  },
}));

describe('JobService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a job with a valid bootstrap container', async () => {
    vi.mocked(JobModel.create).mockResolvedValue(undefined);
    vi.mocked(TokenModel.create).mockResolvedValue(undefined);
    vi.mocked(QueueService.addJob).mockResolvedValue(undefined);

    const payload = {
      title: 'Unit test job',
      containers: [
        {
          name: 'bootstrap',
          image: 'python:3.11-slim',
          is_parent: true,
        },
      ],
      environments: {
        TEST_ENV: 'unit',
      },
      execution_code: 'print("hello")',
      execution_language: 'python' as const,
    };

    const result = await JobService.createJob(payload);

    expect(result.id).toMatch(/^job_/);
    expect(result.token).toMatch(/^run_/);

    expect(JobModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: result.id,
        title: 'Unit test job',
        containers: payload.containers,
        execution_code: 'print("hello")',
        execution_language: 'python',
      }),
    );

    expect(TokenModel.create).toHaveBeenCalledWith(result.token, result.id);
    expect(QueueService.addJob).toHaveBeenCalledWith(result.id, 'python main.py');
  });

  it('should claim a job and build artifact download URLs', async () => {
    const mockToken = 'run_test_token';
    const mockJobId = 'job_test_job';

    vi.mocked(TokenModel.findValidToken).mockResolvedValue({ job_id: mockJobId });
    vi.mocked(JobModel.findById).mockResolvedValue({
      id: mockJobId,
      title: 'Claim test job',
      status: 'pending',
      containers: [
        {
          name: 'bootstrap',
          image: 'python:3.11-slim',
          is_parent: true,
        },
      ],
      environments: {
        TEST_ENV: 'claim',
      },
      attached_files: [
        {
          id: 'file_1',
          filename: 'dataset.csv',
          size_bytes: 123,
          storage_key: 'jobs/job_test_job/files/file_1-dataset.csv',
          mime_type: 'text/csv',
        },
      ],
      execution_code: 'print("hello")',
      execution_language: 'python',
      created_at: '2026-03-26T00:00:00.000Z',
      updated_at: '2026-03-26T00:00:00.000Z',
    } as any);
    vi.mocked(TokenModel.markAsUsed).mockResolvedValue(undefined);
    vi.mocked(JobModel.updateStatus).mockResolvedValue(undefined);

    const result = await JobService.claimJob(mockToken);

    expect(result).toEqual({
      job_id: mockJobId,
      config: {
        job_id: mockJobId,
        containers: [
          {
            name: 'bootstrap',
            image: 'python:3.11-slim',
            is_parent: true,
          },
        ],
        environments: {
          TEST_ENV: 'claim',
        },
        attached_files: [
          {
            filename: 'dataset.csv',
            download_url:
              '/artifacts/download?key=jobs%2Fjob_test_job%2Ffiles%2Ffile_1-dataset.csv',
          },
        ],
        execution_code: 'print("hello")',
        execution_language: 'python',
        entrypoint: undefined,
      },
    });

    expect(TokenModel.markAsUsed).toHaveBeenCalledWith(mockToken);
    expect(JobModel.updateStatus).toHaveBeenCalledWith(mockJobId, 'running');
  });

  it('should not burn a valid token when expected job id does not match', async () => {
    vi.mocked(TokenModel.findValidToken).mockResolvedValue({ job_id: 'job_real' });

    const result = await JobService.claimJob('run_test_token', 'job_other');

    expect(result).toBeNull();
    expect(JobModel.findById).not.toHaveBeenCalled();
    expect(TokenModel.markAsUsed).not.toHaveBeenCalled();
    expect(JobModel.updateStatus).not.toHaveBeenCalled();
  });
});