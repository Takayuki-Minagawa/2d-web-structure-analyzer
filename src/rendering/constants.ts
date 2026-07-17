import * as THREE from 'three';

export const CAMERA_FOV = 45;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 100000;

export const THEME_COLORS = {
  light: {
    background: 0xf0f0f0,
    gridCenter: 0xcccccc,
    gridLine: 0xeeeeee,
    labelNode: '#0044aa',
    labelMember: '#aa4400',
    labelDiagram: '#9d1c1c',
    labelBackground: 'rgba(255, 255, 255, 0.82)',
  },
  dark: {
    background: 0x252535,
    gridCenter: 0x3a3a4a,
    gridLine: 0x333344,
    labelNode: '#66aaff',
    labelMember: '#ffaa66',
    labelDiagram: '#ffd166',
    labelBackground: 'rgba(20, 20, 30, 0.82)',
  },
} as const;

export const NODE_POINT_SIZE = 8;
export const NODE_COLOR = new THREE.Color(0, 0.3, 0.8);
export const NODE_COLOR_SELECTED = new THREE.Color(1, 0, 0);
export const NODE_COLOR_HOVER = new THREE.Color(1, 0.65, 0);
export const NODE_COLOR_PENDING = new THREE.Color(0.95, 0.1, 0.85);
export const MEMBER_COLOR = new THREE.Color(0, 0.3, 0.8);
export const MEMBER_COLOR_SELECTED = new THREE.Color(1, 0, 0);
export const MEMBER_COLOR_HOVER = new THREE.Color(1, 0.65, 0);
export const DEFORM_COLOR = new THREE.Color(0.0, 0.8, 0.3);
export const DIAGRAM_COLOR_POS = new THREE.Color(1, 0.2, 0.2);
export const DIAGRAM_COLOR_NEG = new THREE.Color(0.2, 0.4, 1);
export const SUPPORT_COLOR = 0x00aa00;
export const SUPPORT_OPACITY = 0.6;
export const SUPPORT_SIZE = 8;

export const LABEL_FONT = '11px sans-serif';
export const CLICK_DRAG_THRESHOLD = 4;
export const NODE_PICK_RADIUS = 16;
export const MEMBER_PICK_RADIUS = 12;

export type ThemeColors = typeof THEME_COLORS.dark | typeof THEME_COLORS.light;
