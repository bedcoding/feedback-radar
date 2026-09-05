import type { Metadata } from 'next';
import Link from 'next/link';
import { conceptMeta, snapshotLabel } from './_data/channels';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Design Atlas · 10 Concepts | Feedback Radar',
  description: '동일한 피드백 데이터를 열 가지 정보 구조로 비교하는 디자인 탐색 페이지',
};

function PreviewGlyph({ layout }: { layout: string }) {
  return (
    <div className={styles.previewGlyph} data-layout={layout} aria-hidden="true">
      {Array.from({ length: 9 }, (_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}

export default function ConceptGalleryPage() {
  return (
    <main className={styles.gallery}>
      <header className={styles.topbar}>
        <Link className={styles.brand} href="/card-lab/concepts">
          <span>FR</span>
          <strong>Feedback Radar</strong>
        </Link>
        <nav aria-label="시안 이동">
          <Link href="/card-lab/news">현재 뉴스룸</Link>
          <Link href="/card-lab">카드 시안</Link>
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>DESIGN ATLAS · EXPLORATION 01</p>
          <h1>
            같은 데이터,
            <br />
            열 가지 읽는 방식
          </h1>
          <p className={styles.heroSummary}>
            채널별 마지막 수집분을 뉴스처럼 훑고, 필요할 때 근거까지 읽는 화면을 구조부터
            다시 탐색했습니다. 색상 변형이 아니라 탐색 순서와 정보 위계가 서로 다른 시안입니다.
          </p>
          <div className={styles.snapshot}>{snapshotLabel}</div>
        </div>
        <div className={styles.heroFacts}>
          <div>
            <strong>10</strong>
            <span>서로 다른 구조</span>
          </div>
          <div>
            <strong>7</strong>
            <span>동일한 채널</span>
          </div>
          <div>
            <strong>1</strong>
            <span>고정 데이터셋</span>
          </div>
          <p>
            대표 제목만 굵게, 일반 내용과 메타 정보는 모두 400으로 통일해 구조만 공정하게
            비교합니다.
          </p>
        </div>
      </section>

      <section className={styles.conceptSection} aria-labelledby="concept-list-title">
        <header className={styles.sectionHeading}>
          <div>
            <p>STRUCTURAL DIRECTIONS</p>
            <h2 id="concept-list-title">시안 10개</h2>
          </div>
          <p>각 카드를 누르면 같은 데이터를 넣은 전체 화면이 열립니다.</p>
        </header>

        <div className={styles.conceptGrid}>
          {conceptMeta.map((concept) => (
            <Link className={styles.conceptCard} href={`/card-lab/concepts/${concept.slug}`} key={concept.slug}>
              <div className={styles.cardTopline}>
                <span>{concept.number}</span>
                <small>{concept.reference}</small>
              </div>
              <PreviewGlyph layout={concept.layout} />
              <div className={styles.cardCopy}>
                <h3>{concept.name}</h3>
                <p>{concept.subtitle}</p>
                <dl>
                  <div>
                    <dt>강점</dt>
                    <dd>{concept.question}</dd>
                  </div>
                  <div>
                    <dt>주의</dt>
                    <dd>{concept.tradeoff}</dd>
                  </div>
                </dl>
              </div>
              <span className={styles.openLabel}>전체 시안 보기 <b aria-hidden="true">↗</b></span>
            </Link>
          ))}
        </div>
      </section>

      <footer className={styles.footer}>
        <div>
          <strong>비교 기준</strong>
          <p>2초 안에 핵심이 보이는가 · 채널별 시점 차이가 숨겨지지 않는가 · 세부 내용이 편하게 읽히는가</p>
        </div>
        <Link href="/card-lab/news">기존 뉴스룸 시안으로 돌아가기</Link>
      </footer>
    </main>
  );
}

