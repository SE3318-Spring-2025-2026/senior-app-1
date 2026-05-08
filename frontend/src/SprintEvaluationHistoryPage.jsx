import React from 'react';
import { useParams } from 'react-router-dom';
import SprintEvaluationHistory from './components/SprintEvaluationHistory';

export default function SprintEvaluationHistoryPage() {
  const { teamId, sprintId } = useParams();
  return (
    <main className="page page-sprint-evaluation-history">
      <SprintEvaluationHistory teamId={teamId} sprintId={sprintId} />
    </main>
  );
}
