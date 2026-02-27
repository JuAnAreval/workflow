import { WorkflowNodeDto } from '../../workflow-nodes/dto/workflow-node.dto';

import { WorkflowDto } from '../../workflows/dto/workflow.dto';

import {
  // decorators here
  Type,
} from 'class-transformer';

import {
  // decorators here

  ValidateNested,
  IsNotEmptyObject,
} from 'class-validator';

import {
  // decorators here
  ApiProperty,
} from '@nestjs/swagger';

export class CreateWorkflowEdgeDto {
  @ApiProperty({
    required: true,
    type: () => WorkflowNodeDto,
  })
  @ValidateNested()
  @Type(() => WorkflowNodeDto)
  @IsNotEmptyObject()
  toNode: WorkflowNodeDto;

  @ApiProperty({
    required: true,
    type: () => WorkflowNodeDto,
  })
  @ValidateNested()
  @Type(() => WorkflowNodeDto)
  @IsNotEmptyObject()
  fromNode: WorkflowNodeDto;

  @ApiProperty({
    required: true,
    type: () => WorkflowDto,
  })
  @ValidateNested()
  @Type(() => WorkflowDto)
  @IsNotEmptyObject()
  workflow: WorkflowDto;

  // Don't forget to use the class-validator decorators in the DTO properties.
}
