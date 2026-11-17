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
import { loadAmap, type AmapMap, type AmapMarker, type AmapNamespace, type AmapOverlay } from '../utils/amapLoader';

/** 西湖默认中心点 */
const WEST_LAKE_CENTER: [number, number] = [120.1455, 30.245];

/** 起点下拉中“我的位置”的固定值 */
const MY_LOCATION_KEY = '__my_location__';

/** 高斯投影参数，用于 WGS-84 转 GCJ-02 */
const GCJ_A = 6378245.0;
const GCJ_EE = 0.00669342162296594323;

/** 纬度偏移量 */
function transformLat(x: number, y: number): number {
  let ret = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  ret += ((20 * Math.sin(y * Math.PI) + 40 * Math.sin((y / 3) * Math.PI)) * 2) / 3;
  ret += ((160 * Math.sin((y / 12) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30)) * 2) / 3;
  return ret;
}

/** 经度偏移量 */
function transformLng(x: number, y: number): number {
  let ret = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  ret += ((20 * Math.sin(x * Math.PI) + 40 * Math.sin((x / 3) * Math.PI)) * 2) / 3;
  ret += ((150 * Math.sin((x / 12) * Math.PI) + 300 * Math.sin((x / 30) * Math.PI)) * 2) / 3;
  return ret;
}

/**
 * 浏览器定位返回 WGS-84，高德使用 GCJ-02，这里做一次纠偏
 * @param lng 经度
 * @param lat 纬度
 * @returns 纠偏后的经纬度
 */
function wgs84ToGcj02(lng: number, lat: number): [number, number] {
  if (lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271) {
    return [lng, lat];
  }
  const dLat = transformLat(lng - 105, lat - 35);
  const dLng = transformLng(lng - 105, lat - 35);
  const radLat = (lat / 180) * Math.PI;
  const magic = 1 - GCJ_EE * Math.sin(radLat) ** 2;
  const sqrtMagic = Math.sqrt(magic);
  const newLat = lat + (dLat * 180) / (((GCJ_A * (1 - GCJ_EE)) / (magic * sqrtMagic)) * Math.PI);
  const newLng = lng + (dLng * 180) / ((GCJ_A / sqrtMagic) * Math.cos(radLat) * Math.PI);
  return [newLng, newLat];
}

/**
 * 计算两点之间的方位角
 * @param from 起点
 * @param to 终点
 * @returns 0-360 度，正北为 0
 */
function bearingBetween(from: { lng: number; lat: number }, to: { lng: number; lat: number }): number {
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * 生成带方向的定位标记，箭头指向行进方向
 * @param heading 方位角
 * @returns 标记 HTML
 */
function myMarkerHtml(heading: number): string {
  return `<div style="width:36px;height:36px;transform:rotate(${heading}deg);">
    <div style="width:0;height:0;margin:0 auto 2px;border-left:8px solid transparent;border-right:8px solid transparent;border-bottom:16px solid #3b82f6;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.4));"></div>
    <div style="width:14px;height:14px;margin:0 auto;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 0 5px rgba(59,130,246,0.25);"></div>
  </div>`;
}

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
const locating = ref(false);
const myLocation = ref<{ lng: number; lat: number } | null>(null);
const noticeMsg = ref('');

let amap: AmapNamespace | null = null;
let map: AmapMap | null = null;
let markers: AmapMarker[] = [];
let routeLine: AmapOverlay | null = null;
let myMarker: AmapMarker | null = null;
let locationWatchId: number | null = null;
let centeredOnMe = false;
let lastFix: { lng: number; lat: number } | null = null;
let lastHeading = 0;
let renderedHeading = 0;

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
      zoom: 14,
      center: WEST_LAKE_CENTER,
      viewMode: '2D'
    });
    renderMarkers();
    // 缩放后按当前级别决定是否显示景点名称，避免低级别时文字重叠
    map.on('zoomend', renderMarkers);
  } catch (error) {
    mapError.value = error instanceof Error ? error.message : '地图加载失败';
  }
}

