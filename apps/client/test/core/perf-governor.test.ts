import { describe, expect, it, vi } from 'vitest';
import { PerfGovernor } from '../../src/core/perf-governor';

const run = (governor: PerfGovernor, fps: number, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / fps) governor.tick(1 / fps);
};

describe('PerfGovernor', () => {
  it('keeps quality while the game runs smoothly', () => {
    const apply = vi.fn();
    const g = new PerfGovernor(2, apply);
    run(g, 60, 30);
    expect(apply).not.toHaveBeenCalled();
  });

  it('steps down after sustained low FPS, one level at a time', () => {
    const apply = vi.fn();
    const g = new PerfGovernor(2, apply);
    run(g, 60, 5); // разогрев
    run(g, 30, 4.5);
    expect(apply).toHaveBeenLastCalledWith(1);
    run(g, 30, 5);
    expect(apply).toHaveBeenLastCalledWith(0);
    run(g, 20, 10);
    expect(apply).toHaveBeenCalledTimes(2); // ниже нуля не опускаемся
  });

  it('ignores short hiccups and the warm-up period', () => {
    const apply = vi.fn();
    const g = new PerfGovernor(2, apply);
    run(g, 20, 3); // тормоза при загрузке
    run(g, 60, 5);
    run(g, 25, 1); // секундная просадка
    run(g, 60, 5);
    expect(apply).not.toHaveBeenCalled();
  });

  it('ignores a long frame after returning to the tab', () => {
    const apply = vi.fn();
    const g = new PerfGovernor(2, apply);
    run(g, 60, 5);
    g.tick(3);
    run(g, 60, 5);
    expect(apply).not.toHaveBeenCalled();
  });
});
