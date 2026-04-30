<script lang="ts">
  import { Button } from '$/components/ui/button';
  import { Input } from '$/components/ui/input';
  import { cn } from '$/utils';
  import { adjustContrast, checkContrast } from '$lib/util/colorUtils';
  import { toast } from 'svelte-sonner';

  let {
    label,
    value,
    onChange,
    contrastWith,
    disabled = false,
    showContrastFix = false
  }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    contrastWith?: string;
    disabled?: boolean;
    showContrastFix?: boolean;
  } = $props();

  const inputId = `color-input-${label.replace(/\s+/g, '-').toLowerCase()}`;

  let inputValue = $state(value);

  $effect(() => {
    inputValue = value;
  });

  const contrastInfo = $derived(() => {
    if (!contrastWith || !value || !contrastWith) {
      return null;
    }
    return checkContrast(value, contrastWith);
  });

  const handleInputChange = () => {
    if (/^#?[0-9a-fA-F]{6}$/.test(inputValue) || /^#?[0-9a-fA-F]{3}$/.test(inputValue)) {
      let normalized = inputValue;
      if (!normalized.startsWith('#')) {
        normalized = '#' + normalized;
      }
      if (normalized.length === 4) {
        normalized = '#' + normalized[1] + normalized[1] + normalized[2] + normalized[2] + normalized[3] + normalized[3];
      }
      onChange(normalized.toLowerCase());
    }
  };

  const handlePickerChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    onChange(target.value);
  };

  const fixContrast = () => {
    if (!contrastWith || !value) return;
    const fixed = adjustContrast(value, contrastWith, 4.5);
    onChange(fixed);
    toast.success('已调整对比度至符合WCAG标准');
  };

  const getContrastBadgeClass = () => {
    const info = contrastInfo();
    if (!info) return '';
    if (info.level === 'AAA') return 'bg-green-500';
    if (info.level === 'AA') return 'bg-blue-500';
    return 'bg-yellow-500';
  };
</script>

<div class="flex flex-col gap-1">
  <div class="flex items-center justify-between">
    <label for={inputId} class="text-sm font-medium text-foreground">{label}</label>
    {#if contrastInfo()}
      <span class={cn('flex items-center gap-1 text-xs text-white', getContrastBadgeClass(), 'px-2 py-0.5 rounded')}>
        {contrastInfo()?.ratio}:1
        <span class="font-semibold">{contrastInfo()?.level}</span>
      </span>
    {/if}
  </div>
  <div class="flex gap-2">
    <input
      type="color"
      {value}
      oninput={handlePickerChange}
      {disabled}
      class="h-10 w-12 cursor-pointer rounded border-0 bg-transparent p-0"
    />
    <Input
      id={inputId}
      bind:value={inputValue}
      onchange={handleInputChange}
      placeholder="#000000"
      {disabled}
      class="font-mono text-sm"
    />
    {#if showContrastFix && contrastInfo() && !contrastInfo()?.isAccessible}
      <Button size="sm" variant="outline" onclick={fixContrast} class="shrink-0">
        修复
      </Button>
    {/if}
  </div>
</div>
