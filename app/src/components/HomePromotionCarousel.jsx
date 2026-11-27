import { useEffect, useState } from 'react';
import { ArrowRight, Globe2, ShoppingBag, Sparkles, Target, Zap } from 'lucide-react';

const PROMOTION_CARDS = [
  { id: 'quick-battle', kind: 'internal', eyebrow: 'NEXIRA EVENT', icon: Zap },
  { id: 'store', kind: 'internal', eyebrow: 'NEXIRA STORE', icon: ShoppingBag },
  { id: 'ad-one', kind: 'ad', icon: Sparkles },
  { id: 'ad-two', kind: 'ad', icon: Globe2 },
  { id: 'ad-three', kind: 'ad', icon: Target },
];

export function HomePromotionCarousel({
  quickBattleLabel,
  quickBattleNote,
  storeLabel,
  onQuickBattle,
  onStore,
  reducedMotion = false,
}) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (reducedMotion) return undefined;
    const rotation = window.setInterval(() => {
      if (!document.hidden) {
        setActiveIndex((current) => (current + 1) % PROMOTION_CARDS.length);
      }
    }, 7000);
    return () => window.clearInterval(rotation);
  }, [reducedMotion]);

  return (
    <section className="home-promotion-section" aria-label="Promotional banners">
      <div className="home-promotion-viewport">
        {PROMOTION_CARDS.map((card, index) => {
          const active = index === activeIndex;
          const Icon = card.icon;
          const className = [
            'home-promo-card',
            `home-promo-card--${card.id}`,
            active ? 'is-active' : '',
          ].filter(Boolean).join(' ');
          const content = (
            <>
              <span className="home-promo-art" aria-hidden="true"><Icon size={34} strokeWidth={1.8} /></span>
              <span className="home-promo-copy">
                {card.eyebrow && <small>{card.eyebrow}</small>}
                <strong>
                  {card.id === 'quick-battle' ? quickBattleLabel : card.id === 'store' ? storeLabel : ' '}
                </strong>
                {card.id === 'quick-battle' && <em>{quickBattleNote}</em>}
              </span>
              {card.kind === 'internal' && <ArrowRight className="home-promo-arrow" size={23} aria-hidden="true" />}
              {card.kind === 'ad' && <span className="home-promo-ad-label">AD</span>}
            </>
          );

          return card.kind === 'internal' ? (
            <button
              key={card.id}
              type="button"
              className={className}
              onClick={card.id === 'quick-battle' ? onQuickBattle : onStore}
              aria-hidden={!active}
              tabIndex={active ? 0 : -1}
            >
              {content}
            </button>
          ) : (
            <div
              key={card.id}
              className={className}
              role="group"
              aria-label={`Advertisement slot ${index - 1}`}
              aria-hidden={!active}
            >
              {content}
            </div>
          );
        })}
        <div className="home-promo-pagination" aria-label="Choose a banner">
          {PROMOTION_CARDS.map((card, index) => (
            <button
              key={card.id}
              type="button"
              className={`home-promo-dot${index === activeIndex ? ' is-active' : ''}`}
              onClick={() => setActiveIndex(index)}
              aria-label={`Show banner ${index + 1}`}
              aria-current={index === activeIndex ? 'true' : undefined}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
