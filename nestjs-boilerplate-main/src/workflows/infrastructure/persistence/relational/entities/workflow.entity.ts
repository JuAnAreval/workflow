import { UserEntity } from '../../../../../users/infrastructure/persistence/relational/entities/user.entity';
import { WorkflowNodeEntity } from '../../../../../workflow-nodes/infrastructure/persistence/relational/entities/workflow-node.entity';
import { WorkflowEdgeEntity } from '../../../../../workflow-edges/infrastructure/persistence/relational/entities/workflow-edge.entity';

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EntityRelationalHelper } from '../../../../../utils/relational-entity-helper';

@Entity({
  name: 'workflow',
})
export class WorkflowEntity extends EntityRelationalHelper {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    nullable: false,
    type: String,
  })
  name: string;

  @Index()
  @Column({
    nullable: false,
    type: Number,
  })
  userId: number;

  @ManyToOne(() => UserEntity, {
    eager: true,
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @OneToMany(() => WorkflowNodeEntity, (workflowNode) => workflowNode.workflow)
  nodes: WorkflowNodeEntity[];

  @OneToMany(() => WorkflowEdgeEntity, (workflowEdge) => workflowEdge.workflow)
  edges: WorkflowEdgeEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
