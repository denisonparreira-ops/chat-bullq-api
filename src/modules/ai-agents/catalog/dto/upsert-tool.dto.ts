import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpsertCustomToolDto {
  @ApiProperty({ example: 'unlockCourseAccess' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  @Matches(/^[a-zA-Z][a-zA-Z0-9_]*$/, {
    message:
      'Tool name must start with a letter and contain only letters, digits or underscores (the LLM uses this as a function name).',
  })
  name!: string;

  @ApiProperty()
  @IsString()
  @MinLength(10)
  description!: string;

  @ApiProperty({
    description:
      'JSON Schema descrevendo os parâmetros de entrada. Ex: {"type":"object","properties":{"email":{"type":"string"}},"required":["email"]}',
  })
  @IsObject()
  parameters!: Record<string, unknown>;

  @ApiProperty({ example: 'POST' })
  @IsString()
  @Matches(/^(GET|POST|PUT|PATCH|DELETE)$/i)
  httpMethod!: string;

  @ApiProperty({ example: 'https://members.bravy.com.br/api/admin/access' })
  @IsString()
  httpUrl!: string;

  @ApiPropertyOptional({
    description: 'Headers como objeto. Templates suportados: {{env.X}}, {{input.x}}, {{ctx.x}}.',
  })
  @IsOptional()
  @IsObject()
  httpHeaders?: Record<string, string>;

  @ApiPropertyOptional({
    description:
      'Body template (string). Suporta os mesmos templates dos headers. JSON cru funciona.',
  })
  @IsOptional()
  @IsString()
  httpBodyTemplate?: string;

  @ApiPropertyOptional({
    description:
      'Mapeamento da resposta usando JSONPath simples: {"ok":"$.success","msg":"$.data.message"}',
  })
  @IsOptional()
  @IsObject()
  responseMap?: Record<string, string>;

  @ApiPropertyOptional({ default: 15000 })
  @IsOptional()
  @IsInt()
  @Min(500)
  @Max(60000)
  timeoutMs?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
