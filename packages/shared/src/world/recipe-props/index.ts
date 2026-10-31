import { PALETTE as P, type Assembly } from '../procedural.js';
import { buildBench, buildBin, buildKiosk, buildLamp, buildPlanter, buildTree } from '../ala-too/props.js';
import {
  buildBakery,
  buildCart,
  buildCheckout,
  buildFreezer,
  buildFridge,
  buildGondola,
  buildPallet,
  buildProduce,
} from '../supermarket/fixtures.js';
import {
  buildArmorStand,
  buildBarrel,
  buildBrazier,
  buildCarpet,
  buildCrate,
  buildHall,
  buildKnight,
  buildMoss,
  buildTower,
  buildTreasure,
} from './castle.js';
import { buildSign, buildWallArt } from './common.js';
import {
  buildChair,
  buildDiningTable,
  buildKitchenIsland,
  buildRange,
  buildSofa,
  buildSpill,
  buildTrayStack,
  decorateTable,
} from './dining.js';
import { buildCar, buildChalkGame, buildHouse, buildLaundry, buildPlayground, buildToybox } from './yard.js';

export type PropBuilder = (color?: string, variant?: number) => Assembly;

/**
 * Все предметы, которые можно ставить в рецепт карты, по имени (`kind`). Предметы площади и супермаркета —
 * те же сборки, что на их картах: новая карта из готовых деталей собирается расстановкой, без нового кода.
 */
export const PROP_BUILDERS: Record<string, PropBuilder> = {
  table: (c) => buildDiningTable(c),
  'cloth-table': (c = P.coral) => decorateTable(buildDiningTable(c), c),
  chair: (c) => buildChair(c),
  island: (c) => buildKitchenIsland(c),
  range: (c) => buildRange(c),
  sofa: (c) => buildSofa(c),
  'tray-stack': (c) => buildTrayStack(c),
  spill: (c, v) => buildSpill(c, v),
  'wall-art': (c, v) => buildWallArt(c, v),
  sign: (c, v) => buildSign(c, v),
  house: (c, v) => buildHouse(c, v),
  car: (c) => buildCar(c),
  playground: (c) => buildPlayground(c),
  laundry: (c) => buildLaundry(c),
  toybox: (c) => buildToybox(c),
  'chalk-game': (c) => buildChalkGame(c),
  crate: (c) => buildCrate(c),
  barrel: (c) => buildBarrel(c),
  tower: (c) => buildTower(c),
  hall: (c) => buildHall(c),
  carpet: (c) => buildCarpet(c),
  moss: (c) => buildMoss(c),
  treasure: (c) => buildTreasure(c),
  'armor-stand': (c) => buildArmorStand(c),
  brazier: (c) => buildBrazier(c),
  knight: (c, v) => buildKnight(c, v),
  bench: (c = P.woodLight) => buildBench(c),
  tree: (_c, v = 0) => buildTree(v),
  planter: (c = P.ivory) => buildPlanter(c, P.coral),
  lamp: () => buildLamp(),
  kiosk: (c = P.coral) => buildKiosk(c),
  bin: (c = P.blue) => buildBin(c),
  fridge: (c) => buildFridge(c),
  pallet: (c, v) => buildPallet(c, v),
  cart: (c) => buildCart(c),
  freezer: (c) => buildFreezer(c),
  gondola: (c, v) => buildGondola(c, v),
  produce: (c) => buildProduce(c),
  bakery: () => buildBakery(),
  checkout: (c) => buildCheckout(c),
};
