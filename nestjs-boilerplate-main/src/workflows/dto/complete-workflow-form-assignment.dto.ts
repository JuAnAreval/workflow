import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

export class CompleteWorkflowFormAssignmentDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: {
      nombre: 'Juan',
      correo: 'juan@correo.com',
    },
  })
  @IsObject()
  data: Record<string, unknown>;
}
