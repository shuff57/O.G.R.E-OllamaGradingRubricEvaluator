<script lang="ts">
  import { onMount } from 'svelte';
  import 'mathlive';

  // Props
  let { value = $bindable(''), onInput }: { value?: string; onInput?: (val: string) => void } = $props();
  let mathfield: any;

  onMount(() => {
    if (mathfield) {
      // Set initial value
      if (value) {
        mathfield.setValue(value);
      }

      // Listen for input events
      mathfield.addEventListener('input', (evt: any) => {
        value = evt.target.value;
        onInput?.(value);
      });
    }
  });

  // Sync value changes from parent
  $effect(() => {
    if (mathfield && mathfield.value !== value) {
      mathfield.setValue(value);
    }
  });
</script>

<math-field
  bind:this={mathfield}
  class="mathfield-input"
></math-field>

<style>
  .mathfield-input {
    width: 100%;
    min-height: 60px;
    background-color: var(--color-bg-main);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    border-radius: var(--radius-md);
    padding: var(--spacing-2);
    font-size: 1.1rem;
  }

  .mathfield-input:focus-within {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px var(--color-primary-bg);
  }
</style>
