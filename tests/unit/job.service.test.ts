import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JobService } from '../../src/services/job.service';
import { JobModel, TokenModel } from '../../src/models';
import { QueueService } from '../../src/services/queue.service';

vi.mock('../../src/models');
vi.mock('../../src/services/queue.service');

describe('JobService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a job', async () => {
    vi.mocked(JobModel.create).mockResolvedValue(undefined);
    vi.mocked(TokenModel.create).mockResolvedValue(undefined);
    vi.mocked(QueueService.addJob).mockResolvedValue(undefined);

    const result = await JobService.createJob('echo hello');

    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('token');
    expect(JobModel.create).toHaveBeenCalled();
    expect(TokenModel.create).toHaveBeenCalled();
    expect(QueueService.addJob).toHaveBeenCalled();
  });

  it('should claim a job', async () => {
    const mockToken = 'test-token';
    const mockJobId = 'test-job';
    vi.mocked(TokenModel.findValidToken).mockResolvedValue({ job_id: mockJobId });
    vi.mocked(JobModel.findById).mockResolvedValue({ id: mockJobId, command: 'echo hello', status: 'pending' });
    vi.mocked(TokenModel.markAsUsed).mockResolvedValue(undefined);
    vi.mocked(JobModel.updateStatus).mockResolvedValue(undefined);

    const result = await JobService.claimJob(mockToken);

    expect(result).toEqual({ job_id: mockJobId, command: 'echo hello' });
    expect(TokenModel.markAsUsed).toHaveBeenCalledWith(mockToken);
    expect(JobModel.updateStatus).toHaveBeenCalledWith(mockJobId, 'running');
  });
});
