"use client";

import { hasKakaoNavigationKey, openKakaoNavi } from "../../lib/kakao-navigation";

export default function NavigationLinks({ place }: { place: { name: string; longitude: number; latitude: number } }) {
  const name = encodeURIComponent(place.name);
  const tmap = `tmap://route?goalname=${name}&goalx=${place.longitude}&goaly=${place.latitude}`;
  const naver = `nmap://navigation?dlat=${place.latitude}&dlng=${place.longitude}&dname=${name}&appname=gildam-trip`;
  const kakaoEnabled = hasKakaoNavigationKey();
  return (
    <div className="navigation-links" aria-label={`${place.name} 내비게이션 앱으로 열기`}>
      <a href={tmap} aria-label={`TMAP으로 ${place.name} 길 안내`} title="TMAP">
        <i className="nav-app-icon tmap-icon">T</i>
      </a>
      <button
        type="button"
        onClick={() => openKakaoNavi(place)}
        disabled={!kakaoEnabled}
        title={!kakaoEnabled ? "카카오 JavaScript 키 설정 필요" : "카카오내비"}
        aria-label={`카카오내비로 ${place.name} 길 안내`}
      >
        <i className="nav-app-icon kakao-icon">K</i>
      </button>
      <a href={naver} aria-label={`네이버지도로 ${place.name} 길 안내`} title="네이버지도">
        <i className="nav-app-icon naver-icon">N</i>
      </a>
    </div>
  );
}
