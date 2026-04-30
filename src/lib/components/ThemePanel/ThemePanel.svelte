<script lang="ts">
  import type { ColorPresetId, MermaidBuiltinTheme, ThemeVariables } from '$/types';
  import Card from '$/components/Card/Card.svelte';
  import { Button } from '$/components/ui/button';
  import { Input } from '$/components/ui/input';
  import { Separator } from '$/components/ui/separator';
  import * as ToggleGroup from '$/components/ui/toggle-group';
  import * as Dialog from '$/components/ui/dialog';
  import {
    BUILTIN_THEMES,
    COLOR_PRESETS,
    colorCategories,
    exportTheme,
    parseImportedTheme
  } from '$lib/util/themeManager';
  import {
    applyPreset,
    deleteSavedTheme,
    getColorContrastInfo,
    loadSavedTheme,
    resetToDefaults,
    saveCurrentTheme,
    setBackgroundColor,
    setBuiltinTheme,
    setMultipleThemeVariables,
    setThemeVariable,
    themeStore,
    updateSavedThemeName
  } from '$lib/util/themeStore';
  import { toast } from 'svelte-sonner';
  import ColorInput from './ColorInput.svelte';
  import ImageColorExtractor from './ImageColorExtractor.svelte';
  import PresetSelector from './PresetSelector.svelte';
  import SavedThemesList from './SavedThemesList.svelte';
  import ContrastIcon from '~icons/material-symbols/contrast';
  import SaveIcon from '~icons/material-symbols/save-outline-rounded';
  import UploadIcon from '~icons/material-symbols/upload-rounded';
  import DownloadIcon from '~icons/material-symbols/download-rounded';
  import ResetIcon from '~icons/material-symbols/refresh-rounded';
  import ImageIcon from '~icons/material-symbols/image-rounded';

  type TabId = 'builtin' | 'presets' | 'custom' | 'saved' | 'image' | 'import';
  let activeTab = $state<TabId>('builtin');

  let newThemeName = $state('');
  let importFileContent = $state('');
  let saveDialogOpen = $state(false);
  let importDialogOpen = $state(false);

  $effect(() => {
    if ($themeStore.savedThemes.length === 0) {
      newThemeName = '我的主题 1';
    } else {
      newThemeName = `我的主题 ${$themeStore.savedThemes.length + 1}`;
    }
  });

  const tabs = [
    { id: 'builtin' as TabId, label: '内置主题', icon: ContrastIcon },
    { id: 'presets' as TabId, label: '预设配色', icon: ContrastIcon },
    { id: 'custom' as TabId, label: '自定义颜色', icon: ContrastIcon },
    { id: 'saved' as TabId, label: '已保存', icon: SaveIcon },
    { id: 'image' as TabId, label: '图片调色', icon: ImageIcon },
    { id: 'import' as TabId, label: '导入/导出', icon: UploadIcon }
  ];

  const handleExportTheme = () => {
    const state = $themeStore;
    const json = exportTheme(
      newThemeName || '导出的主题',
      state.activeMermaidTheme,
      state.themeVariables,
      state.backgroundColor
    );

    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mermaid-theme-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('主题已导出');
  };

  const handleImportTheme = () => {
    const result = parseImportedTheme(importFileContent);
    if (!result) {
      toast.error('无效的主题文件格式');
      return;
    }

    setBuiltinTheme(result.mermaidTheme);
    setMultipleThemeVariables(result.themeVariables);
    setBackgroundColor(result.backgroundColor);

    importDialogOpen = false;
    importFileContent = '';
    toast.success('主题已导入');
  };

  const handleFileImport = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      importFileContent = reader.result as string;
      handleImportTheme();
    };
    reader.readAsText(file);
  };

  const handleSaveTheme = () => {
    if (!newThemeName.trim()) {
      toast.error('请输入主题名称');
      return;
    }
    saveCurrentTheme(newThemeName.trim());
    saveDialogOpen = false;
  };

  const getCategoryLabel = (category: string): string => {
    switch (category) {
      case 'primary':
        return '主色';
      case 'secondary':
        return '次色';
      case 'tertiary':
        return '第三色';
      case 'text':
        return '文字';
      case 'lines':
        return '线条';
      default:
        return '其他';
    }
  };

  const getColorValue = (key: keyof ThemeVariables): string | undefined => {
    return $themeStore.themeVariables[key] as string | undefined;
  };

  const getAllCategories = (): Record<string, typeof colorCategories> => {
    const result: Record<string, typeof colorCategories> = {
      primary: [],
      secondary: [],
      tertiary: [],
      text: [],
      lines: [],
      other: []
    };

    for (const category of colorCategories) {
      result[category.category].push(category);
    }

    return result;
  };

  const addDefaultColors = () => {
    const defaultVars: ThemeVariables = {
      primaryColor: '#fff4dd',
      primaryTextColor: '#333333',
      secondaryColor: '#ffcc88',
      secondaryTextColor: '#333333',
      tertiaryColor: '#99eeff',
      tertiaryTextColor: '#333333',
      lineColor: '#333333',
      textColor: '#333333'
    };
    setMultipleThemeVariables(defaultVars);
    toast.success('已添加默认颜色变量');
  };

  const hasAnyColor = $derived(() => {
    return Object.keys($themeStore.themeVariables).length > 0;
  });
