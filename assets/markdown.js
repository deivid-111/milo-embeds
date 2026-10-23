// Discord-flavored markdown to HTML, for the preview only. Everything is escaped first, so nothing a user
// types can run as HTML.
(function () {
  "use strict";

  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function safeUrl(u) {
    return /^https?:\/\//i.test(u) ? u : null;
  }

  function stamp(seconds, style) {
    const d = new Date(Number(seconds) * 1000);
    if (isNaN(d)) return null;
    const date = { day: "numeric", month: "long", year: "numeric" };
    const time = { hour: "numeric", minute: "2-digit" };
    switch (style) {
      case "t": return d.toLocaleTimeString([], time);
      case "T": return d.toLocaleTimeString();
      case "d": return d.toLocaleDateString();
      case "D": return d.toLocaleDateString([], date);
      case "F": return d.toLocaleDateString([], Object.assign({ weekday: "long" }, date)) + " " + d.toLocaleTimeString([], time);
      case "R": {
        const diff = (d - Date.now()) / 1000;
        const units = [["year", 31536000], ["month", 2592000], ["day", 86400], ["hour", 3600], ["minute", 60], ["second", 1]];
        const rtf = new Intl.RelativeTimeFormat([], { numeric: "auto" });
        for (const [unit, size] of units) {
          if (Math.abs(diff) >= size || unit === "second") return rtf.format(Math.round(diff / size), unit);
        }
        return "";
      }
      default: return d.toLocaleDateString([], date) + " " + d.toLocaleTimeString([], time);
    }
  }

  // Inline formatting on already escaped text. Code spans are pulled out first so nothing inside them changes.
  function inline(text, opts) {
    const keep = [];
    const hold = (html) => "\u0000" + (keep.push(html) - 1) + "\u0000";
    let s = esc(text);

    s = s.replace(/``([^`]+?)``|`([^`\n]+?)`/g, (m, a, b) => hold("<code>" + (a || b) + "</code>"));

    // Custom emojis, mentions and timestamps (the < > are escaped by now).
    s = s.replace(/&lt;(a?):(\w{2,32}):(\d{15,25})&gt;/g, (m, anim, name, id) =>
      hold('<img class="emoji" alt=":' + name + ':" title=":' + name + ':" src="https://cdn.discordapp.com/emojis/' +
        id + (anim ? ".gif" : ".webp") + '?size=48">'));
    s = s.replace(/&lt;#(\d{15,25})&gt;/g, () => hold('<span class="mention"># channel</span>'));
    s = s.replace(/&lt;@&amp;(\d{15,25})&gt;/g, () => hold('<span class="mention">@role</span>'));
    s = s.replace(/&lt;@!?(\d{15,25})&gt;/g, () => hold('<span class="mention">@user</span>'));
    s = s.replace(/@(everyone|here)\b/g, (m) => hold('<span class="mention">' + m + "</span>"));
    s = s.replace(/&lt;t:(-?\d{1,13})(?::([tTdDfFR]))?&gt;/g, (m, sec, style) => {
      const t = stamp(sec, style);
      return t ? hold('<span class="stamp">' + esc(t) + "</span>") : m;
    });

    if (opts.links) {
      s = s.replace(/\[([^\]\n]+)\]\((&lt;)?(https?:\/\/[^\s)]+?)(&gt;)?\)/g, (m, label, a, url) =>
        hold('<a href="' + url + '" target="_blank" rel="noopener">' + label + "</a>"));
      s = s.replace(/(^|[\s(])(&lt;)?(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])(&gt;)?/g, (m, pre, a, url) =>
        pre + hold('<a href="' + url + '" target="_blank" rel="noopener">' + url + "</a>"));
    }

    s = s.replace(/\|\|(.+?)\|\|/g, '<span class="spoiler" tabindex="0">$1</span>');
    s = s.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/__(.+?)__/g, "<u>$1</u>");
    s = s.replace(/~~(.+?)~~/g, "<s>$1</s>");
    s = s.replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, "$1<em>$2</em>");
    s = s.replace(/(^|[^_\w])_(?!\s)(.+?)_(?!\w)/g, "$1<em>$2</em>");

    return s.replace(/\u0000(\d+)\u0000/g, (m, i) => keep[Number(i)]);
  }

  // Block formatting: code blocks, headings, subtext, quotes and lists. opts.blocks is false for titles and names.
  function render(text, opts) {
    opts = Object.assign({ links: true, blocks: true }, opts || {});
    if (!text) return "";
    if (!opts.blocks) return inline(text.replace(/\n/g, " "), opts);

    const out = [];
    const parts = text.split(/(```[\s\S]*?```)/g);
    for (const part of parts) {
      const code = part.match(/^```(?:([\w+-]{1,20})\n)?([\s\S]*?)\n?```$/);
      if (code) {
        out.push("<pre><code>" + esc(code[2]) + "</code></pre>");
        continue;
      }
      if (!part) continue;
      const lines = part.split("\n");
      let list = null;
      const closeList = () => { if (list) { out.push("</" + list + ">"); list = null; } };
      lines.forEach((line, i) => {
        let m;
        if ((m = line.match(/^(#{1,3}) (.+)/))) {
          closeList();
          out.push("<h" + m[1].length + ">" + inline(m[2], opts) + "</h" + m[1].length + ">");
        } else if ((m = line.match(/^-# (.+)/))) {
          closeList();
          out.push('<div class="subtext">' + inline(m[1], opts) + "</div>");
        } else if (/^>( |$)/.test(line)) {
          closeList();
          out.push("<blockquote>" + inline(line.replace(/^> ?/, ""), opts) + "</blockquote>");
        } else if ((m = line.match(/^(\s*)[-*] (.+)/))) {
          if (list !== "ul") { closeList(); out.push("<ul>"); list = "ul"; }
          out.push("<li" + (m[1].length >= 2 ? ' class="sub"' : "") + ">" + inline(m[2], opts) + "</li>");
        } else if ((m = line.match(/^(\d{1,3})\. (.+)/))) {
          if (list !== "ol") { closeList(); out.push('<ol start="' + m[1] + '">'); list = "ol"; }
          out.push("<li>" + inline(m[2], opts) + "</li>");
        } else {
          closeList();
          out.push(inline(line, opts) + (i < lines.length - 1 ? "<br>" : ""));
        }
      });
      closeList();
    }
    return out.join("").replace(/<br>(<(?:h\d|ul|ol|blockquote|div class="subtext"|pre))/g, "$1");
  }

  window.DiscordMarkdown = { render: render, escape: esc, safeUrl: safeUrl };
})();
