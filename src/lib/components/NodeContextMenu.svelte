<script lang="ts">
  import { coordinationStore } from '$/util/coordinationStore';
  import { inputStateStore, updateCode } from '$/util/state';
  import { renameNode, changeNodeColor, deleteNode } from '$/util/sourceEditor';
  import { cn } from '$lib/utils.js';
  import { onMount } from 'svelte';

  let menuRef: HTMLDivElement | undefined = $state();

  let contextMenu = $derived($coordinationStore.contextMenu);

  const close = () => {
    coordinationStore.update((c) => ({
      ...c,
      contextMenu: { visible: false, nodeId: null, x: 0, y: 0 }
    }));
  };

  const handleRename = () => {
    const nodeId = contextMenu.nodeId;
    if (!nodeId) return;
    const currentCode = $inputStateStore.code;
    const newName = prompt(`Rename node "${nodeId}" to:`, nodeId);
    if (newName && newName !== nodeId) {
      const newCode = renameNode(currentCode, nodeId, newName);
      updateCode(newCode);
    }
    close();
  };

  const handleChangeColor = () => {
    const nodeId = contextMenu.nodeId;
    if (!nodeId) return;
    const currentCode = $inputStateStore.code;
    const color = prompt(`Enter color for "${nodeId}" (e.g., #ff0000, red):`);
    if (color) {
      const newCode = changeNodeColor(currentCode, nodeId, color);
      updateCode(newCode);
    }
    close();
  };

  const handleDelete = () => {
    const nodeId = contextMenu.nodeId;
    if (!nodeId) return;
    const currentCode = $inputStateStore.code;
    const newCode = deleteNode(currentCode, nodeId);
    updateCode(newCode);
    close();
  };

  const handleClickOutside = (e: MouseEvent) => {
    if (menuRef && !menuRef.contains(e.target as Node)) {
      close();
    }
  };

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      close();
    }
  };

  // Adjust position to stay within viewport
  let adjustedX = $derived(
    contextMenu.x + 160 > window.innerWidth ? Math.max(0, contextMenu.x - 160) : contextMenu.x
  );
  let adjustedY = $derived(
    contextMenu.y + 120 > window.innerHeight
      ? Math.max(0, contextMenu.y - 120)
      : contextMenu.y
  );
</script>

<svelte:window onkeydown={handleKeydown} />

{#if contextMenu.visible && contextMenu.nodeId}
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="fixed inset-0 z-40"
    onclick={handleClickOutside}
    oncontextmenu={(e) => {
      e.preventDefault();
      close();
    }}></div>
  <div
    bind:this={menuRef}
    class={cn(
      'fixed z-50 min-w-[160px] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none',
      'animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95'
    )}
    style="left: {adjustedX}px; top: {adjustedY}px">
    <button
      class="flex w-full items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-1 focus-visible:ring-ring"
      onclick={handleRename}>
      Rename
    </button>
    <button
      class="flex w-full items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-1 focus-visible:ring-ring"
      onclick={handleChangeColor}>
      Change Color
    </button>
    <div class="-mx-1 my-1 h-px bg-border"></div>
    <button
      class="flex w-full items-center rounded-sm px-2 py-1.5 text-sm text-destructive outline-none transition-colors hover:bg-destructive hover:text-destructive-foreground focus-visible:ring-1 focus-visible:ring-ring"
      onclick={handleDelete}>
      Delete
    </button>
  </div>
{/if}
