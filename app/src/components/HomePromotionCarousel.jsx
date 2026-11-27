import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BarChart3, ShoppingBag, UserRound, Zap, Swords } from 'lucide-react';

const PROMOTION_CARDS = [
  { id: 'modes', icon: Swords, titleKey: 'modesLabel', noteKey: 'modesNote', actionKey: 'onModes' },
  { id: 'quick-battle', icon: Zap, titleKey: 'quickBattleLabel', noteKey: 'quickBattleNote', actionKey: 'onQuickBattle' },
  { id: 'rankings', icon: BarChart3, titleKey: 'rankingsLabel', noteKey: 'rankingsNote', actionKey: 'onRankings' },
  { id: 'store', icon: ShoppingBag, titleKey: 'storeLabel', noteKey: 'storeNote', actionKey: 'onStore' },
  { id: 'profile', icon: UserRound, titleKey: 'profileLabel', noteKey: 'profileNote', actionKey: 'onProfile' },
];

const SWIPE_THRESHOLD = 42;

export function HomePromotionCarousel({
  modesLabel,
  modesNote,
  quickBattleLabel,
  quickBattleNote,
  rankingsLabel,
  rankingsNote,
  storeLabel,
  storeNote,
  profileLabel,
  profileNote,
  onModes,
  onQuickBattle,
  onRankings,
  onStore,
  onProfile,
  reducedMotion = false,
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const pointerStartRef = useRef(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    if (reducedMotion) return undefined;
    const rotation = window.setInterval(() => {
      if (!document.hidden) {
        setActiveIndex((current) => (current + 1) % PROMOTION_CARDS.length);
      }
    }, 4000);
    return () => window.clearInterval(rotation);
  }, [reducedMotion]);

  const handlePointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = (event) => {
    if (!pointerStartRef.current) return;
    const deltaX = event.clientX - pointerStartRef.current.x;
    const deltaY = event.clientY - pointerStartRef.current.y;
    pointerStartRef.current = null;
    if (Math.abs(deltaX) < SWIPE_THRESHOLD || Math.abs(deltaX) <= Math.abs(deltaY)) return;

    setActiveIndex((current) => (
      deltaX < 0
        ? (current + 1) % PROMOTION_CARDS.length
        : (current - 1 + PROMOTION_CARDS.length) % PROMOTION_CARDS.length
    ));
    suppressClickRef.current = true;
    window.setTimeout(() => { suppressClickRef.current = false; }, 450);
  };

  const handleClickCapture = (event) => {
    if (!suppressClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClickRef.current = false;
  };

  return (
    <section className="home-promotion-section" aria-label="NEXIRA promotions">
      <div
        className="home-promotion-viewport"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => { pointerStartRef.current = null; }}
        onClickCapture={handleClickCapture}
      >
        {PROMOTION_CARDS.map((card, index) => {
          const active = index === activeIndex;
          const Icon = card.icon;
          const title = ({
            modesLabel, quickBattleLabel, rankingsLabel, storeLabel, profileLabel,
          })[card.titleKey];
          const note = ({
            modesNote, quickBattleNote, rankingsNote, storeNote, profileNote,
          })[card.noteKey];
          const action = ({
            onModes, onQuickBattle, onRankings, onStore, onProfile,
          })[card.actionKey];

          return (
            <button
              key={card.id}
              type="button"
              className={[
                'home-promo-card',
                `home-promo-card--${card.id}`,
                active ? 'is-active' : '',
              ].filter(Boolean).join(' ')}
              onClick={action}
              aria-hidden={!active}
              tabIndex={active ? 0 : -1}
              aria-label={title}
            >
              <span className="home-promo-art" aria-hidden="true"><Icon size={34} strokeWidth={1.8} /></span>
              <span className="home-promo-copy">
                <small>NEXIRA</small>
                <strong>{title}</strong>
                <em>{note}</em>
              </span>
              <ArrowRight className="home-promo-arrow" size={23} aria-hidden="true" />
            </button>
          );
        })}
        <div className="home-promo-pagination" aria-label="Choose a promotion">
          {PROMOTION_CARDS.map((card, index) => (
            <button
              key={card.id}
              type="button"
              className={`home-promo-dot${index === activeIndex ? ' is-active' : ''}`}
              onClick={() => setActiveIndex(index)}
              aria-label={`Show promotion ${index + 1}`}
              aria-current={index === activeIndex ? 'true' : undefined}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
