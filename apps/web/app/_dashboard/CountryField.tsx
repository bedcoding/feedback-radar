'use client';

import { useState } from 'react';
import { flag } from './labels';

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
