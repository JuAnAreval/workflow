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
} from 'typeorm';
import { EntityRelationalHelper } from '../../../../../utils/relational-entity-helper';

@Entity({
  name: 'workflow_form_json',
})
export class WorkflowFormJsonEntity extends EntityRelationalHelper {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({
    nullable: false,
    type: String,
  })
  workflowId: string;

  @Index({ unique: true })
  @Column({
    nullable: false,
    type: String,
  })
  workflowNodeId: string;

  @Column({
    nullable: true,
    type: String,
    length: 255,
  })
  nodeLabel: string | null;

  @Column({
    nullable: false,
    type: 'text',
  })
  payload: string;

  @ManyToOne(() => WorkflowEntity, {
    eager: false,
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'workflowId' })
  workflow: WorkflowEntity;

  @ManyToOne(() => WorkflowNodeEntity, {
    eager: false,
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'workflowNodeId' })
  workflowNode: WorkflowNodeEntity;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
