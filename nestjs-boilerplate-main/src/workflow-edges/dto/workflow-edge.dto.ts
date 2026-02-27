import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class WorkflowEdgeDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  id: string;
}
