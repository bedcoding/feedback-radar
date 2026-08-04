'use client';

import { useState } from 'react';

// 국가 이름 조회기. 인스턴스를 렌더마다 만들면 낭비라 모듈에서 한 번만 만든다.
const REGION_NAMES = (() => {
  try {
    return new Intl.DisplayNames(['ko'], { type: 'region' });
  } catch {
    return undefined;
  }
})();

/**
 * 국가 코드를 국기 이모지로. 'kr' → 🇰🇷. 없는 국가면 빈 문자열.
 *
 * core에 같은 함수(countryFlag)가 있지만 여기서 다시 만든다. core를 import하면
 * paths.ts의 fs와 db.ts의 better-sqlite3가 클라이언트 번들에 딸려 들어와 빌드가 깨진다.
 *
 * 형식만 보면 안 된다. 지역 표시 기호는 조합이 맞으면 무엇이든 렌더되므로,
 * 'jp'를 'ip'로 잘못 써도 🇮🇵이 그려져서 오타가 정상처럼 보인다.
 * Intl이 이름을 못 찾는 코드(= 코드를 그대로 돌려주는 코드)는 국기를 만들지 않는다.
 */
function flag(code: string): string {
  const cc = code.trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(cc)) return '';
  if (REGION_NAMES && REGION_NAMES.of(cc.toUpperCase()) === cc.toUpperCase()) return '';
  return String.fromCodePoint(...[...cc].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 97));
}

/**
 * 스토어 국가 입력칸. 입력한 코드를 국기로 바꿔 칸 옆에 실시간으로 띄운다.
 *
 * 국가 코드는 오타를 눈으로 잡기 어렵다. `jp`를 `ip`로 잘못 쓰면 형식 검사는 통과하고
 * 수집만 조용히 0건이 된다. 국기가 뜨지 않으면 그 자리에서 잘못된 코드임을 알 수 있다.
 */
export function CountryField({
  defaultValue,
  disabled,
}: {
  defaultValue: string;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(defaultValue);
  // 쉼표와 줄바꿈으로 나눈다 (서버 액션과 같은 규칙)
  const codes = [
    ...new Set(
      value
        .split(/[,\n]/)
        .map((c) => c.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  const flags = codes.map(flag).filter(Boolean);
  // 칸 안쪽에 들어가는 자리는 좁다. 세 개까지만 띄우고 나머지는 개수로 접는다.
  const shown = flags.slice(0, 3).join('');
  const rest = flags.length - Math.min(flags.length, 3);
  return (
    <span className="cty-field">
      <input
        name="countries"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="kr, us, jp"
        disabled={disabled}
      />
      {/* 국기를 하나도 못 만들었으면 칸을 비워 둔다 — 빈 자리가 곧 '코드가 잘못됐다'는 신호다 */}
      <span className="cty-flags">
        {shown}
        {rest > 0 && <span className="cty-more">+{rest}</span>}
      </span>
    </span>
  );
}
