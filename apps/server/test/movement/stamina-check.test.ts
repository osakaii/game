import { describe, expect, it } from 'vitest';
import { PLAYER, STAMINA, canSprint, tickStamina, type PlayerState, type StaminaState } from '@mecha/shared';
import { judgeSprint, recordSprint } from '../../src/movement/stamina-check';

const state = (sprinting: boolean): PlayerState => ({
  x: 0,
  y: 0,
  z: 0,
  yaw: 0,
  grounded: true,
  crouching: false,
  pose: 'none',
  climbing: false,
  sprinting,
});

/** Сервер принимает пакеты раз в 50 мс; true — бег принят. */
function serverStep(server: StaminaState, claimSprint: boolean): boolean {
  const judged = judgeSprint(server, state(claimSprint));
  recordSprint(server, judged, 50);
  return judged.sprinting;
}

describe('server stamina', () => {
  it('an honest runner is never refused: the server drains a bit slower than the client', () => {
    const client: StaminaState = {};
    const server: StaminaState = {};
    let refused = 0;
    // 10 с: клиент держит бег, сколько хватает сил (физика 60 Гц), шлёт состояние 20 Гц.
    for (let packet = 0; packet < 200; packet++) {
      for (let step = 0; step < 3; step++) tickStamina(client, canSprint(client), 1 / 60);
      if (client.sprinting && !serverStep(server, true)) refused++;
      if (!client.sprinting) serverStep(server, false);
    }
    expect(refused).toBe(0);
  });

  it('a cheater claiming endless sprint gets refused after the stamina runs out', () => {
    const server: StaminaState = {};
    const accepted: boolean[] = [];
    for (let packet = 0; packet < 200; packet++) accepted.push(serverStep(server, true));
    const firstRefusal = accepted.indexOf(false);
    // Запас — 4 с бега, у сервера с поправкой ~4.7 с; дальше бег не принимается.
    expect(firstRefusal * 0.05).toBeGreaterThan(STAMINA.sprintSeconds);
    expect(firstRefusal * 0.05).toBeLessThan(STAMINA.sprintSeconds / 0.85 + 0.2);
    // Сил нет и бежать не перестаёт — восстановиться они не успевают: дальше только короткие рывки.
    const later = accepted.slice(firstRefusal);
    expect(later.filter(Boolean).length / later.length).toBeLessThan(0.5);
  });

  it('a refused sprint is judged as walking, so the sprint speed fails the speed check', () => {
    const tired: StaminaState = { stamina: 0, sprinting: true };
    expect(judgeSprint(tired, state(true)).sprinting).toBe(false);
    expect(PLAYER.sprintSpeed).toBeGreaterThan(PLAYER.walkSpeed * 1.25); // допуск валидатора — 25%
  });
});
