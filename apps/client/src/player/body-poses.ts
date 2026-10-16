import type { BodyZone, PoseId } from '@mecha/shared';
import { CHARACTER_PARTS, HIP_Y } from '../skin/character-parts';

export type JointAngles = readonly [number, number, number];

/**
 * Поза тела: повороты суставов (рад, порядок осей XYZ, относительно родителя) и положение таза.
 * Не указанный сустав — 0, то есть как в позе покоя.
 *
 * Оси сустава (в позе покоя): X — сгиб вперёд-назад (минус — конечность вперёд),
 * Y — поворот вокруг своей оси, Z — в сторону (для левой части минус — наружу).
 */
export interface BodyPose {
  hipY: number;
  /** Сдвиг таза вперёд/назад — чтобы тело оставалось над точкой опоры. */
  hipZ?: number;
  /** Наклон всего тела вокруг таза: π/2 — лёг лицом вниз (голова вперёд). */
  hipPitch?: number;
  joints: Partial<Record<BodyZone, JointAngles>>;
}

type LimbName = 'upperArm' | 'forearm' | 'hand' | 'thigh' | 'shin' | 'foot';

/**
 * Пара симметричных суставов: левой части — как задано, правой — зеркально.
 * Зеркало по X сохраняет поворот вокруг X (сгиб вперёд-назад), а повороты вокруг Y и Z меняют знак.
 */
export function both(part: LimbName, x: number, y = 0, z = 0): Partial<Record<BodyZone, JointAngles>> {
  return { [`${part}Left`]: [x, y, z], [`${part}Right`]: [x, -y, -z] };
}

const THIGH = CHARACTER_PARTS.thighLeft.joint.y - CHARACTER_PARTS.shinLeft.joint.y; // длина бедра
const SHIN = -CHARACTER_PARTS.footLeft.joint.y; // длина голени
const ANKLE = HIP_Y - THIGH - SHIN; // высота голеностопа над землёй
const HALF_PI = Math.PI / 2;

/**
 * Высота таза, при которой стопы стоят на полу: бедро и голень — звенья цепочки,
 * их вертикальные проекции складываются (cos угла от вертикали).
 */
function hipOnFeet(thighX: number, shinX: number): number {
  return THIGH * Math.cos(thighX) + SHIN * Math.cos(thighX + shinX) + ANKLE;
}

/** Стоит: руки чуть от тела, локти мягко согнуты — не «солдатик». */
export const STAND: BodyPose = {
  hipY: HIP_Y,
  joints: { ...both('upperArm', 0, 0, -0.08), ...both('forearm', -0.15) },
};

/**
 * Присед — «крадущийся»: глубоко на корточках, таз назад, корпус вперёд, голова поднята (смотрит вперёд),
 * руки согнуты перед собой. Углы подобраны так, чтобы макушка влезла в хитбокс приседа
 * PLAYER.crouchHeight, а голова не торчала далеко вперёд из цилиндра физики — это проверяет тест.
 * Стопа доворачивается так, чтобы стоять на полу плоско: сумма углов бедра, голени и стопы = 0.
 */
const CROUCH_THIGH = -1.55;
const CROUCH_SHIN = 2.45;
export const CROUCH: BodyPose = {
  hipY: hipOnFeet(CROUCH_THIGH, CROUCH_SHIN),
  hipZ: -0.28,
  joints: {
    torso: [1.15, 0, 0],
    head: [-0.7, 0, 0],
    ...both('thigh', CROUCH_THIGH, 0, -0.12),
    ...both('shin', CROUCH_SHIN),
    ...both('foot', -(CROUCH_THIGH + CROUCH_SHIN)),
    ...both('upperArm', -1.6, 0, -0.18),
    ...both('forearm', -1.0),
  },
};

/** Прыжок: колени поджаты, руки вверх. */
export const JUMP: BodyPose = {
  hipY: HIP_Y,
  joints: {
    ...both('thigh', -0.9, 0, -0.06),
    ...both('shin', 1.35),
    ...both('foot', 0.25),
    ...both('upperArm', -2.5, 0, -0.3),
    ...both('forearm', -0.35),
  },
};

/**
 * На стене: руки над головой цепляются, колени согнуты, корпус прижат к стене.
 * Ползание руками и ногами по очереди добавляет анимация (PlayerModel.addClimb).
 */
export const CLIMB: BodyPose = {
  hipY: HIP_Y,
  hipZ: 0.05,
  joints: {
    torso: [0.08, 0, 0],
    head: [-0.25, 0, 0],
    ...both('upperArm', -2.6, 0, -0.25),
    ...both('forearm', -0.5),
    ...both('thigh', -0.7, 0, -0.12),
    ...both('shin', 1.1),
    ...both('foot', -0.3),
  },
};

