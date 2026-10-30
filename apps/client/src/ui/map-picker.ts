import { MAPS, MAP_CHOICES, defaultSeekSeconds, type MapId, type RoomSnapshot } from '@mecha/shared';
import { $ } from './dom';

/** Чем карта отличается — одной строкой: выбирают по впечатлению, а не по названию. */
const MAP_BLURBS: Partial<Record<MapId, string>> = {
  'ala-too': 'Площадь под открытым небом: Манас, фонтаны, колоннады',
  apartment: 'Большая квартира: прячься под мебелью и среди вещей',
  supermarket: 'Стеллажи, кассы, холодильники и склад',
};

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/**
 * Выбор карты на виду: плашка «Карта: …» под панелью лобби. Раньше карта пряталась в шторке комнаты →
 * строке настроек → выпадающем списке, и её не находили. Хост тапает плашку — окно с картами
 * карточками; остальные видят, на какой карте сыграют. Время поиска при смене карты сервер
 * подставляет сам (у каждой карты своё), поэтому шлём только mapId.
 */
export class MapPicker {
  private readonly chip = $<HTMLButtonElement>('#lobby-map');
  private readonly chipName = $('#lobby-map-name');
  private readonly root = $('#map-picker');
  private readonly options = new Map<MapId, HTMLButtonElement>();
  private current: MapId | null = null;

  constructor(onPick: (mapId: MapId) => void) {
    const list = $('#map-options');
    for (const id of MAP_CHOICES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'map-option';
      const name = document.createElement('b');
      name.textContent = MAPS[id].name;
      const blurb = document.createElement('span');
      blurb.textContent = MAP_BLURBS[id] ?? '';
      const seek = document.createElement('small');
      seek.textContent = `поиск ${clock(defaultSeekSeconds(id))}`;
      button.append(name, blurb, seek);
      button.addEventListener('click', () => {
        if (id !== this.current) onPick(id);
        this.close();
      });
      list.append(button);
      this.options.set(id, button);
    }
    this.chip.addEventListener('click', () => (this.root.hidden = false));
    $('#map-picker-close').addEventListener('click', () => this.close());
    // Тап мимо карточки — закрыть, как у остальных окон.
    this.root.addEventListener('click', (e) => e.target === this.root && this.close());
  }

  close(): void {
    this.root.hidden = true;
  }

  render(room: RoomSnapshot | null, isHost: boolean): void {
    const inLobby = room?.phase === 'lobby';
    this.chip.hidden = !inLobby;
    if (!room || !inLobby) {
      this.close();
      return;
    }
    this.current = room.settings.mapId;
    this.chipName.textContent = MAPS[this.current].name;
    // Не хосту плашка — просто подпись: менять карту может только он.
    this.chip.disabled = !isHost;
    this.chip.classList.toggle('editable', isHost);
    if (!isHost) this.close();
    for (const [id, button] of this.options) button.setAttribute('aria-pressed', String(id === this.current));
  }
}
