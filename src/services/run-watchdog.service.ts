import { JobService } from './job.service';

export class RunWatchdogService {
  static async sweep(): Promise<string[]> {
    return JobService.markStaleRunsLost();
  }
}