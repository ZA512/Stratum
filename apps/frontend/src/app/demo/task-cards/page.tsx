import React from 'react';
import TaskCard from '@/components/task/task-card';

export default function TaskCardsDemoPage() {
  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark p-8 space-y-8">
      <h1 className="text-2xl font-bold text-text-light dark:text-text-dark">Demo Task Cards</h1>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <TaskCard
          id={152}
          priority="Medium"
          title="Analyser les dépendances critiques"
          description="Identifier les boucles potentielles dans le graphe fractal.d"
          assignees={[{ id: 'u1', initials: 'AR' }]}
          lateness={-6}
          complexity="XL"
          fractalPath="4.0.0.1"
          href="#"
        />
        <TaskCard
          id={153}
          priority="High"
          title="Refactor moteur de règles"
          description="Stabiliser l'algorithme de propagation et réduire la latence."
          assignees={[{ id: 'u2', initials: 'JD' }, { id: 'u3', initials: 'MB' }]}
          lateness={1}
          complexity="L"
          fractalPath="4.0.1.0"
          href="#"
        />
        <TaskCard
          id={154}
          priority="Critical"
          title="Corriger fuite mémoire worker"
          description="Observation d'une augmentation non bornée après 3h de charge."
          assignees={[{ id: 'u4', initials: 'TS' }]}
          lateness={-2}
          complexity="M"
          fractalPath="4.1.0.2"
          href="#"
        />
        <TaskCard
          id={155}
          priority="Low"
          title="Mettre à jour la doc API"
          description="Ajouter les nouveaux endpoints de reporting."
          assignees={[{ id: 'u5', initials: 'AL' }]}
          lateness={0}
          complexity="S"
          fractalPath="4.2.0.0"
          variant="compact"
        />
      </div>
    </div>
  );
}
