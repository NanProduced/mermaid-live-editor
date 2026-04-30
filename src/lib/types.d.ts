import type { Component } from 'svelte';
import type { HTMLInputTypeAttribute } from 'svelte/elements';
import 'unplugin-icons/types/svelte';

export interface MarkerData {
  severity: number;
  message: string;
  source?: string;
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

export interface TabEvents {
  select: Tab;
}

export interface Tab {
  id: string;
  title: string;
  icon: Component;
}

export interface State {
  code: string;
  mermaid: string;
  updateDiagram: boolean;
  rough: boolean;
  // All new options must be optional, as users would have old states saved
  renderCount?: number;
  panZoom?: boolean;
  grid?: boolean;
  editorMode?: EditorMode;
  pan?: { x: number; y: number };
  zoom?: number;
  loader?: LoaderConfig;
  themeBackground?: string;
}

export interface ValidatedState extends State {
  editorMode: EditorMode;
  diagramType?: string;
  error?: Error;
  errorMarkers: MarkerData[];
  serialized: string;
}

export interface GistLoaderConfig {
  url: string;
}

export interface LoadingState {
  loading: boolean;
  message?: string;
}
export interface FileLoaderConfig {
  codeURL: string;
  configURL?: string;
}
export type LoaderConfig =
  | {
      type: 'gist';
      config: GistLoaderConfig;
    }
  | {
      type: 'files';
      config: FileLoaderConfig;
    };
export type HistoryType = 'auto' | 'manual' | 'loader';
export type HistoryEntry = { id: string; state: State; time: number; url?: string } & (
  | {
      type: 'loader';
      name: string;
    }
  | {
      type: HistoryType;
      name?: string;
    }
);

export type DocumentationConfig = Record<
  string,
  {
    code: string;
    config?: string;
  }
>;

export type EditorMode = 'code' | 'config';

export type Loader = (url: string) => Promise<State>;
export type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;

export interface ErrorHash {
  loc: {
    first_line: number;
    last_line: number;
    first_column: number;
    last_column: number;
  };
}

export type InputType = Exclude<HTMLInputTypeAttribute, 'file'>;

export interface EditorProps {
  onUpdate: (text: string) => void;
}

export type MermaidBuiltinTheme = 'default' | 'dark' | 'forest' | 'neutral' | 'base';

export type ColorPresetId = 'default' | 'vibrant' | 'colorblind' | 'monochrome';

export interface ThemeVariables {
  darkMode?: boolean;
  background?: string;
  fontFamily?: string;
  fontSize?: string;
  primaryColor?: string;
  primaryTextColor?: string;
  primaryBorderColor?: string;
  secondaryColor?: string;
  secondaryTextColor?: string;
  secondaryBorderColor?: string;
  tertiaryColor?: string;
  tertiaryTextColor?: string;
  tertiaryBorderColor?: string;
  nodeBorder?: string;
  clusterBkg?: string;
  clusterBorder?: string;
  defaultLinkColor?: string;
  titleColor?: string;
  textColor?: string;
  mainBkg?: string;
  nodeBkg?: string;
  lineColor?: string;
  arrowMarkerColor?: string;
  actorBkg?: string;
  actorBorder?: string;
  actorTextColor?: string;
  signalColor?: string;
  signalTextColor?: string;
  noteBkgColor?: string;
  noteTextColor?: string;
  noteBorderColor?: string;
  sectionBkgColor?: string;
  sectionBkgColor2?: string;
}

export interface ColorPreset {
  id: ColorPresetId;
  name: string;
  description: string;
  themeVariables: ThemeVariables;
  isDark?: boolean;
}

export interface SavedTheme {
  id: string;
  name: string;
  mermaidTheme: MermaidBuiltinTheme;
  themeVariables: ThemeVariables;
  backgroundColor: string;
  createdAt: number;
  updatedAt: number;
}

export interface ThemeState {
  activeMermaidTheme: MermaidBuiltinTheme;
  activePreset: ColorPresetId | null;
  themeVariables: ThemeVariables;
  backgroundColor: string;
  savedThemes: SavedTheme[];
  activeSavedThemeId: string | null;
}

export interface ColorContrastInfo {
  foreground: string;
  background: string;
  ratio: number;
  level: 'AA' | 'AAA' | 'fail';
  isAccessible: boolean;
}

export interface ThemeEditorColor {
  key: keyof ThemeVariables;
  label: string;
  value: string;
  contrastWith?: keyof ThemeVariables;
  category: 'primary' | 'secondary' | 'tertiary' | 'text' | 'lines' | 'other';
}
