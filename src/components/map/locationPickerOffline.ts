import type { LocationInfo } from '../../types/index.ts';
import { isValidCoordinatePair } from '../../utils/geoCoordinates.ts';
import { debugLog } from '../../utils/logger.ts';

type DistrictRange = {
  name: string;
  lat: [number, number];
  lng: [number, number];
};

type OfflineLocationRecord = {
  name: string;
  type: string;
  lat: [number, number];
  lng: [number, number];
  districts?: Array<string | DistrictRange>;
};

const locationDatabase: OfflineLocationRecord[] = [
  {
    name: '上海',
    type: '直辖市',
    lat: [31.0, 31.5],
    lng: [121.2, 121.8],
    districts: [
      { name: '黄浦区', lat: [31.220, 31.240], lng: [121.470, 121.500] },
      { name: '徐汇区', lat: [31.170, 31.220], lng: [121.420, 121.470] },
      { name: '长宁区', lat: [31.200, 31.240], lng: [121.380, 121.440] },
      { name: '静安区', lat: [31.220, 31.260], lng: [121.440, 121.480] },
      { name: '普陀区', lat: [31.230, 31.280], lng: [121.380, 121.440] },
      { name: '虹口区', lat: [31.250, 31.290], lng: [121.480, 121.520] },
      { name: '杨浦区', lat: [31.260, 31.320], lng: [121.500, 121.580] },
      { name: '闵行区', lat: [31.020, 31.120], lng: [121.300, 121.480] },
      { name: '宝山区', lat: [31.300, 31.420], lng: [121.440, 121.540] },
      { name: '嘉定区', lat: [31.350, 31.420], lng: [121.200, 121.300] },
      { name: '浦东新区', lat: [31.150, 31.350], lng: [121.500, 121.900] },
      { name: '金山区', lat: [30.720, 30.900], lng: [121.200, 121.400] },
      { name: '松江区', lat: [31.000, 31.120], lng: [121.180, 121.280] },
      { name: '青浦区', lat: [31.100, 31.200], lng: [121.000, 121.200] },
      { name: '奉贤区', lat: [30.900, 31.050], lng: [121.400, 121.600] },
      { name: '崇明区', lat: [31.600, 31.850], lng: [121.300, 121.950] },
    ],
  },
  { name: '北京', type: '直辖市', lat: [39.7, 40.2], lng: [116.0, 116.8], districts: ['东城区', '西城区', '朝阳区', '丰台区', '石景山区', '海淀区', '门头沟区', '房山区'] },
  { name: '天津', type: '直辖市', lat: [38.8, 39.4], lng: [116.8, 117.8], districts: ['和平区', '河东区', '河西区', '南开区', '河北区', '红桥区'] },
  { name: '重庆', type: '直辖市', lat: [29.0, 30.2], lng: [106.0, 108.0], districts: ['渝中区', '大渡口区', '江北区', '沙坪坝区', '九龙坡区', '南岸区'] },
  { name: '广州', type: '省会', lat: [22.8, 23.6], lng: [113.0, 113.8], districts: ['越秀区', '海珠区', '荔湾区', '天河区', '白云区', '黄埔区'] },
  { name: '深圳', type: '特区', lat: [22.4, 22.9], lng: [113.7, 114.6], districts: ['罗湖区', '福田区', '南山区', '宝安区', '龙岗区', '盐田区'] },
  { name: '杭州', type: '省会', lat: [30.0, 30.6], lng: [119.8, 120.5], districts: ['上城区', '下城区', '江干区', '拱墅区', '西湖区', '滨江区'] },
  { name: '南京', type: '省会', lat: [31.8, 32.4], lng: [118.4, 119.2], districts: ['玄武区', '秦淮区', '建邺区', '鼓楼区', '浦口区', '栖霞区'] },
  { name: '武汉', type: '省会', lat: [30.2, 31.0], lng: [113.8, 114.8], districts: ['江岸区', '江汉区', '硚口区', '汉阳区', '武昌区', '青山区'] },
  { name: '成都', type: '省会', lat: [30.3, 31.0], lng: [103.7, 104.5], districts: ['锦江区', '青羊区', '金牛区', '武侯区', '成华区', '龙泉驿区'] },
  { name: '西安', type: '省会', lat: [34.0, 34.5], lng: [108.6, 109.2], districts: ['新城区', '碑林区', '莲湖区', '灞桥区', '未央区', '雁塔区'] },
  { name: '郑州', type: '省会', lat: [34.5, 35.0], lng: [113.3, 114.0], districts: ['中原区', '二七区', '管城区', '金水区', '上街区', '惠济区'] },
  { name: '济南', type: '省会', lat: [36.4, 37.0], lng: [116.8, 117.4], districts: ['历下区', '市中区', '槐荫区', '天桥区', '历城区', '长清区'] },
  { name: '沈阳', type: '省会', lat: [41.6, 42.0], lng: [123.2, 123.8], districts: ['和平区', '沈河区', '大东区', '皇姑区', '铁西区', '苏家屯区'] },
  { name: '长春', type: '省会', lat: [43.6, 44.2], lng: [125.0, 125.6], districts: ['南关区', '宽城区', '朝阳区', '二道区', '绿园区', '双阳区'] },
  { name: '哈尔滨', type: '省会', lat: [45.5, 46.0], lng: [126.3, 127.0], districts: ['道里区', '道外区', '南岗区', '香坊区', '动力区', '平房区'] },
  { name: '昆明', type: '省会', lat: [24.7, 25.2], lng: [102.4, 103.0], districts: ['五华区', '盘龙区', '官渡区', '西山区', '东川区', '呈贡区'] },
  { name: '南昌', type: '省会', lat: [28.4, 29.0], lng: [115.6, 116.2], districts: ['东湖区', '西湖区', '青云谱区', '湾里区', '青山湖区', '新建区'] },
  { name: '福州', type: '省会', lat: [25.8, 26.4], lng: [119.0, 119.6], districts: ['鼓楼区', '台江区', '仓山区', '马尾区', '晋安区', '长乐区'] },
  { name: '合肥', type: '省会', lat: [31.6, 32.2], lng: [117.0, 117.6], districts: ['瑶海区', '庐阳区', '蜀山区', '包河区', '长丰县', '肥东县'] },
  { name: '石家庄', type: '省会', lat: [37.8, 38.4], lng: [114.2, 114.8], districts: ['长安区', '桥西区', '新华区', '井陉矿区', '裕华区', '藁城区'] },
  { name: '太原', type: '省会', lat: [37.6, 38.2], lng: [112.2, 112.8], districts: ['小店区', '迎泽区', '杏花岭区', '尖草坪区', '万柏林区', '晋源区'] },
  { name: '兰州', type: '省会', lat: [35.8, 36.4], lng: [103.4, 104.0], districts: ['城关区', '七里河区', '西固区', '安宁区', '红古区'] },
  { name: '银川', type: '省会', lat: [38.2, 38.8], lng: [106.0, 106.6], districts: ['兴庆区', '金凤区', '西夏区', '永宁县', '贺兰县'] },
  { name: '西宁', type: '省会', lat: [36.4, 37.0], lng: [101.4, 102.0], districts: ['城东区', '城中区', '城西区', '城北区'] },
  { name: '乌鲁木齐', type: '省会', lat: [43.6, 44.2], lng: [87.2, 88.0], districts: ['天山区', '沙依巴克区', '新市区', '水磨沟区', '头屯河区', '达坂城区'] },
  { name: '拉萨', type: '省会', lat: [29.4, 30.0], lng: [90.8, 91.4], districts: ['城关区', '堆龙德庆区', '达孜区', '林周县'] },
  { name: '呼和浩特', type: '省会', lat: [40.6, 41.2], lng: [111.4, 112.0], districts: ['新城区', '回民区', '玉泉区', '赛罕区'] },
  { name: '南宁', type: '省会', lat: [22.6, 23.2], lng: [108.0, 108.6], districts: ['兴宁区', '青秀区', '江南区', '西乡塘区', '良庆区', '邕宁区'] },
  { name: '海口', type: '省会', lat: [19.8, 20.4], lng: [110.0, 110.6], districts: ['秀英区', '龙华区', '琼山区', '美兰区'] },
  { name: '贵阳', type: '省会', lat: [26.3, 26.9], lng: [106.4, 107.0], districts: ['南明区', '云岩区', '花溪区', '乌当区', '白云区', '观山湖区'] },
];

