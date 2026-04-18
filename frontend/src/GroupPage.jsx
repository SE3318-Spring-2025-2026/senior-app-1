import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import apiClient from './services/apiClient';
import { useNotification } from './contexts/NotificationContext';

export default function GroupPage() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const { notify } = useNotification();

  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [userStudentId, setUserStudentId] = useState(null);
  const [userAdvisorId, setUserAdvisorId] = useState(null);
  const [error, setError] = useState(null);
  const [showReleaseConfirm, setShowReleaseConfirm] = useState(false);

  useEffect(() => {
    const studentId = window.localStorage.getItem('studentId');
    setUserStudentId(studentId);

    try {
      const professorUser = JSON.parse(window.localStorage.getItem('professorUser') || '{}');
      setUserAdvisorId(professorUser?.id ? String(professorUser.id) : null);
    } catch {
      setUserAdvisorId(null);
    }
  }, []);

  const handleAdvisorRelease = async () => {
    setShowReleaseConfirm(true);
  };

  const confirmAdvisorRelease = async () => {
    setShowReleaseConfirm(false);
    if (!userAdvisorId) {
      notify({
        type: 'error',
        title: 'Not authenticated',
        message: 'Please log in as advisor',
      });
      return;
    }
    try {
      const response = await apiClient.patch(`/v1/groups/${groupId}/advisor-release`);
      setGroup((prev) => ({
        ...prev,
        advisorId: null,
        status: response.data?.data?.status || 'LOOKING_FOR_ADVISOR',
      }));
      notify({
        type: 'success',
        title: 'Advisor released',
        message: 'You have released your advisor assignment.',
      });
    } catch (err) {
      notify({
        type: 'error',
        title: 'Release failed',
        message: err.response?.data?.message || 'Could not release advisor assignment.',
      });
    }
  };

  // Fetch group membership details
  useEffect(() => {
    const fetchGroupData = async () => {
      try {
        setLoading(true);
        const response = await apiClient.get(`/v1/groups/${groupId}/membership`);
        setGroup(response.data.data);
        setError(null);
      } catch (err) {
        console.error('Error fetching group data:', err);
        setError(err.response?.data?.message || 'Failed to load group');
        notify({
          type: 'error',
          title: 'Failed to load group',
          message: err.response?.data?.message || 'Try again later',
        });
      } finally {
        setLoading(false);
      }
    };

    if (groupId) {
      fetchGroupData();
    }
  }, [groupId, notify]);

  // Handle joining group
  const handleJoinGroup = async () => {
    if (!userStudentId) {
      notify({
        type: 'error',
        title: 'Not authenticated',
        message: 'Please log in first',
      });
      navigate('/');
      return;
    }

    try {
      setJoining(true);

      const response = await apiClient.post(`/v1/groups/${groupId}/membership/finalize`, {
        studentId: userStudentId,
      });

      // Update local state
      setGroup((prevGroup) => ({
        ...prevGroup,
        members: response.data.data.members || [...(prevGroup?.members || []), userStudentId],
        currentMemberCount: response.data.data.totalMembers,
      }));

      // Show success notification
      notify({
        type: 'success',
        title: 'Joined group successfully',
        message: `Welcome to ${group?.groupName || 'the group'}!`,
      });
    } catch (err) {
      console.error('Error joining group:', err);

      // Check for specific error codes
      const errorCode = err.response?.data?.code;
      let errorTitle = 'Failed to join group';
      let errorMessage = 'Please try again';

      if (errorCode === 'DUPLICATE_MEMBER') {
        errorTitle = 'Already a member';
        errorMessage = 'You are already a member of this group';
      } else if (errorCode === 'MAX_MEMBERS_REACHED') {
        errorTitle = 'Group is full';
        errorMessage = 'This group has reached maximum capacity';
      } else if (errorCode === 'GROUP_FINALIZED') {
        errorTitle = 'Group is closed';
        errorMessage = 'This group is no longer accepting members';
      } else if (errorCode === 'GROUP_NOT_FOUND') {
        errorTitle = 'Group not found';
        errorMessage = 'Unable to find this group';
      }

      notify({
        type: 'error',
        title: errorTitle,
        message: errorMessage,
      });
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading group details...</p>
      </div>
    );
  }

  if (error || !group) {
    return (
      <div style={{ padding: '2rem' }}>
        <h2>Group Not Found</h2>
        <p>{error}</p>
        <button onClick={() => navigate('/')}>Go Back</button>
      </div>
    );
  }

  const isAlreadyMember = userStudentId && group.members?.includes(userStudentId);
  const isFull = group.currentMemberCount >= group.maxMembers;
  const isFinalized = group.status === 'COMPLETED' || group.status === 'DISBANDED';

  const isAdvisor = userAdvisorId && group.advisorId && String(group.advisorId) === String(userAdvisorId);

  return (
    <div style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      {/* Group Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1>{group.groupName || 'Unnamed Group'}</h1>
        <p style={{ color: '#666' }}>Status: <strong>{group.status}</strong></p>
      </div>

      {/* Group Info */}
      <div style={{ 
        border: '1px solid #ddd', 
        padding: '1rem', 
        borderRadius: '8px', 
        marginBottom: '2rem',
        backgroundColor: '#f9f9f9',
      }}>
        <div style={{ marginBottom: '1rem' }}>
          <h3>Group Details</h3>
          <p><strong>Status:</strong> {group.status}</p>
          <p><strong>Members:</strong> {group.currentMemberCount} / {group.maxMembers}</p>
          <p><strong>Available Slots:</strong> {group.availableSlots}</p>
          <p><strong>Advisor:</strong> {group.advisorId ? group.advisorId : <span style={{ color: '#999' }}>None assigned</span>}</p>
        </div>

        {/* Member List */}
        <div>
          <h3>Members ({group.members?.length || 0})</h3>
          {group.members && group.members.length > 0 ? (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {group.members.map((memberId, index) => (
                <li
                  key={`${memberId}-${index}`}
                  style={{
                    padding: '0.5rem',
                    backgroundColor: '#fff',
                    borderRadius: '4px',
                    marginBottom: '0.5rem',
                    border: '1px solid #eee',
                  }}
                >
                  {memberId}
                  {memberId === userStudentId && (
                    <span style={{ marginLeft: '0.5rem', color: '#28a745', fontWeight: 'bold' }}>
                      (You)
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: '#999' }}>No members yet</p>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        {isAlreadyMember ? (
          <div style={{ 
            padding: '1rem', 
            backgroundColor: '#d4edda', 
            color: '#155724', 
            borderRadius: '4px',
            flex: 1,
          }}>
            ✓ You are a member of this group
          </div>
        ) : isFinalized ? (
          <div style={{ 
            padding: '1rem', 
            backgroundColor: '#f8d7da', 
            color: '#721c24', 
            borderRadius: '4px',
            flex: 1,
          }}>
            This group is no longer accepting members
          </div>
        ) : isFull ? (
          <div style={{ 
            padding: '1rem', 
            backgroundColor: '#fff3cd', 
            color: '#856404', 
            borderRadius: '4px',
            flex: 1,
          }}>
            This group is at full capacity
          </div>
        ) : (
          <button
            onClick={handleJoinGroup}
            disabled={joining}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: joining ? 'not-allowed' : 'pointer',
              opacity: joining ? 0.6 : 1,
              flex: 1,
            }}
          >
            {joining ? 'Joining...' : 'Join Group'}
          </button>
        )}

        {isAdvisor && (
          <>
            <button
              onClick={handleAdvisorRelease}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Release Advisor Assignment
            </button>
            {showReleaseConfirm && (
              <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                background: 'rgba(0,0,0,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
              }}>
                <div style={{
                  background: 'white',
                  padding: '2rem',
                  borderRadius: '8px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                  maxWidth: '90vw',
                  width: '400px',
                  textAlign: 'center',
                }}>
                  <h2>Confirm Release</h2>
                  <p>Are you sure you want to release your advisor assignment from this group? This action cannot be undone.</p>
                  <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '2rem' }}>
                    <button
                      onClick={confirmAdvisorRelease}
                      style={{
                        padding: '0.5rem 1.5rem',
                        backgroundColor: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      Yes, Release
                    </button>
                    <button
                      onClick={() => setShowReleaseConfirm(false)}
                      style={{
                        padding: '0.5rem 1.5rem',
                        backgroundColor: '#6c757d',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        <button
          onClick={() => navigate('/')}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Back
        </button>
      </div>
    </div>
  );
}
