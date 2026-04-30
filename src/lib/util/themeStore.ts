import type {
  ColorPresetId,
  MermaidBuiltinTheme,
  SavedTheme,
  ThemeState,
  ThemeVariables
} from '$/types';
import type { MermaidConfig } from 'mermaid';
import {
  colorCategories,
  createSavedTheme,
  defaultThemeState,
  getPresetById,
  loadThemeState,
  saveThemeState,
  updateMermaidConfigWithTheme,
  updateSavedTheme
} from './themeManager';
import { checkContrast, normalizeHex } from './colorUtils';
import { debounce } from 'lodash-es';
import { derived, get, writable, type Readable } from 'svelte/store';
import { inputStateStore, updateCodeStore, updateConfig } from './state';
import { toast } from 'svelte-sonner';

const initialState = loadThemeState();

export const themeStore = writable<ThemeState>(initialState);

const persistThemeState = debounce((state: ThemeState) => {
  saveThemeState(state);
}, 500);

themeStore.subscribe((state) => {
  persistThemeState(state);
});

export const applyPreset = (presetId: ColorPresetId): void => {
  const preset = getPresetById(presetId);
  if (!preset) return;

  themeStore.update((state) => ({
    ...state,
    activePreset: presetId,
    themeVariables: { ...preset.themeVariables },
    activeSavedThemeId: null
  }));

  applyToMermaidConfig();
  toast.success(`已应用预设: ${preset.name}`);
};

export const setBuiltinTheme = (theme: MermaidBuiltinTheme): void => {
  themeStore.update((state) => ({
    ...state,
    activeMermaidTheme: theme,
    activePreset: null,
    activeSavedThemeId: null
  }));
  applyToMermaidConfig();
};

export const setThemeVariable = (
  key: keyof ThemeVariables,
  value: string | boolean | undefined
): void => {
  themeStore.update((state) => {
    const newVariables = { ...state.themeVariables };

    if (value === undefined) {
      delete newVariables[key];
    } else {
      if (typeof value === 'string' && key !== 'fontFamily' && key !== 'fontSize') {
        newVariables[key] = normalizeHex(value);
      } else {
        newVariables[key] = value;
      }
    }

    return {
      ...state,
      themeVariables: newVariables,
      activePreset: null,
      activeSavedThemeId: null
    };
  });
  applyToMermaidConfig();
};

export const setBackgroundColor = (color: string): void => {
  themeStore.update((state) => ({
    ...state,
    backgroundColor: normalizeHex(color)
  }));
  applyBackgroundToView();
};

const applyBackgroundToView = (): void => {
  const state = get(themeStore);
  const viewElement = document.getElementById('view');
  if (viewElement) {
    viewElement.style.backgroundColor = state.backgroundColor;
  }
};

export const setMultipleThemeVariables = (variables: ThemeVariables): void => {
  themeStore.update((state) => ({
    ...state,
    themeVariables: { ...state.themeVariables, ...variables },
    activePreset: null,
    activeSavedThemeId: null
  }));
  applyToMermaidConfig();
};

export const applyToMermaidConfig = (): void => {
  const state = get(themeStore);
  const inputState = get(inputStateStore);

  const newConfig = updateMermaidConfigWithTheme(
    inputState.mermaid,
    state.activeMermaidTheme,
    state.themeVariables
  );

  updateConfig(newConfig);
};

export const saveCurrentTheme = (name: string): void => {
  const state = get(themeStore);
  const savedTheme = createSavedTheme(
    name,
    state.activeMermaidTheme,
    state.themeVariables,
    state.backgroundColor
  );

  themeStore.update((s) => ({
    ...s,
    savedThemes: [...s.savedThemes, savedTheme],
    activeSavedThemeId: savedTheme.id
  }));

  toast.success(`主题已保存: ${name}`);
};

