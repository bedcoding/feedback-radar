import type { Metadata } from 'next';
import type { ComponentType } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { channels, conceptMeta, snapshotLabel, type ChannelSample } from '../_data/channels';
import { loadConcept09Data } from '../_data/liveChannels';
import { Concept01, Concept02, Concept03 } from '../_variants/VariantsA';
import { Concept04, Concept05, Concept06 } from '../_variants/VariantsB';
import { Concept07, Concept08, Concept09, Concept10 } from '../_variants/VariantsC';
import styles from './concept.module.css';

export const dynamic = 'force-dynamic';

interface ConceptProps {
  channels: ChannelSample[];
}

const conceptComponents: Record<string, ComponentType<ConceptProps>> = {
  '01-channel-desk': Concept01,
  '02-newsstand': Concept02,
  '03-channel-shelf': Concept03,
  '04-front-page': Concept04,
  '05-issue-lens': Concept05,
  '06-collection-timeline': Concept06,
  '07-comparison-matrix': Concept07,
  '08-accordion': Concept08,
  '09-news-reader': Concept09,
  '10-channel-report': Concept10,
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const concept = conceptMeta.find((item) => item.slug === slug);

  if (!concept) {
    return { title: 'Concept not found | Feedback Radar' };
  }

  return {
    title: `${concept.number}. ${concept.name} | Feedback Radar`,
    description: concept.subtitle,
  };
}

export default async function ConceptPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const index = conceptMeta.findIndex((item) => item.slug === slug);

  if (index < 0) notFound();

  const concept = conceptMeta[index];
  const Previous = conceptMeta[(index - 1 + conceptMeta.length) % conceptMeta.length];
  const Next = conceptMeta[(index + 1) % conceptMeta.length];
  const Concept = conceptComponents[concept.slug];

  if (!Concept) notFound();

  const conceptData =
    concept.slug === '09-news-reader'
      ? await loadConcept09Data(channels, snapshotLabel)
      : { channels, label: snapshotLabel };

  return (
    <main className={styles.conceptPage}>
      <header className={styles.shellHeader}>
        <div className={styles.shellBar}>
          <Link className={styles.backLink} href="/card-lab/concepts">
            <span aria-hidden="true">←</span> 10개 시안
          </Link>
          <div className={styles.shellBrand}>
            <span>FR</span>
            <strong>Design Atlas</strong>
          </div>
          <nav aria-label="이전 및 다음 시안">
            <Link href={`/card-lab/concepts/${Previous.slug}`} aria-label={`이전 시안: ${Previous.name}`}>
              이전
            </Link>
            <span>{concept.number} / 10</span>
            <Link href={`/card-lab/concepts/${Next.slug}`} aria-label={`다음 시안: ${Next.name}`}>
              다음
            </Link>
          </nav>
        </div>
        <div className={styles.conceptIntro}>
          <div>
            <p>{concept.reference}</p>
            <h1>{concept.name}</h1>
            <span>{concept.subtitle}</span>
          </div>
          <dl>
            <div>
              <dt>잘 맞는 질문</dt>
              <dd>{concept.question}</dd>
            </div>
            <div>
              <dt>주의점</dt>
              <dd>{concept.tradeoff}</dd>
            </div>
          </dl>
          <small>{conceptData.label}</small>
        </div>
      </header>

      <section className={styles.canvas} aria-label={`${concept.name} 전체 화면 시안`}>
        <Concept channels={conceptData.channels} />
      </section>

      <footer className={styles.shellFooter}>
        <Link href={`/card-lab/concepts/${Previous.slug}`}>← {Previous.number}. {Previous.name}</Link>
        <Link href="/card-lab/concepts">시안 전체 보기</Link>
        <Link href={`/card-lab/concepts/${Next.slug}`}>{Next.number}. {Next.name} →</Link>
      </footer>
    </main>
  );
}
