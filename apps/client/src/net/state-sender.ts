import { CLIENT_STATE_RATE, roundCm, type PlayerState } from '@mecha/shared';
import type { LocalPlayer } from '../player/local-player';

const SEND_INTERVAL = 1 / CLIENT_STATE_RATE;
/** Стоим на месте — шлём состояние раз в секунду, чтобы сервер знал, что мы живы. */
const IDLE_HEARTBEAT = 1;

/**
 * Решает, когда отправить своё состояние на сервер.
 * Шаг физики — 60 Гц, а отправка — 20 Гц: незачем слать каждый шаг.
 * Если ничего не изменилось — молчим (экономим трафик и батарею).
 */
export class StateSender {
  private accumulator = 0;
  private sinceLastSend = Infinity;
  private last: PlayerState | null = null;

  constructor(private readonly send: (state: PlayerState) => void) {}

  update(dt: number, player: LocalPlayer): void {
    this.accumulator += dt;
    this.sinceLastSend += dt;
    if (this.accumulator < SEND_INTERVAL) return;
    this.accumulator %= SEND_INTERVAL;

    const p = player.state.position;
    const state: PlayerState = {
      x: roundCm(p.x),
      y: roundCm(p.y),
      z: roundCm(p.z),
      yaw: roundCm(player.facing),
      grounded: player.state.grounded,
      crouching: player.state.crouching,
      pose: player.state.pose,
      climbing: !!player.state.climbing,
    };
    if (this.sinceLastSend < IDLE_HEARTBEAT && this.last && sameState(state, this.last)) return;

    this.send(state);
    this.last = state;
    this.sinceLastSend = 0;
  }

  /** После входа в комнату или телепорта — отправить сразу, не дожидаясь изменений. */
  reset(): void {
    this.last = null;
    this.sinceLastSend = Infinity;
  }
}

function sameState(a: PlayerState, b: PlayerState): boolean {
  return (
    a.x === b.x &&
    a.y === b.y &&
    a.z === b.z &&
    a.yaw === b.yaw &&
    a.grounded === b.grounded &&
    a.crouching === b.crouching &&
    a.pose === b.pose &&
    a.climbing === b.climbing
  );
}
