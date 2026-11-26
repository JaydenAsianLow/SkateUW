// The Controls guide's own preferences, saved per browser (best effort: private mode just forgets them).
//   offered:    the first-time "see the controls?" offer was shown (it never shows again by itself)
//   showPinned: "Show pinned demo while playing" (Settings)
//   pin:        the pinned demo { id, side: 'left' | 'right', size: 'small' | 'medium' }, or null
const KEY = 'skate.guide.v1';
const DEFAULTS = { offered: false, showPinned: true, pin: null };

export const guidePrefs = { ...DEFAULTS };
try {
  Object.assign(guidePrefs, JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? {});
} catch {
  /* unreadable or blocked storage: defaults */
}

const listeners = new Set();
export const onGuidePrefs = (fn) => (listeners.add(fn), () => listeners.delete(fn));
export function setGuidePrefs(patch) {
  Object.assign(guidePrefs, patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(guidePrefs));
  } catch {
    /* not saved */
  }
  for (const fn of listeners) fn({ ...guidePrefs });
}
