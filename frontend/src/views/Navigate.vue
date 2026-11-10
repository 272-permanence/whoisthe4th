<script setup lang="ts">
/**
 * @file 路线导航页
 * @author 第八组（成员B）
 * @date 2026-11-03
 * @description 景点选择 + 步行/驾车模式切换 + 后端代理高德路径规划 + 地图绘制。
 *              地图使用高德 JS API（Web端 Key），路径规划使用后端 Web服务 Key，Key 不下发。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { listPois, planNavigation, type Poi, type NavigationResult, type TravelMode } from '../api/poi';
import { loadAmap, type AmapMap, type AmapNamespace, type AmapOverlay } from '../utils/amapLoader';

/** 西湖默认中心点 */
const WEST_LAKE_CENTER: [number, number] = [120.1455, 30.245];

const route = useRoute();
const router = useRouter();

const mapEl = ref<HTMLDivElement | null>(null);
const pois = ref<Poi[]>([]);
const originId = ref('');
const destId = ref('');
const mode = ref<TravelMode>('walking');
const planning = ref(false);
const errorMsg = ref('');
const mapError = ref('');
const result = ref<NavigationResult | null>(null);

let amap: AmapNamespace | null = null;
let map: AmapMap | null = null;
let markers: AmapOverlay[] = [];
let routeLine: AmapOverlay | null = null;

/** 只有带坐标的景点才能参与导航 */
const selectablePois = computed(() => pois.value.filter((poi) => poi.longitude !== null && poi.latitude !== null));

/**
 * 拉取景点列表并设置默认起止点
 * @returns Promise<void>
 */
async function loadPois(): Promise<void> {
  try {
    pois.value = await listPois({ limit: 100 });
  } catch (error) {
    errorMsg.value = error instanceof Error ? error.message : '景点加载失败';
    return;
  }

  const options = selectablePois.value;
  const destFromQuery = typeof route.query.dest === 'string' ? route.query.dest : '';
  const matched = options.find((poi) => String(poi.id) === destFromQuery);
  if (matched) {
    destId.value = String(matched.id);
  }
  if (options.length > 0 && options[0].id !== matched?.id) {
    originId.value = String(options[0].id);
  } else if (options.length > 1) {
    originId.value = String(options[1].id);
  }
}

/**
 * 初始化地图与景点打点
 * @returns Promise<void>
 */
async function initMap(): Promise<void> {
  if (!mapEl.value) return;
  try {
    amap = await loadAmap();
    map = new amap.Map(mapEl.value, {
      zoom: 13,
      center: WEST_LAKE_CENTER,
      viewMode: '2D'
    });
    renderMarkers();
  } catch (error) {
    mapError.value = error instanceof Error ? error.message : '地图加载失败';
  }
}

/**
 * 在地图上渲染全部景点标记
 */
function renderMarkers(): void {
  if (!map || !amap) return;
  if (markers.length > 0) {
    map.remove(markers);
    markers = [];
  }
  markers = selectablePois.value.map(
    (poi) =>
      new amap!.Marker({
        position: [poi.longitude, poi.latitude],
        title: poi.name,
        anchor: 'bottom-center'
      })
  );
  map.add(markers);
}

/**
 * 绘制规划结果折线并自适应视野
 * @param nav 规划结果
 */
function drawRoute(nav: NavigationResult): void {
  if (!map || !amap) return;
  if (routeLine) {
    map.remove(routeLine);
    routeLine = null;
  }
  if (nav.polyline.length === 0) return;
  routeLine = new amap.Polyline({
    path: nav.polyline.map((point) => [point.lng, point.lat]),
    strokeColor: '#4fc3f7',
    strokeWeight: 6,
    strokeOpacity: 0.9,
    lineJoin: 'round',
    showDir: true
  });
  map.add(routeLine);
  map.setFitView([routeLine], false, false, true);
}

/**
 * 发起路径规划
 * @returns Promise<void>
 */
async function planRoute(): Promise<void> {
  errorMsg.value = '';
  const origin = selectablePois.value.find((poi) => String(poi.id) === originId.value);
  const destination = selectablePois.value.find((poi) => String(poi.id) === destId.value);

  if (!origin || !destination) {
    errorMsg.value = '请选择起点和终点';
    return;
  }
  if (origin.id === destination.id) {
    errorMsg.value = '起点和终点不能相同';
    return;
  }
  if (origin.longitude === null || origin.latitude === null || destination.longitude === null || destination.latitude === null) {
    errorMsg.value = '该景点缺少坐标，无法规划';
    return;
  }

  planning.value = true;
  try {
    const nav = await planNavigation(
      { lng: origin.longitude, lat: origin.latitude },
      { lng: destination.longitude, lat: destination.latitude },
      mode.value
    );
    result.value = nav;
    drawRoute(nav);
  } catch (error) {
    errorMsg.value = error instanceof Error ? error.message : '路径规划失败';
  } finally {
    planning.value = false;
  }
}

/**
 * 距离格式化
 * @param meters 米
 * @returns 展示文本
 */
function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} 米`;
  return `${(meters / 1000).toFixed(1)} 公里`;
}

/**
 * 时长格式化
 * @param seconds 秒
 * @returns 展示文本
 */
function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `约 ${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  return `约 ${hours} 小时 ${minutes % 60} 分钟`;
}

/** 出行方式切换后若已有结果，自动重算 */
watch(mode, () => {
  if (result.value) void planRoute();
});

