/*
 * PKGL player first names — display-only enhancement.
 * Do not change team nicknames, select values, IDs, scoring, login, or database data.
 * If this optional file fails to load, the original PKGL website behaves as before.
 */
(function () {
  'use strict';

  // Fallback for the public login and guest screens, which do not receive players
  // from the existing read-only endpoints. Logged-in screens use live D.teams.
  const KNOWN_PLAYERS = Object.freeze({
    "Basilio Bombers": "Kris & Max",
    "Colombian Crushers": "Ron & Landon",
    "Czech's Mates": "Michael & Blake",
    "Jay and Timothy Golf Pros": "Jay and Timothy",
    "Pancake Putters": "Chad & Evan",
    "Rip Tides": "Kev & Owen",
    "Rippen from the Rough": "Sean & Austin",
    "Scaggs to the Flags": "JD & Travis",
    "Spackler": "Ryan & Adrian",
    "The Fossil Clan": "Adam & Finley",
    "The Gophers": "Eric & Grady",
    "The Smails": "Eric & Julian"
  });

  const processedText = new WeakSet();
  let queued = false;

  function firstNames(players) {
    const parts = String(players || '')
      .split(/\s*(?:&|\band\b)\s*/i)
      .map(function (s) { return s.trim().split(/\s+/)[0]; })
      .filter(Boolean);
    return parts.length === 2 ? parts.join(' & ') : '';
  }

  function roster() {
    const names = new Map();
    Object.keys(KNOWN_PLAYERS).forEach(function (team) {
      const pair = firstNames(KNOWN_PLAYERS[team]);
      if (pair) names.set(team, pair);
    });

    // Existing bootstrap data already includes nickname and players.
    // Read it only; never alter D.teams or the name used for authentication.
    try {
      if (typeof D !== 'undefined' && D && Array.isArray(D.teams)) {
        D.teams.forEach(function (team) {
          const nickname = String(team.nickname || '').trim();
          const pair = firstNames(team.players);
          if (nickname && pair) names.set(nickname, pair);
        });
      }
    } catch (ignored) { /* Cosmetic enhancement only. */ }

    return names;
  }

  function labelLoginOptions(names) {
    const select = document.getElementById('team');
    if (!select) return;

    Array.prototype.forEach.call(select.options, function (option) {
      if (option.getAttribute('data-pkgl-player-names') === '1') return;
      const canonicalName = option.value;
      const pair = names.get(canonicalName);
      if (!pair) return;

      // Critical: set an explicit, unchanged value BEFORE editing visible text.
      // pkgl_login still receives precisely the original database nickname.
      option.value = canonicalName;
      option.setAttribute('data-pkgl-player-names', '1');
      option.textContent = canonicalName + ' (' + pair + ')';
    });
  }

  function labelContent(names) {
    const ordered = Array.from(names.keys()).sort(function (a, b) {
      return b.length - a.length;
    });
    if (!ordered.length || typeof document.createTreeWalker !== 'function') return;

    const pattern = new RegExp(
      '(^|[^A-Za-z0-9])(' +
      ordered.map(function (name) {
        return name.replace(/\W/g, '\\$&');
      }).join('|') +
      ')(?=$|[^A-Za-z0-9])',
      'g'
    );

    ['view', 'guestView', 'publicStats', 'who'].forEach(function (id) {
      const root = document.getElementById(id);
      if (!root) return;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (processedText.has(node)) continue;
        processedText.add(node);
        const parent = node.parentElement;
        if (!parent || (parent.closest &&
            parent.closest('script,style,noscript,textarea,select,option,pre,code,[contenteditable]'))) {
          continue;
        }
        const before = node.nodeValue;
        const after = before.replace(pattern, function (whole, prefix, nickname) {
          const pair = names.get(nickname);
          return prefix + nickname + (pair ? ' (' + pair + ')' : '');
        });
        if (after !== before) node.nodeValue = after;
      }
    });
  }

  function applyLabels() {
    try {
      const names = roster();
      labelLoginOptions(names);
      labelContent(names);
    } catch (error) {
      // Never interfere with the original website's login, views or scores.
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('Optional PKGL player-name labels unavailable:', error);
      }
    }
  }

  applyLabels();

  if (typeof MutationObserver === 'function' && document.body) {
    const observer = new MutationObserver(function () {
      if (queued) return;
      queued = true;
      Promise.resolve().then(function () {
        queued = false;
        applyLabels();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
})();
