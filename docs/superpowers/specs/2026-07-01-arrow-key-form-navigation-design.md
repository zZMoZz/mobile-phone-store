# Arrow-Key Form Navigation — Design

## Problem

Arrow keys currently do nothing in forms across the app. Staff have to reach
for the mouse or Tab through fields one at a time. We want Up/Down arrow keys
to move focus between fields, spreadsheet-style, across every form in the app.

## Behavior Rules

- **ArrowDown / ArrowUp**: move focus to the nearest field *visually*
  below/above the current one (geometry-based on screen position, not just
  DOM/markup order). This matters because not all forms are a single vertical
  column:
  - Single-column forms (Login, AccountModal, ExpenseRecorder, ManageLists
    modals, etc.): geometry-based and DOM-order navigation produce the same
    result.
  - `ProductFormModal` (2-column `SimpleGrid`): Down must go to the field
    below, not sideways to the adjacent column.
  - `NewTransaction` line-items table: Down must move down the same column
    (e.g. quantity row 1 → quantity row 2), matching spreadsheet-trained
    expectations.
- **ArrowLeft / ArrowRight**: untouched. They keep native text-cursor movement
  within a field. Never used for field-to-field navigation.
- **NumberInput**: Mantine's built-in Up/Down increment/decrement is disabled
  app-wide (`withKeyboardEvents={false}` set as a theme default) so arrow-key
  behavior is fully consistent, including on quantity/cost/price fields. This
  intentionally removes the ability to bump a numeric value by 1 via arrow
  keys.
- **Textarea**: exempt from field navigation. Up/Down keep moving the text
  cursor between lines of typed content (needed for the notes field in
  `ExpenseRecorder`). Tab/click/mouse still move focus away from a Textarea
  normally.
- **Select / Combobox / Autocomplete / DatePickerInput**: exempt *while their
  dropdown or calendar popover is open* — native option-highlighting /
  calendar arrow-key behavior wins in that state. When closed, they behave
  like any other field for navigation purposes (e.g. `ProductSearchInput`'s
  own Up/Down option-navigation is preserved when its dropdown is showing).
- **Boundaries**: pressing Down on the last field (or Up on the first) within
  scope does nothing. No wraparound.
- **Barcode scanner field**: excluded entirely from arrow-navigation
  targeting (never focused via arrow nav, never a candidate to navigate
  away from via this feature) — its existing autofocus/Enter-to-submit flow
  (`BarcodeInput.jsx`, `useStickyFocus.js`) must be unaffected.

## Architecture

A single shared mechanism, mounted once, requiring no per-form opt-in:

- **`useArrowFieldNavigation`** hook, mounted near the app root (e.g.
  `AppLayout.jsx`), attaching one `keydown` listener at the document level
  (event delegation). New forms get the behavior automatically.
- On `ArrowDown`/`ArrowUp`, the handler:
  1. Bails out if the focused element is a `Textarea`, or is a
     combobox/select/date-input with its popover currently open (checked via
     `aria-expanded` / the relevant Mantine open-dropdown class).
  2. Determines the **scope**: the nearest ancestor `[role="dialog"]`
     (Mantine `Modal`/`Drawer` content) if inside one, otherwise the main
     page content. This stops navigation from jumping between a modal and
     the page behind it.
  3. Collects focusable, enabled fields within that scope
     (`input:not([disabled]), textarea:not([disabled]), [role="combobox"]`),
     excluding the barcode input.
  4. Picks the closest candidate whose center is above/below the current
     field's center, preferring horizontally-aligned (same-column)
     candidates over ones that are merely below-ish — this is what makes
     the table and 2-column grid behave correctly.
  5. Calls `.focus()` on the target and `preventDefault()` so the page
     doesn't scroll.
- **NumberInput default**: `withKeyboardEvents={false}` is set once via the
  shared Mantine theme (`client/src/theme/`), not on individual usages, so
  it applies consistently and automatically to future NumberInputs.

Net implementation footprint: one new hook file, one theme default, one
mount point in `AppLayout.jsx`. No changes required in individual forms
(NewTransaction, ProductFormModal, ExpenseRecorder, etc.).

## Edge Cases

- RTL (Arabic): no impact, since only Up/Down move fields and text direction
  doesn't change vertical navigation semantics.
- Existing Enter-key handlers (NewTransaction's quantity→price row jump,
  ProductFormModal's Enter-to-save, barcode Enter-to-scan) are unaffected —
  this feature only binds ArrowUp/ArrowDown.
- Disabled/readonly fields are never navigation targets.

## Testing

No frontend test harness exists in this repo (the Vitest suite covers
backend logic only). Verification will be manual, in the browser, covering:

- Login (simple stack)
- AccountModal (stacked fields)
- ProductFormModal (2-column grid)
- NewTransaction (line-items table + barcode field exclusion)
- ExpenseRecorder (confirm Textarea is exempt)
- A Select/DatePickerInput (confirm dropdown-open arrows still behave
  natively)