onMounted(async () => {
  await loadPois();
  await initMap();
  renderMarkers();
});

onBeforeUnmount(() => {
  map?.destroy();
  map = null;
  amap = null;
  routeLine = null;
  markers = [];
});
</script>

<template>
  <div class="nav-page">
    <header class="page-header">
      <div>
        <h1>AI 导航</h1>
        <p>选择起点终点，按步行或驾车获取路线与预计耗时</p>
      </div>
      <button class="ghost-btn" @click="router.push('/pois')">景点列表</button>
    </header>

    <section class="control-panel">
      <label class="field">
        <span>起点</span>
        <select v-model="originId">
          <option value="" disabled>请选择起点</option>
          <option v-for="poi in selectablePois" :key="poi.id" :value="String(poi.id)">
            {{ poi.name }}
          </option>
        </select>
      </label>

      <label class="field">
        <span>终点</span>
        <select v-model="destId">
          <option value="" disabled>请选择终点</option>
          <option v-for="poi in selectablePois" :key="poi.id" :value="String(poi.id)">
            {{ poi.name }}
          </option>
        </select>
      </label>

      <div class="field">
        <span>出行方式</span>
        <div class="mode-switch">
          <button :class="{ active: mode === 'walking' }" @click="mode = 'walking'">步行</button>
          <button :class="{ active: mode === 'driving' }" @click="mode = 'driving'">驾车</button>
        </div>
      </div>

      <button class="primary-btn" :disabled="planning" @click="planRoute">
        {{ planning ? '规划中…' : '开始规划' }}
      </button>
    </section>

    <p v-if="errorMsg" class="state error">{{ errorMsg }}</p>
    <p v-if="mapError" class="state error">地图不可用：{{ mapError }}（仍可正常规划路线）</p>

    <div ref="mapEl" class="map" :class="{ hidden: !!mapError }"></div>

    <section v-if="result" class="result">
      <div class="summary">
        <span class="mode-tag">{{ result.mode === 'walking' ? '步行' : '驾车' }}</span>
        <strong>{{ formatDistance(result.distance) }}</strong>
        <strong>{{ formatDuration(result.duration) }}</strong>
      </div>
      <ol class="steps">
        <li v-for="(step, index) in result.steps" :key="index">
          <span class="step-text">{{ step.instruction }}</span>
          <span class="step-meta">{{ formatDistance(step.distance) }}</span>
        </li>
      </ol>
    </section>
  </div>
</template>

<style scoped>
.nav-page {
  max-width: 1080px;
  margin: 0 auto;
  padding: 32px 20px 60px;
  color: #e8f3ff;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.page-header h1 {
  margin: 0 0 6px;
  font-size: 26px;
}

.page-header p {
  margin: 0;
  color: #8fa9c6;
  font-size: 13px;
}

.ghost-btn {
  border: 1px solid rgba(120, 170, 255, 0.3);
  border-radius: 8px;
  padding: 7px 14px;
  background: transparent;
  color: #a8c4e6;
  cursor: pointer;
}

.control-panel {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 14px;
  align-items: end;
  padding: 18px;
  margin-bottom: 18px;
  border-radius: 14px;
  background: rgba(15, 33, 58, 0.75);
  border: 1px solid rgba(120, 170, 255, 0.15);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: #8fa9c6;
}

.field select {
  padding: 9px 10px;
  border-radius: 8px;
  border: 1px solid rgba(120, 170, 255, 0.25);
  background: #0d1d33;
  color: #e8f3ff;
  font-size: 14px;
  outline: none;
}

.mode-switch {
  display: flex;
  border: 1px solid rgba(120, 170, 255, 0.25);
  border-radius: 8px;
  overflow: hidden;
}

.mode-switch button {
  flex: 1;
  padding: 9px 0;
  border: none;
  background: transparent;
  color: #a8c4e6;
  cursor: pointer;
}

.mode-switch button.active {
  background: rgba(79, 195, 247, 0.2);
  color: #4fc3f7;
}

.primary-btn {
  height: 42px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, #1976d2, #4fc3f7);
  color: #04101f;
  font-weight: 600;
  cursor: pointer;
}

.primary-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.map {
  width: 100%;
  height: 52vh;
  min-height: 340px;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid rgba(120, 170, 255, 0.15);
  background: rgba(10, 22, 40, 0.6);
}

.map.hidden {
  display: none;
}

.state {
  padding: 10px 0;
  color: #8fa9c6;
  font-size: 13px;
}

.state.error {
  color: #ff8a80;
}

.result {
  margin-top: 18px;
  padding: 18px;
  border-radius: 14px;
  background: rgba(15, 33, 58, 0.75);
  border: 1px solid rgba(120, 170, 255, 0.15);
}

.summary {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 14px;
  font-size: 16px;
}

.mode-tag {
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  color: #4fc3f7;
  background: rgba(79, 195, 247, 0.12);
}

.steps {
  margin: 0;
  padding-left: 20px;
  color: #9fb6d1;
  font-size: 13px;
  line-height: 1.8;
}

.steps li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 0;
  border-bottom: 1px dashed rgba(120, 170, 255, 0.12);
}

.step-meta {
  color: #6f88a6;
  white-space: nowrap;
}

@media (max-width: 640px) {
  .nav-page {
    padding: 20px 14px 48px;
  }
  .page-header h1 {
    font-size: 22px;
  }
  .control-panel {
    grid-template-columns: 1fr;
  }
  .map {
    height: 42vh;
  }
}
</style>