</script>

<Card title="主题设置" isOpen={true} icon={{ component: ContrastIcon, class: 'size-5' }}>
  <div class="flex flex-col gap-4 p-3">
    <ToggleGroup.Root type="single" bind:value={activeTab} variant="outline" class="flex flex-wrap gap-1">
      {#each tabs as tab}
        <ToggleGroup.Item value={tab.id} class="flex items-center gap-1">
          <tab.icon class="size-4" />
          <span class="hidden sm:inline">{tab.label}</span>
        </ToggleGroup.Item>
      {/each}
    </ToggleGroup.Root>

    {#if activeTab === 'builtin'}
      <div class="grid grid-cols-2 gap-2">
        {#each BUILTIN_THEMES as theme}
          <Button
            variant={$themeStore.activeMermaidTheme === theme.id ? 'default' : 'outline'}
            onclick={() => setBuiltinTheme(theme.id as MermaidBuiltinTheme)}
            class="justify-start">
            <span class="font-medium">{theme.name}</span>
            <span class="text-xs text-muted-foreground">{theme.description}</span>
          </Button>
        {/each}
      </div>
    {/if}

    {#if activeTab === 'presets'}
      <PresetSelector
        presets={COLOR_PRESETS}
        activePresetId={$themeStore.activePreset}
        onSelect={(id) => applyPreset(id as ColorPresetId)}
      />
    {/if}

    {#if activeTab === 'custom'}
      <div class="flex flex-col gap-4">
        <div class="flex items-center gap-4">
          <ColorInput
            label="背景色"
            value={$themeStore.backgroundColor}
            onChange={(color) => setBackgroundColor(color)}
          />
        </div>

        <Separator />

        {#each Object.entries(getAllCategories()) as [category, colors]}
          {#if colors.length > 0}
            <div class="flex flex-col gap-2">
              <h4 class="text-sm font-semibold capitalize text-foreground">
                {getCategoryLabel(category)}
              </h4>
              <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {#each colors as color}
                  {@const currentValue = getColorValue(color.key)}
                  <ColorInput
                    label={color.label}
                    value={currentValue || '#000000'}
                    onChange={(c) => setThemeVariable(color.key, c)}
                    contrastWith={color.contrastWith ? getColorValue(color.contrastWith) : undefined}
                    showContrastFix={!!color.contrastWith && !!currentValue}
                  />
                {/each}
              </div>
            </div>
          {/if}
        {/each}

        <Separator />

        <div class="flex flex-wrap gap-2">
          <Button variant="outline" onclick={addDefaultColors}>
            添加默认颜色变量
          </Button>
          <Button variant="outline" onclick={resetToDefaults}>
            <ResetIcon class="size-4" />
            重置
          </Button>
        </div>
      </div>
    {/if}

    {#if activeTab === 'saved'}
      <SavedThemesList
        savedThemes={$themeStore.savedThemes}
        activeThemeId={$themeStore.activeSavedThemeId}
        onLoad={loadSavedTheme}
        onDelete={deleteSavedTheme}
        onUpdateName={updateSavedThemeName}
      />
      <Separator />
      <Button onclick={() => (saveDialogOpen = true)}>
        <SaveIcon class="size-4" />
        保存当前主题
      </Button>
    {/if}

    {#if activeTab === 'image'}
      <ImageColorExtractor />
    {/if}

    {#if activeTab === 'import'}
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-2">
          <h4 class="text-sm font-semibold text-foreground">导出主题</h4>
          <p class="text-xs text-muted-foreground">
            将当前主题设置导出为 JSON 文件，以便分享或备份
          </p>
          <Button onclick={handleExportTheme} class="w-fit">
            <DownloadIcon class="size-4" />
            导出主题
          </Button>
        </div>

        <Separator />

        <div class="flex flex-col gap-2">
          <h4 class="text-sm font-semibold text-foreground">导入主题</h4>
          <p class="text-xs text-muted-foreground">
            从 JSON 文件导入主题设置
          </p>
          <div class="flex gap-2">
            <label class="cursor-pointer">
              <input
                type="file"
                accept=".json"
                class="hidden"
                onchange={handleFileImport}
              />
              <Button variant="outline">
                <UploadIcon class="size-4" />
                选择文件
              </Button>
            </label>
          </div>
        </div>
      </div>
    {/if}
  </div>
</Card>

<Dialog.Root open={saveDialogOpen} onOpenChange={(open) => (saveDialogOpen = open)}>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content>
      <Dialog.Header>
        <Dialog.Title>保存主题</Dialog.Title>
        <Dialog.Description>
          为当前主题设置一个名称，以便之后快速应用
        </Dialog.Description>
      </Dialog.Header>
      <div class="flex flex-col gap-4 py-4">
        <Input
          bind:value={newThemeName}
          placeholder="输入主题名称"
          onkeydown={(e) => e.key === 'Enter' && handleSaveTheme()}
        />
      </div>
      <Dialog.Footer>
        <Button variant="ghost" onclick={() => (saveDialogOpen = false)}>取消</Button>
        <Button onclick={handleSaveTheme}>保存</Button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
