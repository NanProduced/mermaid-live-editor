<script lang="ts">
  import { TID } from '$/constants';
  import { contextMenuRequest } from '$/util/nodeSyncStore';
  import {
    changeNodeColor,
    deleteNode,
    parseNodes,
    renameNode
  } from '$/util/nodeParser';
  import { stateStore, updateCode } from '$/util/state';
  import { tick } from 'svelte';
  import ColorIcon from '~icons/material-symbols/colorize-outline-rounded';
  import DeleteIcon from '~icons/material-symbols/delete-outline-rounded';
  import RenameIcon from '~icons/material-symbols/edit-outline-rounded';

  let menuElement: HTMLDivElement | undefined = $state();
  let showRenameInput = $state(false);
  let renameValue = $state('');
  let showColorPicker = $state(false);
  let currentColor = $state('#ffffff');
  let menuPosition = $state({ x: 0, y: 0 });
  let currentNodeId = $state<string | null>(null);

  const close = () => {
    contextMenuRequest.set(null);
    showRenameInput = false;
    showColorPicker = false;
    currentNodeId = null;
  };

  let menuMounted = $state(false);

  // Close menu when clicking outside
  const handleDocumentClick = (e: MouseEvent) => {
    if (menuElement && !menuElement.contains(e.target as Node)) {
      close();
    }
  };

  $effect(() => {
    if (menuMounted) {
      document.addEventListener('mousedown', handleDocumentClick);
      return () => document.removeEventListener('mousedown', handleDocumentClick);
    }
  });

  $effect(() => {
    const unsub = contextMenuRequest.subscribe(async (req) => {
      if (!req) {
        close();
        return;
      }
      currentNodeId = req.nodeId;
      menuPosition = { x: req.x, y: req.y };

      // Get current label for rename
      const code = $stateStore.code;
      const nodes = parseNodes(code);
      const node = nodes.find((n) => n.id === req.nodeId);
      if (node) {
        renameValue = node.label;
      }
      showRenameInput = false;
      showColorPicker = false;
      menuMounted = true;
      await tick();
      // Adjust menu position if it would go off-screen
      if (menuElement) {
        const rect = menuElement.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
          menuPosition.x = window.innerWidth - rect.width - 8;
        }
        if (rect.bottom > window.innerHeight) {
          menuPosition.y = window.innerHeight - rect.height - 8;
        }
      }
    });
    return unsub;
  });

  const handleRename = () => {
    if (!currentNodeId || !renameValue.trim()) return;
    const code = $stateStore.code;
    const newCode = renameNode(code, currentNodeId, renameValue.trim());
    if (newCode !== code) {
      updateCode(newCode, { updateDiagram: true });
    }
    close();
  };

  const handleColorChange = (color: string) => {
    if (!currentNodeId) return;
    const code = $stateStore.code;
    // Derive a darker stroke from the fill
    const strokeColor = darkenColor(color, 30);
    const newCode = changeNodeColor(code, currentNodeId, color, strokeColor);
    if (newCode !== code) {
      updateCode(newCode, { updateDiagram: true });
    }
    close();
  };

  const handleDelete = () => {
    if (!currentNodeId) return;
    const code = $stateStore.code;
    const newCode = deleteNode(code, currentNodeId);
    if (newCode !== code) {
      updateCode(newCode, { updateDiagram: true });
    }
    close();
  };

  /** Darken a hex color by a percentage amount */
  function darkenColor(hex: string, percent: number): string {
    const h = hex.replace('#', '');
    const r = Math.max(0, parseInt(h.slice(0, 2), 16) - Math.round(2.55 * percent));
    const g = Math.max(0, parseInt(h.slice(2, 4), 16) - Math.round(2.55 * percent));
    const b = Math.max(0, parseInt(h.slice(4, 6), 16) - Math.round(2.55 * percent));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  // Preset colors for quick selection
  const presetColors = [
    '#ff6b6b',
    '#ffa94d',
    '#ffd43b',
    '#69db7c',
    '#4dabf7',
    '#9775fa',
    '#f783ac',
    '#868e96'
  ];

</script>

{#if currentNodeId}
  <div
    bind:this={menuElement}
    class="fixed z-[9999] min-w-[180px] rounded-lg border bg-popover p-1.5 text-popover-foreground shadow-lg"
    style="left: {menuPosition.x}px; top: {menuPosition.y}px"
    data-testid={TID.nodeContextMenu}
    role="menu"
    onkeydown={(e) => {
      if (e.key === 'Escape') close();
    }}>
    {#if showRenameInput}
      <div class="flex flex-col gap-1.5 p-1">
        <label class="text-xs text-muted-foreground" for="node-rename-input">New label</label>
        <input
          id="node-rename-input"
          data-testid={TID.nodeRenameInput}
          type="text"
          class="rounded border bg-background px-2 py-1 text-sm focus:ring-1 focus:ring-ring focus:outline-none"
          bind:value={renameValue}
          onkeydown={(e) => {
            if (e.key === 'Enter') handleRename();
            if (e.key === 'Escape') close();
          }} />
        <div class="flex gap-1">
          <button
            class="flex-1 rounded bg-primary px-2 py-1 text-xs text-primary-foreground hover:opacity-90"
            data-testid={TID.nodeRenameConfirm}
            onclick={handleRename}>
            Save
          </button>
          <button
            class="flex-1 rounded border px-2 py-1 text-xs hover:bg-muted"
            onclick={() => (showRenameInput = false)}>
            Cancel
          </button>
        </div>
      </div>
    {:else if showColorPicker}
      <div class="flex flex-col gap-1.5 p-1">
        <label class="text-xs text-muted-foreground" for="node-color-input">Pick a color</label>
        <div class="grid grid-cols-4 gap-1">
          {#each presetColors as color}
            <button
              class="h-6 w-6 rounded border hover:scale-110"
              style="background-color: {color}"
              data-testid={TID.nodeColorOption}
              aria-label="Color {color}"
              title={color}
              onclick={() => handleColorChange(color)}></button>
          {/each}
        </div>
        <div class="flex items-center gap-1">
          <input
            id="node-color-input"
            type="color"
            class="h-7 w-7 cursor-pointer rounded border"
            bind:value={currentColor}
            oninput={() => handleColorChange(currentColor)} />
          <span class="text-xs text-muted-foreground">{currentColor}</span>
        </div>
        <button
          class="rounded border px-2 py-1 text-xs hover:bg-muted"
          onclick={() => (showColorPicker = false)}>
          Cancel
        </button>
      </div>
    {:else}
      <button
        class="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-sm hover:bg-muted"
        data-testid={TID.nodeMenuRename}
        role="menuitem"
        onclick={() => (showRenameInput = true)}>
        <RenameIcon class="size-4" />
        Rename
      </button>
      <button
        class="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-sm hover:bg-muted"
        data-testid={TID.nodeMenuColor}
        role="menuitem"
        onclick={() => (showColorPicker = true)}>
        <ColorIcon class="size-4" />
        Change color
      </button>
      <div class="my-1 border-t"></div>
      <button
        class="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-sm text-destructive hover:bg-destructive/10"
        data-testid={TID.nodeMenuDelete}
        role="menuitem"
        onclick={handleDelete}>
        <DeleteIcon class="size-4" />
        Delete
      </button>
    {/if}
  </div>
{/if}
