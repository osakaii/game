/**
 * Страница /stats/admin одной строкой: без сборщика и фреймворка, сервер отдаёт её как есть.
 * Цифр в ней нет — скрипт берёт их из /stats/admin/api с ключом из localStorage этого браузера.
 * Ники — ввод игроков: в разметку только через textContent, никогда через innerHTML.
 * В скрипте нет обратных кавычек и `${` — иначе их съест шаблонная строка TypeScript.
 */
export const ADMIN_PAGE = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Mecha · статистика</title>
<style>
:root {
  --bg: #f6f5f2; --card: #fff; --text: #1d1d1f; --muted: #6e6e73; --line: #e4e2dc;
  --accent: #e8573c; --accent-soft: #f6c9bd; --hider: #3c8ce8; --seeker: #e8573c;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #141416; --card: #1f1f22; --text: #f2f2f4; --muted: #9a9aa2; --line: #2e2e33;
    --accent: #ff7a5c; --accent-soft: #5a2f26; --hider: #5aa2ff; --seeker: #ff7a5c;
    color-scheme: dark;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.4 system-ui, -apple-system, 'Segoe UI', sans-serif; }
main { max-width: 980px; margin: 0 auto; padding: 16px; }
header { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; margin-bottom: 16px; }
h1 { font-size: 20px; margin: 0; flex: 1 1 auto; }
h2 { font-size: 15px; margin: 0 0 10px; }
button, input { font: inherit; min-height: 44px; border-radius: 10px; }
button { border: 1px solid var(--line); background: var(--card); color: var(--text); padding: 0 14px; cursor: pointer; }
button[aria-pressed="true"] { background: var(--text); color: var(--bg); border-color: var(--text); }
.periods { display: flex; gap: 6px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 14px; margin-bottom: 12px; overflow-x: auto; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 12px; }
.tile { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px; }
.tile b { display: block; font-size: 28px; font-variant-numeric: tabular-nums; }
.tile span, .muted { color: var(--muted); font-size: 13px; }
table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
th, td { text-align: left; padding: 7px 8px; border-bottom: 1px solid var(--line); white-space: nowrap; }
th { color: var(--muted); font-weight: 500; font-size: 13px; }
td.num, th.num { text-align: right; }
.grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px; }
.grid2 .card { margin-bottom: 0; }
.chart { width: 100%; height: 180px; display: block; }
.legend { display: flex; gap: 14px; font-size: 13px; color: var(--muted); margin-top: 6px; }
.legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; }
.split { display: flex; height: 8px; border-radius: 4px; overflow: hidden; min-width: 90px; background: var(--line); }
.split .h { background: var(--hider); } .split .s { background: var(--seeker); }
#login { max-width: 360px; margin: 15vh auto; }
#login form { display: flex; gap: 8px; }
#login input { flex: 1; min-width: 0; border: 1px solid var(--line); background: var(--card); color: var(--text); padding: 0 12px; }
.error { color: var(--accent); }
[hidden] { display: none !important; }
</style>
</head>
<body>
<main>
  <section id="login" hidden>
    <h1>Mecha · статистика</h1>
    <p class="muted">Ключ — значение ADMIN_KEY на сервере. Запомнится в этом браузере.</p>
    <form>
      <input name="key" type="password" autocomplete="current-password" placeholder="Ключ" required>
      <button type="submit">Войти</button>
    </form>
    <p class="error" id="login-error"></p>
  </section>

  <section id="app" hidden>
    <header>
      <h1>Mecha · статистика</h1>
      <div class="periods" id="periods"></div>
      <button id="logout" type="button">Выйти</button>
    </header>
    <p class="error" id="error"></p>
    <p class="muted" id="period"></p>
    <div class="tiles" id="tiles"></div>
    <div class="card">
      <h2>Игроки по дням</h2>
      <svg class="chart" id="chart" role="img" aria-label="Игроки по дням"></svg>
      <div class="legend"><span><i style="background:var(--accent)"></i>играли (вошли в комнату)</span><span><i style="background:var(--accent-soft)"></i>открыли игру</span></div>
    </div>
    <div class="card"><h2>Карты</h2><table id="maps"></table></div>
    <div class="grid2">
      <div class="card"><h2>Чем кончаются раунды</h2><table id="results"></table></div>
      <div class="card"><h2>Устройства</h2><table id="devices"></table></div>
    </div>
    <div class="card" style="margin-top:12px"><h2>Ники</h2><p class="muted">Ник вводят при входе в комнату; устройств больше одного — ник взяли разные люди или один с разных телефонов.</p><table id="nicknames"></table></div>
    <div class="card"><h2>По дням</h2><table id="days"></table></div>
  </section>