/**
 * 在地图上渲染全部景点标记，点击标记可直接导航
 */
function renderMarkers(): void {
  if (!map || !amap) return;
  if (markers.length > 0) {
    map.remove(markers);
    markers = [];
  }
  const showLabels = map.getZoom() >= 14;
  markers = selectablePois.value.map((poi) => {
    const marker = new amap!.Marker({
      position: [poi.longitude, poi.latitude],
      title: poi.name,
      anchor: 'bottom-center',
      ...(showLabels
        ? {
            label: {
              content: `<span style="color:#dbeafe;font-size:12px;text-shadow:0 1px 3px rgba(0,0,0,0.9);">${poi.name}</span>`,
              direction: 'top'
            }
          }
        : {})
    });
    marker.on('click', () => {
      destId.value = String(poi.id);
      noticeMsg.value = `终点已设为「${poi.name}」`;
      if (originId.value) void planRoute();
    });
    return marker;
  });
  map.add(markers);
}

/**
 * 更新当前定位标记，首次定位在景区附近时把地图移到当前位置
 * @param lng 经度
 * @param lat 纬度
 * @param heading 行进方向（正北为 0 度）
 */
function updateMyMarker(lng: number, lat: number, heading: number): void {
  if (!map || !amap) return;
  if (!myMarker) {
    myMarker = new amap.Marker({
      position: [lng, lat],
      anchor: 'center',
      zIndex: 200,
      content: myMarkerHtml(heading)
    });
    renderedHeading = heading;
    map.add(myMarker);
  } else {
    myMarker.setPosition([lng, lat]);
    const diff = Math.abs(((heading - renderedHeading + 540) % 360) - 180);
    if (diff >= 3) {
      myMarker.setContent(myMarkerHtml(heading));
      renderedHeading = heading;
    }
  }
  if (!centeredOnMe) {
    centeredOnMe = true;
    const nearWestLake = Math.abs(lng - WEST_LAKE_CENTER[0]) < 1 && Math.abs(lat - WEST_LAKE_CENTER[1]) < 1;
    if (nearWestLake) {
      map.setZoomAndCenter(15, [lng, lat]);
    } else {
      noticeMsg.value = '当前位置距西湖较远，地图保持景区视图';
    }
  }
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
  // 近距离路线主动放大到合适级别，避免全览时看不清走向
  if (nav.polyline.length > 0) {
    const middle = nav.polyline[Math.floor(nav.polyline.length / 2)];
    const zoom =
      nav.distance <= 300 ? 18
        : nav.distance <= 800 ? 17
          : nav.distance <= 2000 ? 16
            : nav.distance <= 5000 ? 15
              : nav.distance <= 10000 ? 14
                : 0;
    if (zoom > 0) {
      map.setZoomAndCenter(zoom, [middle.lng, middle.lat]);
    }
  }
}

/**
 * 持续监听浏览器当前位置，实时更新地图上的定位标记
 * @returns Promise<void>
 */
