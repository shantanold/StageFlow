import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { ApiError } from "../lib/api";
import { displayPhotoUrl } from "../lib/cloudinary";
import { useItems, useSetPurchaseCost } from "../lib/queries";
import {
  formatCurrency,
  formatDimensions,
  getCategoryEmoji,
  parsePriceInput,
  roundMoney,
  statusBadgeClass,
  statusLabel,
  unpricedItems,
} from "../lib/utils";
import type { Item } from "../types";

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function motionMs() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return 0;
  return 300;
}

function currentCostLabel(cost: string | number | null | undefined): string {
  if (cost === null || cost === undefined) return "No price";
  const trimmed = String(cost).trim();
  if (!trimmed) return "No price";
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return "No price";
  return formatCurrency(value);
}

export function PriceItems() {
  const { user, isAdminMode } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const allowed = user?.role === "manager" && !isAdminMode;
  const { data, isError, refetch } = useItems({}, { enabled: allowed });
  const setCost = useSetPurchaseCost();

  const [queue, setQueue] = useState<Item[] | null>(null);
  const [draft, setDraft] = useState("");
  const [priced, setPriced] = useState(0);
  const [busy, setBusy] = useState(false);
  const [motion, setMotion] = useState<"save" | "skip" | null>(null);
  const [failedPhotoId, setFailedPhotoId] = useState<string | null>(null);
  const alive = useRef(true);
  const lock = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (data && queue === null) setQueue(unpricedItems(data));
  }, [data, queue]);

  if (!allowed) return <Navigate to="/home" replace />;

  const current = queue?.[0] ?? null;
  const upcoming = queue?.slice(1, 3) ?? [];
  const parsed = parsePriceInput(draft);
  const priceError =
    draft.trim().length > 0 && parsed === null
      ? "Enter a valid price"
      : parsed === 0
        ? "Enter a price above $0"
        : "";
  const canSave = !busy && !motion && parsed !== null && parsed > 0;
  const total = priced + (queue?.length ?? 0);
  const pct = total === 0 ? 0 : Math.round((priced / total) * 100);

  async function advance(kind: "save" | "skip") {
    if (!current || lock.current) return;
    if (kind === "skip" && (queue?.length ?? 0) < 2) return;

    const price = parsed;
    if (kind === "save" && (price === null || price <= 0)) return;

    lock.current = true;
    if (kind === "save" && price !== null) {
      setBusy(true);
      try {
        await setCost.mutateAsync({ id: current.id, purchase_cost: roundMoney(price) });
      } catch (err) {
        if (alive.current) {
          showToast(err instanceof ApiError ? err.message : "Could not save that price", "error");
          setBusy(false);
          lock.current = false;
        }
        return;
      }
    }

    const ms = motionMs();
    if (ms > 0 && alive.current) setMotion(kind);
    await wait(ms);
    if (!alive.current) return;

    const id = current.id;
    setQueue((items) => {
      if (!items) return items;
      if (kind === "save") return items.filter((item) => item.id !== id);
      if (items.length < 2 || items[0]?.id !== id) return items;
      const [head, ...rest] = items;
      return head ? [...rest, head] : items;
    });
    if (kind === "save") setPriced((count) => count + 1);
    setDraft("");
    setMotion(null);
    setBusy(false);
    lock.current = false;
  }

  return (
    <div className="animate-in price-page">
      <div className="page-header">
        <button type="button" className="price-back" onClick={() => navigate("/home")}>
          <BackIcon /> Home
        </button>
        <div className="price-header-row">
          <div>
            <h1 className="page-title">Price items</h1>
            <p className="page-subtitle" aria-live="polite">
              {queue === null
                ? "Finding pieces still at $0"
                : queue.length === 0
                  ? priced > 0
                    ? `${priced} priced`
                    : "Nothing is waiting"
                  : `${priced} of ${total} priced`}
            </p>
          </div>
          {queue && queue.length > 0 && (
            <div className="price-count-pill">{queue.length} left</div>
          )}
        </div>
        <div
          className="price-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={queue && queue.length === 0 && priced > 0 ? 100 : pct}
        >
          <span style={{ width: `${queue && queue.length === 0 && priced > 0 ? 100 : pct}%` }} />
        </div>
      </div>

      <div className="page-body">
        {queue === null && isError ? (
          <div className="price-card-shell">
            <div className="price-card price-card-center">
              <p className="price-empty-title">Couldn’t load inventory</p>
              <p className="price-empty-copy">Check the connection and try again.</p>
              <button type="button" className="price-next" onClick={() => refetch()}>
                Try again
              </button>
            </div>
          </div>
        ) : queue === null ? (
          <PriceSkeleton />
        ) : queue.length === 0 ? (
          <DoneState priced={priced} onHome={() => navigate("/home")} />
        ) : current ? (
          <div className="price-layout">
            <div className="price-stage">
              <div className="price-orb price-orb-a" aria-hidden />
              <div className="price-orb price-orb-b" aria-hidden />
              <div className={`price-deck${upcoming.length > 0 ? " has-stack" : ""}`}>
                {upcoming[1] && (
                  <div className="price-peek price-peek-2" aria-hidden>
                    <span>{upcoming[1].name}</span>
                  </div>
                )}
                {upcoming[0] && (
                  <div className="price-peek price-peek-1" aria-hidden>
                    <span>{getCategoryEmoji(upcoming[0].category)} {upcoming[0].name}</span>
                  </div>
                )}
                <div key={current.id} className={`price-card-shell${motion ? ` is-${motion}` : ""}`}>
                  <article className="price-card">
                    <ItemFace
                      item={current}
                      photoBroken={failedPhotoId === current.id}
                      onPhotoError={() => setFailedPhotoId(current.id)}
                    />
                    <form
                      className="price-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void advance("save");
                      }}
                    >
                      <label className="price-field" htmlFor="price-input">
                        <span className="price-field-label">Purchase cost</span>
                        <span className={`price-field-box${priceError ? " is-invalid" : ""}`}>
                          <span className="price-currency" aria-hidden>$</span>
                          <input
                            id="price-input"
                            key={current.id}
                            autoFocus
                            inputMode="decimal"
                            enterKeyHint="next"
                            autoComplete="off"
                            placeholder="Enter amount"
                            value={draft}
                            aria-invalid={priceError ? true : undefined}
                            aria-describedby={priceError ? "price-error" : undefined}
                            onChange={(event) => setDraft(event.target.value)}
                          />
                        </span>
                      </label>
                      {priceError ? (
                        <p id="price-error" className="price-error">{priceError}</p>
                      ) : parsed !== null && parsed > 0 ? (
                        <p className="price-preview">Saves as {formatCurrency(roundMoney(parsed))}</p>
                      ) : (
                        <p className="price-hint">Currently {currentCostLabel(current.purchase_cost)}</p>
                      )}
                      <button type="submit" className="price-next" disabled={!canSave}>
                        {busy ? "Saving…" : queue.length === 1 ? "Save price" : "Save & next"}
                        {!busy && <ArrowIcon />}
                      </button>
                      {queue.length > 1 && (
                        <button
                          type="button"
                          className="price-skip"
                          disabled={busy || motion !== null}
                          onClick={() => void advance("skip")}
                        >
                          Skip for now
                        </button>
                      )}
                    </form>
                  </article>
                </div>
              </div>
            </div>

            <aside className="price-aside">
              <div
                className="price-ring"
                style={{ background: `conic-gradient(#fbbf24 ${pct}%, rgba(148,163,184,0.16) ${pct}%)` }}
                aria-hidden
              >
                <span>{pct}%</span>
              </div>
              <div>
                <p className="price-aside-kicker">This pass</p>
                <p className="price-aside-stat">
                  {priced} priced
                  <span> · {queue.length} left</span>
                </p>
              </div>
              {queue.length > 1 && (
                <div className="price-up-next">
                  <p className="price-aside-kicker">Up next</p>
                  <ul>
                    {queue.slice(1, 5).map((item) => (
                      <li key={item.id}>
                        <span aria-hidden>{getCategoryEmoji(item.category)}</span>
                        <span>{item.name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="price-kbd">Enter saves and moves to the next card.</p>
            </aside>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ItemFace({
  item,
  photoBroken,
  onPhotoError,
}: {
  item: Item;
  photoBroken: boolean;
  onPhotoError: () => void;
}) {
  const photo = photoBroken ? undefined : displayPhotoUrl(item.photo_url);
  const dimensions = formatDimensions(item.width_in, item.depth_in, item.height_in);

  return (
    <>
      <div className="price-photo">
        {photo ? (
          <img src={photo} alt="" draggable={false} onError={onPhotoError} />
        ) : (
          <span className="price-photo-fallback" aria-hidden>{getCategoryEmoji(item.category)}</span>
        )}
        <div className="price-photo-fade" aria-hidden />
      </div>
      <div className="price-meta">
        <div className="price-badges">
          <span className={statusBadgeClass(item.status, item.condition)}>
            {statusLabel(item.status, item.condition)}
          </span>
          <span className="badge badge-gray">{item.category}</span>
          {item.set && <span className="badge badge-blue">{item.set.name}</span>}
        </div>
        <h2 className="price-name">{item.name}</h2>
        <p className="price-sku">{item.sku}</p>
        {dimensions && <p className="price-dims">{dimensions}</p>}
      </div>
    </>
  );
}

function DoneState({ priced, onHome }: { priced: number; onHome: () => void }) {
  const finished = priced > 0;
  return (
    <div className="price-stage price-stage-solo">
      <div className="price-orb price-orb-a" aria-hidden />
      <div className="price-orb price-orb-b" aria-hidden />
      <div className="price-card-shell">
        <div className="price-card price-card-center">
          <div className={`price-check${finished ? "" : " is-quiet"}`} aria-hidden>
            {finished ? <CheckIcon /> : <DollarMark />}
          </div>
          <h2 className="price-empty-title">
            {finished ? "All caught up" : "Nothing to price"}
          </h2>
          <p className="price-empty-copy">
            {finished
              ? `You priced ${priced} item${priced === 1 ? "" : "s"}. Inventory value updates with those costs.`
              : "Every piece already has a purchase cost."}
          </p>
          <button type="button" className="price-next" onClick={onHome}>
            Back to home
          </button>
        </div>
      </div>
    </div>
  );
}

function PriceSkeleton() {
  return (
    <div className="price-card-shell" aria-hidden>
      <div className="price-card">
        <div className="price-skeleton-photo" />
        <div className="price-meta">
          <div className="price-skeleton-bar" style={{ width: "42%" }} />
          <div className="price-skeleton-bar" style={{ width: "70%", height: 22 }} />
          <div className="price-skeleton-bar" style={{ width: "34%" }} />
        </div>
      </div>
    </div>
  );
}

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function DollarMark() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}
