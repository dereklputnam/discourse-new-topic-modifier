# discourse-new-topic-guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Discourse theme component that replaces the New Topic button with a greyed-out, hover-tooltip version for targeted group+category combinations, leaving all other users unaffected.

**Architecture:** Single `api-initializers` JS file using DOM manipulation on `api.onPageChange` — same pattern as `discourse-shared-draft-button`. No Glimmer components. Rules are configured via an `objects`-type setting in `settings.yml`. Markdown links in tooltip messages are rendered via a local regex converter (no external deps).

**Tech Stack:** Discourse Theme Component JS (ESM), Discourse Plugin API (`apiInitializer`), CSS variables for theming, plain DOM APIs for popover.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `about.json` | Create | Component metadata |
| `settings.yml` | Create | Object editor schema for rules |
| `javascripts/discourse/api-initializers/new-topic-guard.js` | Create | All runtime logic: rule matching, button injection, popover |

---

## Task 1: Scaffold the component

**Files:**
- Create: `about.json`
- Create: `.gitignore`

- [ ] **Step 1: Create `about.json`**

```json
{
  "name": "New Topic Guard",
  "component": true,
  "license_url": "https://github.com/dereklputnam/discourse-new-topic-guard/blob/main/LICENSE",
  "about_url": "https://github.com/dereklputnam/discourse-new-topic-guard",
  "authors": "Derek Putnam",
  "theme_version": "1.0.0",
  "minimum_discourse_version": "3.1.0"
}
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
.DS_Store
```

- [ ] **Step 3: Create the JS directory structure**

```bash
mkdir -p javascripts/discourse/api-initializers
```

- [ ] **Step 4: Commit scaffold**

```bash
git add about.json .gitignore
git commit -m "feat: scaffold discourse-new-topic-guard component"
```

---

## Task 2: Write the settings schema

**Files:**
- Create: `settings.yml`

- [ ] **Step 1: Create `settings.yml`**

```yaml
rules:
  refresh: true
  default: []
  type: objects
  schema:
    name: New Topic Guard Rule
    identifier: id
    properties:
      id:
        type: string
        required: true
        validations:
          min_length: 3
      enabled_groups:
        type: groups
        required: true
        validations:
          min: 1
      selected_categories:
        type: categories
      include_subcategories:
        type: boolean
      tooltip_message:
        type: string
        required: true
        textarea: true
        validations:
          min_length: 5
          max_length: 500
      redirect_url:
        type: string
```

**Field notes:**
- `refresh: true` on the top-level `rules` key ensures the theme reloads when rules are saved in admin
- `selected_categories` empty = rule applies on all category pages
- `include_subcategories` = also match children of selected categories
- `tooltip_message` supports Markdown links: `[link text](https://example.com)`
- `redirect_url` optional: if set, clicking the button navigates here; otherwise button is inert

- [ ] **Step 2: Verify in admin (manual)**

Install the component on a dev Discourse instance. Navigate to **Admin → Customize → Themes → [this component] → Settings**. Confirm the object editor appears and you can add a rule with all fields visible.

- [ ] **Step 3: Commit**

```bash
git add settings.yml
git commit -m "feat: add object editor settings schema"
```

---

## Task 3: Write the core initializer

**Files:**
- Create: `javascripts/discourse/api-initializers/new-topic-guard.js`

This is the entire runtime. Write the full file in one step.

- [ ] **Step 1: Create the initializer**

