/** Клавиатура для отладки на компьютере. Храним множество зажатых клавиш по KeyboardEvent.code. */
export class Keyboard {
  private readonly pressed = new Set<string>();
  onJump?: () => void;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.pressed.add(e.code);
      if (e.code === 'Space') this.onJump?.();
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
