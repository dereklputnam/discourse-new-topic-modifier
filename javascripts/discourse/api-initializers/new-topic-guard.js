import { apiInitializer } from "discourse/lib/api";

export default apiInitializer("1.8.0", (api) => {
  const currentUser = api.container.lookup("service:current-user");
  if (!currentUser) {
    return;
  }

  const site = api.container.lookup("service:site");

  const INJECTED_BTN_ID = "ntg-replacement-btn";
  const POPOVER_ID = "ntg-popover";
  const BODY_CLASS = "ntg-active";

  // Persistent CSS in <head> — survives Discourse re-renders unlike inline styles
  if (!document.getElementById("ntg-styles")) {
    const style = document.createElement("style");
    style.id = "ntg-styles";
    style.textContent = `
      body.${BODY_CLASS} #create-topic,
      body.${BODY_CLASS} #custom-create-topic {
        display: none !important;
      }
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
      if (rule.enabled !== true) {
        continue;
      }
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
    const popoverWidth = popover.offsetWidth;
    const top = rect.top + window.scrollY - popoverHeight - 8;
    const left = rect.left + window.scrollX + rect.width / 2 - popoverWidth / 2;
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
      border: "1px solid var(--primary)",
      borderRadius: "4px",
      padding: "10px 14px",
      maxWidth: "280px",
      color: "var(--primary)",
      lineHeight: "1.4",
      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
    });
    document.body.appendChild(popover);
    return popover;
  }

  function injectButton(rule) {
    const realBtn = getCreateTopicButton();
    if (!realBtn) {
      return;
    }

    document.body.classList.add(BODY_CLASS);

    const tooltipHtml = renderLinks(rule.tooltip_message || "");

    const btn = document.createElement("button");
    btn.id = INJECTED_BTN_ID;
    btn.className = realBtn.className;
    btn.innerHTML = realBtn.innerHTML;
    btn.setAttribute("aria-disabled", "true");
    btn.setAttribute("type", "button");

    if (rule.button_text) {
      const label = btn.querySelector(".d-button-label");
      if (label) {
        label.textContent = rule.button_text;
      }
    }

    if (rule.icon && rule.icon !== "default") {
      const iconEl = btn.querySelector(".d-icon");
      if (iconEl) {
        // SVG elements use SVGAnimatedString for className — must use classList
        const oldIconClass = Array.from(iconEl.classList).find((c) => c.startsWith("d-icon-"));
        if (oldIconClass) {
          iconEl.classList.remove(oldIconClass);
          iconEl.classList.add(`d-icon-${rule.icon}`);
        }
        const useEl = iconEl.querySelector("use");
        if (useEl) {
          useEl.setAttribute("href", `#${rule.icon}`);
          useEl.setAttribute("xlink:href", `#${rule.icon}`);
        }
      }
    }

    const parent = realBtn.closest(".navigation-controls, .list-controls, .nav-controls") || realBtn.parentNode;

    const subscribeEl = Array.from(parent.querySelectorAll("button, [class*='subscribe']")).find((el) => {
      const label = el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "";
      return label.toLowerCase().includes("subscribe");
    });

    const insertAnchor = subscribeEl?.closest(".d-combo-button, .btn-group") || subscribeEl;

    if (insertAnchor && parent.contains(insertAnchor)) {
      insertAnchor.parentNode.insertBefore(btn, insertAnchor.nextSibling);
    } else {
      realBtn.parentNode.insertBefore(btn, realBtn.nextSibling);
    }

    btn.addEventListener("click", (e) => e.preventDefault());

    let popover = null;
    let popoverTimeout = null;

    function showPopover() {
      clearTimeout(popoverTimeout);
      if (popover) return;
      popover = createPopover(tooltipHtml);
      positionPopover(popover, btn);
    }

    function hidePopover() {
      popoverTimeout = setTimeout(() => {
        popover?.remove();
        popover = null;
      }, 200);
    }

    btn.addEventListener("mouseenter", showPopover);
    btn.addEventListener("mouseleave", hidePopover);

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
    document.body.classList.remove(BODY_CLASS);
    document.getElementById(INJECTED_BTN_ID)?.remove();
    document.getElementById(POPOVER_ID)?.remove();
  }

  api.onPageChange(() => {
    cleanup();
    setTimeout(() => {
      const rule = findMatchingRule(getCurrentCategoryId());
      if (rule) {
        injectButton(rule);
      }
    }, 150);
  });
});
