import {
  FOUND_MODE_OPTIONS,
  HIDE_SECONDS_OPTIONS,
  MAPS,
  MAP_IDS,
  SEEKER_OPTIONS,
  SEEK_SECONDS_OPTIONS,
  UpdateSettingsSchema,
  type RoomSettings,
  type RoomSnapshot,
  type UpdateSettingsPayload,
} from '@mecha/shared';
import { $ } from './dom';

/** Подписи значений настроек — одни и те же для диалога и краткой сводки в панели. */
export function describeSettings(settings: RoomSettings): string {
  const seekers = settings.seekers === 'auto' ? 'авто' : settings.seekers;
  const hints = settings.hints ? '' : ' · без подсказок';
  return `${MAPS[settings.mapId].name} · ${settings.hideSeconds}/${settings.seekSeconds} с · ищущих: ${seekers}${hints}`;
}

/**
 * Диалог настроек комнаты. Хост меняет значения — каждое изменение сразу уходит на сервер,
 * а применённые значения возвращаются в room:state всем игрокам (и хосту тоже).
 * Остальные игроки видят те же поля, но выключенными.
 */
export class SettingsDialog {
  private readonly root = $('#settings');
  private readonly form = $<HTMLFormElement>('#settings-form');
  private readonly note = $('#settings-note');
  private readonly selects: Record<keyof RoomSettings, HTMLSelectElement>;

  constructor(onChange: (patch: UpdateSettingsPayload) => void) {
    const select = (name: keyof RoomSettings) => this.form.querySelector<HTMLSelectElement>(`[name="${name}"]`)!;
    this.selects = {
      mapId: select('mapId'),
      hideSeconds: select('hideSeconds'),
      seekSeconds: select('seekSeconds'),
      seekers: select('seekers'),
      foundMode: select('foundMode'),
      hints: select('hints'),
    };
    fill(this.selects.mapId, MAP_IDS.map((id) => [id, MAPS[id].name]));
    fill(this.selects.hideSeconds, HIDE_SECONDS_OPTIONS.map((s) => [String(s), `${s} с`]));
    fill(this.selects.seekSeconds, SEEK_SECONDS_OPTIONS.map((s) => [`${s}`, `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`]));
    fill(this.selects.seekers, SEEKER_OPTIONS.map((s) => [String(s), s === 'auto' ? 'Авто (по числу игроков)' : String(s)]));
    fill(
      this.selects.foundMode,
      FOUND_MODE_OPTIONS.map((m) => [m, m === 'helper' ? 'Помогают искать' : 'Становятся призраками']),
    );
    fill(this.selects.hints, [
      ['true', 'Свист во второй половине поиска'],
      ['false', 'Без подсказок'],
    ]);

    // <select> всегда отдаёт строку. Приводим к типам схемы и проверяем той же схемой, что сервер.
    this.form.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      const raw = target.value;
      const isText = target.name === 'mapId' || target.name === 'foundMode' || raw === 'auto';
      const value = target.name === 'hints' ? raw === 'true' : isText ? raw : Number(raw);
      const parsed = UpdateSettingsSchema.safeParse({ [target.name]: value });
      if (parsed.success) onChange(parsed.data);
    });
    $('#settings-close').addEventListener('click', () => this.close());
  }

  open(): void {
    this.root.hidden = false;
  }

  close(): void {
    this.root.hidden = true;
  }

  render(room: RoomSnapshot | null, isHost: boolean): void {
    if (!room) {
      this.close();
      return;
    }
    const editable = isHost && room.phase === 'lobby';
    for (const [name, select] of Object.entries(this.selects)) {
      select.value = String(room.settings[name as keyof RoomSettings]);
      select.disabled = !editable;
    }
    this.note.textContent = editable ? '' : isHost ? 'Менять можно только в лобби' : 'Настройки меняет хост';
  }
}

function fill(select: HTMLSelectElement, options: [value: string, label: string][]) {
  select.replaceChildren(
    ...options.map(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      return option;
    }),
  );
}
