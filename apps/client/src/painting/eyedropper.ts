import * as THREE from 'three';
import type { WorldGeometry } from '../world/active-map';
import { surfaceColor, type SurfaceTexture } from '../world/surfaces';

/**
 * Пипетка: луч из камеры через точку касания -> первый предмет -> цвет его материала.
 *
 * Почему цвет материала, а не пиксель с экрана: пиксель уже освещён (тень, блик).
 * Если покрасить себя освещённым цветом, свет ляжет второй раз и персонаж станет темнее или светлее фона.
 * А одинаковый материал при одинаковом освещении выглядит одинаково — это и есть маскировка.
 *
 * У предметов с рисунком (паркет, обои) берём цвет рисунка именно в точке касания: тёмный шов
 * между досками и светлая доска — разные цвета, и пипетка честно отдаёт тот, в который попали.
 */
export class Eyedropper {
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();

  constructor(
    private readonly camera: THREE.Camera,
    private readonly canvas: HTMLCanvasElement,
    private readonly world: Pick<WorldGeometry, 'obstacles'>,
  ) {}

  pick(clientX: number, clientY: number): string | null {
    // Экранные пиксели -> NDC (normalized device coordinates): x и y от -1 до 1, y вверх.
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);

    const hit = this.raycaster.intersectObjects(this.world.obstacles as THREE.Object3D[], false)[0];
    if (!hit || !(hit.object instanceof THREE.Mesh)) return null;
    const material = hit.object.material;
    if (!(material instanceof THREE.MeshLambertMaterial)) return null;
    // Цвет блока: у склеенной карты — в вершинах (все вершины блока одного цвета), иначе — в материале.
    const colors = hit.object.geometry.getAttribute('color');
    const tint = material.vertexColors && colors && hit.face ? new THREE.Color().fromBufferAttribute(colors, hit.face.a).multiply(material.color) : material.color;
    const surface = material.map?.userData.surface as SurfaceTexture | undefined;
    const color = surface && hit.uv ? surfaceColor(surface, hit.uv.x, hit.uv.y, tint) : tint;
    // getHexString переводит цвет обратно в sRGB — ровно ту строку, что записана в карте.
    return `#${color.getHexString()}`;
  }
}
