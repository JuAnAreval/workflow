import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { WorkflowAssignmentStatus } from '../workflow-assignments.types';

type WorkflowAssignmentStatusFilter = WorkflowAssignmentStatus | 'all';

export class QueryMyWorkflowAssignmentsDto {
  @ApiPropertyOptional({
    enum: ['draft', 'pending', 'completed', 'cancelled', 'all'],
    default: 'draft',
  })
  @IsOptional()
  @IsIn(['draft', 'pending', 'completed', 'cancelled', 'all'])
  status?: WorkflowAssignmentStatusFilter;

  @ApiPropertyOptional({
    type: Number,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    type: Number,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
