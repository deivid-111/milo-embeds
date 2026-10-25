// Panels: messages in Discord's Components v2, like the support server's info posts. A panel is a list of
// blocks: boxes (with a color line and items inside) or items on their own. Items are text (with an optional
// thumbnail), separators, rows of link buttons and images. Same format as utilities/cogs/embeds.py:
// {"layout": [{"type": "box", "color": null, "items": [{"type": "text", "text": "..."}]}]}.
(function () {
  "use strict";

  const MD = window.DiscordMarkdown;
  const LIMITS = { parts: 40, text: 4000, buttons: 5, label: 80 };
  const KINDS = { text: "Text", separator: "Separator", buttons: "Buttons", image: "Image" };
  const $ = (sel, root) => (root || document).querySelector(sel);
  const hex = (n) => "#" + n.toString(16).padStart(6, "0").toUpperCase();
  const esc = MD.escape;

  const blank = {
    box: () => ({ type: "box", color: null, items: [blank.text()] }),
    text: () => ({ type: "text", text: "", thumbnail: "" }),
    separator: () => ({ type: "separator", large: false, visible: true }),
    buttons: () => ({ type: "buttons", buttons: [{ label: "", url: "" }] }),
    image: () => ({ type: "image", url: "" }),
  };

  function starter() {
    return [
      { type: "image", url: "" },
      { type: "box", color: null, items: [
        { type: "text", text: "### A bold title\nOne or two lines about what this channel is for.", thumbnail: "" },
        { type: "separator", large: false, visible: true },
        { type: "text", text: "**The details**\n- Keep it short\n- Put links in the buttons below", thumbnail: "" },
      ] },
      { type: "box", color: null, items: [{ type: "buttons", buttons: [{ label: "Website", url: "https://milo-bot.xyz" }] }] },
    ];
  }

  // ---- data -------------------------------------------------------------------

  function normItem(raw) {
    if (!raw || typeof raw !== "object") return null;
    switch (raw.type) {
      case "text": return { type: "text", text: String(raw.text || ""), thumbnail: String(raw.thumbnail || "") };
      case "separator": return { type: "separator", large: !!raw.large, visible: raw.visible !== false };
      case "image": return { type: "image", url: String(raw.url || "") };
      case "buttons": return { type: "buttons", buttons: (raw.buttons || []).slice(0, LIMITS.buttons)
        .map((b) => ({ label: String((b && b.label) || ""), url: String((b && b.url) || "") })) };
      default: return null;
    }
  }

  function normalize(layout) {
    const out = [];
    for (const raw of layout || []) {
      if (raw && raw.type === "box") {
        out.push({ type: "box", color: typeof raw.color === "number" ? raw.color : null,
          items: (raw.items || []).map(normItem).filter(Boolean) });
      } else {
        const item = normItem(raw);
        if (item) out.push(item);
      }
    }
    return out;
  }

  // What utilities gets: empty bits left out.
  function cleanItem(item) {
    switch (item.type) {
      case "text": {
        const o = { type: "text", text: item.text };
        if (item.thumbnail.trim()) o.thumbnail = item.thumbnail.trim();
        return o;
      }
      case "separator": {
        const o = { type: "separator" };
        if (item.large) o.large = true;
        if (!item.visible) o.visible = false;
        return o;
      }
      case "image": return { type: "image", url: item.url.trim() };
      case "buttons": return { type: "buttons", buttons: item.buttons.map((b) => ({ label: b.label.trim(), url: b.url.trim() })) };
    }
    return item;
  }

  function clean(layout) {
    return layout.map((b) => b.type === "box" ? { type: "box", color: b.color, items: b.items.map(cleanItem) } : cleanItem(b));
  }

  function textLength(layout) {
    let n = 0;
    const count = (i) => { if (i.type === "text") n += i.text.length; };
    layout.forEach((b) => b.type === "box" ? b.items.forEach(count) : count(b));
    return n;
  }

  // Discord counts every component: boxes, rows, each button, each text, a text with a thumbnail is 3.
  function partCount(layout) {
    const count = (i) => i.type === "buttons" ? 1 + i.buttons.length : i.type === "image" ? 2 :
      i.type === "text" && i.thumbnail.trim() ? 3 : 1;
    return layout.reduce((n, b) => n + (b.type === "box" ? 1 + b.items.reduce((m, i) => m + count(i), 0) : count(b)), 0);
  }

  const goodUrl = (u, keep) => !!MD.safeUrl(u) || (keep && /^attachment:\/\/\S+$/.test(u));

  function problems(layout) {
    const out = [];
    if (!layout.length) out.push("The panel is empty. Add a box.");
    const check = (item, where) => {
      if (item.type === "text") {
        if (!item.text.trim()) out.push(where + ": the text is empty.");
        if (item.thumbnail.trim() && !goodUrl(item.thumbnail.trim(), true)) out.push(where + ": the thumbnail has to start with https://");
      } else if (item.type === "image") {
        if (!goodUrl(item.url.trim(), true)) out.push(where + ": the image needs a link that starts with https://");
      } else if (item.type === "buttons") {
        if (!item.buttons.length) out.push(where + ": add a button or remove the row.");
        item.buttons.forEach((b, k) => {
          if (!b.label.trim()) out.push(where + ", button " + (k + 1) + ": it needs a label.");
          if (!MD.safeUrl(b.url.trim())) out.push(where + ", button " + (k + 1) + ": the link has to start with https://");
        });
      }
    };
    layout.forEach((b, n) => {
      if (b.type === "box") {
        if (!b.items.length) out.push("Box " + (n + 1) + " is empty. Add something or remove it.");
        b.items.forEach((i, j) => check(i, "Box " + (n + 1) + ", " + KINDS[i.type].toLowerCase() + " " + (j + 1)));
      } else {
        check(b, KINDS[b.type] + " " + (n + 1));
      }
    });
    if (textLength(layout) > LIMITS.text) out.push("The panel has more than 4000 characters of text.");
    if (partCount(layout) > LIMITS.parts) out.push("The panel has more than 40 parts. Take some out.");
    return out;
  }

  // ---- editor -----------------------------------------------------------------

  function itemEditor(item) {
    const head = '<div class="pitem-top"><span class="pkind">' + KINDS[item.type] + "</span>" +
      '<button type="button" class="link" data-pact="up">Up</button>' +
      '<button type="button" class="link" data-pact="down">Down</button>' +
      '<button type="button" class="link" data-pact="remove">Remove</button></div>';
    let body = "";
    if (item.type === "text") {
      body = '<textarea data-p="text" rows="4" placeholder="### A title, then the text. Markdown works.">' + esc(item.text) + "</textarea>" +
        '<label>Thumbnail URL <span class="opt">optional, small picture on the right</span>' +
        '<input type="url" data-p="thumbnail" value="' + esc(item.thumbnail) + '"></label>';
    } else if (item.type === "separator") {
      body = '<div class="sep-opts"><label class="check"><input type="checkbox" data-p="visible"' + (item.visible ? " checked" : "") +
        "> Show the line</label>" + '<label class="check"><input type="checkbox" data-p="large"' + (item.large ? " checked" : "") +
        "> More space</label></div>";
    } else if (item.type === "image") {
      body = keepNote(item.url) + '<input type="url" data-p="url" placeholder="https://..." value="' + esc(item.url) + '">';
    } else if (item.type === "buttons") {
      body = item.buttons.map((b, k) => '<div class="pbutton" data-k="' + k + '">' +
        '<input type="text" data-p="label" maxlength="' + LIMITS.label + '" placeholder="Label" value="' + esc(b.label) + '">' +
        '<input type="url" data-p="burl" placeholder="https://..." value="' + esc(b.url) + '">' +
        '<button type="button" class="link" data-pact="button-remove">Remove</button></div>').join("") +
        (item.buttons.length < LIMITS.buttons ? '<button type="button" class="add small" data-pact="button-add">+ Button</button>' : "") +
        '<p class="hint">Link buttons. For a channel, use its link (right click the channel, Copy Link).</p>';
    }
    return head + body;
  }

  function keepNote(url) {
    return /^attachment:\/\//.test(url) ? '<p class="hint">This is the picture already on the posted message (' +
      esc(url.slice(13)) + "). Leave it to keep it, or paste a new link.</p>" : "";
  }

  function colorRow(color) {
    const presets = [["#2EC4B6", "Teal"], ["#0B1F3A", "Navy"], ["#FFB703", "Amber"], ["#E5484D", "Red"]];
    return '<div class="row color-row"><label>Line color <span class="opt">optional</span>' +
      '<span class="color-pick"><input type="color" data-p="color" value="' + (color === null ? "#000000" : hex(color)) + '">' +
      '<input type="text" data-p="colorText" maxlength="7" spellcheck="false" value="' + (color === null ? "" : hex(color)) + '"></span></label>' +
      '<div class="presets">' + presets.map(([c, t]) => '<button type="button" data-pcolor="' + c + '" title="' + t + '" style="background:' + c + '"></button>').join("") +
      '<button type="button" data-pcolor="" title="No color" class="none">x</button></div></div>';
  }

  function blockTitle(block, n) {
    if (block.type !== "box") return KINDS[block.type];
    const first = block.items.find((i) => i.type === "text" && i.text.trim());
    const title = first ? first.text.split("\n")[0].replace(/^#+\s*/, "").replace(/<a?:(\w+):\d+>/g, ":$1:").trim().slice(0, 40) : "";
    return "Box " + n + (title ? ": " + title : "");
  }

  function renderEditor(container, layout, open) {
    container.innerHTML = layout.map((block, b) => {
      const isBox = block.type === "box";
      const summary = '<summary><span class="swatch"' + (isBox && block.color !== null ? ' style="background:' + hex(block.color) + '"' : "") +
        '></span><span class="embed-name">' + esc(blockTitle(block, b + 1)) + '</span><span class="move">' +
        '<button type="button" data-pact="up">Up</button><button type="button" data-pact="down">Down</button>' +
        '<button type="button" data-pact="copy">Copy</button><button type="button" data-pact="remove">Remove</button></span></summary>';
      const inner = isBox
        ? colorRow(block.color) + block.items.map((item, i) => '<div class="pitem" data-i="' + i + '">' + itemEditor(item) + "</div>").join("") +
          '<div class="add-row">' + Object.entries(KINDS).map(([k, label]) => '<button type="button" class="add small" data-pact="add-' + k + '">+ ' + label + "</button>").join("") + "</div>"
        : '<div class="pitem solo" data-i="-1">' + itemEditor(block).replace(/<div class="pitem-top">[\s\S]*?<\/div>/, "") + "</div>";
      return '<details class="box block-box" data-b="' + b + '"' + (open[b] === false ? "" : " open") + ">" + summary + inner + "</details>";
    }).join("");
  }

  function target(layout, el) {
    const box = el.closest(".block-box");
    if (!box) return {};
    const b = Number(box.dataset.b);
    const pi = el.closest(".pitem");
    const i = pi ? Number(pi.dataset.i) : null;
    const block = layout[b];
    const item = i === null ? null : i < 0 ? block : block.items[i];
    const pb = el.closest(".pbutton");
    return { b, i, block, item, k: pb ? Number(pb.dataset.k) : null };
  }

  // Changes from typing: returns true if anything changed.
  function onInput(layout, el) {
    const t = target(layout, el);
    if (!t.block) return false;
    const p = el.dataset.p;
    if (p === "color") {
      t.block.color = parseInt(el.value.slice(1), 16);
      $('[data-p="colorText"]', el.closest(".block-box")).value = el.value.toUpperCase();
    } else if (p === "colorText") {
      const m = el.value.trim().match(/^#?([0-9a-f]{6})$/i);
      if (!m) return false;
      t.block.color = parseInt(m[1], 16);
      $('[data-p="color"]', el.closest(".block-box")).value = "#" + m[1];
    } else if (!t.item) {
      return false;
    } else if (p === "label" || p === "burl") {
      t.item.buttons[t.k][p === "label" ? "label" : "url"] = el.value;
    } else if (p === "large" || p === "visible") {
      t.item[p] = el.checked;
    } else if (p) {
      t.item[p] = el.value;
    } else {
      return false;
    }
    const box = el.closest(".block-box");
    $(".embed-name", box).textContent = blockTitle(t.block, t.b + 1);
    $(".swatch", box).style.background = t.block.type === "box" && t.block.color !== null ? hex(t.block.color) : "transparent";
    return true;
  }

  // Button clicks: returns true if the structure changed (the editor needs drawing again).
  function onClick(layout, button) {
    const act = button.dataset.pact;
    if (button.dataset.pcolor !== undefined) {
      const t = target(layout, button);
      t.block.color = button.dataset.pcolor ? parseInt(button.dataset.pcolor.slice(1), 16) : null;
      return true;
    }
    if (!act) return false;
    if (act === "add-box") { layout.push(blank.box()); return true; }
    if (act === "add-top-image") { layout.push(blank.image()); return true; }
    const t = target(layout, button);
    if (!t.block) return false;
    const swap = (arr, a, c) => { if (c >= 0 && c < arr.length) [arr[a], arr[c]] = [arr[c], arr[a]]; };
    const inItem = t.i !== null && t.i >= 0 && !button.closest("summary");
    if (act.startsWith("add-")) { t.block.items.push(blank[act.slice(4)]()); return true; }
    if (act === "button-add") { t.item.buttons.push({ label: "", url: "" }); return true; }
    if (act === "button-remove") { t.item.buttons.splice(t.k, 1); return true; }
    const list = inItem ? t.block.items : layout;
    const at = inItem ? t.i : t.b;
    switch (act) {
      case "up": swap(list, at, at - 1); return true;
      case "down": swap(list, at, at + 1); return true;
      case "copy": list.splice(at + 1, 0, JSON.parse(JSON.stringify(list[at]))); return true;
      case "remove":
        if (!inItem && list[at].type === "box" && list[at].items.length && !confirm("Remove this box?")) return false;
        list.splice(at, 1);
        return true;
    }
    return false;
  }

  // ---- preview ----------------------------------------------------------------

  function imageHtml(url, cls) {
    const u = (url || "").trim();
    if (/^attachment:\/\//.test(u)) return '<div class="' + cls + ' kept">Picture already on the message (' + esc(u.slice(13)) + ")</div>";
    const safe = MD.safeUrl(u);
    return safe ? '<img class="' + cls + '" src="' + esc(safe) + '" alt="" loading="lazy">' : '<div class="' + cls + ' kept">Image: paste a link</div>';
  }

  function itemHtml(item) {
    switch (item.type) {
      case "text": {
        const text = '<div class="c-text">' + (MD.render(item.text) || "&nbsp;") + "</div>";
        return item.thumbnail.trim() ? '<div class="c-section">' + text + imageHtml(item.thumbnail, "c-thumb") + "</div>" : text;
      }
      case "separator": return '<div class="c-sep' + (item.large ? " large" : "") + (item.visible ? "" : " hidden") + '"></div>';
      case "image": return '<div class="c-gallery">' + imageHtml(item.url, "c-image") + "</div>";
      case "buttons": return '<div class="c-row">' + item.buttons.map((b) => '<span class="c-btn">' + esc(b.label || "Button") +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M15 2a1 1 0 0 0 0 2h3.6l-7.3 7.3a1 1 0 1 0 1.4 1.4L20 5.4V9a1 1 0 1 0 2 0V3a1 1 0 0 0-1-1h-6ZM5 4a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-5a1 1 0 1 0-2 0v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5a1 1 0 1 0 0-2H5Z"/></svg></span>').join("") + "</div>";
    }
    return "";
  }

  function previewHtml(layout) {
    if (!layout.length) return '<div class="msg-empty">Nothing to show yet. Add a box.</div>';
    return layout.map((block) => block.type === "box"
      ? '<div class="c-box"' + (block.color !== null ? ' style="border-left:4px solid ' + hex(block.color) + '"' : "") + ">" +
        block.items.map(itemHtml).join("") + "</div>"
      : itemHtml(block)).join("");
  }

  window.MiloPanel = { starter, normalize, clean, problems, textLength, partCount, renderEditor, onInput, onClick, previewHtml, LIMITS };
})();
