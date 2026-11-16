// Feather Places API: a shared map of the flock's favourite spots.
// SQLite storage for places and visits.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dir = path.join(__dirname, 'data');
fs.mkdirSync(dir, { recursive: true });
const db = new Database(path.join(dir, 'places.db'));
db.pragma('journal_mode = WAL');

db.exec(`CREATE TABLE IF NOT EXISTS places (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'perch',
  x REAL DEFAULT 0,
  z REAL DEFAULT 0,
  note TEXT DEFAULT '',
  by_bird TEXT DEFAULT 'gurt',
  visits INTEGER DEFAULT 0,
  created TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id TEXT NOT NULL,
  bird TEXT NOT NULL,
  note TEXT DEFAULT '',
  created TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS place_kind ON places(kind);`);

const now = () => new Date().toISOString();
const rid = () => 'FP-' + Math.random().toString(36).slice(2, 8).toUpperCase();

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 100000) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { resolve({}); } });
  });
}
function placeRow(p) {
  const visits = db.prepare('SELECT bird,note,created FROM visits WHERE place_id=? ORDER BY created DESC').all(p.id);
  return { id: p.id, name: p.name, kind: p.kind, x: p.x, z: p.z, note: p.note,
           by_bird: p.by_bird, visits: p.visits, created: p.created, log: visits };
}

module.exports = function handler(req, res, route) {
  route = Array.isArray(route) ? route.join('/') : String(route || '');

  if (req.method === 'GET' && route === 'stats') {
    const total = db.prepare('SELECT COUNT(*) AS n FROM places').get().n;
    const visits = db.prepare('SELECT COUNT(*) AS n FROM visits').get().n;
    const birds = db.prepare('SELECT COUNT(DISTINCT by_bird) AS n FROM places').get().n;
    const kinds = db.prepare('SELECT kind, COUNT(*) AS n FROM places GROUP BY kind ORDER BY n DESC').all();
    return json(res, 200, { total, visits, birds, kinds });
  }

  if (req.method === 'GET' && (route === '' || route === 'places')) {
    const rows = db.prepare('SELECT * FROM places ORDER BY created ASC').all();
    return json(res, 200, { count: rows.length, places: rows.map(placeRow) });
  }

  if (req.method === 'POST' && route === 'place') {
    return readBody(req).then(b => {
      const name = String(b.name || '').trim().slice(0, 80);
      if (!name) return json(res, 400, { error: 'a place needs a name' });
      const kind = String(b.kind || 'perch').trim().slice(0, 30);
      const x = Math.max(-30, Math.min(30, parseFloat(b.x || 0) || 0));
      const z = Math.max(-30, Math.min(30, parseFloat(b.z || 0) || 0));
      const bird = String(b.by_bird || 'gurt').trim().slice(0, 40) || 'gurt';
      const id = rid();
      db.prepare('INSERT INTO places (id,name,kind,x,z,note,by_bird,visits,created) VALUES (?,?,?,?,?,?,?,0,?)')
        .run(id, name, kind, x, z, String(b.note || '').slice(0, 300), bird, now());
      return json(res, 200, { ok: true, place: placeRow(db.prepare('SELECT * FROM places WHERE id=?').get(id)) });
    });
  }

  if (req.method === 'POST' && route === 'visit') {
    return readBody(req).then(b => {
      const place_id = String(b.place_id || '').trim().toUpperCase();
      const bird = String(b.bird || '').trim().slice(0, 40);
      if (!bird) return json(res, 400, { error: 'a visit needs a bird' });
      const p = db.prepare('SELECT * FROM places WHERE id=?').get(place_id);
      if (!p) return json(res, 404, { error: 'no such place' });
      db.prepare('INSERT INTO visits (place_id,bird,note,created) VALUES (?,?,?,?)')
        .run(place_id, bird, String(b.note || '').slice(0, 200), now());
      db.prepare('UPDATE places SET visits=visits+1 WHERE id=?').run(place_id);
      return json(res, 200, { ok: true, place: placeRow(db.prepare('SELECT * FROM places WHERE id=?').get(place_id)) });
    });
  }

  if (req.method === 'POST' && route === 'remove') {
    return readBody(req).then(b => {
      const place_id = String(b.place_id || '').trim().toUpperCase();
      const bird = String(b.bird || '').trim().slice(0, 40);
      const p = db.prepare('SELECT * FROM places WHERE id=?').get(place_id);
      if (!p) return json(res, 404, { error: 'no such place' });
      if (p.by_bird !== bird) return json(res, 403, { error: 'only the finder can remove it' });
      db.prepare('DELETE FROM visits WHERE place_id=?').run(place_id);
      db.prepare('DELETE FROM places WHERE id=?').run(place_id);
      return json(res, 200, { ok: true, removed: place_id });
    });
  }

  return json(res, 404, { error: 'not found' });
};
