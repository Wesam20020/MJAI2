const express = require('express');
const router = express.Router();
const db = require('../config/db');

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function formatMajor(m) {
  return {
    id: m.id,
    name: m.name,
    description: m.description,
    difficulty: m.difficulty,
    salary: m.salary,
    skills: JSON.parse(m.skills || '[]'),
    subjects: JSON.parse(m.subjects || '[]')
  };
}

router.get('/', async (req, res) => {
  try {
    const majors = await all('SELECT * FROM majors ORDER BY name ASC');
    return res.json({ success: true, data: majors.map(formatMajor) });
  } catch (error) {
    console.error('Failed to fetch majors:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch majors' });
  }
});

router.get('/compare', async (req, res) => {
  try {
    const { ids, names } = req.query;
    let majors;

    if (ids) {
      const idList = String(ids).split(',').map(id => Number(id.trim())).filter(id => !Number.isNaN(id) && id > 0);
      if (idList.length < 2 || idList.length > 3) {
        return res.status(400).json({ success: false, message: 'Provide 2–3 major IDs to compare' });
      }
      const placeholders = idList.map(() => '?').join(',');
      majors = await all(`SELECT * FROM majors WHERE id IN (${placeholders})`, idList);
    } else if (names) {
      const nameList = String(names).split(',').map(n => n.trim()).filter(Boolean);
      if (nameList.length < 2 || nameList.length > 3) {
        return res.status(400).json({ success: false, message: 'Provide 2–3 major names to compare' });
      }
      const placeholders = nameList.map(() => '?').join(',');
      majors = await all(`SELECT * FROM majors WHERE name IN (${placeholders})`, nameList);
    } else {
      return res.status(400).json({ success: false, message: 'Provide ids or names query parameter' });
    }

    return res.json({ success: true, data: majors.map(formatMajor) });
  } catch (error) {
    console.error('Failed to compare majors:', error);
    return res.status(500).json({ success: false, message: 'Failed to compare majors' });
  }
});

module.exports = router;
