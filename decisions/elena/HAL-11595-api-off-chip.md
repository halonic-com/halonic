# Decision: the kit's Callout action can say where it leads, for the Switch it on link

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-715 (Liam's decision: the run page's failed banner for a switched-off Google API has **Switch it on ↗**, "Opens Google Cloud"; words checked by Mara)
- Kind: user-visible

The kit's `Callout` requirement (`kit.callout`) gains one sentence: an action that gives `opens`, the words for where it leads outside Studio, shows a ↗ after its label and gives those words as its tooltip and to screen readers. Callouts without `opens` draw exactly as before. Nothing else in the requirement changes and no test was weakened; the new behaviour has its own tests in `callout.test.tsx`.

## Covers

- kit.callout
