/** Клавиатура для отладки на компьютере. Храним множество зажатых клавиш по KeyboardEvent.code. */
export class Keyboard {
  private readonly pressed = new Set<string>();
  onJump?: () => void;
  onCrouch?: () => void;
  /** Номер позы 0..5 (клавиши 1–6) или null — встать (0 или X). */
  onPose?: (index: number | null) => void;

  constructor() {
    window.addEventListener('keydown', (e) => {
      // Пользователь печатает ник — WASD и пробел не должны двигать персонажа.
      if (e.repeat || isTyping(e)) return;
      this.pressed.add(e.code);
      if (e.code === 'Space') this.onJump?.();
      if (e.code === 'KeyC') this.onCrouch?.();
      const digit = /^Digit([0-6])$/.exec(e.code);
      if (digit) this.onPose?.(digit[1] === '0' ? null : Number(digit[1]) - 1);
      if (e.code === 'KeyX') this.onPose?.(null);
    });
    window.addEventListener('keyup', (e) => this.pressed.delete(e.code));
    // Окно потеряло фокус — keyup уже не придёт, иначе персонаж «залипнет» в движении.
    window.addEventListener('blur', () => this.pressed.clear());
  }

  axis(): { x: number; y: number } {
    const has = (...codes: string[]) => codes.some((c) => this.pressed.has(c));
    return {
      x: (has('KeyD', 'ArrowRight') ? 1 : 0) - (has('KeyA', 'ArrowLeft') ? 1 : 0),
      y: (has('KeyW', 'ArrowUp') ? 1 : 0) - (has('KeyS', 'ArrowDown') ? 1 : 0),
    };
  }
}

function isTyping(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null;
  return !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
}