export const loadSavedTheme = (id: string): void => {
  const state = get(themeStore);
  const savedTheme = state.savedThemes.find((t) => t.id === id);

  if (!savedTheme) {
    toast.error('未找到该主题');
    return;
  }

  themeStore.update((s) => ({
    ...s,
    activeMermaidTheme: savedTheme.mermaidTheme,
    themeVariables: { ...savedTheme.themeVariables },
    backgroundColor: savedTheme.backgroundColor,
    activeSavedThemeId: id,
    activePreset: null
  }));

  applyToMermaidConfig();
  applyBackgroundToView();
  toast.success(`已加载主题: ${savedTheme.name}`);
};

export const deleteSavedTheme = (id: string): void => {
  const state = get(themeStore);
  const themeToDelete = state.savedThemes.find((t) => t.id === id);

  themeStore.update((s) => ({
    ...s,
    savedThemes: s.savedThemes.filter((t) => t.id !== id),
    activeSavedThemeId: s.activeSavedThemeId === id ? null : s.activeSavedThemeId
  }));

  if (themeToDelete) {
    toast.success(`已删除主题: ${themeToDelete.name}`);
  }
};

export const updateSavedThemeName = (id: string, newName: string): void => {
  themeStore.update((s) => ({
    ...s,
    savedThemes: s.savedThemes.map((t) =>
      t.id === id ? updateSavedTheme(t, { name: newName }) : t
    )
  }));
};

export const resetToDefaults = (): void => {
  themeStore.set({
    ...defaultThemeState,
    savedThemes: get(themeStore).savedThemes
  });
  applyToMermaidConfig();
  applyBackgroundToView();
  toast.success('已重置为默认主题');
};

export const getColorContrastInfo = derived(themeStore, (state) => {
  const contrastMap: Map<string, { ratio: number; level: string; isAccessible: boolean }> = new Map();

  for (const item of colorCategories) {
    if (item.contrastWith) {
      const foreground = state.themeVariables[item.key] as string | undefined;
      const background = state.themeVariables[item.contrastWith] as string | undefined;

      if (foreground && background) {
        const result = checkContrast(foreground, background);
        contrastMap.set(item.key, {
          ratio: result.ratio,
          level: result.level,
          isAccessible: result.isAccessible
        });
      }
    }
  }

  return contrastMap;
});

export const fixContrastIssues = (): void => {
  // 对比度一键修复需要更复杂的实现
  // 这里先做一个简单的实现
  toast.info('对比度修复功能需要更多颜色调整逻辑');
};

export const themeStoreWithPreview: Readable<ThemeState> = themeStore;

export const initThemeFromState = (): void => {
  const inputState = get(inputStateStore);

  if (inputState.themeBackground) {
    themeStore.update((state) => ({
      ...state,
      backgroundColor: inputState.themeBackground!
    }));
  }

  try {
    const mermaidConfig = JSON.parse(inputState.mermaid) as MermaidConfig;

    if (mermaidConfig.theme && typeof mermaidConfig.theme === 'string') {
      const validThemes: MermaidBuiltinTheme[] = ['default', 'dark', 'forest', 'neutral', 'base'];
      if (validThemes.includes(mermaidConfig.theme as MermaidBuiltinTheme)) {
        themeStore.update((state) => ({
          ...state,
          activeMermaidTheme: mermaidConfig.theme as MermaidBuiltinTheme
        }));
      }
    }

    if (mermaidConfig.themeVariables && typeof mermaidConfig.themeVariables === 'object') {
      themeStore.update((state) => ({
        ...state,
        themeVariables: { ...mermaidConfig.themeVariables }
      }));
    }
  } catch {
    // 忽略解析错误
  }

  applyBackgroundToView();
};

export const initThemeBackground = (): void => {
  initThemeFromState();
};

const syncBackgroundToState = debounce((bgColor: string) => {
  updateCodeStore({ themeBackground: bgColor });
}, 250);

themeStore.subscribe((state) => {
  syncBackgroundToState(state.backgroundColor);
});
