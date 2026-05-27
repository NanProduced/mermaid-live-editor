<script lang="ts">
  import { Button } from '$/components/ui/button';
  import { contextMenuState, hideContextMenu, nodeMap } from '$/util/nodeLinker';
  import { changeNodeColorInCode, deleteNodeInCode, renameNodeInCode } from '$/util/nodeParser';
  import { inputStateStore, updateCode } from '$/util/state';
  import { get } from 'svelte/store';
  import { onDestroy, onMount } from 'svelte';

  const COLOR_SWATCHES = [
    { name: 'Red', value: '#e74c3c' },
    { name: 'Orange', value: '#f39c12' },
    { name: 'Yellow', value: '#f1c40f' },
    { name: 'Green', value: '#2ecc71' },
    { name: 'Blue', value: '#3498db' },
    { name: 'Purple', value: '#9b59b6' },
    { name: 'Gray', value: '#95a5a6' },
    { name: 'Dark', value: '#34495e' }
  ];

  let container: HTMLElement | undefined = $state();
  let showRenameDialog = $state(false);
  let showColorPanel = $state(false);
  let renameValue = $state('');
  let renameInput: HTMLInputElement | undefined = $state();

  // Current node info from the store
  let currentNode = $derived(
    $contextMenuState.nodeId ? $nodeMap.get($contextMenuState.nodeId) : undefined
  );

  // Adjusted position to stay within viewport
  let adjustedX = $state(0);
  let adjustedY = $state(0);

  function openRename() {
    if (!currentNode) return;
    renameValue = currentNode.label;
    showRenameDialog = true;
    showColorPanel = false;
    setTimeout(() => renameInput?.focus(), 50);
  }

  function getCurrentCode(): string {
    return get(inputStateStore).code;
  }

  function confirmRename() {
    const nodeId = $contextMenuState.nodeId;
    if (!nodeId || !renameValue.trim()) return;

    const code = getCurrentCode();
    const newCode = renameNodeInCode(code, nodeId, renameValue.trim());
    updateCode(newCode, { updateDiagram: true });
    close();
  }

  function applyColor(color: string) {
    const nodeId = $contextMenuState.nodeId;
    if (!nodeId) return;

    const code = getCurrentCode();
    const newCode = changeNodeColorInCode(code, nodeId, color);
    updateCode(newCode, { updateDiagram: true });
    close();
  }

  function handleDelete() {
    const nodeId = $contextMenuState.nodeId;
    if (!nodeId) return;

    const code = getCurrentCode();
    const newCode = deleteNodeInCode(code, nodeId);
    updateCode(newCode, { updateDiagram: true });
    close();
  }

  function close() {
    showRenameDialog = false;
    showColorPanel = false;
    hideContextMenu();
  }

  // Click outside handler
  function handleClickOutside(e: MouseEvent) {
    if ($contextMenuState.visible && container && !container.contains(e.target as Node)) {
      close();
    }
  }

  // Keyboard handler
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (showRenameDialog) {
        showRenameDialog = false;
      } else if (showColorPanel) {
        showColorPanel = false;
      } else {
        close();
      }
    }
  }

  onMount(() => {
    document.addEventListener('mousedown', handleClickOutside, true);
    document.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    document.removeEventListener('mousedown', handleClickOutside, true);
    document.removeEventListener('keydown', handleKeydown);
  });

  // Adjust menu position to stay in viewport
  $effect(() => {
    if ($contextMenuState.visible && container) {
      const rect = container.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let { x, y } = $contextMenuState;
      if (x + rect.width > vw - 8) {
        x = Math.max(8, vw - rect.width - 8);
      }
      if (y + rect.height > vh - 8) {
        y = Math.max(8, vh - rect.height - 8);
      }

      adjustedX = x;
      adjustedY = y;
    }
  });
</script>

{#if $contextMenuState.visible}
  <div
    bind:this={container}
    class="fixed z-50 min-w-[170px] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
    style="left: {adjustedX}px; top: {adjustedY}px;"
    role="menu">
    {#if !showRenameDialog && !showColorPanel}
      <!-- Main Menu -->
      <div class="px-2 py-1.5 text-xs font-medium text-muted-foreground">
        {$contextMenuState.nodeId}
      </div>

      <button
        type="button"
        class="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
        role="menuitem"
        onclick={openRename}>
        <span class="text-sm leading-none">✏️</span>
        Rename
      </button>

      <button
        type="button"
        class="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
        role="menuitem"
        onclick={() => {
          showColorPanel = true;
          showRenameDialog = false;
        }}>
        <span class="text-sm leading-none">🎨</span>
        Change Color
      </button>

      <div class="my-1 h-px bg-border"></div>

      <button
        type="button"
        class="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
        role="menuitem"
        onclick={handleDelete}>
        <span class="text-sm leading-none">🗑️</span>
        Delete
      </button>
    {:else if showRenameDialog}
      <!-- Rename Dialog -->
      <div class="p-2" role="dialog" aria-label="Rename node">
        <label class="mb-1.5 block text-xs font-medium text-muted-foreground"> Rename node </label>
        <input
          bind:this={renameInput}
          type="text"
          class="flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
          bind:value={renameValue}
          onkeydown={(e) => {
            if (e.key === 'Enter') confirmRename();
          }}
          placeholder="Enter new label..." />
        <div class="mt-2 flex justify-end gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onclick={() => {
              showRenameDialog = false;
            }}>
            Cancel
          </Button>
          <Button size="sm" onclick={confirmRename}>Rename</Button>
        </div>
      </div>
    {:else if showColorPanel}
      <!-- Color Picker Panel -->
      <div class="p-2" role="dialog" aria-label="Change color">
        <div class="mb-1.5 text-xs font-medium text-muted-foreground">Choose color</div>
        <div class="grid grid-cols-4 gap-1.5">
          {#each COLOR_SWATCHES as swatch (swatch.value)}
            <button
              type="button"
              class="size-7 cursor-pointer rounded-md border border-border transition-all hover:scale-110 hover:ring-2 hover:ring-ring"
              style="background-color: {swatch.value};"
              title={swatch.name}
              role="menuitem"
              onclick={() => applyColor(swatch.value)}>
            </button>
          {/each}
        </div>
        <button
          type="button"
          class="mt-2 w-full cursor-pointer rounded-sm px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          onclick={() => {
            showColorPanel = false;
          }}>
          ← Back
        </button>
      </div>
    {/if}
  </div>
{/if}
