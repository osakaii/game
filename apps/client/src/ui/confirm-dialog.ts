import { $ } from './dom';

/**
 * «Точно?» перед необратимым действием (выйти посреди раунда).
 *
 * Не `window.confirm`: системное окно на телефоне выкидывает из полноэкранного режима, выглядит
 * чужим и останавливает весь JavaScript, пока висит, — а игра должна продолжать слать позицию.
 */
export class ConfirmDialog {
  private readonly root = $('#confirm');
  private readonly text = $('#confirm-text');
  private readonly ok = $<HTMLButtonElement>('#confirm-ok');
  private resolve: ((answer: boolean) => void) | null = null;

  constructor() {
    this.ok.addEventListener('click', () => this.finish(true));
    $('#confirm-cancel').addEventListener('click', () => this.finish(false));
    // Тап мимо карточки — «нет»: случайное касание не должно выполнить действие.
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.finish(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.resolve) this.finish(false);
    });
  }

  ask(question: string, okLabel: string): Promise<boolean> {
    // Новый вопрос поверх старого: старый считается отклонённым.
    this.finish(false);
    this.text.textContent = question;
    this.ok.textContent = okLabel;
    this.root.hidden = false;
    return new Promise((resolve) => (this.resolve = resolve));
  }

  private finish(answer: boolean) {
    const resolve = this.resolve;
    this.resolve = null;
    this.root.hidden = true;
    resolve?.(answer);
  }
}
