import { Workflow } from '../../workflows/domain/workflow';
import { ApiProperty } from '@nestjs/swagger';

export class WorkflowNode {
  @ApiProperty({
    type: () => Workflow,
    nullable: false,
  })
  workflow: Workflow;

  @ApiProperty({
    type: () => String,
    nullable: false,
  })
  config: string;

  @ApiProperty({
    type: () => Number,
    nullable: false,
  })
  posY: number;

  @ApiProperty({
    type: () => Number,
    nullable: false,
  })
  posX: number;

  @ApiProperty({
    type: () => String,
    nullable: false,
  })
  label: string;

  @ApiProperty({
    type: () => String,
    nullable: false,
  })
  type: string;

  @ApiProperty({
    type: String,
  })
  id: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