```javascript
import { apiInitializer } from "discourse/lib/api";

export default apiInitializer("1.8.0", (api) => {
  const currentUser = api.container.lookup("service:current-user");
  if (!currentUser) {
    return;
  }

  const site = api.container.lookup("service:site");

  const INJECTED_BTN_ID = "ntg-replacement-btn";
  const POPOVER_ID = "ntg-popover";

  // Convert [text](url) Markdown links to <a> tags and newlines to <br>.
  // Kept local to avoid async cook() complexity — only link syntax is needed.
  function renderLinks(text) {
    return text
      .replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
      )
      .replace(/\n/g, "<br>");
  }

  function cleanup() {
    document.getElementById(INJECTED_BTN_ID)?.remove();
    document.getElementById(POPOVER_ID)?.remove();
    const realBtn = document.getElementById("create-topic");
    if (realBtn) {
      realBtn.style.removeProperty("display");
    }
  }

  function getCurrentCategoryId() {
    const match = window.location.pathname.match(
      /\/c\/(?:[^/]+\/)*(\d+)(?:\/|$)/
    );
    if (match) {
      return parseInt(match[1], 10);
    }
    const el = document.querySelector("[data-category-id]");
    if (el) {
      return parseInt(el.getAttribute("data-category-id"), 10);
    }
    return null;
  }

  function userMatchesGroups(groupIds) {
    if (!currentUser.groups?.length) {
      return false;
    }
    const userGroupIds = new Set(currentUser.groups.map((g) => g.id));
    return groupIds.some((id) => userGroupIds.has(id));
  }

  function categoryMatches(rule, categoryId) {
    const selected = rule.selected_categories;
    if (!selected || selected.length === 0) {
      return true;
    }
    if (selected.includes(categoryId)) {
      return true;
    }
    if (rule.include_subcategories) {
      const cat = site.categories?.find((c) => c.id === categoryId);
      if (cat?.parent_category_id && selected.includes(cat.parent_category_id)) {
        return true;
      }
    }
    return false;
  }

  function findMatchingRule(categoryId) {
    const rules = settings.rules || [];
    for (const rule of rules) {
      if (
        userMatchesGroups(rule.enabled_groups) &&
        categoryMatches(rule, categoryId)
      ) {
        return rule;
      }
    }
    return null;
  }

  function positionPopover(popover, anchorBtn) {
    const rect = anchorBtn.getBoundingClientRect();
    const popoverHeight = popover.offsetHeight;
    const top = rect.top + window.scrollY - popoverHeight - 8;
    const left = rect.left + window.scrollX;
    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
  }

  function createPopover(htmlContent) {
    const popover = document.createElement("div");
    popover.id = POPOVER_ID;
    popover.innerHTML = htmlContent;
    Object.assign(popover.style, {
      position: "absolute",
      zIndex: "9999",
      background: "var(--secondary)",
      border: "1px solid var(--primary-medium)",
      borderRadius: "4px",
      padding: "10px 14px",
      maxWidth: "280px",
      color: "var(--primary)",
      fontSize: "0.875em",
      lineHeight: "1.4",
      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
      pointerEvents: "none",
    });
    document.body.appendChild(popover);
    return popover;
  }

  function injectReplacementButton(rule) {
    const realBtn = document.getElementById("create-topic");
    if (!realBtn) {
      return;
    }

    const tooltipHtml = renderLinks(rule.tooltip_message || "");

    realBtn.style.display = "none";

    const btn = document.createElement("button");
    btn.id = INJECTED_BTN_ID;
    btn.className = realBtn.className;
    btn.innerHTML = realBtn.innerHTML;
    btn.setAttribute("aria-disabled", "true");

    Object.assign(btn.style, {
      opacity: "0.5",
      cursor: rule.redirect_url ? "pointer" : "not-allowed",
    });

    if (rule.redirect_url) {
      btn.addEventListener("click", () => {
        window.location.href = rule.redirect_url;
      });
    } else {
      btn.addEventListener("click", (e) => e.preventDefault());
    }

    let popover = null;

    btn.addEventListener("mouseenter", () => {
      popover = createPopover(tooltipHtml);
      positionPopover(popover, btn);
    });

    btn.addEventListener("mouseleave", () => {
      popover?.remove();
      popover = null;
    });

    realBtn.parentNode.insertBefore(btn, realBtn.nextSibling);
  }

  api.onPageChange(() => {
    cleanup();
    setTimeout(() => {
      const categoryId = getCurrentCategoryId();
      const rule = findMatchingRule(categoryId);
      if (rule) {
        injectReplacementButton(rule);
      }
    }, 150);
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add javascripts/
git commit -m "feat: add new-topic-guard initializer with DOM injection and popover"
```

---

## Task 4: Manual verification

No automated test runner is available for Discourse theme component JS. Use this checklist against a dev Discourse instance with the component installed and at least one rule configured.

**Setup:** Add a rule targeting a test group you belong to, pointing at a category you can browse. Set `tooltip_message` to `You cannot post here. Please [submit a request](https://example.com) instead.`

- [ ] **Check 1: Targeted user, matching category**
  - Browse to the targeted category
  - Confirm the New Topic button appears greyed out (opacity reduced)
  - Confirm hovering shows the popover with your message
  - Confirm the link in the tooltip is clickable and opens the URL
  - Confirm clicking the button itself does nothing (no composer opens)

- [ ] **Check 2: Targeted user, non-matching category**
  - Browse to a different category not in the rule
  - Confirm the New Topic button appears normally

- [ ] **Check 3: Non-targeted user**
  - Log in as a user NOT in the rule's `enabled_groups`
  - Browse the targeted category
  - Confirm the New Topic button appears and functions normally

- [ ] **Check 4: `redirect_url` behavior**
  - Add a second rule with `redirect_url` set to `https://example.com`
  - Browse as a targeted user
  - Confirm clicking the greyed-out button navigates to the URL

- [ ] **Check 5: Navigation between categories**
  - Navigate from targeted category → non-targeted category → targeted category
  - Confirm the button state updates correctly each time (no stale injections)

- [ ] **Check 6: No category set (global rule)**
  - Set `selected_categories` to empty
  - Confirm the rule fires on the top-level topic list and any category

- [ ] **Check 7: `include_subcategories`**
  - Select a parent category, enable `include_subcategories`
  - Browse to a subcategory of that parent
  - Confirm the replacement button appears

---

## Task 5: Create GitHub repo and push

- [ ] **Step 1: Create the public repo on GitHub**

```bash
gh repo create dereklputnam/discourse-new-topic-guard \
  --public \
  --description "Discourse theme component: replaces the New Topic button with a greyed-out tooltip version for targeted groups and categories" \
  --source=. \
  --remote=origin \
  --push
```

- [ ] **Step 2: Verify**

```bash
gh repo view dereklputnam/discourse-new-topic-guard
```

Expected: repo page shows with the three committed files visible.