</main>
<script>
(function () {
  var KEY = 'mecha:admin-key';
  var PERIODS = [7, 14, 30, 90];
  var REASONS = { time_up: 'время вышло', all_found: 'всех нашли', seekers_left: 'ищущие вышли', hiders_left: 'прячущиеся вышли' };
  var WINNERS = { hider: 'прячущиеся', seeker: 'ищущие' };
  var DEVICES = { ios: 'iPhone / iPad', android: 'Android', desktop: 'Компьютер' };
  var days = 14;
  /** Запас на случай, если localStorage запрещён (приватный режим): ключ живёт до закрытия вкладки. */
  var sessionKey = null;

  function $(id) { return document.getElementById(id); }
  function storedKey() { try { return localStorage.getItem(KEY) || sessionKey; } catch (e) { return sessionKey; } }
  function storeKey(value) { sessionKey = value || null; try { if (value) localStorage.setItem(KEY, value); else localStorage.removeItem(KEY); } catch (e) {} }

  /** Элемент с текстом: только textContent — ник вида <img onerror=…> останется текстом. */
  function el(tag, text, className) {
    var node = document.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = String(text);
    if (className) node.className = className;
    return node;
  }
  function table(target, head, rows) {
    target.replaceChildren();
    var tr = el('tr');
    head.forEach(function (h) { tr.append(el('th', h[0], h[1] ? 'num' : '')); });
    target.append(tr);
    if (!rows.length) {
      var empty = el('tr'); var td = el('td', 'пока пусто', 'muted'); td.colSpan = head.length; empty.append(td); target.append(empty);
      return;
    }
    rows.forEach(function (cells) {
      var row = el('tr');
      cells.forEach(function (cell, i) {
        var td = el('td', null, head[i][1] ? 'num' : '');
        if (cell instanceof Node) td.append(cell); else td.textContent = cell;
        row.append(td);
      });
      target.append(row);
    });
  }
  function pct(part, whole) { return whole ? Math.round((part / whole) * 100) + '%' : '—'; }
  function duration(seconds) { var m = Math.floor(seconds / 60); var s = seconds % 60; return m + ':' + (s < 10 ? '0' : '') + s; }
  function dayLabel(day) { var p = day.split('-'); return Number(p[2]) + '.' + p[1]; }
  function when(iso) {
    return new Date(iso).toLocaleString('ru-RU', { timeZone: 'Asia/Bishkek', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function showLogin(message) {
    $('app').hidden = true; $('login').hidden = false;
    $('login-error').textContent = message || '';
    $('login').querySelector('input').focus();
  }

  function load() {
    var key = storedKey();
    if (!key) return showLogin();
    $('error').textContent = '';
    fetch('/stats/admin/api?days=' + days, { headers: { 'X-Admin-Key': key }, cache: 'no-store' })
      .then(function (response) {
        if (response.status === 401) { storeKey(null); throw { login: 'Неверный ключ' }; }
        if (response.status === 429) throw { login: 'Слишком много неверных ключей — подожди 10 минут' };
        if (!response.ok) return response.json().then(function (body) { throw { message: body.message || ('Ошибка ' + response.status) }; });
        return response.json();
      })
      .then(render)
      .catch(function (error) {
        if (error && error.login) return showLogin(error.login);
        $('login').hidden = true; $('app').hidden = false;
        $('error').textContent = (error && error.message) || 'Сервер не ответил';
      });
  }

  function render(stats) {
    $('login').hidden = true; $('app').hidden = false;
    var today = stats.daily[stats.daily.length - 1];
    $('period').textContent = 'С ' + dayLabel(stats.from) + ' по ' + dayLabel(stats.to) + ' · дни по Бишкеку · игрок = устройство';

    var tiles = [
      ['Играли', 'players', 'вошли в комнату'],
      ['Открыли игру', 'visitors', ''],
      ['Новых', 'newPlayers', 'впервые'],
      ['Раундов', 'rounds', ''],
      ['Комнат', 'rooms', ''],
    ];
    $('tiles').replaceChildren.apply($('tiles'), tiles.map(function (t) {
      var tile = el('div', null, 'tile');
      tile.append(el('span', t[0]), el('b', stats.total[t[1]]), el('span', 'сегодня ' + today[t[1]] + (t[2] ? ' · ' + t[2] : '')));
      return tile;
    }));

    drawChart(stats.daily);

    var rounds = stats.maps.reduce(function (sum, m) { return sum + m.rounds; }, 0);
    table($('maps'), [['Карта'], ['Раундов', 1], ['Победы: прячущиеся / ищущие'], ['Длится', 1], ['Игроков', 1]],
      stats.maps.map(function (m) {
        var split = el('div', null, 'split');
        var h = el('div', null, 'h'); h.style.width = pct(m.hiderWins, m.rounds);
        var s = el('div', null, 's'); s.style.width = pct(m.seekerWins, m.rounds);
        split.append(h, s);
        var cell = el('div'); cell.append(split, el('span', pct(m.hiderWins, m.rounds) + ' / ' + pct(m.seekerWins, m.rounds), 'muted'));
        return [m.name, m.rounds + ' (' + pct(m.rounds, rounds) + ')', cell, duration(m.avgSeconds), m.avgPlayers];
      }));

    var finished = stats.results.reduce(function (sum, r) { return sum + r.rounds; }, 0);
    table($('results'), [['Победили'], ['Как'], ['Раундов', 1]],
      stats.results.map(function (r) { return [WINNERS[r.winner] || r.winner, REASONS[r.reason] || r.reason, r.rounds + ' (' + pct(r.rounds, finished) + ')']; }));

    table($('nicknames'), [['Ник'], ['Входов', 1], ['Устройств', 1], ['Последний раз']],
      stats.nicknames.map(function (n) { return [n.nickname, n.entries, n.devices, when(n.lastAt)]; }));

    table($('days'), [['День'], ['Играли', 1], ['Открыли', 1], ['Новых', 1], ['Раундов', 1]],
      stats.daily.slice().reverse().map(function (d) { return [dayLabel(d.day), d.players, d.visitors, d.newPlayers, d.rounds]; }));

    var devices = stats.devices.reduce(function (sum, d) { return sum + d.players; }, 0);
    table($('devices'), [['Устройство'], ['Игроков', 1]],
      stats.devices.map(function (d) { return [DEVICES[d.device] || d.device, d.players + ' (' + pct(d.players, devices) + ')']; }));
  }

  /** Столбики: светлый — открыли игру, поверх тёмный — играли. SVG через createElementNS: из данных строится DOM, а не HTML-строка. */
  function drawChart(daily) {
    var svg = $('chart');
    var NS = 'http://www.w3.org/2000/svg';
    // Ширина — настоящая, в пикселях: растянутый viewBox сплющил бы подписи на узком телефоне.
    var width = svg.clientWidth || 600, height = 180, bottom = 18, top = 14;
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    svg.replaceChildren();
    var max = Math.max(1, Math.max.apply(null, daily.map(function (d) { return d.visitors; })));
    var step = width / daily.length;
    var bar = Math.max(2, step * 0.7);
    var labelEvery = Math.ceil(daily.length / Math.max(3, Math.floor(width / 60)));
    function rect(x, value, fill) {
      var h = ((height - bottom - top) * value) / max;
      var r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', x); r.setAttribute('y', height - bottom - h);
      r.setAttribute('width', bar); r.setAttribute('height', h); r.setAttribute('rx', 2);
      // Цвет — свойством стиля: var() работает в CSS, а не в атрибуте fill.
      r.style.fill = fill;
      return r;
    }
    function text(x, y, value, anchor) {
      var t = document.createElementNS(NS, 'text');
      t.setAttribute('x', x); t.setAttribute('y', y); t.setAttribute('text-anchor', anchor || 'middle');
      t.setAttribute('font-size', 11); t.style.fill = 'var(--muted)';
      t.textContent = value;
      return t;
    }
    daily.forEach(function (d, i) {
      var x = i * step + (step - bar) / 2;
      var title = document.createElementNS(NS, 'title');
      title.textContent = dayLabel(d.day) + ': играли ' + d.players + ', открыли ' + d.visitors;
      var group = document.createElementNS(NS, 'g');
      group.append(title, rect(x, d.visitors, 'var(--accent-soft)'), rect(x, d.players, 'var(--accent)'));
      svg.append(group);
      if (i % labelEvery === 0 || i === daily.length - 1) svg.append(text(x + bar / 2, height - 4, dayLabel(d.day)));
    });
    svg.append(text(2, 11, 'макс. ' + max, 'start'));
  }

  PERIODS.forEach(function (n) {
    var button = el('button', n + ' дн.');
    button.type = 'button';
    button.setAttribute('aria-pressed', String(n === days));
    button.addEventListener('click', function () {
      days = n;
      Array.prototype.forEach.call($('periods').children, function (b) { b.setAttribute('aria-pressed', String(b === button)); });
      load();
    });
    $('periods').append(button);
  });
  $('login').querySelector('form').addEventListener('submit', function (event) {
    event.preventDefault();
    storeKey(event.target.key.value.trim());
    event.target.reset();
    load();
  });
  $('logout').addEventListener('click', function () { storeKey(null); showLogin(); });
  load();
})();
</script>
</body>
</html>
`;