function isDistrictRange(value: string | DistrictRange): value is DistrictRange {
  return typeof value !== 'string';
}

export function createSmartOfflineLocation(lat: number, lng: number): LocationInfo {
  debugLog('创建智能离线位置信息:', lat, lng);

  if (!isValidCoordinatePair(lat, lng)) {
    return {
      name: '未知位置',
      address: '未知地址',
    };
  }

  let matchedLocation: OfflineLocationRecord | null = null;
  let matchedDistrict: string | DistrictRange | null = null;
  let bestMatch: OfflineLocationRecord | null = null;
  let minDistance = Infinity;

  for (const location of locationDatabase) {
    if (lat >= location.lat[0] && lat <= location.lat[1] && lng >= location.lng[0] && lng <= location.lng[1]) {
      matchedLocation = location;

      if (location.districts?.length && isDistrictRange(location.districts[0])) {
        let closestDistrict: DistrictRange | null = null;
        let minDistrictDistance = Infinity;

        for (const district of location.districts) {
          if (!isDistrictRange(district)) {
            continue;
          }

          if (lat >= district.lat[0] && lat <= district.lat[1] && lng >= district.lng[0] && lng <= district.lng[1]) {
            matchedDistrict = district;
            debugLog(`精确匹配到区域: ${district.name}`);
            break;
          }

          const centerLat = (district.lat[0] + district.lat[1]) / 2;
          const centerLng = (district.lng[0] + district.lng[1]) / 2;
          const distance = Math.sqrt((lat - centerLat) ** 2 + (lng - centerLng) ** 2);

          if (distance < minDistrictDistance) {
            minDistrictDistance = distance;
            closestDistrict = district;
          }
        }

        if (!matchedDistrict && closestDistrict) {
          matchedDistrict = closestDistrict;
          debugLog(`最近的区域: ${closestDistrict.name}, 距离: ${minDistrictDistance.toFixed(4)}`);
        }
      }

      break;
    }

    const centerLat = (location.lat[0] + location.lat[1]) / 2;
    const centerLng = (location.lng[0] + location.lng[1]) / 2;
    const distance = Math.sqrt((lat - centerLat) ** 2 + (lng - centerLng) ** 2);

    if (distance < minDistance) {
      minDistance = distance;
      bestMatch = location;
    }
  }

  if (!matchedLocation && bestMatch && minDistance < 1.0) {
    matchedLocation = bestMatch;
  }

  if (matchedLocation) {
    let districtName = '市区';

    if (matchedDistrict) {
      districtName = isDistrictRange(matchedDistrict) ? matchedDistrict.name : matchedDistrict;
    } else if (matchedLocation.districts?.length) {
      const district = matchedLocation.districts[Math.floor(Math.random() * matchedLocation.districts.length)];
      districtName = isDistrictRange(district) ? district.name : district;
    }

    debugLog(`匹配到城市: ${matchedLocation.name}, 区域: ${districtName}`);

    return {
      name: `${matchedLocation.name}${districtName}`,
      latitude: lat,
      longitude: lng,
      address: `${matchedLocation.name}市${districtName}附近`,
      details: {
        city: matchedLocation.name,
        suburb: districtName,
        state: matchedLocation.name,
        country: '中国',
      },
    };
  }

  let regionName = '未知区域';
  const isInChina = lat >= 18 && lat <= 54 && lng >= 73 && lng <= 135;

  if (isInChina) {
    if (lat >= 45) regionName = '东北地区';
    else if (lat >= 35) regionName = '华北地区';
    else if (lat >= 30) regionName = '华东地区';
    else if (lat >= 25) regionName = '华南地区';
    else regionName = '南方地区';
  } else {
    regionName = `${lat.toFixed(1)}°N, ${lng.toFixed(1)}°E 附近`;
  }

  const locationInfo: LocationInfo = {
    name: regionName,
    latitude: lat,
    longitude: lng,
    address: `${regionName} (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
    details: {
      country: isInChina ? '中国' : undefined,
    },
  };

  debugLog('智能离线位置信息:', locationInfo);
  return locationInfo;
}
