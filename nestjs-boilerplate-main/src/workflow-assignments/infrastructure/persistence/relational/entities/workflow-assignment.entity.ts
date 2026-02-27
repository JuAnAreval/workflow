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
import { UserEntity } from '../../../../../users/infrastructure/persistence/relational/entities/user.entity';

@Entity({
  name: 'workflow_assignment',
})
export class WorkflowAssignmentEntity extends EntityRelationalHelper {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({
    nullable: false,
    type: Number,
  })
  assignedToUserId: number;

  @ManyToOne(() => UserEntity, {
    eager: true,
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'assignedToUserId' })
  assignedToUser: UserEntity;

  @Index()
  @Column({
    nullable: true,
    type: Number,
  })
  createdByUserId?: number | null;

  @ManyToOne(() => UserEntity, {
    eager: true,
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'createdByUserId' })
  createdByUser?: UserEntity | null;

  @Index()
  @Column({
    nullable: false,
    type: String,
  })
  entityType: string;

  @Index()
  @Column({
    nullable: false,
    type: String,
    default: 'draft',
  })
  status: string;

  @Column({
    nullable: false,
    type: 'jsonb',
    default: () => "'{}'::jsonb",
  })
  templateData: Record<string, unknown>;

  @Column({
    nullable: false,
    type: 'jsonb',
    default: () => "'{}'::jsonb",
  })
  contextData: Record<string, unknown>;

  @Column({
    nullable: false,
    type: 'jsonb',
    default: () => "'{}'::jsonb",
  })
  formData: Record<string, unknown>;

  @Column({
    nullable: true,
    type: 'uuid',
  })
  sourceWorkflowId?: string | null;

  @Column({
    nullable: true,
    type: 'uuid',
  })
  sourceNodeId?: string | null;

  @Column({
    nullable: true,
    type: String,
  })
  createdEntityId?: string | null;

  @Column({
    nullable: true,
    type: Date,
  })
  submittedAt?: Date | null;

  @Index()
  @Column({
    nullable: true,
    type: Number,
  })
  reviewedByUserId?: number | null;

  @ManyToOne(() => UserEntity, {
    eager: true,
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'reviewedByUserId' })
  reviewedByUser?: UserEntity | null;

  @Column({
    nullable: true,
    type: Date,
  })
  reviewedAt?: Date | null;

  @Column({
    nullable: true,
    type: String,
    length: 2000,
  })
  reviewFeedback?: string | null;

  @Column({
    nullable: true,
    type: Date,
  })
  notifiedAt?: Date | null;

  @Column({
    nullable: true,
    type: Date,
  })
  completedAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
