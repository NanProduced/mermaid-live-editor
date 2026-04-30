import type {
  ColorPreset,
  ColorPresetId,
  MermaidBuiltinTheme,
  SavedTheme,
  ThemeState,
  ThemeVariables
} from '$/types';
import { extractColorsFromImage, normalizeHex } from './colorUtils';
import { formatJSON } from './util';
import { v4 as uuidv4 } from 'uuid';
import { fromBase64, toBase64 } from 'js-base64';
import { deflate, inflate } from 'pako';

const BUILTIN_THEMES: { id: MermaidBuiltinTheme; name: string; description: string }[] = [
  { id: 'default', name: 'Default', description: 'Mermaid默认主题' },
  { id: 'dark', name: 'Dark', description: '深色主题' },
  { id: 'forest', name: 'Forest', description: '绿色森林主题' },
  { id: 'neutral', name: 'Neutral', description: '中性黑白主题，适合打印' },
  { id: 'base', name: 'Base', description: '可自定义的基础主题' }
];

const COLOR_PRESETS: ColorPreset[] = [
  {
    id: 'default',
    name: '默认',
    description: 'Mermaid默认配色方案',
    isDark: false,
    themeVariables: {
      primaryColor: '#fff4dd',
      secondaryColor: '#ffcc88',
      tertiaryColor: '#99eeff',
      lineColor: '#333333',
      textColor: '#333333',
      primaryTextColor: '#333333',
      secondaryTextColor: '#333333',
      tertiaryTextColor: '#333333'
    }
  },
  {
    id: 'vibrant',
    name: '鲜艳',
    description: '高饱和度鲜艳配色',
    isDark: false,
    themeVariables: {
      primaryColor: '#ff6b6b',
      secondaryColor: '#4ecdc4',
      tertiaryColor: '#ffe66d',
      lineColor: '#2d3436',
      textColor: '#ffffff',
      primaryTextColor: '#ffffff',
      secondaryTextColor: '#2d3436',
      tertiaryTextColor: '#2d3436'
    }
  },
  {
    id: 'colorblind',
    name: '色盲安全',
    description: 'WCAG兼容的色盲友好配色',
    isDark: false,
    themeVariables: {
      primaryColor: '#377eb8',
      secondaryColor: '#4daf4a',
      tertiaryColor: '#984ea3',
      lineColor: '#e41a1c',
      textColor: '#ffffff',
      primaryTextColor: '#ffffff',
      secondaryTextColor: '#ffffff',
      tertiaryTextColor: '#ffffff'
    }
  },
  {
    id: 'monochrome',
    name: '黑白',
    description: '极简黑白主题',
    isDark: false,
    themeVariables: {
      primaryColor: '#f8f9fa',
      secondaryColor: '#e9ecef',
      tertiaryColor: '#dee2e6',
      lineColor: '#212529',
      textColor: '#212529',
      primaryTextColor: '#212529',
      secondaryTextColor: '#212529',
      tertiaryTextColor: '#212529'
    }
  }
];

const DEFAULT_BACKGROUND_LIGHT = '#ffffff';
const DEFAULT_BACKGROUND_DARK = '#1e1e1e';

const defaultThemeState: ThemeState = {
  activeMermaidTheme: 'default',
  activePreset: null,
  themeVariables: {},
  backgroundColor: DEFAULT_BACKGROUND_LIGHT,
  savedThemes: [],
  activeSavedThemeId: null
};

const STORAGE_KEY = 'mermaid-live-editor-themes';
const SAVED_THEMES_STORAGE_KEY = 'mermaid-saved-themes';

const loadSavedThemes = (): SavedTheme[] => {
  try {
    const stored = localStorage.getItem(SAVED_THEMES_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as SavedTheme[];
    }
  } catch {
    console.error('Failed to load saved themes');
  }
  return [];
};

const saveSavedThemes = (themes: SavedTheme[]): void => {
  try {
    localStorage.setItem(SAVED_THEMES_STORAGE_KEY, JSON.stringify(themes));
  } catch {
    console.error('Failed to save themes');
  }
};

const createSavedTheme = (
  name: string,
  mermaidTheme: MermaidBuiltinTheme,
  themeVariables: ThemeVariables,
  backgroundColor: string
): SavedTheme => {
  const now = Date.now();
  return {
    id: uuidv4(),
    name,
    mermaidTheme,
    themeVariables: { ...themeVariables },
    backgroundColor,
    createdAt: now,
    updatedAt: now
  };
};

const updateSavedTheme = (theme: SavedTheme, updates: Partial<SavedTheme>): SavedTheme => {
  return {
    ...theme,
    ...updates,
    updatedAt: Date.now()
  };
};

