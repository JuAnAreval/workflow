import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class TestHttpRequestDto {
  @ApiProperty({
    type: String,
    example: 'https://api.example.com/webhook',
  })
  @IsString()
  @IsNotEmpty()
  url: string;

  @ApiPropertyOptional({
    type: String,
    enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'],
    example: 'POST',
  })
  @IsString()
  @IsOptional()
  method?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: {
      type: 'string',
    },
    example: {
      Authorization: 'Bearer token',
    },
  })
  @IsOptional()
  headers?: unknown;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: {
      message: 'Hola desde workflow',
    },
  })
  @IsOptional()
  body?: unknown;
}
