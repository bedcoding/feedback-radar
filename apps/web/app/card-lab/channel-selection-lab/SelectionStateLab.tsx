'use client';

import Link from 'next/link';
import { useState } from 'react';

import { ChannelMark } from '../concepts/_components/Shared';
import { channels } from '../concepts/_data/channels';
import styles from './page.module.css';

const demoChannels = channels.slice(0, 4);

const variants = [
  {
    id: 'current',
    number: '00',
    name: '현재 방식',
    cue: '파란 세로선 + 옅은 파란 면',
    character: 'SaaS 대시보드',
    note: '선택은 가장 빠르게 보이지만 익숙한 AI 생성 UI 문법에 가깝습니다.',
  },
  {
    id: 'paper',
    number: '01',
    name: '종이 탭 연결형',
    cue: '본문과 이어지는 흰색 탭',
    character: '편집판 · 기준안',
    note: '색 대신 좌측 목록과 우측 본문의 연결 관계로 선택을 설명합니다.',
  },
  {
    id: 'type',
    number: '02',
    name: '활자 강조형',
    cue: '굵기와 명도만 변화',
    character: '가장 절제됨',
    note: '장식을 거의 없애 게시판 제목과 본문에 시선이 가장 오래 머뭅니다.',
  },
  {
    id: 'avatar',
    number: '03',
    name: '마크 반전형',
    cue: '원형 채널 마크만 반전',
    character: '브랜드 중심',
    note: '행 전체를 칠하지 않아 가볍지만 작은 화면에서는 강조가 다소 약합니다.',
  },
  {
    id: 'rules',
    number: '04',
    name: '신문 인덱스형',
    cue: '위·아래의 가는 괘선',
    character: '아카이브 · 편집형',
    note: '라운드를 버리고 신문 목차처럼 선택된 행의 영역만 구획합니다.',
  },
  {
    id: 'marker',
    number: '05',
    name: '오른쪽 표식형',
    cue: '중립 면 + 오른쪽 작은 점',
    character: '목록 탐색형',
    note: '시선이 흐르는 방향 끝에 표식을 두어 다음 본문으로 자연스럽게 이어집니다.',
  },
  {
    id: 'hybrid',
    number: '06',
    name: '편집 탭 혼합형',
    cue: '본문 연결 70 · 가는 괘선 30',
    character: '새 추천안',
    note: '흰 탭으로 본문과 연결하고, 각을 세운 위·아래 선과 활자 대비로 현재 위치를 보강합니다.',
  },
] as const;

type VariantId = (typeof variants)[number]['id'];

function SelectionSpecimen({ variant }: { variant: (typeof variants)[number] }) {
  const [selectedId, setSelectedId] = useState(demoChannels[0]?.id ?? '');
  const selected = demoChannels.find((channel) => channel.id === selectedId) ?? demoChannels[0];

  if (!selected) return null;

  return (
    <article
      id={`variant-${variant.id}`}
      className={styles.specimen}
      data-recommended={variant.id === 'hybrid' ? 'true' : undefined}
    >
      <header className={styles.specimenHeader}>
        <span>{variant.number}</span>
        <div>
          <h2>{variant.name}</h2>
          <p>{variant.cue}</p>
        </div>
        <small>{variant.character}</small>
      </header>

      <div className={styles.preview} data-variant={variant.id satisfies VariantId}>
        <aside className={styles.channelRail} aria-label={`${variant.name} 채널 선택 예시`}>
          <div className={styles.railHeading}>
            <strong>채널</strong>
            <span>4</span>
          </div>
          <nav>
            {demoChannels.map((channel) => {
              const isSelected = selected.id === channel.id;
              return (
                <button
                  type="button"
                  className={styles.channelButton}
                  data-selected={isSelected ? 'true' : undefined}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedId(channel.id)}
                  key={channel.id}
                >
                  <ChannelMark channel={channel} size="sm" />
                  <span className={styles.channelCopy}>
                    <strong>{channel.name}</strong>
                    <small>{channel.count.toLocaleString('ko-KR')}건 · 실데이터</small>
                  </span>
                  <i className={styles.marker} aria-hidden="true" />
                </button>
              );
            })}
          </nav>
        </aside>

        <section className={styles.miniBoard}>
          <span className={styles.srOnly} role="status">
            {selected.name} 채널 선택됨
          </span>
          <header>
            <span>{selected.initials}</span>
            <div>
              <strong>{selected.name}</strong>
              <small>{selected.kind}</small>
            </div>
          </header>
          <div className={styles.boardMeta}>
            <span>최근 수집 글</span>
            <small>{selected.count.toLocaleString('ko-KR')}건</small>
          </div>
          <ul aria-hidden="true">
            <li><b /><span /></li>
            <li><b /><span /></li>
            <li><b /><span /></li>
          </ul>
        </section>
      </div>

      <p className={styles.specimenNote}>{variant.note}</p>
    </article>
  );
}

export default function SelectionStateLab() {
  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/card-lab/concepts/09-news-reader">← 9번 채널 게시판</Link>
        <span>Feedback Radar · UI Detail Lab</span>
      </header>

      <section className={styles.hero}>
        <p>SELECTION STATE STUDY · 01</p>
        <h1>채널 선택을<br />어떻게 보여줄까</h1>
        <div className={styles.heroBottom}>
          <p>
            데이터, 크기, 간격은 같게 두고 선택된 채널을 알리는 방식만 바꿨습니다.
            각 목록에서 다른 채널을 눌러 실제 전환감을 비교해보세요.
          </p>
          <dl>
            <div><dt>비교안</dt><dd>7</dd></div>
            <div><dt>추천</dt><dd>06</dd></div>
          </dl>
        </div>
      </section>

      <section className={styles.grid} aria-label="채널 선택 강조 방식 7개">
        {variants.map((variant) => <SelectionSpecimen variant={variant} key={variant.id} />)}
      </section>

      <footer className={styles.footer}>
        <div>
          <strong>추천 기준</strong>
          <p>선택은 분명하되 제목보다 먼저 튀지 않고, 게시판·편집판의 분위기를 깨지 않는가</p>
        </div>
        <Link href="/card-lab/concepts/09-news-reader">기존 화면으로 돌아가기 →</Link>
      </footer>
    </main>
  );
}
