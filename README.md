# milo embeds

The embed builder at https://embeds.milo-bot.xyz. Make a message, click Copy code, then run `/embed post` with milo utilities in the server.

Static files on GitHub Pages. The code format (m1. + base64url of raw deflated JSON) must match `utilities/cogs/embeds.py` in milo-bot.

Two kinds of message: classic embeds, and panels (Discord's Components v2, like the support server's info posts),
made in `assets/panel.js`. A panel's JSON is `{"layout": [...]}`, the same shape `/embed load` gives back.
