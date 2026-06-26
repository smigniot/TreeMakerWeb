# Analysis reference

Detailed subsystem analyses of the original TreeMaker source (`../../Orig/`),
produced during the analysis phase (Session 1). These are the long-form notes
that `../../DESIGN.md` distills — kept so a future session can resume cold without
re-deriving file/function/line specifics.

All `file:function` references are relative to `Orig/Source/`.

| Doc | Subsystem |
|---|---|
| [01-core-model.md](01-core-model.md) | Core data model, ownership, algorithms, dpptr/RAII idioms |
| [02-optimizers-nlco.md](02-optimizers-nlco.md) | Packing optimizers, ALM/NLCO solver stack, Wasm assessment |
| [03-io-and-conditions.md](03-io-and-conditions.md) | `.tm/.tmd5` file format + the 13 condition types |
| [04-gui-interactions.md](04-gui-interactions.md) | wxWidgets GUI, canvas rendering, interactions, UI/model boundary |

> Caveat (recorded as-is): the optimizers agent reported "zero callers" for the
> `tm*Optimizer` classes; this is inaccurate — they are driven by the Action menu
> (`tmwxDoc_Action.cpp`, ⌘1/⌘2/⌘3) and by `test/tmModelTester`. See doc 04 §3 and
> `DESIGN.md` §4.
