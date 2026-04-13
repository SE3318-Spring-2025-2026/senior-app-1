import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const roleTitles = {
  STUDENT: 'Student',
  PROFESSOR: 'Professor',
  COORDINATOR: 'Coordinator',
  ADMIN: 'Admin',
};

function detectSessionRole() {
  const checks = [
    ['adminUser', 'ADMIN'],
    ['coordinatorUser', 'COORDINATOR'],
    ['professorUser', 'PROFESSOR'],
    ['studentUser', 'STUDENT'],
  ];

  for (const [userKey, fallbackRole] of checks) {
    const raw = window.localStorage.getItem(userKey);
    if (!raw) {
      continue;
    }

    try {
      const parsed = JSON.parse(raw);
      return (parsed.role || fallbackRole || '').toUpperCase();
    } catch {
      return fallbackRole;
    }
  }

  return null;
}

function readStudentName() {
  const raw = window.localStorage.getItem('studentUser');
  if (!raw) {
    return 'Student';
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed.fullName || parsed.name || parsed.studentId || parsed.email || 'Student';
  } catch {
    return 'Student';
  }
}

export default function HomePage() {
  const navigate = useNavigate();
  const role = detectSessionRole();
  const title = role ? roleTitles[role] || 'User' : null;
  const studentName = role === 'STUDENT' ? readStudentName() : null;
  const [studentGroups, setStudentGroups] = useState([]);

  useEffect(() => {
    if (!title) {
      navigate('/auth', { replace: true });
    }
  }, [title, navigate]);

  useEffect(() => {
    if (role !== 'STUDENT') {
      return;
    }

    const token = window.localStorage.getItem('studentToken') || window.localStorage.getItem('authToken');
    if (!token) {
      return;
    }

    fetch('/api/v1/groups', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          setStudentGroups([]);
          return;
        }

        setStudentGroups(Array.isArray(payload.data) ? payload.data : []);
      })
      .catch(() => {
        setStudentGroups([]);
      });
  }, [role]);

  const leaderGroups = studentGroups.filter((group) => group.membershipRole === 'LEADER');
  const memberGroups = studentGroups.filter((group) => group.membershipRole === 'MEMBER');

  if (!title) {
    return null;
  }

  return (
    <main className="page main-empty-page">
      <section className="main-empty-shell" aria-label="Workspace">
        <p className="eyebrow">Senior Project System</p>
        <h1>{title} Home</h1>
        {role === 'STUDENT' ? (
          <section className="student-home-panel">
            <p><strong>Name:</strong> {studentName}</p>
            <p><strong>Leader Groups:</strong> {leaderGroups.length}</p>
            <p><strong>Member Groups:</strong> {memberGroups.length}</p>
            <p className="student-home-note">
              {studentGroups.length === 0
                ? 'No groups yet. Open Manage Group to create your first group.'
                : 'Use Manage Group to edit your groups, invite students, or leave member groups.'}
            </p>
            <div className="workspace-actions">
              <Link className="workspace-button workspace-button-primary" to="/students/groups/new">
                Manage Group
              </Link>
              <Link className="workspace-button workspace-button-secondary" to="/students/notifications">
                Notifications
              </Link>
            </div>
          </section>
        ) : (
          <div className="main-empty-canvas" />
        )}
      </section>
    </main>
  );
}
