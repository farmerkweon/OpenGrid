<template>
  <div ref="containerRef" class="og-vue-wrapper" :style="containerStyle" />
</template>

<script setup lang="ts">
/**
 * OPEN_GRID 코어를 감싸는 Vue 3 SFC 컴포넌트(`open-grid/vue`).
 * / Vue 3 SFC component wrapping the OPEN_GRID core (`open-grid/vue`).
 *
 * 마운트 시 코어 `OpenGrid` 인스턴스를 만들고, `data`·`theme`·`columns` prop 변경을 감지해 동기화하며,
 * 셀·행·정렬·필터 이벤트를 Vue emit 으로 재발행한다. props/emits 계약은 `./types.js` 참조.
 * / Creates a core `OpenGrid` instance on mount, syncs it as `data`/`theme`/`columns` props change,
 *   and re-emits cell/row/sort/filter events as Vue emits. See `./types.js` for the props/emits contract.
 */
import { ref, onMounted, onUnmounted, watch, shallowRef, computed } from 'vue';
import { OpenGrid } from '../core/OpenGrid.js';
import type { GridOptions, OpenGridInstance } from '../core/types.js';
import type { OpenGridProps, OpenGridEmits } from './types.js';
import '../styles/base.css';

const props = withDefaults(defineProps<OpenGridProps>(), {
  data: () => [],
  height: 400,
  width: '100%',
  editable: false,
  sortable: true,
  filterable: true,
  rowNumber: false,
  checkColumn: false,
  stateColumn: false,
  draggable: false,
  frozenColumns: 0,
  theme: 'default',
});

const emit = defineEmits<OpenGridEmits>();

const containerRef = ref<HTMLElement>();
const gridInstance = shallowRef<OpenGridInstance | null>(null);

// dataChange 루프 방지: 그리드에서 발행한 데이터를 watch가 다시 setData하지 않도록 추적
// / Prevent a dataChange loop: track grid-emitted data so the watcher does not setData it again
let _lastEmittedData: any[] | null = null;

const containerStyle = computed(() => ({
  height: typeof props.height === 'number' ? `${props.height}px` : props.height,
  width: typeof props.width === 'number' ? `${props.width}px` : props.width,
}));

onMounted(() => {
  if (!containerRef.value) return;

  const options: GridOptions = {
    columns: props.columns,
    height: '100%',
    width: '100%',
    editable: props.editable,
    sortable: props.sortable,
    filterable: props.filterable,
    rowNumber: props.rowNumber,
    checkColumn: props.checkColumn,
    stateColumn: props.stateColumn,
    draggable: props.draggable,
    frozenColumns: props.frozenColumns,
    theme: props.theme,
    ...props.options,

    onReady: (grid) => {
      if (props.data?.length) grid.setData(props.data);
      emit('ready', grid);
    },
    onCellClick: (e) => emit('cell-click', e),
    onRowClick: (e) => emit('row-click', e),
    onEditEnd: (e) => emit('edit-end', e),
    onSortChange: (e) => emit('sort-change', e),
    onFilterChange: (e) => emit('filter-change', e),
    onDataChange: (data) => {
      _lastEmittedData = data;
      emit('update:data', data);
    },
  };

  gridInstance.value = new OpenGrid(containerRef.value, options);
});

// data prop 변경 감지 → 그리드 갱신 (그리드 자신이 발행한 데이터는 무시하여 루프 방지)
// / React to data prop changes → update the grid (ignore data the grid itself emitted to avoid a loop)
watch(() => props.data, (newData) => {
  if (!gridInstance.value || !newData) return;
  if (newData === _lastEmittedData) return;
  gridInstance.value.setData(newData);
}, { deep: false });

// theme prop 변경 감지 → setTheme 호출 / React to theme prop changes → call setTheme
watch(() => props.theme, (newTheme) => {
  if (gridInstance.value && newTheme) {
    gridInstance.value.setTheme(newTheme);
  }
});

// columns 변경 감지 / React to columns changes
watch(() => props.columns, (newCols) => {
  if (gridInstance.value) {
    gridInstance.value.applyColumns(newCols);
  }
}, { deep: false });

onUnmounted(() => {
  gridInstance.value?.destroy();
  gridInstance.value = null;
});

// 그리드 인스턴스 외부 노출 / Expose the grid instance to the parent (template ref)
defineExpose({ grid: gridInstance });
</script>

<style scoped>
.og-vue-wrapper {
  display: block;
  box-sizing: border-box;
}
</style>