/** Манекен для Мастерской: руки и ноги разведены — кисть достаёт до боков торса и внутренней стороны ног. */
export const STUDIO: BodyPose = {
  hipY: HIP_Y,
  joints: { ...both('upperArm', 0, 0, -0.38), ...both('thigh', 0, 0, -0.07), ...both('foot', 0, 0, 0.07) },
};

/**
 * Позы для пряток. Ориентиры — как лежат и сидят живые люди: тело опирается на пол, а не висит над ним;
 * конечности чуть несимметричны и согнуты (прямые как палка выглядят «деревянно»).
 * Высоты сверены с POSE_RULES в shared тестом модели.
 */
export const POSE_LIBRARY: Record<PoseId, BodyPose> = {
  /**
   * Пластом, лицом вниз. Тело повёрнуто на 90° вокруг таза; таз на высоте полутолщины торса — грудь на полу.
   * Голова повёрнута щекой в сторону, руки вдоль тела, носки «смотрят» назад (подошвы вверх).
   */
  flat: {
    hipY: CHARACTER_PARTS.torso.size.d / 2,
    hipZ: -0.25,
    hipPitch: HALF_PI,
    joints: {
      head: [-0.35, 0.9, 0],
      ...both('upperArm', 0, 0, -0.18),
      ...both('forearm', 0, 0, -0.1),
      upperArmRight: [0, 0, 0.32],
      ...both('thigh', 0, 0, -0.07),
      thighRight: [0, 0, 0.16],
      ...both('foot', HALF_PI),
    },
  },
  /**
   * На четвереньках, с упором на локти (как кошка, крадущаяся под мебелью): колени и предплечья на полу,
   * бёдра вертикально, плечи чуть ниже таза, голова приподнята и смотрит вперёд.
   * На ладонях было бы выше на полметра — а смысл позы в том, чтобы пролезть под стол и кровать.
   */
  crawl: {
    hipY: THIGH + 0.09,
    hipZ: -0.15,
    hipPitch: HALF_PI,
    joints: {
      torso: [0.12, 0, 0],
      head: [-HALF_PI + 0.05, 0, 0],
      ...both('upperArm', -HALF_PI - 0.12, 0, -0.1),
      ...both('forearm', -HALF_PI + 0.1, 0, 0.1),
      ...both('hand', 0.1),
      ...both('thigh', -HALF_PI, 0, -0.05),
      ...both('shin', HALF_PI),
      ...both('foot', HALF_PI),
    },
  },
  /** Клубок: сидит на полу, колени к груди, руки обхватили голени, голова опущена на колени. */
  ball: {
    hipY: 0.13,
    hipZ: -0.08,
    joints: {
      torso: [0.55, 0, 0],
      head: [0.45, 0, 0],
      ...both('thigh', -2.3, 0, -0.08),
      ...both('shin', 1.95),
      ...both('foot', 0.35),
      ...both('upperArm', -0.75, 0, 0.12),
      ...both('forearm', -1.25, 0.2, 0.25),
    },
  },
  /** Руки вверх «буквой Y», голова чуть запрокинута, корпус тянется. */
  handsUp: {
    hipY: HIP_Y,
    joints: {
      torso: [-0.05, 0, 0],
      head: [-0.2, 0, 0],
      ...both('upperArm', -2.9, 0, -0.32),
      ...both('forearm', -0.12),
      ...both('hand', 0, 0, 0.1),
    },
  },
  /** Сидит на полу, ноги вперёд, откинулся на руки за спиной. Одна нога чуть согнута — живее. */
  sit: {
    hipY: 0.12,
    joints: {
      torso: [-0.2, 0, 0],
      head: [0.12, 0.15, 0],
      ...both('thigh', -HALF_PI + 0.05, 0, -0.1),
      ...both('foot', -0.1),
      thighRight: [-1.9, 0, 0.12],
      shinRight: [0.75, 0, 0],
      footRight: [-0.4, 0, 0],
      ...both('upperArm', 0.5, 0, -0.25),
      ...both('forearm', 0.05),
      ...both('hand', -0.6),
    },
  },
  /**
   * Статуя «как в парке»: правая рука поднята к небу, левая отведена в сторону, правое колено поднято
   * (голень висит под коленом — поза цапли), голова чуть набок.
   */
  statue: {
    hipY: HIP_Y,
    joints: {
      torso: [-0.04, 0, -0.05],
      head: [-0.15, 0, 0.18],
      upperArmRight: [-2.75, 0, 0.3],
      forearmRight: [-0.25, 0, 0],
      upperArmLeft: [0, 0, -1.3],
      forearmLeft: [0, 0, -0.35],
      thighRight: [-1.35, 0, 0.08],
      shinRight: [1.3, 0, 0],
      footRight: [0.25, 0, 0],
      thighLeft: [0, 0, 0.03],
    },
  },
};
