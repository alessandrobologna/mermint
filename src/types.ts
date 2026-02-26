export interface IconPackSource {
  name?: string;
  source: string;
}

export const ROUGH_FILL_STYLES = [
  'hachure',
  'solid',
  'zigzag',
  'cross-hatch',
  'dots',
  'dashed',
  'zigzag-line'
] as const;

export type RoughFillStyle = (typeof ROUGH_FILL_STYLES)[number];

export interface RoughOptions {
  roughness?: number;
  fillWeight?: number;
  fillStyle?: RoughFillStyle;
  hachureGap?: number;
  hachureAngle?: number;
  bowing?: number;
  strokeWidth?: number;
  seed?: number;
  disableMultiStroke?: boolean;
  disableMultiStrokeFill?: boolean;
  preserveVertices?: boolean;
}

export interface RenderOptions extends RoughOptions {
  input: string;
  output: string;
  baseUrl: string;
  theme: string;
  rough: boolean;
  look?: string;
  fontFamily?: string;
  fontSize?: number;
  iconPacks?: IconPackSource[];
  embedFontPath?: string;
  embedFontFamily?: string;
  embedExcalifont?: boolean;
  transparentBg: boolean;
  settleMs: number;
  timeoutMs: number;
  headed: boolean;
}

export interface RenderResult {
  outputPath: string;
  editUrl: string;
  hash: string;
}

export interface UiOptions {
  quiet: boolean;
  spinner: boolean;
  verbose: boolean;
}

export interface StepHandle {
  succeed(message?: string): void;
  fail(message?: string): void;
}

export interface Ui {
  header(title: string, subtitle?: string): void;
  step(message: string, detail?: string): StepHandle;
  info(message: string, detail?: string): void;
  warn(message: string, detail?: string): void;
  error(message: string, detail?: string): void;
  success(message: string, detail?: string): void;
  detail(message: string): void;
}
