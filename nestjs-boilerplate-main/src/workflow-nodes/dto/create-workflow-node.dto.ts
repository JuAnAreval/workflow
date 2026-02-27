import { WorkflowDto } from '../../workflows/dto/workflow.dto';

import {
  // decorators here
  Type,
} from 'class-transformer';

import {
  // decorators here

  IsString,
  IsNumber,
  ValidateNested,
  IsNotEmptyObject,
} from 'class-validator';

import {
  // decorators here
  ApiProperty,
} from '@nestjs/swagger';

export class CreateWorkflowNodeDto {
  @ApiProperty({
    required: true,
    type: () => WorkflowDto,
  })
  @ValidateNested()
  @Type(() => WorkflowDto)
  @IsNotEmptyObject()
  workflow: WorkflowDto;

  @ApiProperty({
    required: true,
    type: () => String,
  })
  @IsString()
  config: string;

  @ApiProperty({
    required: true,
    type: () => Number,
  })
  @IsNumber()
  posY: number;

  @ApiProperty({
    required: true,
    type: () => Number,
  })
  @IsNumber()
  posX: number;

  @ApiProperty({
    required: true,
    type: () => String,
  })
  @IsString()
  label: string;

  @ApiProperty({
    required: true,
    type: () => String,
  })
  @IsString()
  type: string;

  // Don't forget to use the class-validator decorators in the DTO properties.
}
