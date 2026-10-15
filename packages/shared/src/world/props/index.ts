import type { MapBox } from '../map.js';
import { BATHROOM } from './bathroom.js';
import { BEDROOM } from './bedroom.js';
import { KITCHEN_PROPS } from './kitchen.js';
import { seededRandom, type PropDef } from './kit.js';
import { LIVING } from './living.js';
import { MISC } from './misc.js';

export { seededRandom } from './kit.js';

/**
 * Предметы карты (мебель). Предмет — функция, которая строит блоки в СВОЕЙ системе координат:
 * центр основания в (0, 0, 0), «лицом» (сиденьем, полками) к +Z. Карта ставит предмет в точку
 * и поворачивает на 0/90/180/270° — тогда блоки остаются выровненными по осям, и физика их понимает.
 *
 * Вид и столкновения — из одних и тех же блоков: сервер берёт твёрдые (solid !== false),
 * клиент рисует все, кроме hidden. Так «видно диван» и «упёрся в диван» не могут разойтись.
 *
 * Предметы разложены по комнатам: living, kitchen, bedroom, bathroom, misc.
 */
const PROP_DEFS = { ...LIVING, ...KITCHEN_PROPS, ...BEDROOM, ...BATHROOM, ...MISC };

export type PropId = keyof typeof PROP_DEFS;
export const PROP_IDS = Object.keys(PROP_DEFS) as PropId[];

export type Rotation = 0 | 90 | 180 | 270;

export interface PropPlacement {
  prop: PropId;
  x: number;
  z: number;
  /** Высота основания (поставить на стол, повесить шкаф на стену). */
  y?: number;
  rot?: Rotation;
  /** Основной цвет (корпус, обивка). У каждого предмета свой цвет по умолчанию. */
  color?: string;
  /** Второй цвет (подушки, столешница, ножки). */
  accent?: string;
  /** Ширина вдоль локального X, где у предмета есть выбор (диван на 2 или 3 места). */
  length?: number;
}

/**
 * Поставить предмет на карту: построить блоки, повернуть вокруг вертикали и сдвинуть в точку.
 * Поворот как у three.js rotation.y: x' = x·cos + z·sin, z' = −x·sin + z·cos. На 90° и 270°
 * ширина и глубина блока меняются местами — блок по-прежнему выровнен по осям.
 */
export function placeProp(placement: PropPlacement): MapBox[] {
  const def: PropDef = PROP_DEFS[placement.prop];
  // Зерно — от места на карте: два одинаковых шкафа в разных углах выглядят по-разному.
  const random = seededRandom(Math.round(placement.x * 1000) * 31 + Math.round(placement.z * 1000) * 17);
  const local = def.build(
    {
      color: placement.color ?? def.color,
      accent: placement.accent ?? def.accent,
      length: placement.length ?? def.length,
    },
    random,
  );
  const rot = placement.rot ?? 0;
  const cos = Math.round(Math.cos((rot * Math.PI) / 180));
  const sin = Math.round(Math.sin((rot * Math.PI) / 180));
  const swap = rot === 90 || rot === 270;
  return local.map((box) => ({
    ...box,
    x: placement.x + box.x * cos + box.z * sin,
    z: placement.z - box.x * sin + box.z * cos,
    y: (placement.y ?? 0) + (box.y ?? 0),
    w: swap ? box.d : box.w,
    d: swap ? box.w : box.d,
  }));
}
