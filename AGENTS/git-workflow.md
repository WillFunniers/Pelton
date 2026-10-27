# Git workflow

## Commits

Conventional Commits style, matching existing history: `feat:`, `fix:`,
`docs:`, short imperative subject, no body unless truly needed, no
co-author trailers. For a `fix:` commit, the subject must describe the
actual bug ("fix: message snippet truncation breaking utf-8"), not a vague
placeholder like "fix bugs" or "misc fixes".

Commits should carry a DCO sign-off (`git commit -s`). An agent committing
on the user's behalf should ask whether to include `-s` rather than adding
it (or leaving it out) silently.

## Branches

- One branch per feature/fix: `type/short-slug` (e.g.
  `feat/vim-mode-tables`, `fix/oauth-keyring-limit`). The slug should be
  descriptive of the actual bug or feature, not generic. Keep unrelated
  changes out of a branch.
- `main` is the trunk. Every change lands there first, without exception,
  including fixes that are urgently needed in a release. Cut the branch
  from `main` and open the PR against `main`.
- `main` is allowed to be unreleasable. Most of a quarter it holds
  half-finished work for the next version, and that is the normal state,
  not a problem to fix.
- `release/<version>` (e.g. `release/2026.4`) is the shipping line. It is
  cut from `main` when a quarter ships, and every tag for that line
  (`v2026.4`, `v2026.4.1`, ...) lives on it. Only one is live at a time;
  the previous one is abandoned, not deleted.
- Never commit to a release branch directly and never open a feature PR
  against one. The only thing that lands there is a cherry-pick of a
  commit that is already on `main`:

      git checkout release/2026.4
      git cherry-pick <sha from main>

  Fixing the release branch first strands the fix: the next version would
  ship without it.
- If a cherry-pick conflicts because the code was refactored on `main`,
  write the fix a second time against the older shape rather than
  back-porting the refactor.
- Don't force-push shared branches (`main`, `release/*`) or rewrite
  published history without explicit sign-off.

## Release changelog

Pushing a version tag runs `.github/workflows/draft-release.yml`, which
builds the changelog from every pull request merged since the previous tag
and opens a draft release with it. One line per PR, sorted alphabetically
by title, so the conventional-commit prefix groups them (`feat:` before
`fix:`). PR titles must follow `type: subject` for that grouping to work.

PRs labelled `documentation` or `no-changelog` are left out, and nothing
else is: an unlabelled docs PR does show up in the release notes.

`.github/release.yml` is a separate, unrelated file. It only configures
GitHub's own "Generate release notes" button and is not read by the
workflow above.
