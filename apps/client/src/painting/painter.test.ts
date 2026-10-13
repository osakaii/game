import { describe, expect, it, vi } from 'vitest';
import { defaultBodyColors, type EmptyResult, type RoomSnapshot } from '@mecha/shared';
import { PlayerModel } from '../player/player-model';
import { Painter } from './painter';

vi.mock('../ui/toast', () => ({ toast: vi.fn() }));

function setup(serverResult: EmptyResult) {
  const model = new PlayerModel();
  const me = { id: 'me', nickname: 'Me', role: 'hider' as const, found: false, colors: defaultBodyColors() };
  const room = { phase: 'hiding', players: [me] } as unknown as RoomSnapshot;
  const network = { paint: vi.fn(async () => serverResult) };
  const lobby = { room, myRole: 'hider', me };
  const painter = new Painter({} as never, {} as never, network as never, lobby as never, model);
  return { painter, model, network };
}

describe('Painter', () => {
  it('applies color optimistically and sends it to the server', async () => {
    const { painter, model, network } = setup({ ok: true, data: null });
    painter.setColor('#2a9d8f');
    await painter.paint(['head']);
    expect(model.colorOf('head')).toBe('#2a9d8f');
    expect(network.paint).toHaveBeenCalledWith({ zones: ['head'], color: '#2a9d8f' });
  });

  it('rolls back to confirmed colors when the server refuses', async () => {
    const { painter, model } = setup({ ok: false, error: 'PAINT_NOT_ALLOWED' });
    painter.setColor('#2a9d8f');
    const pending = painter.paint(['head']);
    expect(model.colorOf('head')).toBe('#2a9d8f'); // до ответа сервера — уже покрашено
    await pending;
    expect(model.colorOf('head')).toBe('#f2f2f2');
  });

  it('keeps recent colors unique and limited', () => {
    const { painter } = setup({ ok: true, data: null });
    for (const c of ['#000001', '#000002', '#000001', '#000003', '#000004', '#000005', '#000006']) {
      painter.setColor(c);
    }
    expect(painter.recent).toEqual(['#000006', '#000005', '#000004', '#000003', '#000001']);
  });
});
