'use client';

import { useState, useTransition } from 'react';

/**
 * 둘러보기 PDF를 굽고 받는 플로팅 버튼.
 *
 * 발표 자료는 화면을 고칠 때마다 다시 만들어야 하는데, 그때마다 터미널을 열게 하면 결국
 * 안 만들게 되고 자료가 코드보다 뒤처진다. 보고 있는 화면에서 바로 굽는 편이 낫다.
 *
 * 굽는 데 40초쯤 걸린다(14단계를 하나씩 열어 찍는다). 그동안 무엇을 하고 있는지 밝히지
 * 않으면 멈춘 것으로 보이므로 버튼 안에 상태를 적는다.
 */
export function TourPdfButton({
  live,
  hasPdf,
  build,
}: {
  /** 실데이터판을 굽는지 (예시 데이터판과 파일이 따로다) */
  live: boolean;
  hasPdf: boolean;
  build: (live: boolean) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  /** 방금 구웠는지: 서버가 다시 렌더되기 전에도 다운로드를 열어 주기 위해 */
  const [justBuilt, setJustBuilt] = useState(false);

  const ready = hasPdf || justBuilt;
  const href = `/tour/pdf${live ? '?live=1' : ''}`;

  return (
    <div className="tour-pdf">
      {error && <span className="tour-pdf-err">{error}</span>}

      {ready && (
        <a className="tour-pdf-get" href={href} download>
          ⤓ PDF 받기
        </a>
      )}

      <button
        type="button"
        className="tour-pdf-make"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(undefined);
            try {
              await build(live);
              setJustBuilt(true);
            } catch (e) {
              // 실패 사유는 서버 콘솔에 전문이 남는다. 화면에는 첫 줄만
              setError((e as Error).message.split('\n')[0].slice(0, 120));
            }
          })
        }
        title="지금 화면 상태로 단계별 PDF를 만듭니다 (약 40초)"
      >
        {pending ? '만드는 중… 40초쯤' : ready ? '다시 만들기' : 'PDF 만들기'}
      </button>
    </div>
  );
}
