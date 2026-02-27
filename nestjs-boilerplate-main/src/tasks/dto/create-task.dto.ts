import { ProjectDto } from '../../projects/dto/project.dto';

import {
  // decorators here

  IsString,
  ValidateNested,
  IsNotEmptyObject,
} from 'class-validator';

import {
  // decorators here
  ApiProperty,
} from '@nestjs/swagger';

import {
  // decorators here
  Type,
} from 'class-transformer';

export class CreateTaskDto {
  @ApiProperty({
    required: true,
    type: () => String,
  })
  @IsString()
  estado: string;

  @ApiProperty({
    required: true,
    type: () => String,
  })
  @IsString()
  description: string;

  @ApiProperty({
    required: true,
    type: () => ProjectDto,
  })
  @ValidateNested()
  @Type(() => ProjectDto)
  @IsNotEmptyObject()
  project: ProjectDto;

  @ApiProperty({
    required: true,
    type: () => String,
  })
  @IsString()
  name: string;

  // Don't forget to use the class-validator decorators in the DTO properties.
}
