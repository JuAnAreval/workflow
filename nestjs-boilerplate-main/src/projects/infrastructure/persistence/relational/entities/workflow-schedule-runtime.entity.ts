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
  name: 'workflow_schedule_runtime',
})
export class WorkflowScheduleRuntimeEntity extends EntityRelationalHelper {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({
    nullable: false,
    type: 'uuid',
  })
  workflowId: string;

  @Index({ unique: true })
  @Column({
    nullable: false,
    type: 'uuid',
  })
  workflowNodeId: string;

  @Column({
    nullable: false,
    type: String,
    default: 'scheduled',
  })
  status: string;

  @Column({
    nullable: true,
    type: 'text',
  })
  configSignature: string | null;

  @Column({
    nullable: true,
    type: String,
  })
  mode: string | null;

  @Column({
    nullable: true,
    type: String,
  })
  timezone: string | null;

  @Column({
    nullable: true,
    type: Date,
  })
  nextRunAt: Date | null;

  @Column({
    nullable: true,
    type: Date,
  })
  lastExecutedAt: Date | null;

  @Column({
    nullable: true,
    type: Date,
  })
  lastEvaluatedAt: Date | null;

  @Column({
    nullable: true,
    type: 'text',
  })
  lastError: string | null;

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
