## Task 1: i18n keys

**Files:**
- Modify: `client/src/i18n/en.json`
- Modify: `client/src/i18n/ar.json`

**Interfaces:**
- Produces: translation keys `txns.itemCount`, `txns.user`, `txns.filterUser`, `txns.quickToday`, `txns.quickWeek`, `txns.quickMonth`, `txns.quickYear`, `txns.clearFilters` — used by Task 4.

- [ ] **Step 1: Add keys to `en.json`**

In `client/src/i18n/en.json`, find the `"txns"` object (currently ends at `"to": "To"`) and add the new keys:

```json
"txns": {
  "title": "Transactions",
  "filterType": "Type",
  "date": "Date",
  "items": "Items",
  "itemCount": "#",
  "total": "Total",
  "profit": "Profit",
  "note": "Note",
  "details": "Transaction Details",
  "from": "From",
  "to": "To",
  "user": "User",
  "filterUser": "User",
  "quickToday": "Today",
  "quickWeek": "This Week",
  "quickMonth": "This Month",
  "quickYear": "This Year",
  "clearFilters": "Clear"
},
```

- [ ] **Step 2: Add keys to `ar.json`**

In `client/src/i18n/ar.json`, find the `"txns"` object and add:

```json
"txns": {
  "title": "المعاملات",
  "filterType": "النوع",
  "date": "التاريخ",
  "items": "العناصر",
  "itemCount": "#",
  "total": "الإجمالي",
  "profit": "الربح",
  "note": "ملاحظة",
  "details": "تفاصيل المعاملة",
  "from": "من",
  "to": "إلى",
  "user": "المستخدم",
  "filterUser": "المستخدم",
  "quickToday": "اليوم",
  "quickWeek": "هذا الأسبوع",
  "quickMonth": "هذا الشهر",
  "quickYear": "هذه السنة",
  "clearFilters": "مسح"
},
```

- [ ] **Step 3: Commit**

```bash
git add client/src/i18n/en.json client/src/i18n/ar.json
git commit -m "feat(i18n): add transaction table overhaul keys"
```

---

