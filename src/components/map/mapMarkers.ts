import { debugError, debugLog, debugWarn } from '../../utils/logger.ts';
import type { AMapMapLike, AMapMarkerSdk, AMapOverlay } from './amapTypes';

function removeOverlaySafely(map: AMapMapLike, overlay: AMapOverlay | null) {
  if (!overlay) {
    return;
  }

  try {
    map.remove(overlay);
  } catch (error) {
    debugWarn('🗺️ 移除旧标记失败:', error);
  }
}

function createCanvasDataUrl(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas上下文初始化失败');
  }

  draw(ctx);
  return canvas.toDataURL();
}

export function replaceUserLocationMarker({
  AMap,
  map,
  existingMarker,
  lng,
  lat,
}: {
  AMap: AMapMarkerSdk;
  map: AMapMapLike;
  existingMarker: AMapOverlay | null;
  lng: number;
  lat: number;
}): AMapOverlay | null {
  removeOverlaySafely(map, existingMarker);

  try {
    const simpleMarker = new AMap.Marker({
      position: [lng, lat],
      title: '您的位置（简单标记）',
    });

    map.add(simpleMarker);
    return simpleMarker;
  } catch (simpleError) {
    debugError('🗺️ 简单标记失败:', simpleError);
  }

  try {
    const size = 24;
    const image = createCanvasDataUrl(size, size, (ctx) => {
      const center = size / 2;
      ctx.clearRect(0, 0, size, size);

      ctx.beginPath();
      ctx.arc(center + 1, center + 1, 10, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(center, center, 10, 0, 2 * Math.PI);
      ctx.fillStyle = 'white';
      ctx.fill();
      ctx.strokeStyle = '#1890ff';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(center, center, 6, 0, 2 * Math.PI);
      ctx.fillStyle = '#1890ff';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(center, center, 2, 0, 2 * Math.PI);
      ctx.fillStyle = 'white';
      ctx.fill();
    });

    const userMarker = new AMap.Marker({
      position: [lng, lat],
      icon: new AMap.Icon({
        size: new AMap.Size(size, size),
        image,
        imageOffset: new AMap.Pixel(0, 0),
      }),
      title: '您的位置',
      zIndex: 150,
      offset: new AMap.Pixel(-size / 2, -size / 2),
    });

    map.add(userMarker);
    return userMarker;
  } catch (error) {
    debugError('🗺️ 添加用户位置标记失败:', error);
  }

  try {
    const userMarker = new AMap.Marker({
      position: [lng, lat],
      icon: new AMap.Icon({
        size: new AMap.Size(32, 32),
        image: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
            <circle cx="16" cy="16" r="14" fill="white" stroke="#1890ff" stroke-width="3"/>
            <circle cx="16" cy="16" r="8" fill="#1890ff"/>
            <circle cx="16" cy="16" r="3" fill="white"/>
          </svg>
        `),
        imageOffset: new AMap.Pixel(0, 0),
      }),
      title: '您的位置',
      zIndex: 150,
      offset: new AMap.Pixel(-16, -16),
    });

    map.add(userMarker);
    debugLog('🗺️ 使用SVG标记成功');
    return userMarker;
  } catch (svgError) {
    debugError('🗺️ SVG标记失败:', svgError);
  }

  try {
    const circle = new AMap.Circle({
      center: [lng, lat],
      radius: 8,
      strokeColor: 'white',
      strokeWeight: 4,
      fillColor: '#1890ff',
      fillOpacity: 1.0,
      zIndex: 150,
    });

    map.add(circle);
    debugLog('🗺️ 使用备用圆形标记成功');
    return circle;
  } catch (circleError) {
    debugError('🗺️ 所有标记方案都失败:', circleError);
    return null;
  }
}

export function replaceSelectionMarker({
  AMap,
  map,
  existingMarker,
  lng,
  lat,
}: {
  AMap: AMapMarkerSdk;
  map: AMapMapLike;
  existingMarker: AMapOverlay | null;
  lng: number;
  lat: number;
}): AMapOverlay | null {
  removeOverlaySafely(map, existingMarker);

  try {
    const size = 20;
    const center = size / 2;
    const image = createCanvasDataUrl(size, size, (ctx) => {
      ctx.beginPath();
      ctx.arc(center, center, 8, 0, 2 * Math.PI);
      ctx.fillStyle = '#ff4d4f';
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(center, center, 3, 0, 2 * Math.PI);
      ctx.fillStyle = 'white';
      ctx.fill();
    });

    const redMarker = new AMap.Marker({
      position: [lng, lat],
      icon: new AMap.Icon({
        size: new AMap.Size(size, size),
        image,
        imageOffset: new AMap.Pixel(0, 0),
      }),
      title: '选择的位置',
      zIndex: 200,
      offset: new AMap.Pixel(-center, -center),
    });

    map.add(redMarker);
    debugLog('🗺️ 红色选择位置标记添加成功');
    return redMarker;
  } catch (simpleError) {
    debugError('🗺️ 红色标记失败:', simpleError);
  }

  try {
    const width = 30;
    const height = 40;
    const image = createCanvasDataUrl(width, height, (ctx) => {
      ctx.clearRect(0, 0, width, height);

      ctx.beginPath();
      ctx.arc(16, 16, 12, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(15, 15, 12, 0, 2 * Math.PI);
      ctx.fillStyle = '#ff4d4f';
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(15, 15, 4, 0, 2 * Math.PI);
      ctx.fillStyle = 'white';
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(15, 27);
      ctx.lineTo(10, 35);
      ctx.lineTo(20, 35);
      ctx.closePath();
      ctx.fillStyle = '#ff4d4f';
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    const marker = new AMap.Marker({
      position: [lng, lat],
      icon: new AMap.Icon({
        size: new AMap.Size(width, height),
        image,
        imageOffset: new AMap.Pixel(0, 0),
      }),
      title: '选择的位置',
      zIndex: 200,
      offset: new AMap.Pixel(-15, -35),
    });

    map.add(marker);
    debugLog('🗺️ 选择位置标记添加成功');
    return marker;
  } catch (error) {
    debugError('🗺️ 添加选择位置标记失败:', error);
  }

  try {
    const marker = new AMap.Marker({
      position: [lng, lat],
      icon: new AMap.Icon({
        size: new AMap.Size(25, 34),
        image: 'https://webapi.amap.com/theme/v1.3/markers/n/mark_r.png',
        imageOffset: new AMap.Pixel(0, 0),
      }),
      title: '选择的位置',
      zIndex: 200,
      offset: new AMap.Pixel(-12, -34),
    });

    map.add(marker);
    debugLog('🗺️ 使用默认红色标记成功');
    return marker;
  } catch (defaultError) {
    debugError('🗺️ 默认标记也失败:', defaultError);
    return null;
  }
}
