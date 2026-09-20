# Attestations

Frozen attestations and Holder Intent Reports, each with its OpenTimestamps proof, copied from the
live API by `packages/web/scripts/anchor-attestations.ts`. Committing them here anchors the same
hashes in public git history, alongside the Bitcoin timestamp.

Verify any file without trusting Redeem:

    shasum -a 256 report-<ballotId>.json
    ots verify report-<ballotId>.json.ots

These documents record the intent of Robinhood Stock Token holders. They are not shareholder votes
and not proxy solicitations.
