<script lang="ts">
  import { cn } from '$lib/utils';

  let {
    value = 0,
    max = 100,
    class: className,
    showLabel = false,
    label
  }: {
    value?: number;
    max?: number;
    class?: string;
    showLabel?: boolean;
    label?: string;
  } = $props();

  const percentage = Math.min(100, Math.max(0, ((value || 0) / (max || 100)) * 100));
</script>

<div class={cn('w-full space-y-1', className)}>
  {#if showLabel}
    <div class="flex justify-between text-sm text-muted-foreground">
      <span>{label || 'Progress'}</span>
      <span>{Math.round(percentage)}%</span>
    </div>
  {/if}
  <div
    role="progressbar"
    aria-valuenow={value}
    aria-valuemin={0}
    aria-valuemax={max}
    class="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
    <div
      class="h-full bg-primary transition-all duration-300 ease-out"
      style="width: {percentage}%" />
  </div>
</div>
