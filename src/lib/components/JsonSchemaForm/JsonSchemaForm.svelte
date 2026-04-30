<script lang="ts">
  import type { JSONSchema, JSONSchemaProperty } from '$lib/util/exporters';
  import { Input } from '$/components/ui/input';
  import { Switch } from '$/components/ui/switch';
  import * as ToggleGroup from '$/components/ui/toggle-group';

  let {
    schema,
    value = $bindable<Record<string, unknown>>({}),
    onChange
  }: {
    schema: JSONSchema;
    value?: Record<string, unknown>;
    onChange?: (value: Record<string, unknown>) => void;
  } = $props();

  const updateValue = (key: string, newValue: unknown): void => {
    value = { ...value, [key]: newValue };
    onChange?.(value);
  };

  const getDefaultValue = (prop: JSONSchemaProperty, key: string): unknown => {
    if (value[key] !== undefined) {
      return value[key];
    }
    if (prop.default !== undefined) {
      return prop.default;
    }
    const required = schema.required?.includes(key);
    if (!required) {
      return undefined;
    }
    switch (prop.type) {
      case 'string':
        return '';
      case 'number':
        return 0;
      case 'boolean':
        return false;
      case 'array':
        return [];
      case 'object':
        return {};
      default:
        return undefined;
    }
  };

  let properties: [string, JSONSchemaProperty][] = $derived(
    schema.properties ? Object.entries(schema.properties) : []
  );
</script>

<div class="space-y-4">
  {#if schema.title}
    <h3 class="text-lg font-semibold">{schema.title}</h3>
  {/if}
  {#if schema.description}
    <p class="text-sm text-muted-foreground">{schema.description}</p>
  {/if}

  {#if properties.length > 0}
    <div class="space-y-4">
      {#each properties as [key, prop] (key)}
        {@const currentValue = getDefaultValue(prop, key)}

        {#if prop.type === 'boolean'}
          <div class="flex items-center justify-between py-2">
            <label class="text-sm font-medium">{prop.title || key}</label>
            <Switch
              checked={currentValue as boolean}
              oncheckedchange={(checked) => updateValue(key, checked)} />
          </div>
        {:else if prop.type === 'number'}
          <div class="space-y-1.5">
            <label class="text-sm font-medium">{prop.title || key}</label>
            <Input
              type="number"
              min={prop.minimum}
              max={prop.maximum}
              step="0.1"
              value={currentValue as number}
              oninput={(e) =>
                updateValue(key, parseFloat((e.target as HTMLInputElement).value) || 0)} />
            {#if prop.description}
              <p class="text-xs text-muted-foreground">{prop.description}</p>
            {/if}
          </div>
        {:else if prop.type === 'string' && prop.enum}
          <div class="space-y-1.5">
            <label class="text-sm font-medium">{prop.title || key}</label>
            <ToggleGroup.Root
              type="single"
              value={currentValue as string}
              onvaluechange={(v) => v && updateValue(key, v)}
              class="flex flex-wrap gap-1">
              {#each prop.enum as option (String(option))}
                <ToggleGroup.Item value={String(option)}>
                  {String(option)}
                </ToggleGroup.Item>
              {/each}
            </ToggleGroup.Root>
            {#if prop.description}
              <p class="text-xs text-muted-foreground">{prop.description}</p>
            {/if}
          </div>
        {:else if prop.type === 'string'}
          <div class="space-y-1.5">
            <label class="text-sm font-medium">{prop.title || key}</label>
            <Input
              type={prop.format === 'color' ? 'color' : 'text'}
              value={currentValue as string}
              oninput={(e) => updateValue(key, (e.target as HTMLInputElement).value)} />
            {#if prop.description}
              <p class="text-xs text-muted-foreground">{prop.description}</p>
            {/if}
          </div>
        {/if}
      {/each}
    </div>
  {/if}
</div>
