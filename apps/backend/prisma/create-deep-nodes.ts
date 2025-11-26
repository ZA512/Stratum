import { PrismaClient, ColumnBehaviorKey } from '@prisma/client';
import { DEMO_IDS } from './seed';

const prisma = new PrismaClient();

async function createDeepHierarchy() {
  try {
    console.log('🏗️  Création d\'une hiérarchie profonde pour tester le breadcrumb...');

    // Convertir le nœud backlog en complexe pour en faire un sous-board
    const backlogNode = await prisma.node.findUnique({ where: { id: DEMO_IDS.nodes.backlog } });
    if (!backlogNode) throw new Error('Backlog node introuvable');

    console.log('✅ Nœud breadcrumb converti en COMPLEX');

    // Créer un board pour ce nœud
    const subBoard = await prisma.board.create({
      data: {
        id: 'board_breadcrumb_sub',
        nodeId: backlogNode.id,
      },
    });

    console.log('✅ Sous-board créé');

    // Récupérer les behaviors existants
    const behaviors = await prisma.columnBehavior.findMany({
      where: { id: { in: Object.values(DEMO_IDS.behaviors) } },
    });

    // Créer des colonnes pour le sous-board
    const subColumns = await Promise.all([
      prisma.column.create({
        data: {
          id: 'col_sub_backlog',
          boardId: subBoard.id,
          name: 'Sub Backlog',
          position: 0,
          behaviorId: behaviors.find(b => b.key === ColumnBehaviorKey.BACKLOG)!.id,
        },
      }),
      prisma.column.create({
        data: {
          id: 'col_sub_progress',
          boardId: subBoard.id,
          name: 'Sub Progress',
          position: 1,
          behaviorId: behaviors.find(b => b.key === ColumnBehaviorKey.IN_PROGRESS)!.id,
        },
      }),
      prisma.column.create({
        data: {
          id: 'col_sub_done',
          boardId: subBoard.id,
          name: 'Sub Done',
          position: 2,
          behaviorId: behaviors.find(b => b.key === ColumnBehaviorKey.DONE)!.id,
        },
      }),
    ]);

    console.log('✅ Colonnes du sous-board créées');

    // Créer des nœuds de niveau 2
    const level2Node = await prisma.node.create({
      data: {
        id: 'node_level2_design',
        teamId: DEMO_IDS.team,
        workspaceId: subBoard.id,
        parentId: backlogNode.id,
        columnId: subColumns[0].id, // Sub Backlog
        title: 'Composants de design',
        description: 'Finaliser les composants UI du breadcrumb',
        path: `${DEMO_IDS.team}/${DEMO_IDS.rootNode}/${backlogNode.id}/node_level2_design`,
        depth: 2,
        position: 0,
        createdById: DEMO_IDS.user,
      },
    });

    console.log('✅ Nœud niveau 2 créé');

    // Créer un autre board pour le niveau 2
    const level2Board = await prisma.board.create({
      data: {
        id: 'board_level2_design',
        nodeId: level2Node.id,
      },
    });

    // Créer des colonnes pour le niveau 2
    const level2Columns = await Promise.all([
      prisma.column.create({
        data: {
          id: 'col_l2_backlog',
          boardId: level2Board.id,
          name: 'Design Backlog',
          position: 0,
          behaviorId: behaviors.find(b => b.key === ColumnBehaviorKey.BACKLOG)!.id,
        },
      }),
      prisma.column.create({
        data: {
          id: 'col_l2_done',
          boardId: level2Board.id,
          name: 'Design Done',
          position: 1,
          behaviorId: behaviors.find(b => b.key === ColumnBehaviorKey.DONE)!.id,
        },
      }),
    ]);

    // Créer des nœuds de niveau 3 pour vraiment voir l'effet des couches
    await Promise.all([
      prisma.node.create({
        data: {
          id: 'node_level3_icons',
          teamId: DEMO_IDS.team,
          workspaceId: level2Board.id,
          parentId: level2Node.id,
          columnId: level2Columns[0].id,
          title: 'Icônes de type',
          description: 'Créer les icônes S, M, K pour les types de nœuds',
          path: `${DEMO_IDS.team}/${DEMO_IDS.rootNode}/${backlogNode.id}/node_level2_design/node_level3_icons`,
          depth: 3,
          position: 0,
          createdById: DEMO_IDS.user,
        },
      }),
      prisma.node.create({
        data: {
          id: 'node_level3_colors',
          teamId: DEMO_IDS.team,
          workspaceId: level2Board.id,
          parentId: level2Node.id,
          columnId: level2Columns[0].id,
          title: 'Palette de couleurs',
          description: 'Définir la génération de couleurs HSL pour les couches',
          path: `${DEMO_IDS.team}/${DEMO_IDS.rootNode}/${backlogNode.id}/node_level2_design/node_level3_colors`,
          depth: 3,
          position: 1,
          createdById: DEMO_IDS.user,
        },
      }),
    ]);

    console.log('✅ Nœuds niveau 3 créés');

    // Créer encore un niveau pour la palette de couleurs (niveau 4)
    const level3ColorNode = await prisma.node.findUnique({
      where: { id: 'node_level3_colors' },
    });

    if (level3ColorNode) {
      const level3Board = await prisma.board.create({
        data: {
          id: 'board_level3_colors',
          nodeId: level3ColorNode.id,
        },
      });

      const level3Column = await prisma.column.create({
        data: {
          id: 'col_l3_tasks',
          boardId: level3Board.id,
          name: 'Color Tasks',
          position: 0,
          behaviorId: behaviors.find(b => b.key === ColumnBehaviorKey.IN_PROGRESS)!.id,
        },
      });

      await prisma.node.create({
        data: {
          id: 'node_level4_hsl',
          teamId: DEMO_IDS.team,
          workspaceId: level3Board.id,
          parentId: level3ColorNode.id,
          columnId: level3Column.id,
          title: 'Algorithme HSL',
          description: 'Implémentation de la fonction generateLayerColors',
          path: `${DEMO_IDS.team}/${DEMO_IDS.rootNode}/${backlogNode.id}/node_level2_design/node_level3_colors/node_level4_hsl`,
          depth: 4,
          position: 0,
          createdById: DEMO_IDS.user,
        },
      });

      console.log('✅ Nœud niveau 4 créé - Hiérarchie de test complète !');
    }

    console.log('\n🎉 Hiérarchie profonde créée avec succès !');
    console.log('📏 Profondeur maximum : 4 niveaux');
    console.log('🧪 Testez le breadcrumb en naviguant vers : /boards/' + DEMO_IDS.team + '/node_level4_hsl');

  } catch (error) {
    console.error('❌ Erreur lors de la création :', error);
  } finally {
    await prisma.$disconnect();
  }
}

createDeepHierarchy();