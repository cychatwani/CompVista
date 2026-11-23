import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { CompensationController } from './compensation.controller.js';
import { msUntilMidnight } from './compensation-workflow.js';

// Promotes upcoming compensation packages to current at 00:00 (server local time) each night,
// and once at startup so a missed midnight (downtime, deploy) is caught up immediately.
@Injectable()
export class CompensationSchedulerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('CompensationScheduler');
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly compensation: CompensationController) {}

  onApplicationBootstrap() {
    if (process.env.COMPENSATION_SCHEDULER === 'off') return;
    void this.run();
    this.scheduleNext();
  }

  onApplicationShutdown() {
    if (this.timer) clearTimeout(this.timer);
  }

  private scheduleNext() {
    // A small delay past midnight keeps the run safely on the new calendar day.
    this.timer = setTimeout(() => { void this.run(); this.scheduleNext(); }, msUntilMidnight() + 1000);
    this.timer.unref();
  }

  private async run() {
    try {
      const promoted = await this.compensation.promoteDuePackages();
      if (promoted) this.logger.log(`Promoted ${promoted} upcoming compensation package(s) to current`);
    } catch (error) {
      this.logger.error('Promoting upcoming compensation failed', error as Error);
    }
  }
}
