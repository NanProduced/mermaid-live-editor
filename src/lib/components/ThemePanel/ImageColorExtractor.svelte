<script lang="ts">
  import type { ThemeVariables } from '$/types';
  import { Button } from '$/components/ui/button';
  import { Input } from '$/components/ui/input';
  import { extractThemeFromImage } from '$lib/util/themeManager';
  import { setMultipleThemeVariables } from '$lib/util/themeStore';
  import { cn } from '$/utils';
  import { toast } from 'svelte-sonner';

  let imageUrl = $state('');
  let isLoading = $state(false);
  let extractedColors = $state<string[]>([]);
  let extractedTheme = $state<ThemeVariables | null>(null);

  const extractFromImage = async () => {
    if (!imageUrl.trim()) {
      toast.error('请输入图片URL');
      return;
    }

    isLoading = true;
    extractedColors = [];
    extractedTheme = null;

    try {
      const theme = await extractThemeFromImage(imageUrl);
      if (theme) {
        extractedTheme = theme;
        extractedColors = [
          theme.primaryColor,
          theme.secondaryColor,
          theme.tertiaryColor,
          theme.lineColor
        ].filter((c): c is string => c !== undefined);
        toast.success('成功从图片提取颜色！');
      } else {
        toast.error('无法从图片提取颜色，请检查URL是否正确');
      }
    } catch (error) {
      console.error('Image extraction error:', error);
      toast.error('提取颜色失败: ' + (error as Error).message);
    } finally {
      isLoading = false;
    }
  };

  const applyExtractedTheme = () => {
    if (extractedTheme) {
      setMultipleThemeVariables(extractedTheme);
      toast.success('已应用提取的主题配色！');
    }
  };
</script>

<div class="flex flex-col gap-4">
  <div class="flex gap-2">
    <Input
      bind:value={imageUrl}
      placeholder="输入图片URL (例如: https://example.com/image.png)"
      onkeydown={(e) => e.key === 'Enter' && extractFromImage()}
    />
    <Button {isLoading} onclick={extractFromImage} disabled={!imageUrl.trim()}>
      {isLoading ? '提取中...' : '提取颜色'}
    </Button>
  </div>

  {#if imageUrl}
    <div class="flex max-h-48 justify-center overflow-hidden rounded-lg border border-border">
      <img
        src={imageUrl}
        alt="Preview"
        class="max-h-48 w-auto object-contain"
        onerror={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
    </div>
  {/if}

  {#if extractedColors.length > 0}
    <div class="flex flex-col gap-3">
      <p class="text-sm font-medium">提取的颜色:</p>
      <div class="flex gap-2">
        {#each extractedColors as color}
          <div
            class={cn(
              'h-12 w-12 rounded-lg border-2 border-border shadow-sm',
              'cursor-pointer transition-transform hover:scale-105'
            )}
            style="background-color: {color}"
            title={color}
          ></div>
        {/each}
      </div>
      {#if extractedTheme}
        <Button onclick={applyExtractedTheme} class="w-full">
          应用此配色方案
        </Button>
      {/if}
    </div>
  {/if}
</div>
