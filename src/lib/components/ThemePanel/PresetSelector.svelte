<script lang="ts">
  import type { ColorPreset } from '$/types';
  import { Button } from '$/components/ui/button';
  import { cn } from '$/utils';

  let {
    presets,
    activePresetId,
    onSelect
  }: {
    presets: ColorPreset[];
    activePresetId: string | null;
    onSelect: (id: string) => void;
  } = $props();
</script>

<div class="grid grid-cols-2 gap-2">
  {#each presets as preset}
    <button
      onclick={() => onSelect(preset.id)}
      disabled={activePresetId === preset.id}
      class={cn(
        'flex flex-col items-start gap-1 rounded-lg border-2 p-3 text-left transition-all hover:border-primary disabled:cursor-default',
        activePresetId === preset.id
          ? 'border-primary bg-primary/10'
          : 'border-border bg-background'
      )}>
      <div class="flex gap-1">
        {#if preset.themeVariables.primaryColor}
          <div
            class="h-4 w-4 rounded-full border border-border"
            style="background-color: {preset.themeVariables.primaryColor}"
          ></div>
        {/if}
        {#if preset.themeVariables.secondaryColor}
          <div
            class="h-4 w-4 rounded-full border border-border"
            style="background-color: {preset.themeVariables.secondaryColor}"
          ></div>
        {/if}
        {#if preset.themeVariables.tertiaryColor}
          <div
            class="h-4 w-4 rounded-full border border-border"
            style="background-color: {preset.themeVariables.tertiaryColor}"
          ></div>
        {/if}
      </div>
      <span class="text-sm font-medium">{preset.name}</span>
      <span class="text-xs text-muted-foreground">{preset.description}</span>
    </button>
  {/each}
</div>
