// ============================================================
// location.js ― 現在地の取得
//
// 1. ブラウザの Geolocation API（GPSなど）で現在地を取る
// 2. 取れなかったときは、IPアドレスから大まかな位置を取る
//    （APIキー不要・HTTPS対応の無料サービス。1つ目がダメなら2つ目）
//
// ここで取った位置は画面に表示するだけで、勝手に保存はしない。
// 保存は、本人が場所を確認して「投稿する」を押したときだけ。
// ============================================================

export function getGpsPosition() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new LocationError('unsupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(new LocationError(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  });
}

const IP_SERVICES = [
  {
    // GeoJS: https://www.geojs.io/
    url: 'https://get.geojs.io/v1/ip/geo.json',
    parse: (d) => ({ lat: Number(d.latitude), lng: Number(d.longitude) }),
  },
  {
    // ipapi.co: https://ipapi.co/
    url: 'https://ipapi.co/json/',
    parse: (d) => ({ lat: Number(d.latitude), lng: Number(d.longitude) }),
  },
];

// 取れなければ null を返す
export async function getIpPosition() {
  for (const service of IP_SERVICES) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(service.url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) continue;
      const pos = service.parse(await res.json());
      if (Number.isFinite(pos.lat) && Number.isFinite(pos.lng) && !(pos.lat === 0 && pos.lng === 0)) {
        return pos;
      }
    } catch {
      // 次のサービスを試す
    }
  }
  return null;
}

export class LocationError extends Error {
  constructor(code) {
    super(code);
    this.name = 'LocationError';
    this.code = code;
  }
}
