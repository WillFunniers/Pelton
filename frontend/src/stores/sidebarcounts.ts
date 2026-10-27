// sidebarcounts.ts re-reads the sidebar's badges after a local change (#403).
//
// Deleting a message, marking one read, moving one or sending one changes what
// the badges should say, but nothing told the sidebar: it was only refreshed on
// sync events, so a folder kept its unread count and its bold highlight until
// the next sync and an already-triaged folder still looked like it needed
// attention.
//
// Two stores hold badge counts and both are re-read here. The folder tree, the
// pinned group and the unified views come from the sidebar load; saved Views
// carry their own eagerly-run counts and load separately. Refreshing one and
// not the other is what makes a fix like this look half-applied.
//
// The counts are re-read rather than adjusted in place. Which folders feed
// which unified view, and what counts as unread in each, is the backend's rule;
// a second copy of it here would be one more thing to keep in step, and it
// would be wrong in the cases that matter (a move crosses two folders, a delete
// lands in Trash, a unified view spans every account, a saved View is an
// arbitrary query). Reading is cheap, and both loaders keep their current data
// on screen while they run, so nothing blanks.

import { refreshSidebar } from './accounts'
import { loadViews } from './views'

// countSettleMs is how long a run of local changes is given to finish before
// the counts are re-read. Long enough that deleting fifty messages is one round
// trip rather than fifty, short enough to read as immediate.
const countSettleMs = 200

let countTimer: ReturnType<typeof setTimeout> | null = null

/** Re-reads the badge counts, collapsing a run of changes into one pass. */
export function refreshCountsSoon(): void {
  if (countTimer !== null) {
    clearTimeout(countTimer)
  }
  countTimer = setTimeout(() => {
    countTimer = null
    void refreshSidebar()
    void loadViews()
  }, countSettleMs)
}
