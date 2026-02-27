import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class WorkflowNodeDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  id: string;
}
