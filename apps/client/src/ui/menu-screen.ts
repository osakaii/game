import { JoinRoomSchema, NicknameSchema, ROOM_CODE_LENGTH } from '@mecha/shared';
import { $, storage } from './dom';

const NICKNAME_KEY = 'mecha:nickname';

interface MenuHandlers {
  onCreate(nickname: string): void;
  onJoin(nickname: string, code: string): void;
}

/** Стартовый экран: ник, «создать комнату», «войти по коду». */
export class MenuScreen {
  private readonly root = $('#menu');
  private readonly form = $<HTMLFormElement>('#menu-form');
  private readonly nickname = $<HTMLInputElement>('#nickname');
  private readonly code = $<HTMLInputElement>('#room-code');
  private readonly createButton = $<HTMLButtonElement>('#create-room');
  private readonly joinButton = $<HTMLButtonElement>('#join-room');
  private readonly errorEl = $('#menu-error');
  private online = false;
  private busy = false;

  constructor(handlers: MenuHandlers, initialCode: string | null) {
    this.nickname.value = storage.get(NICKNAME_KEY) ?? '';
    this.code.maxLength = ROOM_CODE_LENGTH;
    if (initialCode) this.code.value = initialCode;

    this.code.addEventListener('input', () => {
      this.code.value = this.code.value.toUpperCase();
    });

    this.createButton.addEventListener('click', () => {
      const nickname = this.readNickname();
      if (nickname) handlers.onCreate(nickname);
    });

    // submit формы = «Войти»: так работает и кнопка, и Enter/«Готово» на клавиатуре телефона.
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const parsed = JoinRoomSchema.safeParse({ nickname: this.nickname.value, code: this.code.value });
      if (!parsed.success) {
        this.showError(parsed.error.issues[0]?.message ?? 'Ошибка');
        return;
      }
      storage.set(NICKNAME_KEY, parsed.data.nickname);
      handlers.onJoin(parsed.data.nickname, parsed.data.code);
    });
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  show(): void {
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
    this.showError('');
  }

  setOnline(online: boolean): void {
    this.online = online;
    this.updateButtons();
  }

  setBusy(busy: boolean): void {
    this.busy = busy;
    this.updateButtons();
  }

  showError(text: string): void {
    this.errorEl.textContent = text;
  }

  private readNickname(): string | null {
    const parsed = NicknameSchema.safeParse(this.nickname.value);
    if (!parsed.success) {
      this.showError(parsed.error.issues[0]?.message ?? 'Ошибка');
      this.nickname.focus();
      return null;
    }
    storage.set(NICKNAME_KEY, parsed.data);
    return parsed.data;
  }

  private updateButtons() {
    const disabled = !this.online || this.busy;
    this.createButton.disabled = disabled;
    this.joinButton.disabled = disabled;
  }
}
