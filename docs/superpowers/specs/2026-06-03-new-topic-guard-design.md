# discourse-new-topic-guard — Design Spec

Date: 2026-06-03

## Overview

A Discourse theme component that hides the standard New Topic button for specific groups of users in specific categories, replacing it with a visually greyed-out button that shows a hover popover explaining where to post instead. Non-targeted users see the normal button with no indication the component is active.

## Problem

Certain user groups should not post directly in community categories and should instead be directed to an internal portal or alternative destination. The default Discourse UI offers no way to communicate this without removing posting permissions entirely (which would remove the button for everyone or break other flows).

## Solution

Intercept the New Topic button via DOM manipulation on every page change. If the current user matches a configured rule (group + category), hide the real button and inject a greyed-out replacement. The replacement shows a Markdown-rendered popover on hover and optionally redirects on click. No composer ever opens for matched users.

## Architecture

Single-file theme component. No Glimmer components, no external dependencies. Follows the same DOM manipulation pattern as `discourse-shared-draft-button`.

```
discourse-new-topic-guard/
├── about.json
├── settings.yml
└── javascripts/
    └── discourse/
        └── api-initializers/
            └── new-topic-guard.js
```

## Settings Schema

```yaml
rules:
  type: objects
  default: []
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

## Behavior Logic

On every `api.onPageChange`:

1. **Cleanup** — remove any previously injected replacement button and popover div from the DOM.
2. **Determine current category** — read category ID from URL path (`/c/.../ID`) or `[data-category-id]` DOM attribute, matching the method in `discourse-shared-draft-button`.
3. **Evaluate rules** — iterate `settings.rules` in order. For each rule:
   - Check if current user belongs to any of `enabled_groups` (via `currentUser.groups`)
   - Check if current category matches `selected_categories`:
     - Empty → match all categories
     - Non-empty → match if current category ID is in the list, or if `include_subcategories` is true and the current category's `parent_category_id` is in the list
   - First matching rule wins.
4. **If match found:**
   - Set `display: none` on `#create-topic`
   - Inject a replacement `<button>` adjacent to `#create-topic` in the DOM with the same classes + greyed-out treatment
   - Attach `mouseenter`/`mouseleave` handlers to show/hide the popover
   - If `redirect_url` is set, attach a click handler to navigate there; otherwise the button is inert
5. **If no match:** real button remains visible, no injection occurs.

A small `setTimeout` delay (matching `discourse-shared-draft-button`'s 150ms) is used after navigation to allow Discourse to finish rendering the button before manipulation.

## Popover

- Injected as a `<div>` into `document.body`
- Positioned using `getBoundingClientRect()` on the replacement button — appears above the button
- `tooltip_message` is rendered from Markdown to HTML using Discourse's `discourse/lib/text` `cook` utility so links (`[text](url)`) become real `<a>` tags
- Styled using CSS variables only: `--primary`, `--secondary`, `--primary-medium`, `--primary-low` for background, border, and text — respects light/dark themes automatically

## Replacement Button Styling

- Copies Discourse's `.btn .btn-default` classes from the real `#create-topic` button
- Applies `opacity: 0.5` and `cursor: not-allowed`
- Label text stays "New Topic" (reads from the existing button label to stay in sync with Discourse's i18n)
- Icon (pencil/plus) is preserved by copying the existing button's icon element

## Non-Goals

- Composer modification (no composer ever opens for matched users)
- Custom button label or icon per rule (always mirrors the real button)
- Dismissal state / localStorage tracking
- Date range filtering

## Open Questions

- The `cook` utility is async — the popover content will be rendered once on first hover and cached on the element to avoid repeated async calls.
- If `#create-topic` is not present on a page (e.g., user lacks create-topic permission at the Discourse level), the component does nothing — the real permission system takes precedence.
