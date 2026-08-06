'use client';

import { useState } from 'react';

/**
 * 검색 키워드 입력칸. 지금 몇 개인지를 칸 안쪽에 실시간으로 띄운다.
 *
 * 카드 헤더의 "검색 키워드 N개"는 서버가 설정 파일을 읽어 만든 값이라 저장한 뒤에야 바뀐다.
 * 키워드 하나가 곧 수집량과 분류 호출량이라, 저장을 누르기 전에 몇 개를 넣고 있는지
 * 보이는 편이 낫다. 그래서 이 칸만 클라이언트 컴포넌트로 둔다.
 */
export function KeywordField({
  defaultValue,
  disabled,
}: {
  defaultValue: string;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(defaultValue);
  // 쉼표, 줄바꿈, 가운뎃점으로 나눈다 (서버 액션과 같은 규칙)
  const count = value.split(/[,\n·]/).filter((k) => k.trim()).length;
  return (
    <span className="kw-field">
      <input
        name="keywords"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="검색 키워드 (쉼표로 구분)"
        disabled={disabled}
        required
      />
      <span className="kw-count">{count}</span>
    </span>
  );
}