async function locateMe(): Promise<void> {
  errorMsg.value = '';
  if (!('geolocation' in navigator)) {
    errorMsg.value = '当前浏览器不支持定位';
    return;
  }
  if (!window.isSecureContext) {
    errorMsg.value = '定位需要 HTTPS 或 localhost 访问，当前地址不安全';
    return;
  }
  if (locationWatchId !== null) {
    locating.value = myLocation.value === null;
    return;
  }
  locating.value = true;
  locationWatchId = navigator.geolocation.watchPosition(
    (position) => {
      const [lng, lat] = wgs84ToGcj02(position.coords.longitude, position.coords.latitude);
      let heading = lastHeading;
      const deviceHeading = position.coords.heading;
      if (deviceHeading !== null && Number.isFinite(deviceHeading) && deviceHeading >= 0) {
        heading = deviceHeading;
      } else if (lastFix) {
        const moved = Math.hypot(
          (lng - lastFix.lng) * Math.cos((lat * Math.PI) / 180) * 111320,
          (lat - lastFix.lat) * 110540
        );
        if (moved >= 2) {
          heading = bearingBetween(lastFix, { lng, lat });
        }
      }
      lastFix = { lng, lat };
      lastHeading = heading;
      myLocation.value = { lng, lat };
      locating.value = false;
      updateMyMarker(lng, lat, heading);
    },
    (error) => {
      locating.value = false;
      errorMsg.value =
        error.code === error.PERMISSION_DENIED
          ? '定位权限被拒绝，请在浏览器设置中允许后重试'
          : '定位失败，请检查系统定位服务或稍后重试';
      if (error.code === error.PERMISSION_DENIED && locationWatchId !== null) {
        navigator.geolocation.clearWatch(locationWatchId);
        locationWatchId = null;
      }
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
  );
}

/**
 * 发起路径规划
 * @returns Promise<void>
 */
async function planRoute(): Promise<void> {
  errorMsg.value = '';
  let originPoint: { lng: number; lat: number } | null = null;
  let originPoiId: string | null = null;
  if (originId.value === MY_LOCATION_KEY) {
    originPoint = myLocation.value;
  } else {
    const origin = selectablePois.value.find((poi) => String(poi.id) === originId.value);
    if (origin) {
      originPoiId = String(origin.id);
      if (origin.longitude !== null && origin.latitude !== null) {
        originPoint = { lng: origin.longitude, lat: origin.latitude };
      }
    }
  }
  const destination = selectablePois.value.find((poi) => String(poi.id) === destId.value);

  if (!originId.value || !destination) {
    errorMsg.value = '请选择起点和终点';
    return;
  }
  if (!originPoint) {
    errorMsg.value = originId.value === MY_LOCATION_KEY ? '尚未获取当前位置，请重新定位' : '该景点缺少坐标，无法规划';
    return;
  }
  if (originPoiId !== null && originPoiId === String(destination.id)) {
    errorMsg.value = '起点和终点不能相同';
    return;
  }
  if (destination.longitude === null || destination.latitude === null) {
    errorMsg.value = '该景点缺少坐标，无法规划';
    return;
  }

  planning.value = true;
  try {
    const nav = await planNavigation(
      originPoint,
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

/** 选择“我的位置”时自动请求定位授权 */
watch(originId, (value) => {
  if (value === MY_LOCATION_KEY && !myLocation.value) {
    void locateMe();
  }
});

onMounted(async () => {
  await loadPois();
  await initMap();
  renderMarkers();
  void locateMe();
});

onBeforeUnmount(() => {
  if (locationWatchId !== null) {
    navigator.geolocation.clearWatch(locationWatchId);
    locationWatchId = null;
  }
  map?.destroy();
  map = null;
  amap = null;
  routeLine = null;
  markers = [];
  myMarker = null;
});
</script>

<template>
  <div class="nav-page">
    <header class="page-header">
      <div>
        <h1>AI 导航</h1>
        <p>实时显示当前位置，点击地图上的景点标记可直接导航</p>
      </div>
      <button class="ghost-btn" @click="router.push('/pois')">景点列表</button>
    </header>

    <section class="control-panel">
      <label class="field">
        <span>起点</span>
        <select v-model="originId">
          <option value="" disabled>请选择起点</option>
          <option :value="MY_LOCATION_KEY">
            {{ locating ? '定位中…' : myLocation ? '我的位置（已定位）' : '我的位置（需授权）' }}
          </option>
          <option v-for="poi in selectablePois" :key="poi.id" :value="String(poi.id)">
            {{ poi.name }}
          </option>
        </select>
        <small v-if="originId === MY_LOCATION_KEY" class="hint">
          {{ locating ? '正在获取当前位置…' : myLocation ? '已获取当前位置，可直接规划' : '选择后请在浏览器中允许定位' }}
        </small>
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
    <p v-if="noticeMsg" class="state notice">{{ noticeMsg }}</p>
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

.hint {
  color: #7f9bb8;
  font-size: 12px;
  line-height: 1.4;
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

.state.notice {
  color: #7ee0a3;
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
