# SDD Progress Ledger — Auth Overhaul (display_name, owner, force_password_change, recovery codes, soft-delete, token_version)

Branch: main
Merge base: 918ba522693cf123226d72754ab0983afd93c75f
Plan: docs/superpowers/plans/2026-06-22-auth-authorization.md

Task 1: complete (commits 918ba52..3d21892, review clean)
Task 2: complete (commits 3d21892..285d72c, review clean)
Task 3: complete (commits 285d72c..243dc8a, review clean)
Task 4: complete (commits 243dc8a..6e4b06f, review clean)
Task 5: complete (commits 6e4b06f..da72619, review clean)
Task 6: complete (commits da72619..0f84beb, review clean)
Task 7: complete (commits 0f84beb..666776b, review clean)
Task 8: complete (commits 666776b..865eedf, review clean — fix: removed navigate from login/mount, ProtectedRoute is sole redirect guard)
Task 9: complete (commits 865eedf..003a48e, review clean — fix: removed dead confirmed state, fixed copy tooltip)
Task 10: complete (commits 003a48e..6a2401a, review clean — added 3 missing i18n keys + ForceChangePassword page)
Task 11: complete (commits 6a2401a..65b8135, review clean — fix: added confirm password field to ForgotPassword)
Task 12: complete (commits 65b8135..0795fc1, review clean)
Task 13: complete (commits 0795fc1..a3600ad, review clean — fix: table header Status column label, newUserHint i18n key added)

Final whole-branch review (918ba52..a3600ad): READY TO SHIP
Minor findings (no blockers):
- auth_invalid_credentials and user_password_required error codes have no i18n entry (fall back to common.error — no breakage)
- 4 unused i18n keys: auth.passwordTooShort, auth.wrongPassword, auth.accountDisabled, auth.recoverSuccess
- display_name claim in JWT is dead weight (backend re-reads DB on every request — correct behavior)
- Disabled-account login shows generic message (auth.accountDisabled never shown — acceptable for info-disclosure reasons)
