import { WorkflowEdgeEntity } from '../../../../../workflow-edges/infrastructure/persistence/relational/entities/workflow-edge.entity';
import { WorkflowEntity } from '../../../../../workflows/infrastructure/persistence/relational/entities/workflow.entity';

import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { EntityRelationalHelper } from '../../../../../utils/relational-entity-helper';

@Entity({
  name: 'workflow_node',
})
export class WorkflowNodeEntity extends EntityRelationalHelper {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    nullable: false,
    type: String,
  })
  config: string;

  @Column({
    nullable: false,
    type: Number,
  })
  posY: number;

  @Column({
    nullable: false,
    type: Number,
  })
  posX: number;

  @Column({
    nullable: false,
    type: String,
  })
  label: string;

  @Column({
    nullable: false,
    type: String,
  })
  type: string;

  @Index()
  @Column({
    nullable: false,
    type: String,
  })
  workflowId: string;

  @ManyToOne(() => WorkflowEntity, (workflow) => workflow.nodes, {
    eager: true,
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'workflowId' })
  workflow: WorkflowEntity;

  @OneToMany(() => WorkflowEdgeEntity, (workflowEdge) => workflowEdge.fromNode)
  outgoingEdges: WorkflowEdgeEntity[];

  @OneToMany(() => WorkflowEdgeEntity, (workflowEdge) => workflowEdge.toNode)
  incomingEdges: WorkflowEdgeEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
