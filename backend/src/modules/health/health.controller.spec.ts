import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns the backend health status', () => {
    const controller = new HealthController();

    expect(controller.check()).toEqual({
      status: 'ok',
      service: 'nexira-backend',
    });
  });
});
