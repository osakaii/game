import { describe, expect, it, vi } from 'vitest';
import { ServerClock } from './server-clock';

describe('ServerClock', () => {
  it('estimates offset assuming symmetric latency', () => {
    const clock = new ServerClock();
    // клиент отправил в 100, сервер ответил своим 5_000_060, ответ пришёл в 200 (RTT 100)
    clock.addSample(100, 5_000_060, 200);
    vi.spyOn(performance, 'now').mockReturnValue(200);
    // в момент 150 у клиента на сервере было 5_000_060 -> сейчас (200) там 5_000_110
    expect(clock.now()).toBe(5_000_110);
    vi.restoreAllMocks();
  });

  it('trusts low-RTT samples more than a spike', () => {
    const clock = new ServerClock();
    clock.addSample(0, 1000, 20); // offset = 990
    clock.addSample(100, 1600, 600); // всплеск RTT 500, «врущий» образец: offset 1250
    vi.spyOn(performance, 'now').mockReturnValue(0);
    expect(clock.now()).toBeLessThan(1000);
    vi.restoreAllMocks();
  });
});
