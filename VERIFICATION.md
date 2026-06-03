# Manual Verification Checklist

This document describes the manual testing procedures for the discourse-new-topic-guard theme component. No automated test runner is available for Discourse theme component JavaScript, so verification must be performed against a running Discourse instance with the component installed.

## Setup

Before running any checks:

1. Install the discourse-new-topic-guard theme component on your dev Discourse instance.
2. Create at least one rule via **Admin → Customize → Themes → New Topic Guard → Settings**.
3. For initial testing, use a rule with these settings:
   - **Enabled Groups**: A group you belong to (e.g., staff, moderators, or a test group)
   - **Selected Categories**: A category you can browse
   - **Tooltip Message**: `You cannot post here. Please [submit a request](https://example.com) instead.`
   - **Redirect URL**: Leave empty for checks 1-3, 5-7; set to `https://example.com` for check 4

---

## Check 1: Targeted user, matching category

**Setup:**
- Log in as a user in the rule's `enabled_groups`
- Navigate to the category specified in the rule's `selected_categories`

**Verification:**
- [ ] The New Topic button appears greyed out (opacity visibly reduced)
- [ ] Hovering over the button displays a popover with your configured message
- [ ] The popover text includes a clickable link formatted correctly (if included in `tooltip_message`)
- [ ] Clicking the link opens the URL in a new tab/window
- [ ] Clicking the button itself does nothing (no composer modal opens, no navigation occurs)

**Expected Outcome:**
Button is visually disabled, tooltip appears on hover, redirect link is functional, button click is inert.

---

## Check 2: Targeted user, non-matching category

**Setup:**
- Log in as a user in the rule's `enabled_groups` (same as Check 1)
- Navigate to a different category NOT included in the rule's `selected_categories`

**Verification:**
- [ ] The New Topic button appears normally (full opacity, interactive appearance)
- [ ] Button functions as expected (composer opens on click or default behavior applies)

**Expected Outcome:**
Button is fully functional; rule does not apply to this category.

---

## Check 3: Non-targeted user

**Setup:**
- Log out or log in as a user NOT in the rule's `enabled_groups`
- Navigate to the category specified in the rule's `selected_categories`

**Verification:**
- [ ] The New Topic button appears normally (full opacity, interactive appearance)
- [ ] Button functions as expected (composer opens on click)
- [ ] No popover or replacement button is injected

**Expected Outcome:**
Button is fully functional; rule does not apply to users outside the target groups.

---

## Check 4: `redirect_url` behavior

**Setup:**
- Create a second rule (or modify the existing rule) with `redirect_url` set to a valid URL (e.g., `https://example.com`)
- Log in as a user in the rule's `enabled_groups`
- Navigate to the targeted category

**Verification:**
- [ ] The New Topic button appears greyed out (same as Check 1)
- [ ] Clicking the greyed-out button navigates to the `redirect_url` (page changes)
- [ ] Hovering still shows the tooltip

**Expected Outcome:**
Greyed-out button is clickable and redirects to the configured URL.

---

## Check 5: Navigation between categories

**Setup:**
- Have a rule configured targeting specific categories
- Log in as a user in the rule's `enabled_groups`

**Verification:**
- [ ] Navigate from a targeted category → non-targeted category → targeted category → different targeted category
- [ ] Observe that the button state updates correctly after each navigation
- [ ] No stale injected buttons remain from previous navigations (previous replacement button is removed)
- [ ] The correct tooltip message appears for the current category's rule

**Expected Outcome:**
Button state synchronizes correctly as you navigate. Cleanup removes old injections before new ones are applied.

---

## Check 6: No category set (global rule)

**Setup:**
- Create a rule with `selected_categories` left empty (unselected)
- Log in as a user in the rule's `enabled_groups`

**Verification:**
- [ ] Navigate to any category (including parent topic lists)
- [ ] Confirm the replacement button appears on all pages
- [ ] Navigate to the home/top-level topic list
- [ ] Confirm the replacement button appears there as well

**Expected Outcome:**
Rule applies globally to all category and topic list pages when `selected_categories` is empty.

---

## Check 7: `include_subcategories`

**Setup:**
- Create a rule targeting a parent category (e.g., "Products")
- Set `include_subcategories` to true
- Log in as a user in the rule's `enabled_groups`

**Verification:**
- [ ] Navigate to the parent category
- [ ] Confirm the replacement button appears
- [ ] Navigate to a subcategory of that parent (e.g., "Products → Subproduct")
- [ ] Confirm the replacement button appears in the subcategory as well
- [ ] Navigate to a sibling category (not a subcategory of the parent)
- [ ] Confirm the replacement button does NOT appear

**Expected Outcome:**
Rule correctly matches both the parent category and its direct children when `include_subcategories` is enabled.

---

## Notes

- **Popover positioning**: The popover should appear above the button (8px gap). If the button is near the top of the viewport, adjust your zoom or scroll position to verify positioning logic.
- **Markdown rendering**: Only `[text](url)` links and `\n` newlines are supported in `tooltip_message`. Other Markdown syntax is rendered as plain text.
- **CSS variables**: The popover uses Discourse CSS variables (`--primary`, `--secondary`, `--primary-medium`) to match your theme.
- **Performance**: Each page navigation triggers a 150ms debounce before injection; this prevents flashing and race conditions.
