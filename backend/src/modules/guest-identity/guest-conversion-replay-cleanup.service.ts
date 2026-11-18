import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { GuestIdentityService } from './guest-identity.service';

@Injectable()
export class GuestConversionReplayCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GuestConversionReplayCleanupService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly guests: GuestIdentityService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => { void this.runCleanup(); }, 60_000);
    this.timer.unref();
    void this.runCleanup();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async runCleanup(): Promise<void> {
    try {
      const purged = await this.guests.purgeExpiredReplayCiphertexts();
      if (purged > 0) this.logger.log(`Purged ${purged} expired guest conversion replay payload(s)`);
    } catch {
      this.logger.error('Guest conversion replay cleanup failed; it will retry on the next interval');
    }
  }
}
