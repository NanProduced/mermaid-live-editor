<script lang="ts">
  import type { SavedTheme } from '$/types';
  import { Button } from '$/components/ui/button';
  import { Input } from '$/components/ui/input';
  import * as Dialog from '$/components/ui/dialog';
  import { cn } from '$/utils';
  import dayjs from 'dayjs';
  import TrashIcon from '~icons/material-symbols/delete-outline-rounded';

  let {
    savedThemes,
    activeThemeId,
    onLoad,
    onDelete,
    onUpdateName
  }: {
    savedThemes: SavedTheme[];
    activeThemeId: string | null;
    onLoad: (id: string) => void;
    onDelete: (id: string) => void;
    onUpdateName: (id: string, name: string) => void;
  } = $props();

  let editingId = $state<string | null>(null);
  let editName = $state('');
  let deleteConfirmId = $state<string | null>(null);

  const startEdit = (theme: SavedTheme) => {
    editingId = theme.id;
    editName = theme.name;
  };

  const saveEdit = () => {
    if (editingId && editName.trim()) {
      onUpdateName(editingId, editName.trim());
    }
    editingId = null;
  };

  const confirmDelete = (id: string) => {
    deleteConfirmId = id;
  };

  const executeDelete = () => {
    if (deleteConfirmId) {
      onDelete(deleteConfirmId);
      deleteConfirmId = null;
    }
  };
</script>

{#if savedThemes.length === 0}
  <div class="flex flex-col items-center justify-center gap-2 py-8 text-center">
    <p class="text-sm text-muted-foreground">暂无保存的主题</p>
    <p class="text-xs text-muted-foreground">调整颜色后点击"保存主题"按钮</p>
  </div>
{:else}
  <div class="flex flex-col gap-2">
    {#each savedThemes as theme}
      <div
        class={cn(
          'flex items-center justify-between rounded-lg border-2 p-3 transition-all',
          activeThemeId === theme.id
            ? 'border-primary bg-primary/10'
            : 'border-border bg-background hover:border-border-dark'
        )}>
        <div class="flex items-center gap-3">
          <div class="flex gap-1">
            {#if theme.themeVariables.primaryColor}
              <div
                class="h-5 w-5 rounded-full border border-border"
                style="background-color: {theme.themeVariables.primaryColor}"
              ></div>
            {/if}
            {#if theme.themeVariables.secondaryColor}
              <div
                class="h-5 w-5 rounded-full border border-border"
                style="background-color: {theme.themeVariables.secondaryColor}"
              ></div>
            {/if}
          </div>
          {#if editingId === theme.id}
            <div class="flex items-center gap-2">
              <Input
                bind:value={editName}
                onkeydown={(e) => {
                  if (e.key === 'Enter') saveEdit();
                  if (e.key === 'Escape') editingId = null;
                }}
                class="h-8 min-w-32"
              />
              <Button size="sm" variant="outline" onclick={saveEdit}>确定</Button>
              <Button size="sm" variant="ghost" onclick={() => (editingId = null)}>取消</Button>
            </div>
          {:else}
            <div class="flex flex-col">
              <span class="text-sm font-medium">{theme.name}</span>
              <span class="text-xs text-muted-foreground">
                {dayjs(theme.updatedAt).format('YYYY-MM-DD HH:mm')}
              </span>
            </div>
          {/if}
        </div>
        {#if editingId !== theme.id}
          <div class="flex items-center gap-1">
            <Button size="sm" variant="ghost" onclick={() => startEdit(theme)}>
              重命名
            </Button>
            <Button size="sm" variant="ghost" onclick={() => onLoad(theme.id)}>
              应用
            </Button>
            <Button size="icon" variant="ghost" onclick={() => confirmDelete(theme.id)}>
              <TrashIcon class="size-5 text-destructive" />
            </Button>
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<Dialog.Root open={deleteConfirmId !== null} onOpenChange={(open) => !open && (deleteConfirmId = null)}>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content>
      <Dialog.Header>
        <Dialog.Title>确认删除</Dialog.Title>
        <Dialog.Description>
          确定要删除这个主题吗？此操作无法撤销。
        </Dialog.Description>
      </Dialog.Header>
      <Dialog.Footer>
        <Button variant="ghost" onclick={() => (deleteConfirmId = null)}>取消</Button>
        <Button variant="destructive" onclick={executeDelete}>删除</Button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
