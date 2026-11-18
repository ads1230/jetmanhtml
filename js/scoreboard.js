'use strict';

// Local top-5 scoreboard, saved to localStorage (port of Scoreboard.swift).

class Scoreboard {
  constructor() {
    /** Entries, highest first: { id, score, date (ms since 1970), skin }. */
    this.entries = [];
    const saved = Store.get(Scoreboard.key, null);
    if (Array.isArray(saved)) {
      this.entries = saved
        .filter((e) => e && Number.isFinite(e.score) && Number.isFinite(e.date))
        .map((e) => ({ id: String(e.id || Scoreboard.newId()), score: Math.trunc(e.score), date: e.date, skin: String(e.skin) }))
        .slice(0, Scoreboard.capacity);
    }
  }

  static newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  /** Removes every entry (Settings → Reset Scores). */
  reset() {
    this.entries = [];
    Store.remove(Scoreboard.key);
  }

  /** Adds a finished run. Returns its 1-based rank if it made the board, otherwise null. */
  record(score, skinId, date = Date.now()) {
    if (!(score > 0)) return null;
    const entry = { id: Scoreboard.newId(), score, date, skin: skinId };
    // Highest first; earlier runs win ties.
    const updated = [...this.entries, entry]
      .sort((a, b) => (a.score !== b.score ? b.score - a.score : a.date - b.date))
      .slice(0, Scoreboard.capacity);
    this.entries = updated;
    Store.set(Scoreboard.key, updated);
    const index = updated.indexOf(entry);
    return index >= 0 ? index + 1 : null;
  }
}

/** The board keeps and shows the top five runs. */
Scoreboard.capacity = 5;
Scoreboard.key = 'jetman.scoreboard';

/** The pilot skin for an entry (unknown skins show as Navy, like the app). */
function entrySkin(entry) {
  return PilotSkin[entry.skin] && SKIN_IDS.includes(entry.skin) ? PilotSkin[entry.skin] : PilotSkin.navy;
}
