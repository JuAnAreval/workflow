import { WorkflowNode } from '../../workflow-nodes/domain/workflow-node';
import { Workflow } from '../../workflows/domain/workflow';
import { ApiProperty } from '@nestjs/swagger';

export class WorkflowEdge {
  @ApiProperty({
    type: () => WorkflowNode,
    nullable: false,
  })
  toNode: WorkflowNode;

  @ApiProperty({
    type: () => WorkflowNode,
    nullable: false,
  })
  fromNode: WorkflowNode;

  @ApiProperty({
    type: () => Workflow,
    nullable: false,
  })
  workflow: Workflow;

  @ApiProperty({
    type: String,
  })
  id: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