const loadThemeState = (): ThemeState => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<ThemeState>;
      return {
        ...defaultThemeState,
        ...parsed,
        savedThemes: loadSavedThemes()
      };
    }
  } catch {
    console.error('Failed to load theme state');
  }
  return {
    ...defaultThemeState,
    savedThemes: loadSavedThemes()
  };
};

const saveThemeState = (state: ThemeState): void => {
  try {
    const { savedThemes, ...rest } = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
    saveSavedThemes(savedThemes);
  } catch {
    console.error('Failed to save theme state');
  }
};

const getPresetById = (id: ColorPresetId): ColorPreset | undefined => {
  return COLOR_PRESETS.find((p) => p.id === id);
};

const getBuiltinThemeById = (id: string): (typeof BUILTIN_THEMES)[0] | undefined => {
  return BUILTIN_THEMES.find((t) => t.id === id);
};

const mergeThemeVariables = (
  base: ThemeVariables,
  override: ThemeVariables
): ThemeVariables => {
  const result: ThemeVariables = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value !== undefined && value !== null) {
      (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
};

const generateThemeFromColors = (colors: string[]): ThemeVariables => {
  if (colors.length === 0) {
    return {};
  }

  const sorted = [...colors].sort((a, b) => {
    const rgbA = a.match(/[a-f\d]{2}/gi);
    const rgbB = b.match(/[a-f\d]{2}/gi);
    if (!rgbA || !rgbB) return 0;
    const brightnessA = parseInt(rgbA[0], 16) + parseInt(rgbA[1], 16) + parseInt(rgbA[2], 16);
    const brightnessB = parseInt(rgbB[0], 16) + parseInt(rgbB[1], 16) + parseInt(rgbB[2], 16);
    return brightnessA - brightnessB;
  });

  const themeVars: ThemeVariables = {};

  if (sorted.length >= 1) {
    themeVars.primaryColor = normalizeHex(sorted[0]);
  }
  if (sorted.length >= 2) {
    themeVars.secondaryColor = normalizeHex(sorted[1]);
  }
  if (sorted.length >= 3) {
    themeVars.tertiaryColor = normalizeHex(sorted[2]);
  }
  if (sorted.length >= 4) {
    themeVars.lineColor = normalizeHex(sorted[3]);
  }

  const hasDarkColors = sorted.some((c) => {
    const rgb = c.match(/[a-f\d]{2}/gi);
    if (!rgb) return false;
    const brightness = (parseInt(rgb[0], 16) + parseInt(rgb[1], 16) + parseInt(rgb[2], 16)) / 3;
    return brightness < 128;
  });

  themeVars.primaryTextColor = hasDarkColors ? '#ffffff' : '#333333';
  themeVars.secondaryTextColor = hasDarkColors ? '#ffffff' : '#333333';
  themeVars.tertiaryTextColor = hasDarkColors ? '#ffffff' : '#333333';

  return themeVars;
};

const extractThemeFromImage = async (imageUrl: string): Promise<ThemeVariables | null> => {
  const colors = await extractColorsFromImage(imageUrl, 5);
  if (!colors || colors.length === 0) {
    return null;
  }
  return generateThemeFromColors(colors);
};

const exportTheme = (
  name: string,
  mermaidTheme: MermaidBuiltinTheme,
  themeVariables: ThemeVariables,
  backgroundColor: string
): string => {
  const exportData = {
    version: 1,
    name,
    mermaidTheme,
    themeVariables,
    backgroundColor,
    exportedAt: Date.now()
  };
  return formatJSON(exportData);
};

const parseImportedTheme = (jsonStr: string): {
  name: string;
  mermaidTheme: MermaidBuiltinTheme;
  themeVariables: ThemeVariables;
  backgroundColor: string;
} | null => {
  try {
    const data = JSON.parse(jsonStr);
    if (data.version !== 1) {
      console.warn('Unknown theme version');
    }
    return {
      name: data.name || 'Imported Theme',
      mermaidTheme: (BUILTIN_THEMES.find((t) => t.id === data.mermaidTheme)?.id ||
        'base') as MermaidBuiltinTheme,
      themeVariables: data.themeVariables || {},
      backgroundColor: data.backgroundColor || DEFAULT_BACKGROUND_LIGHT
    };
  } catch {
    console.error('Failed to parse imported theme');
    return null;
  }
};

const URL_THEME_PARAM = 't';

const encodeThemeForURL = (
  mermaidTheme: MermaidBuiltinTheme,
  themeVariables: ThemeVariables,
  backgroundColor: string
): string => {
  const data = {
    m: mermaidTheme,
    v: themeVariables,
    b: backgroundColor
  };
  const jsonStr = JSON.stringify(data);
  const compressed = deflate(new TextEncoder().encode(jsonStr));
  return toBase64(compressed, true);
};

const decodeThemeFromURL = (encoded: string): {
  mermaidTheme: MermaidBuiltinTheme;
  themeVariables: ThemeVariables;
  backgroundColor: string;
} | null => {
  try {
    const compressed = new Uint8Array(
      atob(encoded.replace(/-/g, '+').replace(/_/g, '/'))
        .split('')
        .map((c) => c.charCodeAt(0))
    );
    const decompressed = inflate(compressed, { to: 'string' });
    const data = JSON.parse(decompressed);

    return {
      mermaidTheme: (BUILTIN_THEMES.find((t) => t.id === data.m)?.id ||
        'default') as MermaidBuiltinTheme,
      themeVariables: data.v || {},
      backgroundColor: data.b || DEFAULT_BACKGROUND_LIGHT
    };
  } catch {
    console.error('Failed to decode theme from URL');
    return null;
  }
};

const getURLThemeParam = (): string | null => {
  try {
    const hash = window.location.hash.slice(1);
    const url = new URL(`http://dummy?${hash}`);
    return url.searchParams.get(URL_THEME_PARAM);
  } catch {
    return null;
  }
};

const updateMermaidConfigWithTheme = (
  existingConfig: string,
  mermaidTheme: MermaidBuiltinTheme,
  themeVariables: ThemeVariables
): string => {
  try {
    const config = JSON.parse(existingConfig) as Record<string, unknown>;
    config.theme = mermaidTheme;

    const hasCustomVars = Object.keys(themeVariables).length > 0;
    if (hasCustomVars) {
      config.themeVariables = { ...themeVariables };
    } else {
      delete config.themeVariables;
    }

    return formatJSON(config);
  } catch {
    return formatJSON({
      theme: mermaidTheme,
      ...(Object.keys(themeVariables).length > 0 ? { themeVariables } : {})
    });
  }
};

const colorCategories: {
  key: keyof ThemeVariables;
  label: string;
  category: 'primary' | 'secondary' | 'tertiary' | 'text' | 'lines' | 'other';
  contrastWith?: keyof ThemeVariables;
}[] = [
  { key: 'primaryColor', label: '主背景色', category: 'primary', contrastWith: 'primaryTextColor' },
  { key: 'primaryTextColor', label: '主文字色', category: 'text', contrastWith: 'primaryColor' },
  { key: 'primaryBorderColor', label: '主边框色', category: 'primary' },
  { key: 'secondaryColor', label: '次背景色', category: 'secondary', contrastWith: 'secondaryTextColor' },
  { key: 'secondaryTextColor', label: '次文字色', category: 'text', contrastWith: 'secondaryColor' },
  { key: 'secondaryBorderColor', label: '次边框色', category: 'secondary' },
  { key: 'tertiaryColor', label: '第三背景色', category: 'tertiary', contrastWith: 'tertiaryTextColor' },
  { key: 'tertiaryTextColor', label: '第三文字色', category: 'text', contrastWith: 'tertiaryColor' },
  { key: 'tertiaryBorderColor', label: '第三边框色', category: 'tertiary' },
  { key: 'textColor', label: '全局文字色', category: 'text' },
  { key: 'lineColor', label: '连接线色', category: 'lines' },
  { key: 'arrowMarkerColor', label: '箭头色', category: 'lines' },
  { key: 'nodeBorder', label: '节点边框', category: 'other' },
  { key: 'clusterBkg', label: '子图背景', category: 'other' },
  { key: 'clusterBorder', label: '子图边框', category: 'other' },
  { key: 'titleColor', label: '标题色', category: 'text' }
];

export {
  BUILTIN_THEMES,
  COLOR_PRESETS,
  DEFAULT_BACKGROUND_LIGHT,
  DEFAULT_BACKGROUND_DARK,
  defaultThemeState,
  loadThemeState,
  saveThemeState,
  loadSavedThemes,
  saveSavedThemes,
  createSavedTheme,
  updateSavedTheme,
  getPresetById,
  getBuiltinThemeById,
  mergeThemeVariables,
  generateThemeFromColors,
  extractThemeFromImage,
  exportTheme,
  parseImportedTheme,
  URL_THEME_PARAM,
  encodeThemeForURL,
  decodeThemeFromURL,
  getURLThemeParam,
  updateMermaidConfigWithTheme,
  colorCategories
};
