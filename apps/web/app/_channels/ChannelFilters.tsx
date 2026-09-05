'use client';

/*
  게시판 머리의 필터 줄.

  게시판 본체는 서버에서 그린다. 이 줄만 클라이언트인 이유는 **바깥을 눌렀을 때 닫히는
  동작** 때문이다. 처음에는 스크립트를 아예 안 쓰려고 <details> 로 만들었는데, 그건
  자기 자리를 눌러야만 닫힌다. 셋을 다 펼쳐 놓고 목록을 보려 하면 화면을 가린 채로
  남아 있었다.

  여기서 서버 전용 모듈(liveData 등)을 절대 import 하지 않는다. 상수 하나 때문에
  그 파일을 물었다가 pg 드라이버까지 브라우저 번들로 끌려온 적이 있다. 그래서 주소도
  함수가 아니라 **미리 만들어진 문자열**로 받는다 (서버 → 클라이언트로 함수는 못 넘긴다).
*/

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import styles from './channelBoard.module.css';

export interface ChannelFilterMenu {
  id: string;
  /** 아무것도 안 고른 상태에서 보일 이름 */
  label: string;
  active?: string;
  /** 이 축을 해제하는 주소 */
  allHref: string;
  options: { key: string; label: string; count: number; href: string }[];
}

export function ChannelFilters({
  menus,
  resetHref,
}: {
  menus: ChannelFilterMenu[];
  resetHref?: string;
}) {
  /** 한 번에 하나만 열린다. 셋이 겹쳐 뜨면 뒤엣것이 앞엣것을 가린다 */
  const [openId, setOpenId] = useState<string | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openId) return undefined;

    // pointerdown 으로 듣는다. click 까지 기다리면 누른 자리의 링크가 먼저 반응한다
    function onPointerDown(event: PointerEvent) {
      if (!rowRef.current?.contains(event.target as Node)) setOpenId(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenId(null);
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openId]);

  return (
    <div className={styles.readerFilters} ref={rowRef}>
      {menus.map((menu) => {
        const activeLabel = menu.options.find((option) => option.key === menu.active)?.label;
        /*
          고를 값이 하나뿐이면(예: 더쿠는 전부 한국어) 열어도 소용이 없다. 그렇다고
          단추를 지우면 채널을 바꿀 때마다 줄이 셋이었다 둘이었다 해서 옆 것이 밀린다.
          자리는 지키고 누를 수 없게만 둔다.
        */
        if (menu.options.length < 2) {
          return (
            <span
              key={menu.id}
              className={styles.readerFilterMenu}
              data-disabled="true"
              aria-disabled="true"
            >
              <span>{menu.label}</span>
            </span>
          );
        }

        const open = openId === menu.id;
        return (
          <div
            key={menu.id}
            className={styles.readerFilterMenu}
            data-on={menu.active ? 'true' : undefined}
            data-open={open ? 'true' : undefined}
          >
            <button
              type="button"
              aria-expanded={open}
              aria-haspopup="menu"
              onClick={() => setOpenId(open ? null : menu.id)}
            >
              {activeLabel ?? menu.label}
            </button>
            {open && (
              <div role="menu">
                <Link href={menu.allHref} data-on={menu.active ? undefined : 'true'} role="menuitem">
                  전체
                </Link>
                {menu.options.map((option) => (
                  <Link
                    key={option.key}
                    href={option.href}
                    data-on={menu.active === option.key ? 'true' : undefined}
                    role="menuitem"
                  >
                    {option.label} <b>{option.count.toLocaleString('ko-KR')}</b>
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {resetHref && (
        <Link className={styles.readerFilterReset} href={resetHref}>
          해제
        </Link>
      )}
    </div>
  );
}
