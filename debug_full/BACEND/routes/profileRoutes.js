const express = require('express');
const db = require('../config/db');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function normalizeArrayField(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }

  return [];
}

function parseStoredArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function validateProfileInput(body) {
  const errors = [];

  const name = body.name !== undefined ? String(body.name).trim() : undefined;
  const email = body.email !== undefined ? String(body.email).trim().toLowerCase() : undefined;
  const educationLevel = body.educationLevel !== undefined ? String(body.educationLevel).trim() : undefined;
  const schoolOrUniversity = body.schoolOrUniversity !== undefined ? String(body.schoolOrUniversity).trim() : undefined;
  const gpa = body.gpa !== undefined ? String(body.gpa).trim() : undefined;
  const preferredStudyStyle = body.preferredStudyStyle !== undefined ? String(body.preferredStudyStyle).trim() : undefined;
  const preferredStudyDestination = body.preferredStudyDestination !== undefined ? String(body.preferredStudyDestination).trim() : undefined;

  const favoriteSubjects = normalizeArrayField(body.favoriteSubjects);
  const weakSubjects = normalizeArrayField(body.weakSubjects);
  const academicInterests = normalizeArrayField(body.academicInterests);
  const careerInterests = normalizeArrayField(body.careerInterests);

  if (name !== undefined && name.length < 2) {
    errors.push('Full name must be at least 2 characters');
  }

  if (email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('Email format is invalid');
  }

  if (gpa !== undefined && gpa.length > 20) {
    errors.push('GPA value is too long');
  }

  return {
    errors,
    data: {
      name,
      email,
      educationLevel,
      schoolOrUniversity,
      gpa,
      favoriteSubjects,
      weakSubjects,
      preferredStudyStyle,
      academicInterests,
      careerInterests,
      preferredStudyDestination
    }
  };
}

async function getRecommendationSummary(userId) {
  const latestResult = await get(
    `
      SELECT recommended_major, top_majors, created_at
      FROM results
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `,
    [userId]
  );

  const attemptsRow = await get(
    `SELECT COUNT(*) as count FROM results WHERE user_id = ?`,
    [userId]
  );

  return {
    latestRecommendedMajor: latestResult?.recommended_major || null,
    topThreeMajors: latestResult?.top_majors
      ? parseStoredArray(latestResult.top_majors).slice(0, 3)
      : [],
    attemptsCount: attemptsRow?.count || 0,
    lastAssessmentDate: latestResult?.created_at || null
  };
}

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await get(
      `SELECT id, name, email, profile_image, created_at FROM users WHERE id = ?`,
      [userId]
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const profile = await get(`SELECT * FROM profiles WHERE user_id = ?`, [userId]);
    const recommendationSummary = await getRecommendationSummary(userId);

    return res.json({
      success: true,
      message: 'Profile fetched successfully',
      data: {
        user: {
          id: user.id,
          fullName: user.name,
          email: user.email,
          profileImage: user.profile_image || '',
          createdAt: user.created_at
        },
        profile: {
          educationLevel: profile?.education_level || '',
          schoolOrUniversity: profile?.school_or_university || '',
          gpa: profile?.gpa || '',
          favoriteSubjects: parseStoredArray(profile?.favorite_subjects),
          weakSubjects: parseStoredArray(profile?.weak_subjects),
          preferredStudyStyle: profile?.preferred_study_style || '',
          academicInterests: parseStoredArray(profile?.academic_interests),
          careerInterests: parseStoredArray(profile?.career_interests),
          preferredStudyDestination: profile?.preferred_study_destination || ''
        },
        recommendationSummary
      }
    });
  } catch (error) {
    console.error('Failed to fetch profile:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch profile'
    });
  }
});

