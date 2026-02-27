import { WorkflowNodeEntity } from '../../../../../workflow-nodes/infrastructure/persistence/relational/entities/workflow-node.entity';

import { WorkflowEntity } from '../../../../../workflows/infrastructure/persistence/relational/entities/workflow.entity';

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { EntityRelationalHelper } from '../../../../../utils/relational-entity-helper';

@Entity({
  name: 'workflow_edge',
})
@Unique('UQ_workflow_edge_connection', ['workflowId', 'fromNodeId', 'toNodeId'])
export class WorkflowEdgeEntity extends EntityRelationalHelper {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({
    nullable: false,
    type: String,
  })
  toNodeId: string;

  @Index()
  @Column({
    nullable: false,
    type: String,
  })
  fromNodeId: string;

  @Index()
  @Column({
    nullable: false,
    type: String,
  })
  workflowId: string;

  @ManyToOne(
    () => WorkflowNodeEntity,
    (workflowNode) => workflowNode.incomingEdges,
    {
      eager: true,
      nullable: false,
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'toNodeId' })
  toNode: WorkflowNodeEntity;

  @ManyToOne(
    () => WorkflowNodeEntity,
    (workflowNode) => workflowNode.outgoingEdges,
    {
      eager: true,
      nullable: false,
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'fromNodeId' })
  fromNode: WorkflowNodeEntity;

  @ManyToOne(() => WorkflowEntity, (workflow) => workflow.edges, {
    eager: true,
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'workflowId' })
  workflow: WorkflowEntity;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
