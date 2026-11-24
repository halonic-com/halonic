# Decision: merge control reads the board's fast-track login from config

- Approval: HAL-17836
- Kind: internal

`paperclip.merge-control-fast-track` named the board's GitHub login as a
verified fast-track labeller, and merge control's default settings and three
tests hard-coded it. The leak guard's personal-term rule now fails every merge
group on those lines. The rule (board, HAL-16851) is that code recognising the
board's login reads it from config. The requirement now says the login comes
from the plugin setting `fastTrackLabelAdder`, the one the fast-track pass
already reads; the tests use an invented login, and a new test checks that
the board's label doesn't count while that setting is empty. What merge
control does with a verified label is unchanged.

## Covers

- paperclip.merge-control-fast-track
