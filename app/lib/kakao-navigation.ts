const KAKAO_JAVASCRIPT_KEY = process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY ?? "";
let kakaoSdkPromise: Promise<void> | null = null;

declare global {
  interface Window {
    Kakao?: {
      init: (key: string) => void;
      isInitialized: () => boolean;
      Navi: { start: (options: { name: string; x: number; y: number; coordType: "wgs84" }) => void };
    };
  }
}

function loadKakaoSdk() {
  if (window.Kakao) return Promise.resolve();
  if (kakaoSdkPromise) return kakaoSdkPromise;
  kakaoSdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://t1.kakaocdn.net/kakao_js_sdk/2.8.1/kakao.min.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("카카오내비 연결 모듈을 불러오지 못했습니다."));
    document.head.appendChild(script);
  });
  return kakaoSdkPromise;
}

export function hasKakaoNavigationKey() {
  return Boolean(KAKAO_JAVASCRIPT_KEY);
}

export async function openKakaoNavi(place: { name: string; longitude: number; latitude: number }) {
  if (!KAKAO_JAVASCRIPT_KEY) {
    window.alert("카카오내비 JavaScript 키가 아직 설정되지 않았습니다.");
    return;
  }
  try {
    await loadKakaoSdk();
    if (!window.Kakao) throw new Error("카카오내비를 실행하지 못했습니다.");
    if (!window.Kakao.isInitialized()) window.Kakao.init(KAKAO_JAVASCRIPT_KEY);
    window.Kakao.Navi.start({ name: place.name, x: place.longitude, y: place.latitude, coordType: "wgs84" });
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "카카오내비를 실행하지 못했습니다.");
  }
}