router.put('/me', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { errors, data } = validateProfileInput(req.body);

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: errors[0]
      });
    }

    const existingUser = await get(`SELECT id, email FROM users WHERE id = ?`, [userId]);

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (data.email && data.email !== existingUser.email) {
      const emailOwner = await get(`SELECT id FROM users WHERE email = ?`, [data.email]);

      if (emailOwner && emailOwner.id !== userId) {
        return res.status(409).json({
          success: false,
          message: 'Email already in use'
        });
      }
    }

    await run(
      `
        UPDATE users
        SET
          name = COALESCE(?, name),
          email = COALESCE(?, email)
        WHERE id = ?
      `,
      [data.name ?? null, data.email ?? null, userId]
    );

    const profileExists = await get(`SELECT id FROM profiles WHERE user_id = ?`, [userId]);

    const payload = [
      data.educationLevel || '',
      data.schoolOrUniversity || '',
      data.gpa || '',
      JSON.stringify(data.favoriteSubjects),
      JSON.stringify(data.weakSubjects),
      data.preferredStudyStyle || '',
      JSON.stringify(data.academicInterests),
      JSON.stringify(data.careerInterests),
      data.preferredStudyDestination || ''
    ];

    if (profileExists) {
      await run(
        `
          UPDATE profiles
          SET
            education_level = ?,
            school_or_university = ?,
            gpa = ?,
            favorite_subjects = ?,
            weak_subjects = ?,
            preferred_study_style = ?,
            academic_interests = ?,
            career_interests = ?,
            preferred_study_destination = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ?
        `,
        [...payload, userId]
      );
    } else {
      await run(
        `
          INSERT INTO profiles (
            user_id,
            education_level,
            school_or_university,
            gpa,
            favorite_subjects,
            weak_subjects,
            preferred_study_style,
            academic_interests,
            career_interests,
            preferred_study_destination
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [userId, ...payload]
      );
    }

    const updatedUser = await get(
      `SELECT id, name, email, profile_image, created_at FROM users WHERE id = ?`,
      [userId]
    );

    const updatedProfile = await get(`SELECT * FROM profiles WHERE user_id = ?`, [userId]);
    const recommendationSummary = await getRecommendationSummary(userId);

    return res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: {
          id: updatedUser.id,
          fullName: updatedUser.name,
          email: updatedUser.email,
          profileImage: updatedUser.profile_image || '',
          createdAt: updatedUser.created_at
        },
        profile: {
          educationLevel: updatedProfile?.education_level || '',
          schoolOrUniversity: updatedProfile?.school_or_university || '',
          gpa: updatedProfile?.gpa || '',
          favoriteSubjects: parseStoredArray(updatedProfile?.favorite_subjects),
          weakSubjects: parseStoredArray(updatedProfile?.weak_subjects),
          preferredStudyStyle: updatedProfile?.preferred_study_style || '',
          academicInterests: parseStoredArray(updatedProfile?.academic_interests),
          careerInterests: parseStoredArray(updatedProfile?.career_interests),
          preferredStudyDestination: updatedProfile?.preferred_study_destination || ''
        },
        recommendationSummary
      }
    });
  } catch (error) {
    console.error('Failed to update profile:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
});

// Upload profile image (base64)
router.post('/me/image', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { image } = req.body;

    if (!image || typeof image !== 'string') {
      return res.status(400).json({ success: false, message: 'Image data is required' });
    }

    // Validate base64 format and size (~2MB limit, base64 is ~33% larger)
    const base64Match = image.match(/^data:image\/(jpeg|jpg|png|webp);base64,/);
    if (!base64Match) {
      return res.status(400).json({ success: false, message: 'Only JPG, PNG, and WebP images are allowed' });
    }

    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const sizeInBytes = Math.ceil(base64Data.length * 0.75);
    if (sizeInBytes > 2 * 1024 * 1024) {
      return res.status(400).json({ success: false, message: 'Image must be under 2MB' });
    }

    await run('UPDATE users SET profile_image = ? WHERE id = ?', [image, userId]);

    return res.json({ success: true, message: 'Profile image updated', data: { profileImage: image } });
  } catch (error) {
    console.error('Failed to upload profile image:', error);
    return res.status(500).json({ success: false, message: 'Failed to upload profile image' });
  }
});

// Delete profile image
router.delete('/me/image', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    await run("UPDATE users SET profile_image = '' WHERE id = ?", [userId]);
    return res.json({ success: true, message: 'Profile image removed' });
  } catch (error) {
    console.error('Failed to remove profile image:', error);
    return res.status(500).json({ success: false, message: 'Failed to remove profile image' });
  }
});

module.exports = router;