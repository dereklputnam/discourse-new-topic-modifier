import { apiInitializer } from "discourse/lib/api";

export default apiInitializer("1.8.0", (api) => {
  const currentUser = api.container.lookup("service:current-user");
  if (!currentUser) {
    return;
  }

  const site = api.container.lookup("service:site");

  const INJECTED_BTN_ID = "ntg-replacement-btn";
  const POPOVER_ID = "ntg-popover";

  // Inject CSS for button styling
  if (!document.getElementById("ntg-styles")) {
    const style = document.createElement("style");
    style.id = "ntg-styles";
    style.textContent = `
      #${INJECTED_BTN_ID} {
        opacity: 0.5 !important;
        cursor: not-allowed !important;
      }
      #${POPOVER_ID} a {
        color: var(--tertiary);
        text-decoration: underline;
      }
    `;
    document.head.appendChild(style);
  }

  function renderLinks(text) {
    return text
      .replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
      )
      .replace(/\n/g, "<br>");
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

  function getCreateTopicButton() {
    return document.getElementById("create-topic") || document.getElementById("custom-create-topic");
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
    });
    document.body.appendChild(popover);
    return popover;
  }

  function injectButtonAfterSubscribe(rule) {
    const realBtn = getCreateTopicButton();
    if (!realBtn) {
      console.log("[NTG] ERROR: No #create-topic or #custom-create-topic button found");
      return;
    }

    console.log("[NTG] Found button:", realBtn.id, "Creating injected button...");
    const tooltipHtml = renderLinks(rule.tooltip_message || "");

    // Create replacement button (copy from real button to preserve icon)
    const btn = document.createElement("button");
    btn.id = INJECTED_BTN_ID;
    btn.className = realBtn.className;
    btn.innerHTML = realBtn.innerHTML;
    btn.setAttribute("aria-disabled", "true");

    // Update button text if custom text provided
    if (rule.button_text) {
      const label = btn.querySelector(".d-button-label");
      if (label) {
        label.textContent = rule.button_text;
      }
    }

    // Find subscribe button to position after it
    const subscribeBtn = document.querySelector("[class*='subscribe']") || realBtn.parentElement.querySelector("[class*='subscribe']");
    let insertAfter = realBtn;

    if (subscribeBtn) {
      console.log("[NTG] Found subscribe button, positioning after it");
      insertAfter = subscribeBtn;
    }

    insertAfter.parentNode.insertBefore(btn, insertAfter.nextSibling);
    console.log("[NTG] Injected button created");

    // Hide real button
    realBtn.style.display = "none";
    console.log("[NTG] Real button hidden");

    // Handle click
    if (rule.redirect_url) {
      btn.addEventListener("click", () => {
        window.location.href = rule.redirect_url;
      });
    } else {
      btn.addEventListener("click", (e) => e.preventDefault());
    }

    // Popover handling
    let popover = null;
    let popoverTimeout = null;

    function showPopover() {
      clearTimeout(popoverTimeout);
      if (popover) return;
      popover = createPopover(tooltipHtml);
      positionPopover(popover, btn);
      console.log("[NTG] Popover shown");
    }

    function hidePopover() {
      popoverTimeout = setTimeout(() => {
        popover?.remove();
        popover = null;
        console.log("[NTG] Popover hidden");
      }, 200);
    }

    btn.addEventListener("mouseenter", showPopover);
    btn.addEventListener("mouseleave", hidePopover);

    // Keep popover visible when hovering over it
    document.addEventListener("mouseover", (e) => {
      if (e.target.closest(`#${POPOVER_ID}`)) {
        clearTimeout(popoverTimeout);
      }
    });

    document.addEventListener("mouseout", (e) => {
      if (e.target.closest(`#${POPOVER_ID}`) && !e.target.closest(`#${INJECTED_BTN_ID}`)) {
        hidePopover();
      }
    });
  }

  function cleanup() {
    document.getElementById(INJECTED_BTN_ID)?.remove();
    document.getElementById(POPOVER_ID)?.remove();
    const realBtn = getCreateTopicButton();
    if (realBtn) {
      realBtn.style.removeProperty("display");
    }
  }

  api.onPageChange(() => {
    console.log("[NTG] ========== PAGE CHANGE ==========");
    console.log("[NTG] Current user:", currentUser.username);
    console.log("[NTG] User groups:", currentUser.groups?.map(g => ({ id: g.id, name: g.name })));
    cleanup();
    setTimeout(() => {
      const categoryId = getCurrentCategoryId();
      console.log("[NTG] Current category ID:", categoryId);
      const rule = findMatchingRule(categoryId);
      if (rule) {
        console.log("[NTG] ✓ RULE MATCHED:", rule.id);
        injectButtonAfterSubscribe(rule);
      } else {
        console.log("[NTG] ✗ No matching rule for this user/category");
      }
    }, 150);
  });
});
