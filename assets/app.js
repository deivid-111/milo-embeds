// milo embeds: make a Discord message with embeds, preview it, and turn it into a code that milo utilities
// posts with /embed post. The code is "m1." + base64url(raw deflate(JSON)), the same as utilities/cogs/embeds.py.
(function () {
  "use strict";

  const MD = window.DiscordMarkdown;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const DRAFT_KEY = "milo-embeds:draft";
  const LIMITS = { embeds: 10, fields: 25, total: 6000 };

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private window */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* private window */ } },
  };

  const blankEmbed = () => ({
    color: 0x2EC4B6, author: { name: "", url: "", icon_url: "" }, title: "", url: "", description: "",
    fields: [], image: { url: "" }, thumbnail: { url: "" }, footer: { text: "", icon_url: "" }, timestamp: "",
  });

  const starter = () => ({
    content: "",
    embeds: [Object.assign(blankEmbed(), {
      title: "Welcome to milo embeds",
      description: "Type on the left and this preview updates as you go.\n\n" +
        "**Bold**, *italic*, __underline__, ~~strike~~, `code` and [links](https://milo-bot.xyz) all work, " +
        "just like in Discord.\n\nWhen it looks right, click **Copy code** and run `/embed post` in the server.",
      footer: { text: "milo utilities", icon_url: "" },
    })],
  });

  let state = loadSaved();

  // ---- state ------------------------------------------------------------------

  function normalize(msg) {
    const out = { content: msg.content || "", embeds: [] };
    for (const e of (msg.embeds || []).slice(0, LIMITS.embeds)) {
      const b = blankEmbed();
      b.color = typeof e.color === "number" ? e.color : null;
      b.author = Object.assign(b.author, pick(e.author, ["name", "url", "icon_url"]));
      b.title = e.title || "";
      b.url = e.url || "";
      b.description = e.description || "";
      b.fields = (e.fields || []).slice(0, LIMITS.fields).map((f) => ({ name: f.name || "", value: f.value || "", inline: !!f.inline }));
      b.image = { url: (e.image && e.image.url) || "" };
      b.thumbnail = { url: (e.thumbnail && e.thumbnail.url) || "" };
      b.footer = Object.assign(b.footer, pick(e.footer, ["text", "icon_url"]));
      b.timestamp = e.timestamp ? toLocalInput(e.timestamp) : "";
      out.embeds.push(b);
    }
    return out;
  }

  function pick(obj, keys) {
    const out = {};
    for (const k of keys) if (obj && typeof obj[k] === "string") out[k] = obj[k];
    return out;
  }

  function toLocalInput(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function loadSaved() {
    try {
      const saved = store.get(DRAFT_KEY);
      if (saved) return normalize(JSON.parse(saved));
    } catch (e) { /* ignore a broken draft */ }
    return starter();
  }

  function save() {
    store.set(DRAFT_KEY, JSON.stringify(payload(false)));
  }

  // What Discord gets: empty parts left out, so the API doesn't reject the message.
  function payload(forSend) {
    const out = {};
    if (state.content.trim()) out.content = state.content;
    out.embeds = state.embeds.map((e) => {
      const o = {};
      if (e.color !== null) o.color = e.color;
      const author = clean(e.author);
      if (author.name) o.author = author;
      if (e.title.trim()) o.title = e.title;
      if (e.url.trim()) o.url = e.url.trim();
      if (e.description.trim()) o.description = e.description;
      const fields = e.fields.filter((f) => !forSend || f.name.trim() || f.value.trim())
        .map((f) => ({ name: f.name, value: f.value, inline: f.inline }));
      if (fields.length) o.fields = fields;
      if (e.image.url.trim()) o.image = { url: e.image.url.trim() };
      if (e.thumbnail.url.trim()) o.thumbnail = { url: e.thumbnail.url.trim() };
      const footer = clean(e.footer);
      if (footer.text) o.footer = footer;
      if (e.timestamp) {
        const d = new Date(e.timestamp);
        if (!isNaN(d)) o.timestamp = d.toISOString();
      }
      return o;
    });
    if (!out.embeds.length) delete out.embeds;
    return out;
  }

  function clean(obj) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) if (v && v.trim()) out[k] = v.trim();
    return out;
  }

  function embedLength(e) {
    return e.title.length + e.description.length + e.author.name.length + e.footer.text.length +
      e.fields.reduce((n, f) => n + f.name.length + f.value.length, 0);
  }

  function get(obj, path) { return path.split(".").reduce((o, k) => o[k], obj); }
  function set(obj, path, value) {
    const keys = path.split(".");
    const last = keys.pop();
    keys.reduce((o, k) => o[k], obj)[last] = value;
  }

  const hex = (n) => "#" + n.toString(16).padStart(6, "0").toUpperCase();

  // ---- editor -----------------------------------------------------------------

  function renderEditor() {
    $("#content").value = state.content;
    const list = $("#embeds");
    const open = [...list.querySelectorAll(".embed-box")].map((d) => d.open);
    list.innerHTML = "";
    state.embeds.forEach((embed, i) => {
      const node = $("#embed-template").content.firstElementChild.cloneNode(true);
      node.dataset.index = i;
      if (open[i] === false) node.open = false;
      node.querySelectorAll("[data-k]").forEach((input) => {
        const k = input.dataset.k;
        if (k === "color") input.value = embed.color === null ? "#000000" : hex(embed.color);
        else if (k === "colorText") input.value = embed.color === null ? "" : hex(embed.color);
        else input.value = get(embed, k);
      });
      const fields = $(".fields", node);
      embed.fields.forEach((field, j) => {
        const f = $("#field-template").content.firstElementChild.cloneNode(true);
        f.dataset.field = j;
        $('[data-f="name"]', f).value = field.name;
        $('[data-f="value"]', f).value = field.value;
        $('[data-f="inline"]', f).checked = field.inline;
        fields.appendChild(f);
      });
      $('[data-act="add-field"]', node).hidden = embed.fields.length >= LIMITS.fields;
      list.appendChild(node);
    });
    $("#btn-add-embed").hidden = state.embeds.length >= LIMITS.embeds;
    labelEmbeds();
    counts();
  }

  function labelEmbeds() {
    document.querySelectorAll(".embed-box").forEach((box, i) => {
      const e = state.embeds[i];
      $(".embed-name", box).textContent = "Embed " + (i + 1) + (e.title.trim() ? ": " + e.title.replace(/<a?:(\w+):\d+>/g, ":$1:").trim().slice(0, 40) : "");
      $(".swatch", box).style.background = e.color === null ? "transparent" : hex(e.color);
    });
  }

  function counts() {
    document.querySelectorAll(".count").forEach((el) => {
      const box = el.closest(".embed-box");
      const text = box ? state.embeds[box.dataset.index][el.dataset.for] : state.content;
      const max = { content: 2000, title: 256, description: 4096 }[el.dataset.for];
      el.textContent = text.length ? text.length + " / " + max : "";
    });
    const total = state.embeds.reduce((n, e) => n + embedLength(e), 0);
    const el = $("#total");
    el.textContent = total + " / " + LIMITS.total + " characters";
    el.classList.toggle("over", total > LIMITS.total);
  }

  let sizeTimer = null;
  function changed(structure) {
    if (structure) renderEditor();
    else { labelEmbeds(); counts(); }
    renderPreview();
    save();
    clearTimeout(sizeTimer);
    sizeTimer = setTimeout(updateCodeSize, 300);
  }

  document.addEventListener("input", (ev) => {
    const t = ev.target;
    if (t.id === "content") state.content = t.value;
    else if (t.id === "load-code") return;
    else {
      const box = t.closest(".embed-box");
      if (!box) return;
      const embed = state.embeds[box.dataset.index];
      const fieldEl = t.closest(".field");
      if (fieldEl && t.dataset.f) {
        const field = embed.fields[fieldEl.dataset.field];
        field[t.dataset.f] = t.type === "checkbox" ? t.checked : t.value;
      } else if (t.dataset.k === "color") {
        embed.color = parseInt(t.value.slice(1), 16);
        $('[data-k="colorText"]', box).value = t.value.toUpperCase();
      } else if (t.dataset.k === "colorText") {
        const m = t.value.trim().match(/^#?([0-9a-f]{6})$/i);
        if (!m) return;
        embed.color = parseInt(m[1], 16);
        $('[data-k="color"]', box).value = "#" + m[1];
      } else if (t.dataset.k) {
        set(embed, t.dataset.k, t.value);
      }
    }
    changed(false);
  });

  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    const box = b.closest(".embed-box");
    const i = box ? Number(box.dataset.index) : -1;
    const embed = box ? state.embeds[i] : null;
    if (b.dataset.color !== undefined && box) {
      embed.color = b.dataset.color ? parseInt(b.dataset.color.slice(1), 16) : null;
      return changed(true);
    }
    const act = b.dataset.act;
    if (!act) return;
    if (b.closest("summary")) ev.preventDefault(); // don't fold the box when using its buttons
    const fieldEl = b.closest(".field");
    const j = fieldEl ? Number(fieldEl.dataset.field) : -1;
    switch (act) {
      case "up": if (i > 0) swap(state.embeds, i, i - 1); break;
      case "down": if (i < state.embeds.length - 1) swap(state.embeds, i, i + 1); break;
      case "copy":
        if (state.embeds.length >= LIMITS.embeds) return;
        state.embeds.splice(i + 1, 0, JSON.parse(JSON.stringify(embed)));
        break;
      case "remove":
        if (embedLength(embed) > 0 && !confirm("Remove this embed?")) return;
        state.embeds.splice(i, 1);
        break;
      case "add-field": embed.fields.push({ name: "", value: "", inline: false }); break;
      case "field-up": if (j > 0) swap(embed.fields, j, j - 1); break;
      case "field-down": if (j < embed.fields.length - 1) swap(embed.fields, j, j + 1); break;
      case "field-remove": embed.fields.splice(j, 1); break;
      case "now": embed.timestamp = toLocalInput(new Date().toISOString()); break;
      case "no-time": embed.timestamp = ""; break;
      default: return;
    }
    changed(true);
  });

  function swap(arr, a, b) { [arr[a], arr[b]] = [arr[b], arr[a]]; }

  $("#btn-add-embed").addEventListener("click", () => {
    state.embeds.push(blankEmbed());
    changed(true);
    const boxes = document.querySelectorAll(".embed-box");
    boxes[boxes.length - 1].scrollIntoView({ behavior: "smooth", block: "start" });
  });

  $("#btn-clear").addEventListener("click", () => {
    if (!confirm("Clear everything and start from an empty message?")) return;
    state = { content: "", embeds: [blankEmbed()] };
    changed(true);
  });

  // ---- preview ----------------------------------------------------------------

  function img(url, cls, alt) {
    const u = MD.safeUrl((url || "").trim());
    return u ? '<img class="' + cls + '" src="' + MD.escape(u) + '" alt="' + (alt || "") + '" loading="lazy">' : "";
  }

  function link(url, inner) {
    const u = MD.safeUrl((url || "").trim());
    return u ? '<a href="' + MD.escape(u) + '" target="_blank" rel="noopener">' + inner + "</a>" : inner;
  }

  function stampText(local) {
    const d = new Date(local);
    if (isNaN(d)) return "";
    const today = new Date();
    const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (d.toDateString() === today.toDateString()) return "Today at " + time;
    return d.toLocaleDateString() + " " + time;
  }

  function embedHtml(e) {
    const parts = [];
    if (e.author.name.trim()) {
      parts.push('<div class="e-author">' + img(e.author.icon_url, "e-author-icon") +
        link(e.author.url, MD.escape(e.author.name)) + "</div>");
    }
    if (e.title.trim()) {
      const title = MD.render(e.title, { blocks: false, links: false });
      parts.push('<div class="e-title' + (MD.safeUrl(e.url.trim()) ? " linked" : "") + '">' + link(e.url, title) + "</div>");
    }
    if (e.description.trim()) parts.push('<div class="e-desc">' + MD.render(e.description) + "</div>");
    if (e.fields.length) {
      const perRow = e.thumbnail.url.trim() ? 2 : 3;
      let row = [];
      const rows = [];
      for (const f of e.fields) {
        if (f.inline && row.length < perRow) { row.push(f); continue; }
        if (row.length) rows.push(row);
        row = f.inline ? [f] : [];
        if (!f.inline) rows.push([f]);
      }
      if (row.length) rows.push(row);
      parts.push('<div class="e-fields">' + rows.map((r) =>
        '<div class="e-row" style="grid-template-columns:repeat(' + (r[0].inline ? r.length : 1) + ',minmax(0,1fr))">' +
        r.map((f) => '<div class="e-field"><div class="e-fname">' + (MD.render(f.name, { blocks: false, links: false }) || "&nbsp;") +
          '</div><div class="e-fvalue">' + (MD.render(f.value) || "&nbsp;") + "</div></div>").join("") + "</div>").join("") + "</div>");
    }
    if (e.image.url.trim()) parts.push('<div class="e-image">' + img(e.image.url, "", "") + "</div>");
    const footerBits = [];
    if (e.footer.text.trim()) footerBits.push(MD.escape(e.footer.text));
    if (e.timestamp) footerBits.push(stampText(e.timestamp));
    if (footerBits.length) {
      parts.push('<div class="e-footer">' + (e.footer.text.trim() ? img(e.footer.icon_url, "e-footer-icon") : "") +
        footerBits.join(' <span class="dot">-</span> ') + "</div>");
    }
    const thumb = img(e.thumbnail.url, "e-thumb", "");
    const color = e.color === null ? "#1e1f22" : hex(e.color);
    return '<div class="embed" style="border-left-color:' + color + '"><div class="e-grid"><div class="e-main">' +
      parts.join("") + "</div>" + thumb + "</div></div>";
  }

  function renderPreview() {
    const name = "milo utilities";
    const avatar = "/assets/utilities-avatar.png";
    const now = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const empty = !state.content.trim() && !state.embeds.some((e) => embedLength(e) || e.image.url || e.thumbnail.url);
    $("#preview").innerHTML =
      '<div class="msg"><img class="avatar" src="' + MD.escape(avatar) + '" alt="">' +
      '<div class="msg-body"><div class="msg-head"><span class="msg-name">' + MD.escape(name) + "</span>" +
      '<span class="tag">APP</span><span class="msg-time">Today at ' + now + "</span></div>" +
      (state.content.trim() ? '<div class="msg-text">' + MD.render(state.content) + "</div>" : "") +
      state.embeds.map(embedHtml).join("") +
      (empty ? '<div class="msg-empty">Nothing to show yet. Add some text or an embed.</div>' : "") +
      "</div></div>";
  }

  // ---- codes ----------------------------------------------------------------

  function problems() {
    const out = [];
    const p = payload(true);
    if (!p.content && !p.embeds) out.push("The message is empty.");
    state.embeds.forEach((e, i) => {
      const o = p.embeds ? p.embeds[i] : {};
      if (Object.keys(o).filter((k) => k !== "color").length === 0) out.push("Embed " + (i + 1) + " is empty. Fill it in or remove it.");
      if (e.author.name.trim() === "" && (e.author.url.trim() || e.author.icon_url.trim())) out.push("Embed " + (i + 1) + ": the author needs a name.");
      e.fields.forEach((f, j) => {
        if ((f.name.trim() || f.value.trim()) && !(f.name.trim() && f.value.trim()))
          out.push("Embed " + (i + 1) + ", field " + (j + 1) + ": Discord needs both a name and some text.");
      });
      if (e.footer.text.trim() === "" && e.footer.icon_url.trim()) out.push("Embed " + (i + 1) + ": the footer icon needs footer text.");
      for (const [label, u] of [["title link", e.url], ["author link", e.author.url], ["author icon", e.author.icon_url],
        ["image", e.image.url], ["thumbnail", e.thumbnail.url], ["footer icon", e.footer.icon_url]]) {
        if (u.trim() && !MD.safeUrl(u.trim())) out.push("Embed " + (i + 1) + ": the " + label + " has to start with https://");
      }
    });
    if (state.embeds.reduce((n, e) => n + embedLength(e), 0) > LIMITS.total) out.push("All the embeds together go over Discord's 6000 character limit.");
    return out;
  }

  function status(text, kind) {
    const el = $("#status");
    el.className = kind || "";
    el.innerHTML = text;
  }

  async function encodeCode(data) {
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    const packed = new Uint8Array(await new Response(stream).arrayBuffer());
    let bin = "";
    packed.forEach((b) => { bin += String.fromCharCode(b); });
    return "m1." + btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  async function decodeCode(text) {
    let t = text.trim();
    if (t.includes("#code=")) t = t.split("#code=")[1];
    if (t.startsWith("{")) return JSON.parse(t);
    if (!t.startsWith("m1.")) throw new Error("not a code");
    const bin = atob(t.slice(3).replace(/-/g, "+").replace(/_/g, "/"));
    const stream = new Blob([Uint8Array.from(bin, (c) => c.charCodeAt(0))]).stream()
      .pipeThrough(new DecompressionStream("deflate-raw"));
    return JSON.parse(await new Response(stream).text());
  }

  function useData(data) {
    if (Array.isArray(data)) data = { embeds: data };
    else if (!data.embeds && (data.title || data.description || data.fields)) data = { embeds: [data] };
    state = normalize(data);
    if (!state.embeds.length) state.embeds.push(blankEmbed());
    changed(true);
  }

  async function updateCodeSize() {
    try {
      const code = await encodeCode(payload(true));
      const el = $("#code-size");
      el.textContent = code.length + " / 6000 characters of code";
      el.classList.toggle("over", code.length > 6000);
    } catch (e) { /* old browser */ }
  }

  $("#btn-code").addEventListener("click", async () => {
    const issues = problems();
    if (issues.length) return status(issues.map(MD.escape).join("<br>"), "bad");
    let code;
    try {
      code = await encodeCode(payload(true));
    } catch (e) {
      return status("Your browser can't make codes. Try a newer Chrome, Edge, Firefox or Safari.", "bad");
    }
    if (code.length > 6000) return status("This message is too big for one code (" + code.length + " of 6000). Make it a bit shorter.", "bad");
    copy(code, $("#btn-code"));
    status("Copied. Now run <code>/embed post</code> in the server and paste it into <b>code</b>.", "good");
  });

  $("#btn-load").addEventListener("click", async () => {
    const text = $("#load-code").value;
    if (!text.trim()) return status("Paste a code first.", "bad");
    try {
      useData(await decodeCode(text));
      $("#load-code").value = "";
      status("Loaded.", "good");
    } catch (e) {
      status("That code doesn't look right. Copy it again.", "bad");
    }
  });

  // ---- JSON and sharing -------------------------------------------------------

  const dialog = $("#json-dialog");
  $("#btn-json").addEventListener("click", () => {
    $("#json").value = JSON.stringify(payload(true), null, 2);
    $("#json-error").textContent = "";
    dialog.showModal();
  });

  $("#btn-json-apply").addEventListener("click", () => {
    try {
      useData(JSON.parse($("#json").value));
      dialog.close();
    } catch (e) {
      $("#json-error").textContent = "That isn't valid JSON: " + e.message;
    }
  });

  $("#btn-json-copy").addEventListener("click", () => copy($("#json").value, $("#btn-json-copy")));

  $("#btn-share").addEventListener("click", async () => {
    try {
      copy(location.origin + location.pathname + "#code=" + await encodeCode(payload(false)), $("#btn-share"));
    } catch (e) {
      status("Your browser can't make share links. Try a newer one.", "bad");
    }
  });

  function copy(text, button) {
    const done = () => {
      const old = button.textContent;
      button.textContent = "Copied";
      setTimeout(() => { button.textContent = old; }, 1400);
    };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => prompt("Copy this:", text));
    else prompt("Copy this:", text);
  }

  // ---- start ------------------------------------------------------------------

  renderEditor();
  renderPreview();
  updateCodeSize();
  const shared = location.hash.match(/^#code=(.+)$/);
  if (shared) {
    decodeCode(shared[1]).then((data) => {
      useData(data);
      history.replaceState(null, "", location.pathname);
      status("Loaded the message from the link.", "good");
    }, () => status("That link's code doesn't look right.", "bad"));
  }
  setInterval(renderPreview, 60000); // keep "Today at" and relative times fresh
})();
